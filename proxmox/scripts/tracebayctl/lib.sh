# shellcheck shell=bash
# Fonctions communes de tracebayctl : chargé par tracebayctl, jamais exécuté seul.

TB_EXPECTED_ORIGIN="${TB_EXPECTED_ORIGIN:-https://github.com/K0uzia/Tracebay.git}"
TB_BRANCH="${TB_BRANCH:-proxmox}"
TB_CONF="${TB_CONF:-/etc/tracebay/tracebayctl.conf}"
TB_LOCK="${TB_LOCK:-/run/tracebay-ops.lock}"
TB_LIB_DIR="${TB_LIB_DIR:-/usr/local/lib/tracebay}"
TB_BIN_DIR="${TB_BIN_DIR:-/usr/local/bin}"
TB_CRON_FILE="${TB_CRON_FILE:-/etc/cron.d/tracebay-backup}"
TB_SYSTEMD_DIR="${TB_SYSTEMD_DIR:-/etc/systemd/system}"
TB_SERVICE="${TB_SERVICE:-proxmox-backend}"
TB_STATE_DIR="${TB_STATE_DIR:-/var/lib/tracebay}"
TB_BACKUP_KEEP="${TB_BACKUP_KEEP:-14}"
TB_BACKUP_MAX_AGE_DAYS="${TB_BACKUP_MAX_AGE_DAYS:-2}"
TB_DISK_MIN_PCT="${TB_DISK_MIN_PCT:-10}"
TB_DISK_MIN_MB="${TB_DISK_MIN_MB:-2048}"
TB_IMAGE_MAX_AGE_DAYS="${TB_IMAGE_MAX_AGE_DAYS:-90}"
TB_SLEEP="${TB_SLEEP:-1}"
TB_DB_WAIT="${TB_DB_WAIT:-45}"
TB_API_WAIT="${TB_API_WAIT:-90}"
# Versions de Node corrigées contre la faille Brotli CVE-2026-111497 (21/10/2026), une par majeure suivie.
TB_NODE_FIXED="${TB_NODE_FIXED:-22.23.4 24.22.1 26.12.1}"

# Empreintes SHA-256 des anciens secrets publiés (même liste que proxmox/app/src/config/secrets.ts).
TB_KNOWN_SECRET_SHA256="057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86 e2186dbdb1bb4193608605e84f33208765b5693b55edd4f730a719a100eeea6f 92809ab604c9377285fbbcf82c4f30db65f107ecfd7217c7e62c17a2b3be7633 2cf82d6772e3014af9d2e3b0763c3ffee59e1f4df88ab1eda72ba8b81666c06e 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9 0537dfd229ccd644e29c82f0c27a1b3b075a1589fa75a186ed40abc25bfcd248 19e0c9cda72695f03a7560f35476f610057b88398b7fb9331db056971a29536b fee39c23856e3d9dd500861a30903548b8878994291b2fef7fff2f53b3073c0c 2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918 21a3230e03772a58aff1b3709a9e232850916337e1fba95c434076b6668c6e08"

# =============== Messages ===============

C_R="" C_G="" C_Y="" C_B="" C_0=""
if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
  C_R=$'\033[0;31m' C_G=$'\033[0;32m' C_Y=$'\033[1;33m' C_B=$'\033[1;36m' C_0=$'\033[0m'
fi

# Tous les messages vont sur la sortie d'erreur : la sortie standard reste aux résultats (chemin d'une sauvegarde).
info() { printf '%s\n' "$*" >&2; }
ok() { printf '%sOK%s %s\n' "$C_G" "$C_0" "$*" >&2; }
warn() { printf '%sATTENTION%s %s\n' "$C_Y" "$C_0" "$*" >&2; }
title() { printf '\n%s== %s ==%s\n' "$C_B" "$*" "$C_0" >&2; }
die() {
  printf '%sERREUR%s %s\n' "$C_R" "$C_0" "$1" >&2
  exit "${2:-1}"
}

trap_signals() {
  trap 'die "Interrompu." 130' INT TERM
}

require_root() {
  [[ $EUID -eq 0 || -n "${TB_SKIP_ROOT_CHECK:-}" ]] || die "tracebayctl $1 doit être lancé en root (sudo tracebayctl $1)."
}

# Oui seulement sur « o » ; sans terminal, il faut --yes.
confirm() {
  [[ -n "${TB_YES:-}" ]] && return 0
  [[ -t 0 ]] || die "Confirmation impossible sans terminal : relancer avec --yes."
  local reponse=""
  read -r -p "$1 [o/N] " reponse || true
  [[ "$reponse" == "o" || "$reponse" == "O" ]]
}

# =============== Dépôt et configuration ===============

