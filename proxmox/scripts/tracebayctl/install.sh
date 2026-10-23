# shellcheck shell=bash
# tracebayctl install, install-cli, uninstall-cli, cron, start, stop, restart, rebuild, purge,
# destroy-db-volume, test-api, diag.

TB_CRON_LOG="${TB_CRON_LOG:-/var/log/tracebay-backup.log}"
TB_OLD_CLI_LIB="${TB_OLD_CLI_LIB:-/usr/local/lib/proxmox-cli.sh}"

# Script relais posé dans TB_BIN_DIR (plus sûr qu'un lien : rien à résoudre, nom d'appel transmis).
ecrire_relais() {
  local cible="$1" appel="${2:-}" tmp
  tmp="$(mktemp "$cible.XXXXXX")"
  {
    printf '#!/usr/bin/env bash\n# Installé par tracebayctl install-cli : lance la copie installée de tracebayctl.\n'
    if [[ -n "$appel" ]]; then
      printf 'TB_APPEL=%q exec %q "$@"\n' "$appel" "$TB_LIB_DIR/tracebayctl"
    else
      printf 'exec %q "$@"\n' "$TB_LIB_DIR/tracebayctl"
    fi
  } > "$tmp"
  chmod 755 "$tmp"
  mv -f "$tmp" "$cible"
}

