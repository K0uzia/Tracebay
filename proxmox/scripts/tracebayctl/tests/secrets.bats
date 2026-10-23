#!/usr/bin/env bats
# tracebayctl rotate-secrets.

load helpers

setup() {
  setup_tb
  ENV="$TB_REPO/proxmox/docker/.env"
  cp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
  printf '%s' "$SECRET_DB" > "$FAKE_DIR/db.password"
}
teardown() { rendre_verrou; }

valeur() { sed -n "s/^$1=//p" "$ENV" | tail -n 1; }

# Les nouveaux secrets ne doivent apparaître ni dans la sortie ni dans les arguments de docker ou curl.
refuter_nouveaux_secrets() {
  local nom v
  for nom in JWT_SECRET ADMIN_TOKEN DB_PASSWORD; do
    v="$(valeur "$nom")"
    [[ "$1" != *"$v"* ]] || { echo "$nom dans la sortie" >&2; return 1; }
    ! grep -qF "$v" "$FAKE_DIR/docker.log" "$FAKE_DIR/curl.log" 2>/dev/null || { echo "$nom dans des arguments" >&2; return 1; }
  done
}

@test "rotate-secrets : nouveaux secrets, rôle PostgreSQL aligné, API vérifiée" {
  run "$CTL" rotate-secrets --yes
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$(valeur JWT_SECRET)" != "$SECRET_JWT" ]
  [ "$(valeur ADMIN_TOKEN)" != "$SECRET_ADMIN" ]
  [ "$(valeur DB_PASSWORD)" != "$SECRET_DB" ]
  [ "${#SECRET_JWT}" -gt 0 ]
  [ "$(valeur JWT_SECRET | wc -c)" -eq 65 ]
  [ "$(valeur DB_PASSWORD | wc -c)" -eq 49 ]
  [ "$(cat "$FAKE_DIR/db.password")" = "$(valeur DB_PASSWORD)" ]
  grep -q '^NODE_ENV=production$' "$ENV"
  [ "$(grep -c '^DB_PASSWORD=' "$ENV")" -eq 1 ]
  [ ! -f "$TB_REPO/proxmox/docker/.env.avant-rotation" ]
  [[ "$output" == *"Secrets renouvelés, API en service."* ]]
  refuter_secrets "$output"
  refuter_nouveaux_secrets "$output"
}

@test "rotate-secrets : docker compose up en échec, .env identique et ancien mot de passe remis" {
  FAKE_UP_FAIL_AT=1 run "$CTL" rotate-secrets --yes
  echo "$output"
  [ "$status" -eq 1 ]
  cmp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
  [ "$(cat "$FAKE_DIR/db.password")" = "$SECRET_DB" ]
  [ "$(grep -c '^ALTER ROLE' "$FAKE_DIR/psql.log")" -eq 2 ]
  [ ! -f "$TB_REPO/proxmox/docker/.env.avant-rotation" ]
  [[ "$output" == *"docker compose up a échoué"* ]]
  [[ "$output" == *"Rotation annulée : les secrets d'avant sont toujours en service."* ]]
  refuter_secrets "$output"
}

@test "rotate-secrets : API muette après redémarrage, tout est remis comme avant" {
  FAKE_HEALTH=500 run "$CTL" rotate-secrets --yes
  [ "$status" -eq 1 ]
  cmp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
  [ "$(cat "$FAKE_DIR/db.password")" = "$SECRET_DB" ]
  [[ "$output" == *"L'API ne répond pas avec les nouveaux secrets"* ]]
}

@test "rotate-secrets : changement du rôle refusé, rien n'a changé" {
  FAKE_PSQL_FAIL_ON="ALTER ROLE" run "$CTL" rotate-secrets --yes
  [ "$status" -eq 1 ]
  cmp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
  [ "$(cat "$FAKE_DIR/db.password")" = "$SECRET_DB" ]
  [[ "$output" == *"Changement du mot de passe PostgreSQL refusé"* ]]
}

@test "rotate-secrets : interruption après le changement du rôle, état d'avant remis" {
  # Faux psql qui envoie SIGTERM au script après avoir changé le mot de passe du rôle.
  cat > "$BATS_TEST_TMPDIR/docker" <<'EOF'
#!/usr/bin/env bash
"$TB_SRC/tests/fakes/docker" "$@"
rc=$?
if [[ "$*" == *" psql "* && ! -f "$FAKE_DIR/interrompu" ]] && grep -q "ALTER ROLE" "$FAKE_DIR/psql.log" 2>/dev/null; then
  touch "$FAKE_DIR/interrompu"
  kill -TERM "$TB_VICTIME" 2>/dev/null
fi
exit $rc
EOF
  chmod +x "$BATS_TEST_TMPDIR/docker"
  PATH="$BATS_TEST_TMPDIR:$PATH" TB_SRC="$TB_SRC" TB_LOCK_HELD=1 run bash -c 'export TB_VICTIME=$$; exec "$0" rotate-secrets --yes' "$CTL"
  echo "$output"
  [ "$status" -eq 130 ]
  cmp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
  [ "$(cat "$FAKE_DIR/db.password")" = "$SECRET_DB" ]
  [[ "$output" == *"Interrompu."* ]]
}

@test "rotate-secrets : remède quand les secrets actuels sont faibles ou absents" {
  sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=workspace/; /^JWT_SECRET=/d' "$ENV"
  run "$CTL" rotate-secrets --yes
  [ "$status" -eq 0 ]
  [ "$(valeur JWT_SECRET | wc -c)" -eq 65 ]
  [ "$(valeur DB_PASSWORD)" != "workspace" ]
}

@test "rotate-secrets : compose invalide, rien n'a changé" {
  FAKE_CONFIG_FAIL=1 run "$CTL" rotate-secrets --yes
  [ "$status" -eq 1 ]
  cmp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
  [ ! -s "$FAKE_DIR/psql.log" ]
}

@test "rotate-secrets : sans --yes ni terminal, rien n'est fait" {
  run "$CTL" rotate-secrets </dev/null
  [ "$status" -eq 1 ]
  cmp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
}

@test "rotate-secrets : opération déjà en cours, code 75" {
  prendre_verrou
  run "$CTL" rotate-secrets --yes
  [ "$status" -eq 75 ]
  cmp "$ENV" "$BATS_TEST_TMPDIR/env.origine"
}