# Ordre : TB_REPO, /etc/tracebay/tracebayctl.conf (écrit par install-cli), ancien WORKSPACE_REPO_ROOT,
# puis le dépôt qui contient ce script. Le fichier de configuration est lu, jamais exécuté.
tb_resolve_repo() {
  if [[ -z "${TB_REPO:-}" && -r "$TB_CONF" ]]; then
    TB_REPO="$(sed -n 's/^TB_REPO=//p' "$TB_CONF" | tail -n 1)"
  fi
  if [[ -z "${TB_REPO:-}" && -n "${WORKSPACE_REPO_ROOT:-}" ]]; then
    TB_REPO="$WORKSPACE_REPO_ROOT"
  fi
  if [[ -z "${TB_REPO:-}" ]]; then
    local candidat
    candidat="$(cd "$TB_SELF_DIR/../../.." 2>/dev/null && pwd || true)"
    [[ -n "$candidat" && -d "$candidat/proxmox/docker" ]] && TB_REPO="$candidat"
  fi
  [[ -n "${TB_REPO:-}" && -f "$TB_REPO/proxmox/docker/docker-compose.yml" ]] \
    || die "Dépôt Tracebay introuvable. Indiquer son dossier dans $TB_CONF (ligne TB_REPO=/root/workspace) ou lancer tracebayctl depuis le dépôt."
  TB_DOCKER="$TB_REPO/proxmox/docker"
  TB_ENV="$TB_DOCKER/.env"
  TB_BACKUPS="${TB_BACKUPS:-$TB_DOCKER/backups}"
}

env_get() {
  [[ -f "$TB_ENV" ]] || return 0
  sed -n "s/^$1=//p" "$TB_ENV" | tail -n 1
}

# Remplace ou ajoute CLE=VALEUR dans un fichier .env ; la valeur passe par l'environnement d'awk, jamais par ses arguments.
env_set_in() {
  local fichier="$1"
  TB_K="$2" TB_V="$3" awk '
    BEGIN { k = ENVIRON["TB_K"]; v = ENVIRON["TB_V"]; fait = 0 }
    index($0, k "=") == 1 { if (!fait) print k "=" v; fait = 1; next }
    { print }
    END { if (!fait) print k "=" v }
  ' "$fichier" > "$fichier.tmp" && cat "$fichier.tmp" > "$fichier" && rm -f "$fichier.tmp"
}

db_user() { local u; u="$(env_get DB_USER)"; printf '%s' "${u:-Admin}"; }
db_name() { local n; n="$(env_get DB_NAME)"; printf '%s' "${n:-workspace_db}"; }
api_port() { local p; p="$(env_get API_PORT)"; printf '%s' "${p:-4000}"; }
api_url() { printf 'http://127.0.0.1:%s' "$(api_port)"; }

sql_lit() { printf "'%s'" "${1//\'/\'\'}"; }
sql_ident() { printf '"%s"' "${1//\"/\"\"}"; }

json_str() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//[$'\001'-$'\037']/}"
  printf '"%s"' "$s"
}

# Valeur d'un champ texte ou numérique d'une réponse JSON plate (affichage seulement).
json_field() {
  local v
  v="$(printf '%s' "$2" | grep -o "\"$1\":\(\"[^\"]*\"\|[^,}]*\)" | head -n 1 | cut -d: -f2-)" || true
  v="${v#\"}"
  printf '%s' "${v%\"}"
}

# =============== Secrets ===============

