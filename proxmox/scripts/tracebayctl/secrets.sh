# shellcheck shell=bash
# tracebayctl rotate-secrets.
#
# Ordre : copie du .env, nouveau mot de passe du rôle PostgreSQL, puis seulement nouveau .env
# (écriture atomique), redémarrage et contrôle de l'API. À la moindre erreur, ou sur interruption,
# l'ancien .env et l'ancien mot de passe du rôle sont remis en place et les conteneurs relancés.

# Lance "$@" avec les secrets donnés pour l'interpolation de docker compose (le .env peut ne pas les avoir).
avec_secrets() {
  local jwt="$1" admin="$2" db="$3"
  shift 3
  JWT_SECRET="${jwt:-x}" ADMIN_TOKEN="${admin:-x}" DB_PASSWORD="${db:-x}" "$@"
}

restaurer_avant_rotation() {
  [[ -n "$TB_ROT_FINI" || -n "$TB_ROT_RESTAURE" ]] && return 0
  TB_ROT_RESTAURE=1
  warn "Remise en place de l'état d'avant la rotation..."
  if [[ -f "$TB_ROT_COPIE" ]]; then
    cat "$TB_ROT_COPIE" > "$TB_ENV" && rm -f "$TB_ROT_COPIE" && info ".env d'avant remis en place."
  fi
  if [[ -n "$TB_ROT_ROLE_CHANGE" ]]; then
    if [[ -n "$TB_ROT_ANCIEN_DB" ]] && avec_secrets "$TB_ROT_ANCIEN_JWT" "$TB_ROT_ANCIEN_ADMIN" "$TB_ROT_ANCIEN_DB" set_db_role_password "$TB_ROT_ANCIEN_DB"; then
      info "Mot de passe PostgreSQL d'avant remis en place."
    else
      warn "Mot de passe PostgreSQL d'avant non remis : relancer tracebayctl rotate-secrets."
    fi
  fi
  if dc up -d --remove-orphans > /dev/null 2>&1; then info "Conteneurs relancés avec l'ancienne configuration."; fi
}

echec_rotation() {
  warn "$1"
  restaurer_avant_rotation
  die "Rotation annulée : les secrets d'avant sont toujours en service."
}

cmd_rotate_secrets() {
  local args=("$@") jwt admin db tmp
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) export TB_YES=1 ;;
      -h | --help) usage_cmd rotate-secrets; return 0 ;;
      *) die "Option inconnue : $1" 2 ;;
    esac
    shift
  done
  require_root rotate-secrets
  with_lock rotate-secrets "${args[@]}"
  lock_note rotate-secrets

  [[ -f "$TB_ENV" ]] || die "$TB_ENV absent : tracebayctl install le crée."
  # Structure du compose seulement : les secrets actuels peuvent être absents ou faibles, c'est ce qu'on corrige.
  avec_secrets x x x compose_valid || die "docker-compose.yml invalide (message ci-dessus) : rien n'a changé."
  warn "JWT_SECRET, ADMIN_TOKEN et DB_PASSWORD vont être renouvelés : tous les utilisateurs devront se reconnecter et l'ancien ADMIN_TOKEN ne marchera plus."
  confirm "Renouveler les secrets ?" || { info "Annulé : rien n'a changé."; return 0; }

  TB_ROT_COPIE="$TB_DOCKER/.env.avant-rotation"
  TB_ROT_ANCIEN_JWT="$(env_get JWT_SECRET)"
  TB_ROT_ANCIEN_ADMIN="$(env_get ADMIN_TOKEN)"
  TB_ROT_ANCIEN_DB="$(env_get DB_PASSWORD)"
  TB_ROT_ROLE_CHANGE="" TB_ROT_FINI="" TB_ROT_RESTAURE=""
  (umask 077 && cat "$TB_ENV" > "$TB_ROT_COPIE") || die "Copie de sécurité du .env impossible : rien n'a changé."
  trap restaurer_avant_rotation EXIT

  jwt="$(rand_hex 32)"
  admin="$(rand_hex 32)"
  db="$(rand_hex 24)"

  title "PostgreSQL"
  avec_secrets "$jwt" "$admin" "$db" ensure_db_up || echec_rotation "PostgreSQL ne répond pas."
  TB_ROT_ROLE_CHANGE=1
  avec_secrets "$jwt" "$admin" "$db" set_db_role_password "$db" || echec_rotation "Changement du mot de passe PostgreSQL refusé."
  ok "Mot de passe PostgreSQL changé."

  title "Fichier .env"
  tmp="$(mktemp "$TB_ENV.XXXXXX")" || echec_rotation "Fichier temporaire impossible à créer."
  chmod 600 "$tmp"
  if ! { cat "$TB_ENV" > "$tmp" && env_set_in "$tmp" JWT_SECRET "$jwt" && env_set_in "$tmp" ADMIN_TOKEN "$admin" && env_set_in "$tmp" DB_PASSWORD "$db" && mv -f "$tmp" "$TB_ENV"; }; then
    rm -f "$tmp"
    echec_rotation "Écriture du nouveau .env impossible."
  fi
  ok "Nouveaux secrets écrits dans $TB_ENV."

  title "Redémarrage"
  dc up -d --remove-orphans || echec_rotation "docker compose up a échoué avec les nouveaux secrets."
  wait_api || echec_rotation "L'API ne répond pas avec les nouveaux secrets (santé ou accès à la base)."
  TB_ROT_FINI=1
  rm -f "$TB_ROT_COPIE"
  ok "Secrets renouvelés, API en service."
  info "Nouveau ADMIN_TOKEN (page de monitoring) : ligne ADMIN_TOKEN de $TB_ENV, à lire sans l'afficher en public."
}
