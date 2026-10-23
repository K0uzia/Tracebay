# shellcheck shell=bash
# tracebayctl backup et restore.
#
# Une sauvegarde = un dossier backups/AAAAMMJJ-HHMMSS[-étiquette]/ avec db.sql.gz (pg_dump --clean
# --if-exists) et manifest.txt. Écrite dans .<nom>.en-cours puis renommée : un dossier sans ce
# préfixe est toujours complet et vérifié. Les anciens pre_update_*.sql.gz restent restaurables.

TB_DUMP_FIN="-- PostgreSQL database dump complete"

tag_valide() { [[ "$1" =~ ^[a-z0-9][a-z0-9-]{0,31}$ ]]; }

# gzip lisible, non vide, et fin de dump écrite par pg_dump (absente si le dump a été coupé).
dump_valide() {
  [[ -s "$1" ]] && gzip -t "$1" 2>/dev/null && gzip -dc "$1" | tail -n 3 | grep -F -e "$TB_DUMP_FIN" >/dev/null
}

taille_base_mo() {
  local octets
  octets="$(printf 'SELECT pg_database_size(current_database());\n' | db_psql "" -t -A 2>/dev/null | tr -dc '0-9' || true)"
  echo $((${octets:-0} / 1048576))
}

# Garde les TB_BACKUP_KEEP sauvegardes les plus récentes (nouveau format seulement).
rotation_sauvegardes() {
  local garder="$TB_BACKUP_KEEP" dossiers=() i
  [[ "$garder" =~ ^[0-9]+$ ]] && ((garder >= 1)) || return 0
  for i in "$TB_BACKUPS"/[0-9]*/; do
    [[ -f "$i/manifest.txt" ]] && dossiers+=("${i%/}")
  done
  for ((i = 0; i < ${#dossiers[@]} - garder; i++)); do
    rm -rf -- "${dossiers[$i]}"
    info "Rotation : $(basename "${dossiers[$i]}") supprimée."
  done
}

# Sauvegarde vérifiée ; écrit son chemin sur la sortie standard. $2 = « sans-rotation » pour ne rien supprimer.
do_backup() {
  local tag="$1" rotation="${2:-}" base nom encours n=2 taille libre
  mkdir -p "$TB_BACKUPS"
  chmod 700 "$TB_BACKUPS"
  if ! ensure_db_up; then
    warn "PostgreSQL ne répond pas : sauvegarde impossible."
    return 1
  fi
  taille="$(taille_base_mo)"
  libre="$(free_mb "$TB_BACKUPS")"
  if [[ "$libre" =~ ^[0-9]+$ ]] && ((libre < taille + 200)); then
    warn "Espace insuffisant dans $TB_BACKUPS : $libre Mo libres pour une base de $taille Mo."
    return 1
  fi
  base="$(date +%Y%m%d-%H%M%S)${tag:+-$tag}"
  nom="$base"
  while [[ -e "$TB_BACKUPS/$nom" ]]; do
    nom="$base-$n"
    n=$((n + 1))
  done
  encours="$TB_BACKUPS/.$nom.en-cours"
  rm -rf -- "$encours"
  mkdir -m 700 "$encours"
  info "Sauvegarde de la base $(db_name)..."
  if ! dc exec -T db pg_dump -U "$(db_user)" -d "$(db_name)" --no-owner --no-acl --clean --if-exists | gzip -c > "$encours/db.sql.gz"; then
    rm -rf -- "$encours"
    warn "pg_dump a échoué (message ci-dessus)."
    return 1
  fi
  if ! dump_valide "$encours/db.sql.gz"; then
    rm -rf -- "$encours"
    warn "Sauvegarde vide ou incomplète (fin de dump absente) : supprimée."
    return 1
  fi
  {
    echo "date=$(date '+%Y-%m-%d %H:%M:%S')"
    echo "tag=$tag"
    echo "commit=$(git -C "$TB_REPO" rev-parse --short HEAD 2>/dev/null || true)"
    echo "base=$(db_name)"
    echo "taille=$(stat -c %s "$encours/db.sql.gz")"
    echo "sha256=$(sha256sum "$encours/db.sql.gz" | cut -d' ' -f1)"
  } > "$encours/manifest.txt"
  mv -- "$encours" "$TB_BACKUPS/$nom"
  [[ "$rotation" == "sans-rotation" ]] || rotation_sauvegardes
  printf '%s\n' "$TB_BACKUPS/$nom"
}

cmd_backup() {
  local tag="" args=("$@") chemin
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) tag="${2:-}"; shift ;;
      --attendre) TB_LOCK_WAIT="${TB_LOCK_WAIT:-600}" ;;
      -h | --help) usage_cmd backup; return 0 ;;
      *) die "Option inconnue : $1" 2 ;;
    esac
    shift
  done
  [[ -z "$tag" ]] || tag_valide "$tag" || die "Étiquette invalide : minuscules, chiffres et tirets, 32 caractères au plus." 2
  require_root backup
  with_lock backup "${args[@]}"
  lock_note backup "${args[@]}"
  compose_valid || die "docker-compose.yml invalide (tracebayctl check) : sauvegarde annulée."
  chemin="$(do_backup "$tag")" || die "Sauvegarde échouée."
  printf '%s\n' "$chemin"
  ok "Sauvegarde vérifiée : $chemin ($(du -h "$chemin/db.sql.gz" | cut -f1))."
}