# Même règle que proxmox/app/src/config/secrets.ts : vide, valeur publiée ou trop court.
secret_problem() {
  local nom="$1" valeur="$2" min=32 empreinte
  [[ "$nom" == "DB_PASSWORD" ]] && min=16
  if [[ -z "$valeur" ]]; then
    echo "vide"
    return 0
  fi
  empreinte="$(printf '%s' "${valeur,,}" | sha256sum | cut -d' ' -f1)"
  case "${valeur,,}" in
    change-me-* | admin-*) empreinte="prefixe" ;;
  esac
  if [[ "$empreinte" == "prefixe" || " $TB_KNOWN_SECRET_SHA256 " == *" $empreinte "* ]]; then
    echo "valeur par défaut connue (publiée dans le dépôt)"
  elif ((${#valeur} < min)); then
    echo "trop court (${#valeur} caractères, minimum $min)"
  fi
  return 0
}

rand_hex() {
  local v
  v="$(openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n')"
  ((${#v} == $1 * 2)) || die "Impossible de générer un secret aléatoire (openssl et /dev/urandom indisponibles)."
  printf '%s' "$v"
}

# =============== Docker ===============

# Depuis le dossier docker : le fichier docker-compose.override.yml local (montage du partage) est pris en compte.
dc() { (cd "$TB_DOCKER" && docker compose "$@"); }

# grep sans -q dans les tubes : avec pipefail, -q coupe le tube et le producteur meurt de SIGPIPE.
db_running() { dc ps --status running --services 2>/dev/null | grep -x db >/dev/null; }
api_running() { dc ps --status running --services 2>/dev/null | grep -x proxmox >/dev/null; }

wait_db() {
  local i
  for ((i = 0; i < TB_DB_WAIT; i++)); do
    dc exec -T db pg_isready -U "$(db_user)" >/dev/null 2>&1 && return 0
    sleep "$TB_SLEEP"
  done
  return 1
}

ensure_db_up() {
  if ! db_running; then
    info "Démarrage de PostgreSQL..."
    dc up -d db >/dev/null || return 1
  fi
  wait_db
}

# psql dans le conteneur db ; base par défaut celle de l'application.
db_psql() {
  local base="${1:-$(db_name)}"
  shift || true
  dc exec -T db psql -U "$(db_user)" -d "$base" -v ON_ERROR_STOP=1 -q "$@"
}

# Mot de passe du rôle PostgreSQL ; envoyé par l'entrée standard, jamais en argument (visible dans ps).
set_db_role_password() {
  printf 'ALTER ROLE %s WITH PASSWORD %s;\n' "$(sql_ident "$(db_user)")" "$(sql_lit "$1")" | db_psql postgres >/dev/null
}

http_code() { curl -s -o /dev/null -m 5 -w '%{http_code}' "$@" 2>/dev/null || true; }

# Santé de l'API et accès à la base (GET /api/branding lit app_settings).
api_healthy() {
  [[ "$(http_code "$(api_url)/api/health")" == "200" && "$(http_code "$(api_url)/api/branding")" == "200" ]]
}

wait_api() {
  local i
  for ((i = 0; i < TB_API_WAIT; i++)); do
    api_healthy && return 0
    sleep "$TB_SLEEP"
  done
  return 1
}

# =============== Contrôles avant opération ===============

compose_valid() { dc config -q >/dev/null; }

# Vérifie Docker, le compose et le .env ; affiche chaque problème et renvoie 1 s'il y en a un.
preflight() {
  local erreurs=0 nom probleme
  if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    warn "Docker ou le greffon docker compose est absent."
    return 1
  fi
  if [[ ! -f "$TB_ENV" ]]; then
    warn "Fichier $TB_ENV absent (tracebayctl install le crée)."
    return 1
  fi
  if [[ "$(stat -c %a "$TB_ENV")" != "600" ]]; then
    chmod 600 "$TB_ENV" && info "Droits de $TB_ENV ramenés à 600."
  fi
  for nom in JWT_SECRET ADMIN_TOKEN DB_PASSWORD; do
    probleme="$(secret_problem "$nom" "$(env_get "$nom")")"
    if [[ -n "$probleme" ]]; then
      warn "$nom : $probleme. Corriger avec : tracebayctl rotate-secrets"
      erreurs=1
    fi
  done
  if ! compose_valid; then
    warn "docker compose config refuse $TB_DOCKER/docker-compose.yml (message ci-dessus)."
    erreurs=1
  fi
  return "$erreurs"
}

# Espace libre en Mo du système de fichiers qui contient $1.
free_mb() { df -Pm "$1" 2>/dev/null | awk 'NR == 2 { print $4 }'; }

# =============== Verrou d'opération ===============

lock_busy() {
  local rc=0
  flock -n -E 75 "$TB_LOCK" true 2>/dev/null || rc=$?
  [[ $rc -eq 75 ]]
}

lock_holder() {
  [[ -r "$TB_LOCK.info" ]] && cat "$TB_LOCK.info" || echo "processus inconnu"
}

# Relance la commande sous verrou exclusif. Avec -o, flock ne transmet pas le descripteur du verrou
# à la commande : ni docker ni les conteneurs ne peuvent le garder après la fin de l'opération.
with_lock() {
  [[ -n "${TB_LOCK_HELD:-}" ]] && return 0
  command -v flock >/dev/null 2>&1 || die "flock (paquet util-linux) introuvable."
  local attente=(-n) rc=0
  [[ -n "${TB_LOCK_WAIT:-}" ]] && attente=(-w "$TB_LOCK_WAIT")
  TB_LOCK_HELD=1 flock "${attente[@]}" -o -E 75 "$TB_LOCK" "$TB_SELF" "$@" || rc=$?
  if [[ $rc -eq 75 ]]; then
    die "Une opération tracebayctl est déjà en cours ($(lock_holder)). Réessayer quand elle sera terminée." 75
  fi
  exit "$rc"
}

# À appeler une fois sous verrou : décrit l'opération en cours pour status et les autres commandes.
lock_note() {
  printf 'pid %s, tracebayctl %s, depuis le %s\n' "$$" "$*" "$(date '+%d/%m/%Y %H:%M:%S')" > "$TB_LOCK.info" 2>/dev/null || true
}
