#!/usr/bin/env bats
# tracebayctl help, check et status.

load helpers

setup() { setup_tb; }
teardown() { rendre_verrou; }

@test "help : liste les commandes, code 0" {
  run "$CTL" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage : tracebayctl"* ]]
  [[ "$output" == *"status"* ]]
}

@test "commande inconnue : code 2" {
  run "$CTL" nimporte
  [ "$status" -eq 2 ]
  [[ "$output" == *"Commande inconnue : nimporte"* ]]
}

@test "aide d'une commande avec -h" {
  run "$CTL" status -h
  [ "$status" -eq 0 ]
  [[ "$output" == *"Lecture seule"* ]]
}

@test "check : configuration valide" {
  run "$CTL" check
  [ "$status" -eq 0 ]
  [[ "$output" == *"sont valides"* ]]
  refuter_secrets "$output"
}

@test "check : compose invalide, arrêt avec le message de docker compose" {
  FAKE_CONFIG_FAIL=1 run "$CTL" check
  [ "$status" -eq 1 ]
  [[ "$output" == *"mapping values are not allowed"* ]]
  [[ "$output" == *"Configuration invalide"* ]]
}

@test "check : secret connu ou court refusé, sans afficher de valeur" {
  sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=workspace/' "$TB_REPO/proxmox/docker/.env"
  sed -i 's/^JWT_SECRET=.*/JWT_SECRET=court/' "$TB_REPO/proxmox/docker/.env"
  run "$CTL" check
  [ "$status" -eq 1 ]
  [[ "$output" == *"DB_PASSWORD : valeur par défaut connue"* ]]
  [[ "$output" == *"JWT_SECRET : trop court"* ]]
  [[ "$output" != *"=court"* ]]
}

@test "check : .env absent" {
  rm "$TB_REPO/proxmox/docker/.env"
  run "$CTL" check
  [ "$status" -eq 1 ]
  [[ "$output" == *".env absent"* ]]
}

@test "status : sections, secrets masqués, licence et atelier" {
  run "$CTL" status
  [ "$status" -eq 0 ]
  [[ "$output" == *"== Version =="* ]]
  [[ "$output" == *"Conteneur proxmox"*"en marche"* ]]
  [[ "$output" == *"Santé (/api/health)"*"200"* ]]
  [[ "$output" == *"Atelier"*"LA CAPSULE, logo présent"* ]]
  [[ "$output" == *"Licence"*"non activée"* ]]
  [[ "$output" == *"JWT_SECRET"*"renseigné"* ]]
  [[ "$output" == *"Node de l'API"*"v22.23.4"* ]]
  [[ "$output" == *"Verrou d'opération"*"libre"* ]]
  refuter_secrets "$output"
}

@test "status : Node vulnérable ou en fin de vie signalé" {
  FAKE_NODE_VERSION=v22.22.0 run "$CTL" status
  [[ "$output" == *"v22.22.0 : vulnérable (CVE-2026-111497, corrigé en 22.23.4)"* ]]
  FAKE_NODE_VERSION=v20.20.0 run "$CTL" status
  [[ "$output" == *"v20.20.0 : fin de vie"* ]]
}

@test "status : origin différent de K0uzia/Tracebay signalé" {
  git -C "$TB_REPO" remote set-url origin https://github.com/SandersonnDev/workspace
  run "$CTL" status
  [[ "$output" == *"Origin"*"SandersonnDev/workspace (attendu"* ]]
  [[ "$output" == *"install-cli propose la correction"* ]]
}

@test "status : API arrêtée et aucune sauvegarde, alertes comptées" {
  touch "$FAKE_DIR/api.down"
  run "$CTL" status
  [ "$status" -eq 0 ]
  [[ "$output" == *"Santé (/api/health)"*"000"* ]]
  [[ "$output" == *"Dernière sauvegarde"*"aucune"* ]]
  [[ "$output" == *"point(s) à regarder"* ]]
}

@test "status : verrou pris, opération en cours affichée" {
  prendre_verrou
  run "$CTL" status
  [[ "$output" == *"Verrou d'opération"*"pris : pid 4242, tracebayctl update"* ]]
}

@test "node_verdict" {
  TB_SELF_DIR="$TB_SRC"
  . "$TB_SRC/lib.sh"
  . "$TB_SRC/status.sh"
  [ "$(node_verdict v22.23.4)" = "ok" ]
  [ "$(node_verdict v22.24.0)" = "ok" ]
  [ "$(node_verdict v24.22.0)" = "vulnérable (CVE-2026-111497, corrigé en 24.22.1)" ]
  [ "$(node_verdict v26.12.1)" = "ok" ]
  [ "$(node_verdict v23.11.0)" = "fin de vie" ]
  [ "$(node_verdict v18.20.0)" = "fin de vie" ]
  [ "$(node_verdict v28.0.0)" = "ok" ]
  [ "$(node_verdict inconnu)" = "inconnue" ]
}
