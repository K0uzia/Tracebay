#!/usr/bin/env bats
# tracebayctl backup et restore.

load helpers

setup() { setup_tb; }
teardown() { rendre_verrou; }

sauvegardes() { find "$TB_REPO/proxmox/docker/backups" -mindepth 1 -maxdepth 1 -name '[0-9]*' -type d | sort; }

# Sauvegarde factice complète, datée $1 (AAAAMMJJ-HHMMSS), contenu $2.
fausse_sauvegarde() {
  local d="$TB_REPO/proxmox/docker/backups/$1"
  mkdir -p "$d"
  printf -- '-- PostgreSQL database dump\n%s\n-- PostgreSQL database dump complete\n' "$2" | gzip -c > "$d/db.sql.gz"
  printf 'date=%s\ntag=\n' "$1" > "$d/manifest.txt"
  touch -d "$(echo "$1" | sed 's/\(....\)\(..\)\(..\)-\(..\)\(..\)\(..\)/\1-\2-\3 \4:\5:\6/')" "$d/db.sql.gz" "$d/manifest.txt"
}

@test "backup : dossier vérifié, manifeste, chemin seul sur la sortie standard" {
  run --separate-stderr "$CTL" backup --tag essai
  echo "$output"; [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | wc -l)" -eq 1 ]
  [ -f "$output/db.sql.gz" ]
  [[ "$output" == *-essai ]]
  gzip -dc "$output/db.sql.gz" | grep -q "INSERT INTO lots VALUES (1);"
  grep -q '^tag=essai$' "$output/manifest.txt"
  grep -q '^sha256=' "$output/manifest.txt"
  [ -z "$(find "$TB_REPO/proxmox/docker/backups" -name '*.en-cours')" ]
  grep -q -- "pg_dump -U Admin -d workspace_db --no-owner --no-acl --clean --if-exists" "$FAKE_DIR/docker.log"
  refuter_secrets "$output $stderr"
}

@test "backup : pg_dump en échec, rien n'est gardé" {
  FAKE_PGDUMP_FAIL=1 run "$CTL" backup
  echo "$output"; [ "$status" -eq 1 ]
  [[ "$output" == *"pg_dump a échoué"* ]]
  [ -z "$(sauvegardes)" ]
  [ -z "$(find "$TB_REPO/proxmox/docker/backups" -name '.*en-cours')" ]
}

@test "backup : dump coupé (fin absente) refusé" {
  FAKE_PGDUMP_TRUNCATED=1 run "$CTL" backup
  echo "$output"; [ "$status" -eq 1 ]
  [[ "$output" == *"incomplète"* ]]
  [ -z "$(sauvegardes)" ]
}

@test "backup : PostgreSQL arrêté, démarré avant la sauvegarde" {
  touch "$FAKE_DIR/db.down"
  run "$CTL" backup
  echo "$output"; [ "$status" -eq 0 ]
  grep -q "^compose up -d db$" "$FAKE_DIR/docker.log"
}

@test "backup : rotation à 14, les plus anciennes supprimées" {
  for j in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15; do fausse_sauvegarde "202610${j}-030000" "jour $j"; done
  run "$CTL" backup
  echo "$output"; [ "$status" -eq 0 ]
  [ "$(sauvegardes | wc -l)" -eq 14 ]
  [ ! -d "$TB_REPO/proxmox/docker/backups/20261001-030000" ]
  [ ! -d "$TB_REPO/proxmox/docker/backups/20261002-030000" ]
  [ -d "$TB_REPO/proxmox/docker/backups/20261003-030000" ]
}

@test "backup : étiquette invalide, code 2" {
  run "$CTL" backup --tag "../x"
  [ "$status" -eq 2 ]
}

@test "backup : opération déjà en cours, code 75 et opération affichée" {
  prendre_verrou
  run "$CTL" backup
  [ "$status" -eq 75 ]
  [[ "$output" == *"déjà en cours (pid 4242, tracebayctl update"* ]]
  [ -z "$(sauvegardes)" ]
}

@test "backup : compose invalide, aucune sauvegarde" {
  FAKE_CONFIG_FAIL=1 run "$CTL" backup
  echo "$output"; [ "$status" -eq 1 ]
  [ -z "$(sauvegardes)" ]
}

