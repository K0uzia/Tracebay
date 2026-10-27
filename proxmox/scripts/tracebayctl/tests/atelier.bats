#!/usr/bin/env bats
# tracebayctl set-branding, set-licence, logs, users, admin-password, user-delete, alerte de comptes.

load helpers

setup() { setup_tb; }
teardown() { rendre_verrou; }

png() { printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' > "$1"; }

@test "set-branding : nom et logo envoyés à l'API, jeton jamais en argument" {
  png "$BATS_TEST_TMPDIR/logo.png"
  run "$CTL" set-branding --nom 'Atelier "Les Ãmes" \ test' --logo "$BATS_TEST_TMPDIR/logo.png"
  echo "$output"
  [ "$status" -eq 0 ]
  grep -q '^PUT\|-X PUT' "$FAKE_DIR/curl.log"
  grep -qF '"company_name":"Atelier \"Les Ãmes\" \\ test"' "$FAKE_DIR/curl.body"
  grep -qF '"logo":"data:image/png;base64,iVBORw0K' "$FAKE_DIR/curl.body"
  grep -qF "x-admin-token: $SECRET_ADMIN" "$FAKE_DIR/curl.headers"
  [[ "$output" == *"logo image/png"* ]]
  refuter_secrets "$output"
}

@test "set-branding : ancienne forme NOM [LOGO] acceptée" {
  png "$BATS_TEST_TMPDIR/logo.png"
  run "$CTL" set-branding "LA CAPSULE" "$BATS_TEST_TMPDIR/logo.png"
  [ "$status" -eq 0 ]
  grep -qF '"company_name":"LA CAPSULE","logo":"data:image/png' "$FAKE_DIR/curl.body"
}

@test "set-branding : SVG, logo trop lourd, nom trop long refusés avant tout appel" {
  echo '<svg xmlns="http://www.w3.org/2000/svg"/>' > "$BATS_TEST_TMPDIR/logo.svg"
  run "$CTL" set-branding --nom X --logo "$BATS_TEST_TMPDIR/logo.svg"
  [ "$status" -eq 2 ]
  [[ "$output" == *"pas de SVG"* ]]
  png "$BATS_TEST_TMPDIR/gros.png"
  head -c 600000 /dev/zero >> "$BATS_TEST_TMPDIR/gros.png"
  run "$CTL" set-branding --nom X --logo "$BATS_TEST_TMPDIR/gros.png"
  [ "$status" -eq 2 ]
  [[ "$output" == *"512 Ko"* ]]
  run "$CTL" set-branding --nom "$(printf 'é%.0s' {1..121})"
  [ "$status" -eq 2 ]
  run "$CTL" set-branding --nom "$(printf 'é%.0s' {1..120})"
  [ "$status" -eq 0 ]
}

@test "set-branding : retirer le logo seul passe par DELETE" {
  run "$CTL" set-branding --retirer-logo
  [ "$status" -eq 0 ]
  grep -q -- "-X DELETE" "$FAKE_DIR/curl.log"
  grep -q "/api/admin/branding/logo" "$FAKE_DIR/curl.log"
}

@test "set-branding : refus de l'API affiché, API arrêtée signalée" {
  FAKE_PUT_CODE=400 FAKE_PUT_BODY='{"error":"Nom invalide."}' run "$CTL" set-branding --nom X
  [ "$status" -eq 1 ]
  [[ "$output" == *"HTTP 400"*"Nom invalide."* ]]
  touch "$FAKE_DIR/api.down"
  run "$CTL" set-branding --nom X
  [ "$status" -eq 1 ]
  [[ "$output" == *"L'API ne répond pas"* ]]
}

@test "set-licence : clé envoyée, état affiché ; clé mal formée refusée" {
  run "$CTL" set-licence "TB1.eyJ2IjoxfQ.c2lnbmF0dXJl"
  [ "$status" -eq 0 ]
  grep -qF '{"cle":"TB1.eyJ2IjoxfQ.c2lnbmF0dXJl"}' "$FAKE_DIR/curl.body"
  [[ "$output" == *"active, Atelier test, expire le 2027-10-23"* ]]
  run "$CTL" set-licence 'TB1.x"y.z'
  [ "$status" -eq 2 ]
  echo "TB1.abc.def" | "$CTL" set-licence -
  grep -qF '{"cle":"TB1.abc.def"}' "$FAKE_DIR/curl.body"
}

@test "logs : API par défaut, base, suivi et ancienne forme live" {
  run "$CTL" logs
  [ "$status" -eq 0 ]
  grep -q "^compose logs --tail 200 proxmox$" "$FAKE_DIR/docker.log"
  "$CTL" logs db -n 50
  grep -q "^compose logs --tail 50 db$" "$FAKE_DIR/docker.log"
  "$CTL" logs live
  grep -q "^compose logs --tail 200 -f proxmox$" "$FAKE_DIR/docker.log"
}

@test "users : liste sans hachage, requête sans password_hash lu" {
  run "$CTL" users
  [ "$status" -eq 0 ]
  [[ "$output" == *"AdminTest"* ]]
  [[ "$output" == *"marie"* ]]
  ! grep -q "SELECT password_hash\|, password_hash FROM\|SELECT \*" "$FAKE_DIR/psql.log"
}

@test "admin-password : saisie hors terminal, envoyée par fichier au bon compte" {
  run bash -c 'printf "%s\n" "un mot de passe \"très\" long" | "$0" admin-password marie' "$CTL"
  echo "$output"
  [ "$status" -eq 0 ]
  grep -q "/api/admin/users/3" "$FAKE_DIR/curl.log"
  grep -qF '{"password":"un mot de passe \"très\" long"}' "$FAKE_DIR/curl.body"
  ! grep -q "très" "$FAKE_DIR/curl.log" "$FAKE_DIR/docker.log"
  [[ "$output" != *"très"* ]]
  [[ "$output" == *"Mot de passe de marie changé."* ]]
}

@test "admin-password : trop court ou compte inconnu, rien n'est envoyé" {
  run bash -c 'echo court | "$0" admin-password marie' "$CTL"
  [ "$status" -eq 1 ]
  [[ "$output" == *"trop court"* ]]
  run bash -c 'echo "assez long pour passer" | "$0" admin-password personne' "$CTL"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Compte introuvable : personne"* ]]
  ! grep -q "/api/admin/users/" "$FAKE_DIR/curl.log"
}

@test "user-delete : nom insensible à la casse, confirmation, DELETE de l'API" {
  run "$CTL" user-delete --yes admintest
  [ "$status" -eq 0 ]
  grep -q -- "-X DELETE" "$FAKE_DIR/curl.log"
  grep -q "/api/admin/users/2" "$FAKE_DIR/curl.log"
  [[ "$output" == *"Compte AdminTest supprimé"* ]]
}

@test "user-delete : sans confirmation, rien n'est supprimé" {
  run "$CTL" user-delete AdminTest </dev/null
  [ "$status" -eq 1 ]
  ! grep -q -- "-X DELETE" "$FAKE_DIR/curl.log"
}

@test "status : alerte compte de test et mot de passe publié, comparaison dans PostgreSQL" {
  FAKE_COMPTES="AdminTest|admin" run "$CTL" status
  [[ "$output" == *"Compte de test"*"AdminTest présent : tracebayctl user-delete AdminTest"* ]]
  [[ "$output" == *"Mot de passe publié"*"admin : tracebayctl admin-password"* ]]
  grep -q "encode(sha256(convert_to(password_hash, 'UTF8')), 'hex') IN ('3228a480fbb0046dfac2c2efd87a88f1395059368944d2de3e99dd1d10617532')" "$FAKE_DIR/psql.log"
  FAKE_COMPTES="|" run "$CTL" status
  [[ "$output" == *"Comptes"*"aucun compte de test ni mot de passe par défaut"* ]]
}

@test "admin-code : saisie hors terminal, envoyée par fichier, jamais en argument ni affichée" {
  run bash -c 'printf "%s\n" "Capsule-Huelgoat-29" | "$0" admin-code' "$CTL"
  echo "$output"
  [ "$status" -eq 0 ]
  grep -q -- "-X PUT" "$FAKE_DIR/curl.log"
  grep -q "/api/admin/poste/code" "$FAKE_DIR/curl.log"
  grep -qF '{"code":"Capsule-Huelgoat-29","confirmation":"Capsule-Huelgoat-29"}' "$FAKE_DIR/curl.body"
  grep -qF "x-admin-token: $SECRET_ADMIN" "$FAKE_DIR/curl.headers"
  ! grep -q "Capsule-Huelgoat" "$FAKE_DIR/curl.log"
  [[ "$output" != *"Capsule-Huelgoat"* ]]
  [[ "$output" == *"Code administrateur des postes enregistré"* ]]
  refuter_secrets "$output"
}

@test "admin-code : code refusé par le serveur, message du serveur affiché" {
  export FAKE_PUT_CODE=400 FAKE_PUT_BODY='{"error":"Code trop simple : suite de caractères (abcdef, 123456, azerty…)."}'
  run bash -c 'printf "%s\n" "abcdefghijklmn" | "$0" admin-code' "$CTL"
  echo "$output"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Code trop simple"* ]]
}

@test "admin-code : trop court, rien n'est envoyé" {
  run bash -c 'echo court | "$0" admin-code' "$CTL"
  [ "$status" -eq 1 ]
  [[ "$output" == *"trop court"* ]]
  ! grep -q "/api/admin/poste/code" "$FAKE_DIR/curl.log"
}