# Fichiers de sauvegarde, plus récents d'abord (15 au plus).
liste_sauvegardes() {
  local f
  for f in "$TB_BACKUPS"/[0-9]*/db.sql.gz "$TB_BACKUPS"/pre_update_*.sql.gz; do
    [[ -f "$f" ]] && printf '%s %s\n' "$(stat -c %Y "$f")" "$f"
  done | sort -rn | head -n 15 | cut -d' ' -f2-
}

decrire_sauvegarde() {
  local f="$1" dossier manifeste date tag
  dossier="$(dirname "$f")"
  manifeste="$dossier/manifest.txt"
  if [[ -f "$manifeste" ]]; then
    date="$(sed -n 's/^date=//p' "$manifeste")"
    tag="$(sed -n 's/^tag=//p' "$manifeste")"
    printf '%s du %s%s, %s' "$(basename "$dossier")" "$date" "${tag:+ ($tag)}" "$(du -h "$f" | cut -f1)"
  else
    printf '%s (ancien format), %s' "$(basename "$f")" "$(du -h "$f" | cut -f1)"
  fi
}

resoudre_sauvegarde() {
  local p
  for p in "$1" "$TB_BACKUPS/$1" "$TB_BACKUPS/$(basename "$1")"; do
    if [[ -d "$p" && -f "$p/db.sql.gz" ]]; then
      readlink -f "$p/db.sql.gz"
      return 0
    fi
    if [[ -f "$p" ]]; then
      readlink -f "$p"
      return 0
    fi
  done
  return 1
}