# Copie des scripts du dépôt dans TB_LIB_DIR (dossier neuf puis échange) et relais tracebayctl.
installer_fichiers() {
  local source="$TB_REPO/proxmox/scripts/tracebayctl" neuf ancien
  [[ -f "$source/tracebayctl" ]] || source="$TB_SELF_DIR"
  mkdir -p "$(dirname "$TB_LIB_DIR")" "$TB_BIN_DIR"
  neuf="$TB_LIB_DIR.neuf.$$"
  ancien="$TB_LIB_DIR.ancien.$$"
  rm -rf -- "$neuf"
  mkdir -m 755 "$neuf"
  cp "$source/tracebayctl" "$source"/*.sh "$neuf/"
  chmod 755 "$neuf/tracebayctl"
  chmod 644 "$neuf"/*.sh
  if [[ -d "$TB_LIB_DIR" ]] && ! mv -- "$TB_LIB_DIR" "$ancien" 2> /dev/null; then
    # Dossier impossible à renommer (fichier ouvert sous Windows) : remplacement fichier par fichier,
    # jamais « mv neuf » qui le rangerait dans l'ancien dossier.
    cp -f "$neuf"/* "$TB_LIB_DIR/" || return 1
    rm -rf -- "$neuf"
  else
    mv -- "$neuf" "$TB_LIB_DIR" || return 1
    rm -rf -- "$ancien"
  fi
  ecrire_relais "$TB_BIN_DIR/tracebayctl"
  printf '%s\n' "$TB_LIB_DIR"
}

cron_activer() {
  mkdir -p "$(dirname "$TB_CRON_FILE")"
  cat > "$TB_CRON_FILE" <<EOF
# Sauvegarde quotidienne de la base Tracebay (14 gardées). Désactiver : tracebayctl cron off
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root $TB_BIN_DIR/tracebayctl backup --tag quotidien --attendre >> $TB_CRON_LOG 2>&1
EOF
  chmod 644 "$TB_CRON_FILE"
}

cmd_cron() {
  case "${1:-status}" in
    on)
      require_root cron
      cron_activer
      ok "Sauvegarde quotidienne activée (3 h 17, journal $TB_CRON_LOG)."
      ;;
    off)
      require_root cron
      rm -f "$TB_CRON_FILE"
      ok "Sauvegarde quotidienne désactivée."
      ;;
    status)
      if [[ -f "$TB_CRON_FILE" ]]; then info "Sauvegarde quotidienne : active ($TB_CRON_FILE)."; else info "Sauvegarde quotidienne : inactive (tracebayctl cron on)."; fi
      ;;
    -h | --help) usage_cmd cron ;;
    *) die "Usage : tracebayctl cron on|off|status" 2 ;;
  esac
}

verifier_origin() {
  local origine
  origine="$(git -C "$TB_REPO" remote get-url origin 2>/dev/null || true)"
  [[ "$origine" == "$TB_EXPECTED_ORIGIN" ]] && return 0
  warn "Origin du dépôt : ${origine:-absent}, attendu $TB_EXPECTED_ORIGIN."
  if [[ -n "${TB_YES:-}" || -t 0 ]] && confirm "Remplacer l'origin par $TB_EXPECTED_ORIGIN ?"; then
    if [[ -n "$origine" ]]; then
      git -C "$TB_REPO" remote set-url origin "$TB_EXPECTED_ORIGIN"
    else
      git -C "$TB_REPO" remote add origin "$TB_EXPECTED_ORIGIN"
    fi
    ok "Origin corrigé : $TB_EXPECTED_ORIGIN"
  else
    info "Origin laissé tel quel. Correction plus tard : tracebayctl install-cli"
  fi
}

# Installation de la commande : copie, relais tracebayctl et proxmox, configuration, origin, cron.
installer_cli() {
  local sans_cron="$1"
  installer_fichiers > /dev/null
  ecrire_relais "$TB_BIN_DIR/proxmox" proxmox
  rm -f "$TB_OLD_CLI_LIB"
  mkdir -p "$(dirname "$TB_CONF")"
  printf '# Écrit par tracebayctl install-cli.\nTB_REPO=%s\n' "$TB_REPO" > "$TB_CONF"
  chmod 644 "$TB_CONF"
  ok "tracebayctl installé : $TB_BIN_DIR/tracebayctl (copie dans $TB_LIB_DIR, dépôt $TB_REPO)."
  info "L'ancienne commande « proxmox » mène désormais à tracebayctl."
  verifier_origin
  if [[ -n "$sans_cron" ]]; then
    rm -f "$TB_CRON_FILE"
    info "Sauvegarde quotidienne non activée (--sans-cron). L'activer : tracebayctl cron on"
  else
    cron_activer
    ok "Sauvegarde quotidienne activée (3 h 17, 14 gardées). La désactiver : tracebayctl cron off"
  fi
}

cmd_install_cli() {
  local sans_cron="" args=("$@")
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --sans-cron) sans_cron=1 ;;
      --yes) export TB_YES=1 ;;
      -h | --help) usage_cmd install-cli; return 0 ;;
      *) die "Option inconnue : $1" 2 ;;
    esac
    shift
  done
  require_root install-cli
  with_lock install-cli "${args[@]}"
  installer_cli "$sans_cron"
}

cmd_uninstall_cli() {
  require_root uninstall-cli
  rm -f "$TB_BIN_DIR/tracebayctl" "$TB_BIN_DIR/proxmox" "$TB_CRON_FILE" "$TB_CONF"
  rm -rf -- "$TB_LIB_DIR"
  ok "tracebayctl désinstallé (le dépôt, la base et les sauvegardes sont intacts). Toujours utilisable depuis le dépôt : bash proxmox/scripts/tracebayctl/tracebayctl"
}

# =============== Installation complète ===============

generer_env() {
  local ip mail_from="noreply@localhost" smtp_host="localhost" smtp_port="25" smtp_secure="false" smtp_user="" smtp_pass="" reponse=""
  ip="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
  ip="${ip:-127.0.0.1}"
  if [[ -t 0 && -z "${TB_YES:-}" ]]; then
    read -r -p "Configurer l'envoi d'e-mails (PDF envoyés depuis la réception) maintenant ? [o/N] " reponse || true
    if [[ "$reponse" == "o" || "$reponse" == "O" ]]; then
      read -r -p "Adresse d'expédition [$mail_from] : " reponse && [[ -n "$reponse" ]] && mail_from="$reponse"
      read -r -p "Serveur SMTP [$smtp_host] : " reponse && [[ -n "$reponse" ]] && smtp_host="$reponse"
      read -r -p "Port SMTP [$smtp_port] : " reponse && [[ -n "$reponse" ]] && smtp_port="$reponse"
      read -r -p "Connexion chiffrée (TLS) ? [o/N] " reponse && [[ "$reponse" == "o" || "$reponse" == "O" ]] && smtp_secure="true"
      read -r -p "Utilisateur SMTP (vide si aucun) : " smtp_user || true
      read -r -s -p "Mot de passe SMTP (vide si aucun) : " smtp_pass || true
      printf '\n' >&2
    fi
  fi
  (
    umask 077
    cat > "$TB_ENV" <<EOF
# Configuration générée par tracebayctl install : secrets aléatoires, jamais de valeur par défaut.
NODE_ENV=production
API_PORT=4000
PORT=4000
LOG_LEVEL=info
SERVER_HOST=0.0.0.0
WS_PORT=4000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://$ip:3000,http://$ip,http://localhost
JWT_SECRET=$(rand_hex 32)
ADMIN_TOKEN=$(rand_hex 32)
DB_HOST=db
DB_PORT=5432
DB_NAME=workspace_db
DB_USER=Admin
DB_PASSWORD=$(rand_hex 24)
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000
COMPOSE_PROJECT_NAME=proxmox
ALLOW_REGISTRATION=false
MAIL_FROM=$mail_from
SMTP_HOST=$smtp_host
SMTP_PORT=$smtp_port
SMTP_SECURE=$smtp_secure
SMTP_USER=$smtp_user
SMTP_PASS=$smtp_pass
EOF
  )
  chmod 600 "$TB_ENV"
  ok "$TB_ENV créé avec des secrets aléatoires (adresse du serveur : $ip)."
}

installer_service() {
  command -v systemctl > /dev/null 2>&1 || return 0
  mkdir -p "$TB_SYSTEMD_DIR"
  cat > "$TB_SYSTEMD_DIR/$TB_SERVICE.service" <<EOF
[Unit]
Description=Tracebay : API et PostgreSQL (Docker Compose)
After=network-online.target docker.service
Wants=network-online.target docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$TB_DOCKER
ExecStart=/usr/bin/docker compose up -d
# stop et non down : réseau et volumes gardés
ExecStop=/usr/bin/docker compose stop
TimeoutStartSec=0
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$TB_SERVICE" > /dev/null 2>&1 || true
}

cmd_install() {
  local args=("$@") sans_cron="" erreurs
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --sans-cron) sans_cron=1 ;;
      --yes) export TB_YES=1 ;;
      -h | --help) usage_cmd install; return 0 ;;
      *) die "Option inconnue : $1" 2 ;;
    esac
    shift
  done
  require_root install
  with_lock install "${args[@]}"
  lock_note install
  if ! command -v docker > /dev/null 2>&1 || ! docker compose version > /dev/null 2>&1; then
    die "Docker et le greffon docker compose sont nécessaires (proxmox/docs/DEPLOYMENT.md, Prérequis)."
  fi
  title "Configuration"
  if [[ -f "$TB_ENV" ]]; then info "$TB_ENV existant : conservé."; else generer_env; fi
  preflight || die "Configuration invalide : installation arrêtée."
  title "Construction de l'image"
  dc build proxmox || die "Construction de l'image échouée (message ci-dessus)."
  title "Base de données"
  ensure_db_up || die "PostgreSQL ne démarre pas : tracebayctl logs db"
  set_db_role_password "$(env_get DB_PASSWORD)" || die "Mot de passe PostgreSQL non aligné sur DB_PASSWORD."
  erreurs="$(appliquer_schemas)"
  [[ "$erreurs" == "0" ]] || warn "$erreurs erreur(s) de schéma : $TB_STATE_DIR/schema-erreurs.log"
  title "Service"
  installer_service
  dc up -d --remove-orphans || die "docker compose up a échoué."
  wait_api || die "L'API ne répond pas : tracebayctl logs api"
  title "Commande tracebayctl"
  installer_cli "$sans_cron"
  ok "Installation terminée. État : tracebayctl status"
}

# =============== Marche, arrêt, maintenance ===============

a_service() { [[ -f "$TB_SYSTEMD_DIR/$TB_SERVICE.service" ]] && command -v systemctl > /dev/null 2>&1; }

cmd_start() {
  require_root start
  with_lock start
  if a_service; then systemctl start "$TB_SERVICE"; else dc up -d; fi
  wait_api || die "L'API ne répond pas : tracebayctl logs api"
  ok "Tracebay en service."
}

cmd_stop() {
  require_root stop
  with_lock stop
  if a_service; then systemctl stop "$TB_SERVICE"; else dc stop; fi
  ok "Tracebay arrêté (données et volume PostgreSQL conservés)."
}

cmd_restart() {
  require_root restart
  with_lock restart
  if a_service; then systemctl restart "$TB_SERVICE"; else dc restart; fi
  wait_api || die "L'API ne répond pas après le redémarrage : tracebayctl logs api"
  ok "Tracebay redémarré."
}

cmd_rebuild() {
  require_root rebuild
  with_lock rebuild
  lock_note rebuild
  preflight || die "Configuration invalide : rien n'a changé."
  dc build proxmox || die "Construction échouée : l'ancienne image est toujours en service."
  dc up -d --remove-orphans || die "docker compose up a échoué."
  wait_api || die "L'API ne répond pas : tracebayctl logs api"
  ok "Image reconstruite et API redémarrée (code inchangé ; nouvelle version : tracebayctl update)."
}

cmd_purge() {
  require_root purge
  with_lock purge
  docker builder prune -f > /dev/null 2>&1 || true
  docker image prune -f > /dev/null 2>&1 || true
  docker container prune -f > /dev/null 2>&1 || true
  ok "Caches Docker, images pendantes et conteneurs arrêtés supprimés. Volume PostgreSQL intact (aucun docker volume prune)."
}

cmd_destroy_db_volume() {
  local args=("$@") vol securite
  [[ "${I_ACCEPT_DESTROY_ALL_DATABASE_DATA:-}" == "YES_I_UNDERSTAND" ]] \
    || die "Refusé : exporter exactement I_ACCEPT_DESTROY_ALL_DATABASE_DATA=YES_I_UNDERSTAND pour supprimer le volume PostgreSQL." 2
  require_root destroy-db-volume
  with_lock destroy-db-volume "${args[@]}"
  lock_note destroy-db-volume
  warn "Toutes les données PostgreSQL vont être DÉTRUITES (volume Docker supprimé)."
  if securite="$(do_backup avant-destruction sans-rotation)"; then
    ok "Dernière sauvegarde : $securite"
  else
    warn "Aucune sauvegarde n'a pu être faite avant la destruction."
  fi
  confirm "Détruire définitivement la base ?" || { info "Annulé : rien n'a été détruit."; return 0; }
  dc down -v --remove-orphans > /dev/null 2>&1 || true
  for vol in proxmox_postgres_data workspace_postgres_data; do
    docker volume inspect "$vol" > /dev/null 2>&1 && docker volume rm "$vol" > /dev/null && info "Volume supprimé : $vol"
  done
  ok "Volume PostgreSQL supprimé. tracebayctl install recrée une base vide."
}

# Contrôles sans écriture : santé, base, licence, routes protégées refusées sans jeton.
cmd_test_api() {
  local echecs=0 code attendu chemin
  while read -r attendu chemin; do
    code="$(http_code "$(api_url)$chemin")"
    if [[ "$code" == "$attendu" ]]; then
      ok "GET $chemin : $code"
    else
      warn "GET $chemin : ${code:-pas de réponse} (attendu $attendu)"
      echecs=$((echecs + 1))
    fi
  done <<'EOF'
200 /api/health
200 /api/branding
200 /api/licence
401 /api/monitoring/users
401 /api/admin/users
EOF
  ((echecs == 0)) || die "$echecs contrôle(s) en échec."
  ok "API conforme."
}

cmd_diag() {
  cmd_status
  title "Journal de l'API (50 dernières lignes)"
  dc logs --tail 50 proxmox || true
  title "Journal de PostgreSQL (20 dernières lignes)"
  dc logs --tail 20 db || true
}
