# shellcheck shell=bash
# tracebayctl set-branding, set-licence, logs, users, admin-password, admin-code, user-delete.

# Empreintes SHA-256 des hachages de mots de passe publiés dans l'historique du dépôt (compte « admin »
# de l'ancien schema.sql). Comparées dans PostgreSQL : aucun hachage n'est lu ni affiché.
TB_KNOWN_HASH_SHA256="${TB_KNOWN_HASH_SHA256:-3228a480fbb0046dfac2c2efd87a88f1395059368944d2de3e99dd1d10617532}"

# Appel de l'API d'administration. Jeton par fichier d'en-tête, corps par fichier : rien en argument.
# Résultat dans TB_HTTP (code) et TB_REPONSE (corps).
api_admin() {
  local methode="$1" chemin="$2" corps="${3:-}" entete reponse token opts
  token="$(env_get ADMIN_TOKEN)"
  [[ -n "$token" ]] || die "ADMIN_TOKEN absent de $TB_ENV."
  entete="$(mktemp)"
  chmod 600 "$entete"
  printf 'x-admin-token: %s\nContent-Type: application/json\n' "$token" > "$entete"
  opts=(-s -m 30 -X "$methode" -H "@$entete" -w '\n%{http_code}')
  [[ -n "$corps" ]] && opts+=(--data-binary "@$corps")
  reponse="$(curl "${opts[@]}" "$(api_url)$chemin" 2> /dev/null || true)"
  rm -f "$entete"
  TB_HTTP="${reponse##*$'\n'}"
  TB_REPONSE="${reponse%$'\n'*}"
}

exiger_api() {
  api_healthy || die "L'API ne répond pas : la démarrer d'abord (tracebayctl status, tracebayctl logs api)."
}

nb_car() {
  local LC_ALL=C.UTF-8
  printf '%s' "${#1}"
}

corps_json() {
  local f
  f="$(mktemp)"
  chmod 600 "$f"
  printf '%s' "$1" > "$f"
  printf '%s' "$f"
}

# =============== Atelier et licence ===============