choisir_sauvegarde() {
  local fichiers=() f i=1 choix
  while read -r f; do fichiers+=("$f"); done < <(liste_sauvegardes)
  ((${#fichiers[@]} > 0)) || die "Aucune sauvegarde dans $TB_BACKUPS."
  [[ -t 0 ]] || die "Indiquer la sauvegarde à restaurer (tracebayctl restore <dossier>), pas de choix sans terminal." 2
  info "Sauvegardes disponibles (plus récentes d'abord) :"
  for f in "${fichiers[@]}"; do
    info "  $i  $(decrire_sauvegarde "$f")"
    i=$((i + 1))
  done
  read -r -p "Numéro à restaurer : " choix
  if ! [[ "$choix" =~ ^[0-9]+$ ]] || ((choix < 1 || choix > ${#fichiers[@]})); then
    die "Choix invalide : rien n'a changé."
  fi
  printf '%s\n' "${fichiers[$((choix - 1))]}"
}

# Remplace la base par le dump : fermeture des connexions, base recréée vide, import (ancien ou nouveau format).
import_dump() {
  local base utilisateur
  base="$(db_name)"
  utilisateur="$(db_user)"
  printf 'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid();\nDROP DATABASE IF EXISTS %s WITH (FORCE);\nCREATE DATABASE %s OWNER %s;\n' \
    "$(sql_lit "$base")" "$(sql_ident "$base")" "$(sql_ident "$base")" "$(sql_ident "$utilisateur")" | db_psql postgres >/dev/null || return 1
  gzip -dc "$1" | db_psql "$base" >/dev/null
}

relancer_api_si_arretee() {
  api_running || dc up -d >/dev/null 2>&1 || true
}

cmd_restore() {
  local cible="" verifier="" args=("$@") fichier securite
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check) verifier=1 ;;
      --yes) export TB_YES=1 ;;
      -h | --help) usage_cmd restore; return 0 ;;
      -*) die "Option inconnue : $1" 2 ;;
      *) cible="$1" ;;
    esac
    shift
  done
  require_root restore
  if [[ -n "$verifier" ]]; then
    # Lecture seule, sans verrou.
    if [[ -n "$cible" ]]; then fichier="$(resoudre_sauvegarde "$cible")" || die "Sauvegarde introuvable : $cible"; else fichier="$(choisir_sauvegarde)"; fi
    dump_valide "$fichier" || die "Sauvegarde illisible ou incomplète : $(decrire_sauvegarde "$fichier")."
    ok "Sauvegarde lisible et complète : $(decrire_sauvegarde "$fichier")."
    return 0
  fi

  with_lock restore "${args[@]}"
  lock_note restore "${args[@]}"
  compose_valid || die "docker-compose.yml invalide (tracebayctl check) : restauration annulée, rien n'a changé."
  if [[ -n "$cible" ]]; then fichier="$(resoudre_sauvegarde "$cible")" || die "Sauvegarde introuvable : $cible"; else fichier="$(choisir_sauvegarde)"; fi
  dump_valide "$fichier" || die "Sauvegarde illisible ou incomplète : $(decrire_sauvegarde "$fichier"). Rien n'a changé."
  warn "Toute la base $(db_name) sera remplacée par : $(decrire_sauvegarde "$fichier")."
  if ! confirm "Restaurer cette sauvegarde ?"; then
    info "Annulé : rien n'a changé."
    return 0
  fi

  title "Sauvegarde de sécurité de l'état actuel"
  # Sans rotation : elle ne doit pas supprimer la sauvegarde qu'on s'apprête à restaurer.
  securite="$(do_backup avant-restauration sans-rotation)" || die "Sauvegarde de sécurité impossible : restauration annulée, rien n'a changé."
  ok "Sauvegarde de sécurité : $securite"

  title "Restauration"
  trap relancer_api_si_arretee EXIT
  dc stop proxmox >/dev/null 2>&1 || true
  if ! import_dump "$fichier"; then
    warn "Restauration échouée : remise de la base dans son état d'avant ($securite)."
    if import_dump "$securite/db.sql.gz"; then
      dc up -d --remove-orphans >/dev/null || true
      die "Restauration annulée : la base est revenue à son état d'avant, rien n'a changé."
    fi
    die "ÉCHEC GRAVE : ni la sauvegarde ni la sauvegarde de sécurité n'ont pu être importées. Ne rien relancer ; sauvegarde de sécurité : $securite"
  fi
  ok "Base restaurée depuis $(decrire_sauvegarde "$fichier")."
  rotation_sauvegardes
  dc up -d --remove-orphans >/dev/null || die "Base restaurée, mais l'API ne redémarre pas : tracebayctl logs api"
  if wait_api; then
    ok "API de nouveau en service. En cas de problème, revenir en arrière : tracebayctl restore $(basename "$securite")"
  else
    die "Base restaurée, mais l'API ne répond pas : tracebayctl logs api. Retour possible : tracebayctl restore $(basename "$securite")"
  fi
}