@test "verrou : descripteur jamais transmis à docker (vrai flock seulement)" {
  vrai_flock || skip "flock d'util-linux absent (Git Bash) : contrôle fait sur le serveur"
  cat > "$BATS_TEST_TMPDIR/docker" <<'EOF'
#!/usr/bin/env bash
ls -l /proc/$$/fd 2>/dev/null | grep -F "$TB_LOCK" >> "$FAKE_DIR/fd-verrou" || true
exec "$TB_SRC/tests/fakes/docker" "$@"
EOF
  chmod +x "$BATS_TEST_TMPDIR/docker"
  PATH="$BATS_TEST_TMPDIR:$PATH" TB_SRC="$TB_SRC" run "$CTL" backup
  echo "$output"; [ "$status" -eq 0 ]
  [ ! -s "$FAKE_DIR/fd-verrou" ]
}

@test "restore : sauvegarde de sécurité, API arrêtée puis relancée, base remplacée" {
  fausse_sauvegarde 20261020-030000 "INSERT INTO lots VALUES (20);"
  run "$CTL" restore --yes 20261020-030000
  echo "$output"; [ "$status" -eq 0 ]
  grep -q "VALUES (20)" "$FAKE_DIR/db.content"
  securite="$(find "$TB_REPO/proxmox/docker/backups" -maxdepth 1 -name '*-avant-restauration')"
  [ -n "$securite" ]
  gzip -dc "$securite/db.sql.gz" | grep -q "VALUES (1);"
  grep -q "^compose stop proxmox$" "$FAKE_DIR/docker.log"
  grep -q "DROP DATABASE IF EXISTS \"workspace_db\" WITH (FORCE);" "$FAKE_DIR/psql.log"
  [ ! -f "$FAKE_DIR/api.down" ]
  [[ "$output" == *"API de nouveau en service"* ]]
  refuter_secrets "$output"
}

@test "restore : import en échec, base remise dans son état d'avant" {
  fausse_sauvegarde 20261020-030000 "INSERT INTO lots VALUES (20); -- casse"
  FAKE_PSQL_FAIL_ON="-- casse" run "$CTL" restore --yes 20261020-030000
  echo "$output"; [ "$status" -eq 1 ]
  [[ "$output" == *"la base est revenue à son état d'avant"* ]]
  grep -q "VALUES (1);" "$FAKE_DIR/db.content"
  [ ! -f "$FAKE_DIR/api.down" ]
}

@test "restore : la plus ancienne des 14 n'est pas supprimée par la sauvegarde de sécurité" {
  for j in 01 02 03 04 05 06 07 08 09 10 11 12 13 14; do fausse_sauvegarde "202610${j}-030000" "INSERT INTO lots VALUES ($j);"; done
  run "$CTL" restore --yes 20261001-030000
  echo "$output"; [ "$status" -eq 0 ]
  grep -q "VALUES (01)" "$FAKE_DIR/db.content"
  [ "$(sauvegardes | wc -l)" -eq 14 ]
}

@test "restore : ancien fichier pre_update_*.sql.gz" {
  mkdir -p "$TB_REPO/proxmox/docker/backups"
  printf -- '-- PostgreSQL database dump\nINSERT INTO lots VALUES (7);\n-- PostgreSQL database dump complete\n' | gzip -c > "$TB_REPO/proxmox/docker/backups/pre_update_20260511_123326.sql.gz"
  run "$CTL" restore --yes pre_update_20260511_123326.sql.gz
  echo "$output"; [ "$status" -eq 0 ]
  grep -q "VALUES (7)" "$FAKE_DIR/db.content"
}

@test "restore --check : sauvegarde coupée signalée, rien n'est touché" {
  mkdir -p "$TB_REPO/proxmox/docker/backups/20261020-030000"
  printf -- '-- PostgreSQL database dump\nINSERT\n' | gzip -c > "$TB_REPO/proxmox/docker/backups/20261020-030000/db.sql.gz"
  run "$CTL" restore --check 20261020-030000
  echo "$output"; [ "$status" -eq 1 ]
  [[ "$output" == *"incomplète"* ]]
  [ ! -s "$FAKE_DIR/psql.log" ]
}

@test "restore : sans argument ni terminal, code 2" {
  fausse_sauvegarde 20261020-030000 "x"
  run "$CTL" restore </dev/null
  [ "$status" -eq 2 ]
}

@test "restore : sans --yes ni terminal, rien n'est fait" {
  fausse_sauvegarde 20261020-030000 "INSERT INTO lots VALUES (20);"
  run "$CTL" restore 20261020-030000 </dev/null
  echo "$output"; [ "$status" -eq 1 ]
  [[ "$output" == *"relancer avec --yes"* ]]
  grep -q "VALUES (1);" "$FAKE_DIR/db.content"
}

@test "restore : sauvegarde introuvable" {
  run "$CTL" restore --yes 20990101-000000
  echo "$output"; [ "$status" -eq 1 ]
  [[ "$output" == *"Sauvegarde introuvable"* ]]
}