cmd_set_branding() {
  local args=("$@") nom="" logo="" retirer="" positionnels=() taille signature mime corps json
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --nom) nom="${2:-}"; shift ;;
      --logo) logo="${2:-}"; shift ;;
      --retirer-logo) retirer=1 ;;
      -h | --help) usage_cmd set-branding; return 0 ;;
      -*) die "Option inconnue : $1" 2 ;;
      *) positionnels+=("$1") ;;
    esac
    shift
  done
  # Ancienne forme : set-branding "NOM" [LOGO]
  [[ -z "$nom" && ${#positionnels[@]} -ge 1 ]] && nom="${positionnels[0]}"
  [[ -z "$logo" && ${#positionnels[@]} -ge 2 ]] && logo="${positionnels[1]}"
  nom="${nom//[$'\001'-$'\037']/}"
  [[ -n "$nom" || -n "$logo" || -n "$retirer" ]] || die "Rien à enregistrer : --nom, --logo ou --retirer-logo (tracebayctl set-branding -h)." 2
  [[ -n "$logo" && -n "$retirer" ]] && die "--logo et --retirer-logo ensemble : choisir l'un des deux." 2
  if [[ -n "$nom" ]] && (($(nb_car "$nom") > 120)); then
    die "Nom trop long (120 caractères au plus)." 2
  fi
  if [[ -n "$logo" ]]; then
    [[ -f "$logo" ]] || die "Logo introuvable : $logo" 2
    taille="$(stat -c %s "$logo")"
    ((taille > 0 && taille <= 524288)) || die "Le logo doit faire au plus 512 Ko." 2
    signature="$(head -c 12 "$logo" | od -An -tx1 | tr -d ' \n')"
    case "$signature" in
      89504e470d0a1a0a*) mime="image/png" ;;
      ffd8ff*) mime="image/jpeg" ;;
      52494646????????57454250) mime="image/webp" ;;
      *) die "Format de logo accepté : PNG, JPEG ou WebP (pas de SVG)." 2 ;;
    esac
  fi
  require_root set-branding
  with_lock set-branding "${args[@]}"
  lock_note set-branding
  exiger_api

  if [[ -n "$retirer" && -z "$nom" ]]; then
    api_admin DELETE /api/admin/branding/logo
  else
    json="{"
    [[ -n "$nom" ]] && json+="\"company_name\":$(json_str "$nom")"
    if [[ -n "$logo" ]]; then
      [[ -n "$nom" ]] && json+=","
      json+="\"logo\":\"data:$mime;base64,$(base64 -w0 "$logo")\""
    elif [[ -n "$retirer" ]]; then
      json+=",\"logo\":null"
    fi
    json+="}"
    corps="$(corps_json "$json")"
    api_admin PUT /api/admin/branding "$corps"
    rm -f "$corps"
  fi
  [[ "$TB_HTTP" == "200" ]] || die "Réglage refusé (HTTP ${TB_HTTP:-sans réponse}) : $(json_field error "$TB_REPONSE")"
  ok "Réglage de l'atelier enregistré${nom:+ : $nom}${mime:+, logo $mime}${retirer:+, logo retiré}. Les postes l'utilisent pour les prochains PDF."
}

cmd_set_licence() {
  local args=("$@") cle="${1:-}" corps
  [[ "$cle" == "-h" || "$cle" == "--help" ]] && { usage_cmd set-licence; return 0; }
  # Verrou d'abord : la commande est relancée sous flock, l'entrée standard doit être lue après.
  require_root set-licence
  with_lock set-licence "${args[@]}"
  lock_note set-licence
  case "$cle" in
    -) read -r cle || true ;;
    "")
      [[ -t 0 ]] || die "Clé attendue : tracebayctl set-licence \"TB1....\" (ou - pour la lire sur l'entrée standard)." 2
      read -r -p "Clé de licence (TB1....) : " cle
      ;;
  esac
  cle="${cle//[[:space:]]/}"
  [[ "$cle" =~ ^TB1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ && ${#cle} -le 4000 ]] || die "Ce n'est pas une clé de licence Tracebay (forme TB1.xxxx.yyyy)." 2
  exiger_api
  corps="$(corps_json "{\"cle\":\"$cle\"}")"
  api_admin PUT /api/admin/licence "$corps"
  rm -f "$corps"
  [[ "$TB_HTTP" == "200" ]] || die "Clé refusée (HTTP ${TB_HTTP:-sans réponse}) : $(json_field error "$TB_REPONSE")"
  ok "Licence enregistrée : $(json_field etat "$TB_REPONSE"), $(json_field entreprise "$TB_REPONSE"), expire le $(json_field expire "$TB_REPONSE")."
}

# =============== Journaux ===============

cmd_logs() {
  local service="proxmox" lignes=200 suivre=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      api) service="proxmox" ;;
      db) service="db" ;;
      live | -f | --suivre) suivre=(-f) ;;
      -n) lignes="${2:-}"; shift ;;
      -h | --help) usage_cmd logs; return 0 ;;
      *) die "Option inconnue : $1" 2 ;;
    esac
    shift
  done
  [[ "$lignes" =~ ^[0-9]+$ ]] || die "-n attend un nombre de lignes." 2
  dc logs --tail "$lignes" "${suivre[@]}" "$service"
}

# =============== Comptes ===============

