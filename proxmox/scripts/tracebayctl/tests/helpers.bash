# shellcheck shell=bash
# Environnement de test : dépôt Git factice (avec un origin local), faux docker, curl, systemctl,
# hostname, et faux flock si le système n'en a pas. Aucun accès réseau ni Docker réel.

bats_require_minimum_version 1.5.0

TB_SRC="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"

# Secrets de test, forts : ils ne doivent jamais apparaître dans une sortie ni dans les arguments d'une commande.
SECRET_JWT="$(printf 'j%.0s' {1..40})9f3c"
SECRET_ADMIN="$(printf 'a%.0s' {1..40})7d1e"
SECRET_DB="$(printf 'd%.0s' {1..24})5b2a"

ecrire_env() {
  cat > "$1" <<EOF
NODE_ENV=production
API_PORT=4000
JWT_SECRET=$SECRET_JWT
ADMIN_TOKEN=$SECRET_ADMIN
DB_NAME=workspace_db
DB_USER=Admin
DB_PASSWORD=$SECRET_DB
COMPOSE_PROJECT_NAME=proxmox
EOF
  chmod 600 "$1"
}

# Copie les scripts de tracebayctl dans le dépôt factice $1 (update relance la version du dépôt).
copier_scripts() {
  mkdir -p "$1/proxmox/scripts/tracebayctl"
  cp "$TB_SRC"/tracebayctl "$TB_SRC"/*.sh "$1/proxmox/scripts/tracebayctl/"
}

setup_tb() {
  export FAKE_DIR="$BATS_TEST_TMPDIR/fake"
  mkdir -p "$FAKE_DIR"
  local origine="$BATS_TEST_TMPDIR/origin.git"
  export TB_REPO="$BATS_TEST_TMPDIR/repo"

  git init -q --bare -b proxmox "$origine"
  git init -q -b proxmox "$TB_REPO"
  git -C "$TB_REPO" config core.autocrlf false
  mkdir -p "$TB_REPO/proxmox/docker" "$TB_REPO/proxmox/app/src/db"
  cp "$TB_SRC/../../docker/docker-compose.yml" "$TB_REPO/proxmox/docker/"
  echo "CREATE TABLE IF NOT EXISTS lots (id SERIAL PRIMARY KEY);" > "$TB_REPO/proxmox/app/src/db/schema.sql"
  echo "ALTER TABLE lots ADD COLUMN IF NOT EXISTS name VARCHAR(255);" > "$TB_REPO/proxmox/app/src/db/migrations-embarquees.sql"
  printf '.env\nbackups/\n' > "$TB_REPO/proxmox/docker/.gitignore"
  copier_scripts "$TB_REPO"
  (
    cd "$TB_REPO" || exit 1
    git -c core.autocrlf=false -c user.name=test -c user.email=test@example.invalid add -A
    git -c core.autocrlf=false -c user.name=test -c user.email=test@example.invalid commit -q -m "version initiale"
    git remote add origin "$origine"
    git push -q origin proxmox
    git fetch -q origin
  )
  ecrire_env "$TB_REPO/proxmox/docker/.env"
  echo "INSERT INTO lots VALUES (1);" > "$FAKE_DIR/db.content"

  TB_EXPECTED_ORIGIN="$(git -C "$TB_REPO" remote get-url origin)"
  export TB_EXPECTED_ORIGIN
  export TB_CONF="$BATS_TEST_TMPDIR/absent.conf"
  export TB_LOCK="$BATS_TEST_TMPDIR/ops.lock"
  export TB_LIB_DIR="$BATS_TEST_TMPDIR/lib/tracebay"
  export TB_BIN_DIR="$BATS_TEST_TMPDIR/bin"
  export TB_CRON_FILE="$BATS_TEST_TMPDIR/cron.d/tracebay-backup"
  export TB_SYSTEMD_DIR="$BATS_TEST_TMPDIR/systemd"
  export TB_STATE_DIR="$BATS_TEST_TMPDIR/state"
  export TB_CRON_LOG="$BATS_TEST_TMPDIR/tracebay-backup.log"
  export TB_OLD_CLI_LIB="$BATS_TEST_TMPDIR/lib/proxmox-cli.sh"
  export TB_SKIP_ROOT_CHECK=1 TB_SLEEP=0 TB_DB_WAIT=3 TB_API_WAIT=3
  export NO_COLOR=1
  unset TB_YES TB_LOCK_HELD TB_BACKUPS

  PATH="$TB_SRC/tests/fakes:$PATH"
  if ! command -v flock >/dev/null 2>&1; then
    PATH="$TB_SRC/tests/fakes-flock:$PATH"
  fi
  export PATH
  # shellcheck disable=SC2034 # utilisé par les fichiers .bats
  CTL="$TB_REPO/proxmox/scripts/tracebayctl/tracebayctl"
}

vrai_flock() { flock --version 2>/dev/null | grep -q util-linux; }

# Prend le verrou comme le ferait une autre opération en cours.
prendre_verrou() {
  if vrai_flock; then
    flock -n "$TB_LOCK" sleep 30 &
    VERROU_PID=$!
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      flock -n "$TB_LOCK" true 2>/dev/null || return 0
      sleep 0.1
    done
  else
    mkdir "$TB_LOCK.d"
  fi
  echo "pid 4242, tracebayctl update, depuis le 23/10/2026 10:00:00" > "$TB_LOCK.info"
}

rendre_verrou() {
  if [[ -n "${VERROU_PID:-}" ]]; then kill "$VERROU_PID" 2>/dev/null || true; fi
  rmdir "$TB_LOCK.d" 2>/dev/null || true
}

# Échoue si un secret de test apparaît dans $1 (texte) ou dans les arguments passés à docker ou curl.
refuter_secrets() {
  local s
  for s in "$SECRET_JWT" "$SECRET_ADMIN" "$SECRET_DB"; do
    if [[ "$1" == *"$s"* ]]; then
      echo "secret présent dans la sortie" >&2
      return 1
    fi
    if grep -qF "$s" "$FAKE_DIR/docker.log" "$FAKE_DIR/curl.log" 2>/dev/null; then
      echo "secret présent dans les arguments d'une commande" >&2
      return 1
    fi
  done
}

# Publie sur l'origin une nouvelle version : scripts marqués « version 2 », et les fichiers $@ ajoutés
# dans proxmox/docker (CASSE : compose invalide, CASSE_SANTE : API qui ne démarre pas).
nouvelle_version() {
  local clone="$BATS_TEST_TMPDIR/clone" f
  git clone -q -b proxmox "$BATS_TEST_TMPDIR/origin.git" "$clone"
  git -C "$clone" config core.autocrlf false
  copier_scripts "$clone"
  echo 'info "Scripts de la version 2."' >> "$clone/proxmox/scripts/tracebayctl/lib.sh"
  echo "ALTER TABLE lots ADD COLUMN IF NOT EXISTS v2 INT;" >> "$clone/proxmox/app/src/db/schema.sql"
  for f in "$@"; do touch "$clone/proxmox/docker/$f"; done
  git -C "$clone" add -A
  git -C "$clone" -c user.name=test -c user.email=test@example.invalid commit -q -m "version 2"
  git -C "$clone" push -q origin proxmox
  # shellcheck disable=SC2034 # NOUVEAU et ANCIEN : utilisés par les fichiers .bats
  NOUVEAU="$(git -C "$clone" rev-parse --short HEAD)"
  # shellcheck disable=SC2034
  ANCIEN="$(git -C "$TB_REPO" rev-parse --short HEAD)"
}
