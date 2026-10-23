#!/usr/bin/env bats
# tracebayctl install, install-cli, cron, compatibilité proxmox et proxmox.sh, marche et maintenance.

load helpers

setup() { setup_tb; }
teardown() { rendre_verrou; }

@test "install-cli : copie, relais tracebayctl et proxmox, configuration, cron quotidien" {
  mkdir -p "$(dirname "$TB_OLD_CLI_LIB")"
  echo "ancienne cli" > "$TB_OLD_CLI_LIB"
  run "$CTL" install-cli
  echo "$output"
  [ "$status" -eq 0 ]
  [ -f "$TB_LIB_DIR/tracebayctl" ]
  [ -f "$TB_LIB_DIR/lib.sh" ]
  [ -f "$TB_LIB_DIR/install.sh" ]
  [ ! -f "$TB_OLD_CLI_LIB" ]
  grep -q "^TB_REPO=$TB_REPO$" "$TB_CONF"
  grep -q "17 3 \* \* \* root $TB_BIN_DIR/tracebayctl backup --tag quotidien --attendre >> $TB_CRON_LOG 2>&1" "$TB_CRON_FILE"
  run "$TB_BIN_DIR/tracebayctl" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage : tracebayctl"* ]]
  [ -z "$(find "$(dirname "$TB_LIB_DIR")" -maxdepth 1 -name '*.neuf.*' -o -maxdepth 1 -name '*.ancien.*')" ]
}

@test "install-cli --sans-cron : pas de sauvegarde quotidienne ; cron on, off, status" {
  run "$CTL" install-cli --sans-cron
  [ "$status" -eq 0 ]
  [ ! -f "$TB_CRON_FILE" ]
  run "$CTL" cron status
  [[ "$output" == *"inactive"* ]]
  "$CTL" cron on
  [ -f "$TB_CRON_FILE" ]
  run "$CTL" cron status
  [[ "$output" == *"active"* ]]
  "$CTL" cron off
  [ ! -f "$TB_CRON_FILE" ]
}

@test "install-cli : origin hérité corrigé avec --yes, laissé sans terminal" {
  attendu="$TB_EXPECTED_ORIGIN"
  git -C "$TB_REPO" remote set-url origin https://github.com/SandersonnDev/workspace
  run "$CTL" install-cli </dev/null
  [ "$status" -eq 0 ]
  [[ "$output" == *"Origin laissé tel quel"* ]]
  [ "$(git -C "$TB_REPO" remote get-url origin)" = "https://github.com/SandersonnDev/workspace" ]
  run "$CTL" install-cli --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"Origin corrigé"* ]]
  [ "$(git -C "$TB_REPO" remote get-url origin)" = "$attendu" ]
}

@test "ancienne commande proxmox : avis, status par défaut, logs live, endpoints" {
  "$CTL" install-cli --sans-cron
  run "$TB_BIN_DIR/proxmox"
  [ "$status" -eq 0 ]
  [[ "$output" == *"La commande proxmox est remplacée par tracebayctl"* ]]
  [[ "$output" == *"== Version =="* ]]
  run "$TB_BIN_DIR/proxmox" logs live
  grep -q "^compose logs --tail 200 -f proxmox$" "$FAKE_DIR/docker.log"
  run "$TB_BIN_DIR/proxmox" endpoints
  [ "$status" -eq 0 ]
  [[ "$output" == *"docs/API.md"* ]]
}

@test "proxmox.sh : enveloppe, anciens noms de commandes" {
  run bash "$TB_SRC/../proxmox.sh" status
  [ "$status" -eq 0 ]
  [[ "$output" == *"proxmox.sh est remplacé par tracebayctl"* ]]
  [[ "$output" == *"== Version =="* ]]
  mkdir -p "$TB_REPO/proxmox/docker/backups"
  printf -- '-- PostgreSQL database dump\nX\n-- PostgreSQL database dump complete\n' | gzip -c > "$TB_REPO/proxmox/docker/backups/pre_update_20260511_123326.sql.gz"
  run bash "$TB_SRC/../proxmox.sh" restore-backup --check pre_update_20260511_123326.sql.gz
  [ "$status" -eq 0 ]
  [[ "$output" == *"lisible et complète"* ]]
  run bash "$TB_SRC/../proxmox.sh" purge-safe
  [ "$status" -eq 0 ]
  grep -q "^builder prune -f$" "$FAKE_DIR/docker.log"
}