# Ligne « id<TAB>nom<TAB>rôle » du compte : nom exact, sinon insensible à la casse s'il est unique.
trouver_compte() {
  local lignes
  lignes="$(printf "SELECT id, username, coalesce(role, 'user') FROM users WHERE username = %s;\n" "$(sql_lit "$1")" | db_psql "" -t -A -F $'\t')" || return 1
  if [[ -z "$lignes" ]]; then
    lignes="$(printf "SELECT id, username, coalesce(role, 'user') FROM users WHERE lower(username) = lower(%s);\n" "$(sql_lit "$1")" | db_psql "" -t -A -F $'\t')" || return 1
  fi
  if [[ -z "$lignes" ]]; then
    warn "Compte introuvable : $1 (tracebayctl users)"
    return 1
  fi
  if (($(printf '%s\n' "$lignes" | wc -l) > 1)); then
    warn "Plusieurs comptes correspondent à $1 : $(printf '%s\n' "$lignes" | cut -f2 | paste -sd ' ')"
    return 1
  fi
  printf '%s\n' "$lignes"
}

cmd_users() {
  [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage_cmd users; return 0; }
  require_root users
  local lignes id nom role cree supprime mdp
  # Colonnes choisies une à une : password_hash n'est jamais lu.
  lignes="$(printf "SELECT id, username, coalesce(role, 'user'), to_char(created_at, 'DD/MM/YYYY'), CASE WHEN password_hash IS NULL THEN 'non' ELSE 'oui' END, CASE WHEN deleted_at IS NULL THEN '' ELSE 'supprimé' END FROM users ORDER BY id;\n" | db_psql "" -t -A -F $'\t')" \
    || die "Lecture des comptes impossible (PostgreSQL arrêté ?)."
  printf '%-5s %-28s %-7s %-11s %-12s %s\n' "id" "nom" "rôle" "créé le" "mot de passe" "état"
  # Champ éventuellement vide en dernier : IFS tabulation fusionne les séparateurs consécutifs.
  while IFS=$'\t' read -r id nom role cree mdp supprime; do
    [[ -n "$id" ]] || continue
    printf '%-5s %-28s %-7s %-11s %-12s %s\n' "$id" "$nom" "$role" "$cree" "$mdp" "$supprime"
  done <<< "$lignes"
}

cmd_admin_password() {
  local args=("$@") nom="${1:-}" compte id mdp mdp2 corps
  case "$nom" in
    -h | --help) usage_cmd admin-password; return 0 ;;
    "" | -*) die "Usage : tracebayctl admin-password <utilisateur>" 2 ;;
  esac
  require_root admin-password
  with_lock admin-password "${args[@]}"
  lock_note admin-password "$nom"
  exiger_api
  compte="$(trouver_compte "$nom")" || die "Rien n'a changé."
  id="${compte%%$'\t'*}"
  nom="$(cut -f2 <<< "$compte")"
  if [[ -t 0 ]]; then
    read -r -s -p "Nouveau mot de passe pour $nom (12 caractères au moins) : " mdp
    printf '\n' >&2
    read -r -s -p "Une seconde fois : " mdp2
    printf '\n' >&2
    [[ "$mdp" == "$mdp2" ]] || die "Les deux saisies diffèrent : rien n'a changé."
  else
    IFS= read -r mdp || true
  fi
  (($(nb_car "$mdp") >= 12)) || die "Mot de passe trop court (12 caractères au moins) : rien n'a changé."
  # Le serveur hache le mot de passe (bcrypt) dans son conteneur ; il ne transite que par un fichier 600.
  corps="$(corps_json "{\"password\":$(json_str "$mdp")}")"
  unset mdp mdp2
  api_admin PUT "/api/admin/users/$id" "$corps"
  rm -f "$corps"
  [[ "$TB_HTTP" == "200" ]] || die "Mot de passe refusé (HTTP ${TB_HTTP:-sans réponse}) : $(json_field error "$TB_REPONSE")"
  ok "Mot de passe de $nom changé."
}

