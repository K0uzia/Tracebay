#!/usr/bin/env bats
# tracebayctl update.

load helpers

setup() { setup_tb; }
teardown() { rendre_verrou; }

head_court() { git -C "$TB_REPO" rev-parse --short HEAD; }
sauvegardes_maj() { find "$TB_REPO/proxmox/docker/backups" -maxdepth 1 -name '*-avant-maj' 2>/dev/null; }

@test "update : déjà à jour, rien n'est fait" {
  run "$CTL" update --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"Déjà à jour"* ]]
  [ -z "$(sauvegardes_maj)" ]
  [ ! -f "$FAKE_DIR/build.log" ]
}

@test "update : sauvegarde, nouveau code, image construite avant le redémarrage, scripts de la nouvelle version" {
  nouvelle_version
  run "$CTL" update --yes
  echo "$output"
  [ "$status" -eq 0 ]
  [ "$(head_court)" = "$NOUVEAU" ]
  [ -n "$(sauvegardes_maj)" ]
  [[ "$output" == *"Scripts de la version 2."* ]]
  [ "$(tail -n 1 "$FAKE_DIR/build.log")" = "$NOUVEAU" ]
  construction="$(grep -n '^compose build proxmox$' "$FAKE_DIR/docker.log" | head -n 1 | cut -d: -f1)"
  redemarrage="$(grep -n '^compose up -d --remove-orphans$' "$FAKE_DIR/docker.log" | head -n 1 | cut -d: -f1)"
  [ "$construction" -lt "$redemarrage" ]
  grep -q "ADD COLUMN IF NOT EXISTS v2" "$FAKE_DIR/psql.log"
  grep -q "ADD COLUMN IF NOT EXISTS name" "$FAKE_DIR/psql.log"
  grep -q '^ALTER ROLE "Admin" WITH PASSWORD' "$FAKE_DIR/psql.log"
  grep -q "^resultat=réussie$" "$TB_STATE_DIR/derniere-maj"
  grep -q "^schema=ok$" "$TB_STATE_DIR/derniere-maj"
  [[ "$output" == *"Mise à jour terminée : $ANCIEN vers $NOUVEAU"* ]]
  refuter_secrets "$output"
  run "$CTL" status
  [[ "$output" == *"Dernière mise à jour"*"$ANCIEN vers $NOUVEAU, réussie, schéma : ok"* ]]
}

@test "update : sauvegarde impossible, arrêt sans rien changer" {
  nouvelle_version
  FAKE_PGDUMP_FAIL=1 run "$CTL" update --yes
  [ "$status" -eq 1 ]
  [[ "$output" == *"Sauvegarde impossible : mise à jour annulée, rien n'a changé."* ]]
  [ "$(head_court)" = "$ANCIEN" ]
  [ ! -f "$FAKE_DIR/build.log" ]
}

@test "update : --skip-backup explicite, pas de sauvegarde" {
  nouvelle_version
  run "$CTL" update --yes --skip-backup
  [ "$status" -eq 0 ]
  [[ "$output" == *"--skip-backup : aucune sauvegarde"* ]]
  [ -z "$(sauvegardes_maj)" ]
  [ "$(head_court)" = "$NOUVEAU" ]
}

@test "update : SKIP_BACKUP_BEFORE_UPDATE=1 ignorée, la sauvegarde est faite" {
  nouvelle_version
  SKIP_BACKUP_BEFORE_UPDATE=1 run "$CTL" update --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"SKIP_BACKUP_BEFORE_UPDATE=1 est ignorée"* ]]
  [ -n "$(sauvegardes_maj)" ]
}

@test "update : construction échouée, retour au code d'avant, conteneurs intacts" {
  nouvelle_version
  FAKE_BUILD_FAIL_AT=1 run "$CTL" update --yes
  [ "$status" -eq 1 ]
  [[ "$output" == *"Construction échouée : code revenu à $ANCIEN, l'ancienne version est toujours en service."* ]]
  [ "$(head_court)" = "$ANCIEN" ]
  ! grep -q '^compose up -d --remove-orphans$' "$FAKE_DIR/docker.log"
}

@test "update : compose de la nouvelle version invalide, retour sans construction" {
  nouvelle_version CASSE
  run "$CTL" update --yes
  [ "$status" -eq 1 ]
  [[ "$output" == *"Configuration de la nouvelle version invalide"* ]]
  [ "$(head_court)" = "$ANCIEN" ]
  [ ! -f "$FAKE_DIR/build.log" ]
}

@test "update : API en échec après redémarrage, retour à l'ancienne version et sauvegarde indiquée" {
  nouvelle_version CASSE_SANTE
  run "$CTL" update --yes
  echo "$output"
  [ "$status" -eq 1 ]
  [ "$(head_court)" = "$ANCIEN" ]
  [ "$(tail -n 1 "$FAKE_DIR/build.log")" = "$ANCIEN" ]
  [[ "$output" == *"l'ancienne version est de nouveau en service"* ]]
  [[ "$output" == *"tracebayctl restore "*"-avant-maj"* ]]
  grep -q "^resultat=annulée" "$TB_STATE_DIR/derniere-maj"
  [ ! -f "$FAKE_DIR/api.down" ]
}

@test "update : erreur de schéma, avertissement noté et visible dans status" {
  nouvelle_version
  FAKE_PSQL_FAIL_ON="ADD COLUMN IF NOT EXISTS v2" run "$CTL" update --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"Schéma schema.sql : erreur"* ]]
  [ "$(head_court)" = "$NOUVEAU" ]
  grep -q "^schema=1 erreur(s)" "$TB_STATE_DIR/derniere-maj"
  grep -q "simulé" "$TB_STATE_DIR/schema-erreurs.log"
  run "$CTL" status
  [[ "$output" == *"Dernière mise à jour"*"schéma : 1 erreur(s)"* ]]
  [[ "$output" == *"point(s) à regarder"* ]]
}

@test "update : modifications locales du dépôt, refus sans terminal ni --yes" {
  nouvelle_version
  echo "# modifié à la main" >> "$TB_REPO/proxmox/app/src/db/schema.sql"
  run "$CTL" update </dev/null
  [ "$status" -eq 1 ]
  [[ "$output" == *"modifiés sur ce serveur"* ]]
  [ "$(head_court)" = "$ANCIEN" ]
}

@test "update : sans --yes ni terminal, aucune action" {
  nouvelle_version
  run "$CTL" update </dev/null
  [ "$status" -eq 1 ]
  [[ "$output" == *"relancer avec --yes"* ]]
  [ "$(head_court)" = "$ANCIEN" ]
  [ -z "$(sauvegardes_maj)" ]
}

@test "update : configuration invalide avant de commencer" {
  nouvelle_version
  sed -i 's/^ADMIN_TOKEN=.*/ADMIN_TOKEN=Password/' "$TB_REPO/proxmox/docker/.env"
  run "$CTL" update --yes
  [ "$status" -eq 1 ]
  [[ "$output" == *"rien n'a changé"* ]]
  [ "$(head_court)" = "$ANCIEN" ]
}

@test "update : opération déjà en cours, code 75" {
  nouvelle_version
  prendre_verrou
  run "$CTL" update --yes
  [ "$status" -eq 75 ]
  [ "$(head_court)" = "$ANCIEN" ]
}
