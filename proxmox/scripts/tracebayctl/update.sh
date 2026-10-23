# shellcheck shell=bash
# tracebayctl update.
#
# Phase 1 (scripts de la version en service) : contrôles, sauvegarde obligatoire, git reset.
# Phase 2 (scripts de la nouvelle version, relancés par exec) : contrôle du nouveau compose,
# construction de l'image AVANT de toucher aux conteneurs, schémas, redémarrage, santé.
# Invariant entre versions : « tracebayctl update --suite --depuis COMMIT --sauvegarde CHEMIN »
# doit rester accepté, c'est l'appel de la phase 1 d'une version à la phase 2 de la suivante.

court() { git -C "$TB_REPO" rev-parse --short "$1" 2>/dev/null || printf '%s' "$1"; }

# Écrit l'état de la dernière mise à jour, lu par status.
noter_maj() {
  mkdir -p "$TB_STATE_DIR" 2>/dev/null || return 0
  printf 'date=%s\ndepuis=%s\nvers=%s\nresultat=%s\nschema=%s\n' \
    "$(date '+%d/%m/%Y %H:%M')" "$1" "$2" "$3" "$4" > "$TB_STATE_DIR/derniere-maj" 2>/dev/null || true
}

# schema.sql puis migrations embarquées. Une erreur reste un avertissement (comportement historique) ;
# le détail est gardé dans $TB_STATE_DIR/schema-erreurs.log. Affiche le nombre d'erreurs.
appliquer_schemas() {
  local f erreurs=0 journal="$TB_STATE_DIR/schema-erreurs.log"
  mkdir -p "$TB_STATE_DIR" 2>/dev/null || journal=/dev/null
  : > "$journal" 2>/dev/null || journal=/dev/null
  for f in "$TB_REPO/proxmox/app/src/db/schema.sql" "$TB_REPO/proxmox/app/src/db/migrations-embarquees.sql"; do
    if [[ ! -f "$f" ]]; then
      warn "Schéma introuvable : $f"
      erreurs=$((erreurs + 1))
    elif db_psql "" < "$f" > /dev/null 2> >(tee -a "$journal" >&2); then
      ok "Schéma appliqué : $(basename "$f")"
    else
      warn "Schéma $(basename "$f") : erreur (détail dans $journal), mise à jour poursuivie."
      erreurs=$((erreurs + 1))
    fi
  done
  echo "$erreurs"
}

marquer_service_actif() {
  command -v systemctl > /dev/null 2>&1 || return 0
  if systemctl is-enabled "$TB_SERVICE" > /dev/null 2>&1 && ! systemctl is-active "$TB_SERVICE" > /dev/null 2>&1; then
    systemctl start "$TB_SERVICE" 2> /dev/null || true
  fi
}

cmd_update() {
  local args=("$@") sauter="" suite="" depuis="" sauvegarde="" forcer="" avant cible nouveau
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-backup) sauter=1 ;;
      --yes) export TB_YES=1 ;;
      --force) forcer=1 ;;
      --suite) suite=1 ;;
      --depuis) depuis="${2:-}"; shift ;;
      --sauvegarde) sauvegarde="${2:-}"; shift ;;
      -h | --help) usage_cmd update; return 0 ;;
      *) die "Option inconnue : $1" 2 ;;
    esac
    shift
  done
  require_root update
  with_lock update "${args[@]}"
  if [[ -n "$suite" ]]; then
    update_suite "$depuis" "$sauvegarde"
    return 0
  fi
  lock_note update "${args[@]}"
  if [[ "${SKIP_BACKUP_BEFORE_UPDATE:-}" == "1" ]]; then
    warn "SKIP_BACKUP_BEFORE_UPDATE=1 est ignorée : la sauvegarde est obligatoire (option --skip-backup pour s'en passer)."
  fi

  title "Contrôles"
  preflight || die "Configuration invalide : mise à jour annulée, rien n'a changé."
  if [[ -n "$(git -C "$TB_REPO" status --porcelain --untracked-files=no)" ]]; then
    warn "Fichiers du dépôt modifiés sur ce serveur ; la mise à jour les écrasera :"
    git -C "$TB_REPO" status --short --untracked-files=no >&2
    confirm "Écraser ces modifications locales ?" || die "Annulé : rien n'a changé."
  fi
  git -C "$TB_REPO" fetch --quiet origin "$TB_BRANCH" || die "git fetch impossible (réseau, origin ?) : rien n'a changé."
  avant="$(git -C "$TB_REPO" rev-parse HEAD)"
  cible="$(git -C "$TB_REPO" rev-parse "origin/$TB_BRANCH")"
  if [[ "$avant" == "$cible" && -z "$forcer" ]]; then
    ok "Déjà à jour ($(git -C "$TB_REPO" log -1 --format='%h %s')). Reconstruire quand même : tracebayctl update --force"
    return 0
  fi
  info "Version en service : $(git -C "$TB_REPO" log -1 --format='%h %s')"
  if [[ "$avant" != "$cible" ]]; then
    info "Nouveautés :"
    git -C "$TB_REPO" log --oneline "$avant..$cible" >&2
  fi
  confirm "Mettre à jour vers $(court "$cible") ?" || { info "Annulé : rien n'a changé."; return 0; }

  title "Sauvegarde"
  if [[ -n "$sauter" ]]; then
    warn "--skip-backup : aucune sauvegarde avant la mise à jour, aucun retour possible pour la base."
    confirm "Continuer SANS sauvegarde ?" || { info "Annulé : rien n'a changé."; return 0; }
    sauvegarde="aucune"
  else
    sauvegarde="$(do_backup avant-maj)" || die "Sauvegarde impossible : mise à jour annulée, rien n'a changé."
    ok "Sauvegarde vérifiée : $sauvegarde"
  fi

  title "Code"
  git -C "$TB_REPO" reset --hard --quiet "$cible" || die "git reset impossible : rien n'a changé."
  nouveau="$TB_REPO/proxmox/scripts/tracebayctl/tracebayctl"
  if [[ -f "$nouveau" ]]; then
    exec bash "$nouveau" update --suite --depuis "$avant" --sauvegarde "$sauvegarde"
  fi
  update_suite "$avant" "$sauvegarde"
}