@test "update : la copie installée est rafraîchie avec les scripts de la nouvelle version" {
  "$CTL" install-cli --sans-cron
  nouvelle_version
  run "$TB_BIN_DIR/tracebayctl" update --yes
  echo "$output"
  [ "$status" -eq 0 ]
  grep -q 'Scripts de la version 2.' "$TB_LIB_DIR/lib.sh"
}

@test "uninstall-cli : commande retirée, dépôt et sauvegardes intacts" {
  "$CTL" install-cli
  "$CTL" backup > /dev/null
  run "$CTL" uninstall-cli
  [ "$status" -eq 0 ]
  [ ! -e "$TB_BIN_DIR/tracebayctl" ]
  [ ! -e "$TB_BIN_DIR/proxmox" ]
  [ ! -d "$TB_LIB_DIR" ]
  [ ! -f "$TB_CRON_FILE" ]
  [ -n "$(ls "$TB_REPO/proxmox/docker/backups")" ]
}

@test "install : .env créé aux secrets aléatoires, image, base, service, commande" {
  rm "$TB_REPO/proxmox/docker/.env"
  mkdir -p "$TB_SYSTEMD_DIR"
  run "$CTL" install --yes --sans-cron
  echo "$output"
  [ "$status" -eq 0 ]
  run "$CTL" check
  [ "$status" -eq 0 ]
  grep -q "^ALLOW_REGISTRATION=false$" "$TB_REPO/proxmox/docker/.env"
  grep -q "WorkingDirectory=$TB_REPO/proxmox/docker" "$TB_SYSTEMD_DIR/proxmox-backend.service"
  grep -q "^enable proxmox-backend$" "$FAKE_DIR/systemctl.log"
  grep -q "^compose build proxmox$" "$FAKE_DIR/docker.log"
  grep -q "^compose up -d --remove-orphans$" "$FAKE_DIR/docker.log"
  grep -q "CREATE TABLE IF NOT EXISTS lots" "$FAKE_DIR/psql.log"
  [ -f "$TB_BIN_DIR/tracebayctl" ]
  [ "$(cat "$FAKE_DIR/db.password")" = "$(sed -n 's/^DB_PASSWORD=//p' "$TB_REPO/proxmox/docker/.env")" ]
}

@test "install : .env existant conservé" {
  cp "$TB_REPO/proxmox/docker/.env" "$BATS_TEST_TMPDIR/env.origine"
  run "$CTL" install --yes --sans-cron
  [ "$status" -eq 0 ]
  [[ "$output" == *"existant : conservé"* ]]
  cmp "$TB_REPO/proxmox/docker/.env" "$BATS_TEST_TMPDIR/env.origine"
}

@test "start, stop, restart : systemd si le service existe, sinon docker compose" {
  run "$CTL" stop
  [ "$status" -eq 0 ]
  grep -q "^compose stop$" "$FAKE_DIR/docker.log"
  run "$CTL" start
  [ "$status" -eq 0 ]
  grep -q "^compose up -d$" "$FAKE_DIR/docker.log"
  mkdir -p "$TB_SYSTEMD_DIR"
  touch "$TB_SYSTEMD_DIR/proxmox-backend.service"
  run "$CTL" restart
  [ "$status" -eq 0 ]
  grep -q "^restart proxmox-backend$" "$FAKE_DIR/systemctl.log"
}

@test "test-api : santé, base, licence, routes protégées refusées sans jeton" {
  run "$CTL" test-api
  echo "$output"
  [ "$status" -eq 0 ]
  [[ "$output" == *"GET /api/monitoring/users : 401"* ]]
  FAKE_BRANDING_CODE=500 run "$CTL" test-api
  [ "$status" -eq 1 ]
}

@test "purge : jamais de docker volume prune" {
  run "$CTL" purge
  [ "$status" -eq 0 ]
  grep -q "^image prune -f$" "$FAKE_DIR/docker.log"
  ! grep -q "volume prune" "$FAKE_DIR/docker.log"
}

@test "destroy-db-volume : refusé sans la variable, sauvegarde avant destruction sinon" {
  run "$CTL" destroy-db-volume
  [ "$status" -eq 2 ]
  ! grep -q "down -v" "$FAKE_DIR/docker.log" 2>/dev/null
  I_ACCEPT_DESTROY_ALL_DATABASE_DATA=YES_I_UNDERSTAND TB_YES=1 run "$CTL" destroy-db-volume
  [ "$status" -eq 0 ]
  [ -n "$(find "$TB_REPO/proxmox/docker/backups" -maxdepth 1 -name '*-avant-destruction')" ]
  grep -q "^compose down -v --remove-orphans$" "$FAKE_DIR/docker.log"
}