# Code administrateur des postes : déverrouille l'adresse du serveur sur un poste. Robustesse vérifiée
# par le serveur (une seule règle) ; le code ne passe que par un fichier 600, le serveur n'en garde
# qu'une empreinte scrypt, envoyée aux postes.
cmd_admin_code() {
  local args=("$@") code code2 corps
  case "${1:-}" in
    -h | --help) usage_cmd admin-code; return 0 ;;
    -*) die "Option inconnue : $1" 2 ;;
  esac
  require_root admin-code
  with_lock admin-code "${args[@]}"
  lock_note admin-code
  exiger_api
  if [[ -t 0 ]]; then
    read -r -s -p "Code administrateur des postes (12 caractères au moins, pas de suite ni de mot courant) : " code
    printf '\n' >&2
    read -r -s -p "Une seconde fois : " code2
    printf '\n' >&2
    [[ "$code" == "$code2" ]] || die "Les deux saisies diffèrent : rien n'a changé."
  else
    IFS= read -r code || true
    code2="$code"
  fi
  (($(nb_car "$code") >= 12)) || die "Code trop court (12 caractères au moins) : rien n'a changé."
  corps="$(corps_json "{\"code\":$(json_str "$code"),\"confirmation\":$(json_str "$code2")}")"
  unset code code2
  api_admin PUT "/api/admin/poste/code" "$corps"
  rm -f "$corps"
  [[ "$TB_HTTP" == "200" ]] || die "Code refusé (HTTP ${TB_HTTP:-sans réponse}) : $(json_field error "$TB_REPONSE")"
  ok "Code administrateur des postes enregistré. Les postes le reçoivent à leur prochaine connexion."
}

cmd_user_delete() {
  local args=("$@") nom="" compte id role
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes) export TB_YES=1 ;;
      -h | --help) usage_cmd user-delete; return 0 ;;
      -*) die "Option inconnue : $1" 2 ;;
      *) nom="$1" ;;
    esac
    shift
  done
  [[ -n "$nom" ]] || die "Usage : tracebayctl user-delete [--yes] <utilisateur>" 2
  require_root user-delete
  with_lock user-delete "${args[@]}"
  lock_note user-delete "$nom"
  exiger_api
  compte="$(trouver_compte "$nom")" || die "Rien n'a été supprimé."
  id="${compte%%$'\t'*}"
  nom="$(cut -f2 <<< "$compte")"
  role="$(cut -f3 <<< "$compte")"
  warn "Le compte $nom ($role, id $id) sera supprimé définitivement ; son nom et ses traces seront retirés du journal d'activité."
  confirm "Supprimer le compte $nom ?" || { info "Annulé : rien n'a été supprimé."; return 0; }
  api_admin DELETE "/api/admin/users/$id"
  [[ "$TB_HTTP" == "200" ]] || die "Suppression refusée (HTTP ${TB_HTTP:-sans réponse}) : $(json_field error "$TB_REPONSE")"
  ok "Compte $nom supprimé, journal d'activité anonymisé."
}

# Ligne de status : compte AdminTest, ou mot de passe encore égal à un défaut publié.
status_comptes() {
  local liste="" e resultat test defaut
  for e in $TB_KNOWN_HASH_SHA256; do liste+="${liste:+, }$(sql_lit "$e")"; done
  resultat="$(printf "SELECT coalesce(string_agg(username, ', ') FILTER (WHERE lower(username) = 'admintest'), ''), coalesce(string_agg(username, ', ') FILTER (WHERE password_hash IS NOT NULL AND encode(sha256(convert_to(password_hash, 'UTF8')), 'hex') IN (%s)), '') FROM users;\n" "$liste" | db_psql "" -t -A -F '|' 2> /dev/null)" || {
    alerte "Comptes" "lecture impossible (PostgreSQL arrêté ?)"
    return 0
  }
  test="${resultat%%|*}"
  defaut="${resultat#*|}"
  if [[ -z "$test" && -z "$defaut" ]]; then
    ligne "Comptes" "aucun compte de test ni mot de passe par défaut"
  fi
  [[ -n "$test" ]] && alerte "Compte de test" "$test présent : tracebayctl user-delete $test"
  [[ -n "$defaut" ]] && alerte "Mot de passe publié" "$defaut : tracebayctl admin-password <nom> (ou user-delete)"
  return 0
}