update_suite() {
  local depuis="$1" sauvegarde="$2" nouveau erreurs
  nouveau="$(git -C "$TB_REPO" rev-parse HEAD)"
  lock_note update "$(court "$depuis") vers $(court "$nouveau")"
  TB_MAJ_DEPUIS="$depuis"
  TB_MAJ_SAUVEGARDE="$sauvegarde"
  TB_MAJ_FINIE=""
  trap update_sortie EXIT

  title "Contrôle de la nouvelle version"
  if ! preflight; then
    retour_code sans-construction
    die "Configuration de la nouvelle version invalide : code revenu à $(court "$depuis"), l'ancienne version est toujours en service."
  fi

  title "Construction de l'image"
  if ! dc build proxmox; then
    retour_code sans-construction
    die "Construction échouée : code revenu à $(court "$depuis"), l'ancienne version est toujours en service."
  fi

  title "Base de données"
  if ! ensure_db_up || ! set_db_role_password "$(env_get DB_PASSWORD)"; then
    echec_maj "PostgreSQL indisponible ou mot de passe non aligné sur DB_PASSWORD"
  fi
  erreurs="$(appliquer_schemas)"

  title "Redémarrage"
  dc up -d --remove-orphans || echec_maj "docker compose up a échoué"
  wait_api || echec_maj "l'API ne répond pas (santé ou accès à la base)"
  marquer_service_actif
  if declare -F installer_fichiers > /dev/null && [[ -d "$TB_LIB_DIR" ]]; then
    installer_fichiers > /dev/null || warn "Copie installée de tracebayctl non rafraîchie : tracebayctl install-cli"
  fi
  TB_MAJ_FINIE=1
  if [[ "$erreurs" == "0" ]]; then
    noter_maj "$(court "$depuis")" "$(court "$nouveau")" "réussie" "ok"
    ok "Mise à jour terminée : $(court "$depuis") vers $(court "$nouveau"). Sauvegarde d'avant : $sauvegarde"
  else
    noter_maj "$(court "$depuis")" "$(court "$nouveau")" "réussie" "$erreurs erreur(s), voir $TB_STATE_DIR/schema-erreurs.log"
    warn "Mise à jour terminée ($(court "$depuis") vers $(court "$nouveau")) avec $erreurs erreur(s) de schéma : $TB_STATE_DIR/schema-erreurs.log"
  fi
}

# Retour au commit d'avant ; avec reconstruction et redémarrage sauf « sans-construction »
# (rien n'a encore été remplacé : l'ancienne image et ses conteneurs sont toujours en service).
retour_code() {
  git -C "$TB_REPO" reset --hard --quiet "$TB_MAJ_DEPUIS" || return 1
  [[ "${1:-}" == "sans-construction" ]] && return 0
  dc build proxmox && dc up -d --remove-orphans && wait_api
}

echec_maj() {
  local conseil="Pas de sauvegarde (--skip-backup)."
  [[ "$TB_MAJ_SAUVEGARDE" != "aucune" ]] && conseil="Si la base a déjà été modifiée : tracebayctl restore $(basename "$TB_MAJ_SAUVEGARDE")"
  warn "$1 : retour à la version $(court "$TB_MAJ_DEPUIS")."
  if retour_code; then
    TB_MAJ_FINIE=1
    noter_maj "$(court "$TB_MAJ_DEPUIS")" "$(git -C "$TB_REPO" rev-parse --short HEAD)" "annulée ($1)" "-"
    die "Mise à jour annulée : l'ancienne version est de nouveau en service. $conseil"
  fi
  die "ÉCHEC : le retour à $(court "$TB_MAJ_DEPUIS") n'a pas abouti. Voir tracebayctl logs api. $conseil"
}

# Quoi qu'il arrive (erreur, interruption), l'API n'est jamais laissée arrêtée.
update_sortie() {
  [[ -n "$TB_MAJ_FINIE" ]] && return 0
  api_running || dc up -d > /dev/null 2>&1 || true
}
