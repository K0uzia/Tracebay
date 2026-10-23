# shellcheck shell=bash
# tracebayctl status et check.

TB_ALERTES=0

# L'état va sur la sortie standard (peut être redirigé dans un fichier).
section() { printf '\n%s== %s ==%s\n' "$C_B" "$1" "$C_0"; }

# Libellé complété à 24 caractères (printf compte les octets, faux avec les accents).
libelle() {
  local LC_ALL=C.UTF-8 n
  n=$((24 - ${#1}))
  ((n < 1)) && n=1
  printf '  %s%*s' "$1" "$n" ''
}
ligne() { printf '%s%s\n' "$(libelle "$1")" "$2"; }
alerte() {
  printf '%s%s%s%s\n' "$(libelle "$1")" "$C_Y" "$2" "$C_0"
  TB_ALERTES=$((TB_ALERTES + 1))
}

ver_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" == "$2" ]]; }

# Verdict sur une version de Node : ok, fin de vie, ou vulnérable avec la version corrigée.
node_verdict() {
  local v="${1#v}" majeure correctif
  majeure="${v%%.*}"
  if ! [[ "$majeure" =~ ^[0-9]+$ ]]; then
    echo "inconnue"
    return 0
  fi
  if ((majeure < 22 || majeure % 2 == 1)); then
    echo "fin de vie"
    return 0
  fi
  for correctif in $TB_NODE_FIXED; do
    if [[ "${correctif%%.*}" == "$majeure" ]]; then
      if ver_ge "$v" "$correctif"; then echo "ok"; else echo "vulnérable (CVE-2026-111497, corrigé en $correctif)"; fi
      return 0
    fi
  done
  echo "ok"
}

jours_depuis() {
  local t
  t="$(date -d "$1" +%s 2>/dev/null)" || return 1
  echo $((($(date +%s) - t) / 86400))
}

# Fichier ou dossier de sauvegarde le plus récent (nouveau format et anciens pre_update_*.sql.gz).
derniere_sauvegarde() {
  local f meilleur="" t max=0
  for f in "$TB_BACKUPS"/*/manifest.txt "$TB_BACKUPS"/pre_update_*.sql.gz; do
    [[ -e "$f" ]] || continue
    t="$(stat -c %Y "$f")"
    if ((t > max)); then
      max=$t
      meilleur="$f"
    fi
  done
  [[ -n "$meilleur" ]] && printf '%s %s\n' "$max" "${meilleur%/manifest.txt}"
}

status_depot() {
  section "Version"
  local commit distant origine
  commit="$(git -C "$TB_REPO" log -1 --format='%h %cd %s' --date=format:'%d/%m/%Y' 2>/dev/null || echo "inconnu")"
  ligne "Commit déployé" "$commit"
  ligne "Branche" "$(git -C "$TB_REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
  distant="$(git -C "$TB_REPO" rev-list --count "HEAD..origin/$TB_BRANCH" 2>/dev/null || echo "?")"
  if [[ "$distant" == "0" ]]; then
    ligne "Retard sur origin" "aucun (au dernier fetch)"
  else
    ligne "Retard sur origin" "$distant commit(s) (au dernier fetch) : tracebayctl update"
  fi
  if [[ -r "$TB_STATE_DIR/derniere-maj" ]]; then
    local f="$TB_STATE_DIR/derniere-maj" texte resultat schema
    resultat="$(sed -n 's/^resultat=//p' "$f")"
    schema="$(sed -n 's/^schema=//p' "$f")"
    texte="$(sed -n 's/^date=//p' "$f"), $(sed -n 's/^depuis=//p' "$f") vers $(sed -n 's/^vers=//p' "$f"), $resultat, schéma : $schema"
    if [[ "$resultat" == "réussie" && "$schema" == "ok" ]]; then ligne "Dernière mise à jour" "$texte"; else alerte "Dernière mise à jour" "$texte"; fi
  fi
  origine="$(git -C "$TB_REPO" remote get-url origin 2>/dev/null || echo "absent")"
  if [[ "$origine" == "$TB_EXPECTED_ORIGIN" ]]; then
    ligne "Origin" "$origine"
  else
    alerte "Origin" "$origine (attendu $TB_EXPECTED_ORIGIN : tracebayctl install-cli propose la correction)"
  fi
}

status_services() {
  section "Services"
  local service etat sante redemarrages
  for service in proxmox db; do
    etat="$(docker inspect -f '{{.State.Status}}' "$(conteneur "$service")" 2>/dev/null || echo "absent")"
    sante="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$(conteneur "$service")" 2>/dev/null || true)"
    redemarrages="$(docker inspect -f '{{.RestartCount}}' "$(conteneur "$service")" 2>/dev/null || echo 0)"
    if [[ "$etat" == "running" && "${sante:-healthy}" == "healthy" ]]; then
      ligne "Conteneur $service" "en marche${sante:+, $sante}, $redemarrages redémarrage(s)"
    else
      alerte "Conteneur $service" "$etat${sante:+, $sante}"
    fi
  done
  if command -v systemctl >/dev/null 2>&1; then
    ligne "Service $TB_SERVICE" "$(systemctl is-enabled "$TB_SERVICE" 2>/dev/null || echo "absent"), $(systemctl is-active "$TB_SERVICE" 2>/dev/null || true)"
  fi
}

conteneur() {
  case "$1" in
    proxmox) env_get CONTAINER_API_NAME | grep . || echo "workspace-proxmox" ;;
    db) env_get CONTAINER_DB_NAME | grep . || echo "workspace-db" ;;
  esac
}

status_api() {
  section "API"
  local ip code licence branding etat
  ip="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
  ligne "Adresse" "http://${ip:-?}:$(api_port)"
  code="$(http_code "$(api_url)/api/health")"
  if [[ "$code" == "200" ]]; then ligne "Santé (/api/health)" "200"; else alerte "Santé (/api/health)" "${code:-pas de réponse}"; fi
  code="$(http_code "$(api_url)/api/branding")"
  if [[ "$code" == "200" ]]; then ligne "Accès à la base" "ok"; else alerte "Accès à la base" "GET /api/branding : ${code:-pas de réponse}"; fi

  branding="$(curl -s -m 5 "$(api_url)/api/branding" 2>/dev/null || true)"
  if [[ -n "$branding" ]]; then
    local logo="absent"
    [[ "$branding" == *'"logo":"data:'* ]] && logo="présent"
    ligne "Atelier" "$(json_field company_name "$branding"), logo $logo"
  fi

  licence="$(curl -s -m 5 "$(api_url)/api/licence" 2>/dev/null || true)"
  if [[ -n "$licence" ]]; then
    etat="$(json_field etat "$licence")"
    case "$etat" in
      active) ligne "Licence" "active, $(json_field entreprise "$licence"), expire le $(json_field expire "$licence")" ;;
      non_activee | absente) ligne "Licence" "non activée (tracebayctl set-licence)" ;;
      expire_bientot | grace) alerte "Licence" "$etat, $(json_field entreprise "$licence"), $(json_field jours_restants "$licence") jour(s)" ;;
      *) alerte "Licence" "${etat:-illisible} $(json_field raison "$licence")" ;;
    esac
  fi
}

status_versions() {
  section "Node et images"
  local v verdict image cree age
  v="$(dc exec -T proxmox node -v 2>/dev/null | tr -d '\r' || true)"
  if [[ -n "$v" ]]; then
    verdict="$(node_verdict "$v")"
    if [[ "$verdict" == "ok" ]]; then ligne "Node de l'API" "$v"; else alerte "Node de l'API" "$v : $verdict"; fi
  else
    alerte "Node de l'API" "inconnu (API arrêtée)"
  fi
  if command -v node >/dev/null 2>&1; then
    v="$(node -v)"
    verdict="$(node_verdict "$v")"
    if [[ "$verdict" == "ok" ]]; then
      ligne "Node de l'hôte" "$v (inutilisé par le service)"
    else
      ligne "Node de l'hôte" "$v, $verdict (inutilisé par le service : peut être désinstallé)"
    fi
  else
    ligne "Node de l'hôte" "absent (inutile, l'API est construite dans l'image)"
  fi
  while read -r image; do
    [[ -n "$image" ]] || continue
    cree="$(docker image inspect -f '{{.Created}}' "$image" 2>/dev/null || true)"
    [[ -n "$cree" ]] || continue
    age="$(jours_depuis "$cree" || echo "?")"
    if [[ "$age" =~ ^[0-9]+$ ]] && ((age > TB_IMAGE_MAX_AGE_DAYS)); then
      alerte "Image $image" "construite il y a $age jours : penser à tracebayctl update"
    else
      ligne "Image $image" "construite il y a $age jour(s)"
    fi
  done < <(dc config --images 2>/dev/null | sort -u)
}

status_disque() {
  section "Disque et sauvegardes"
  local chemin vus=" " fs libre pct derniere age
  for chemin in "$TB_REPO" "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true)"; do
    [[ -n "$chemin" && -d "$chemin" ]] || continue
    read -r fs libre pct < <(df -Pm "$chemin" | awk 'NR == 2 { gsub("%", "", $5); print $1, $4, 100 - $5 }')
    [[ "$vus" == *" $fs "* ]] && continue
    vus+="$fs "
    if ((pct < TB_DISK_MIN_PCT || libre < TB_DISK_MIN_MB)); then
      alerte "Disque $chemin" "$libre Mo libres ($pct %) : disque presque plein"
    else
      ligne "Disque $chemin" "$libre Mo libres ($pct %)"
    fi
  done
  derniere="$(derniere_sauvegarde || true)"
  if [[ -z "$derniere" ]]; then
    alerte "Dernière sauvegarde" "aucune dans $TB_BACKUPS : tracebayctl backup"
  else
    age=$((($(date +%s) - ${derniere%% *}) / 86400))
    if ((age > TB_BACKUP_MAX_AGE_DAYS)); then
      alerte "Dernière sauvegarde" "il y a $age jours : $(basename "${derniere#* }")"
    else
      ligne "Dernière sauvegarde" "il y a $age jour(s) : $(basename "${derniere#* }")"
    fi
  fi
  if [[ -f "$TB_CRON_FILE" ]]; then ligne "Sauvegarde quotidienne" "active ($TB_CRON_FILE)"; else alerte "Sauvegarde quotidienne" "inactive : tracebayctl cron on"; fi
}

status_config() {
  section "Configuration"
  local nom probleme
  if compose_valid 2>/dev/null; then ligne "docker compose config" "valide"; else alerte "docker compose config" "invalide : tracebayctl check"; fi
  for nom in JWT_SECRET ADMIN_TOKEN DB_PASSWORD; do
    probleme="$(secret_problem "$nom" "$(env_get "$nom")")"
    if [[ -z "$probleme" ]]; then ligne "$nom" "renseigné"; else alerte "$nom" "$probleme"; fi
  done
  declare -F status_comptes > /dev/null && status_comptes
  if lock_busy; then
    ligne "Verrou d'opération" "pris : $(lock_holder)"
  else
    ligne "Verrou d'opération" "libre"
  fi
}

cmd_status() {
  [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage_cmd status; return 0; }
  # Lecture seule et sans verrou : utilisable pendant une opération en cours.
  status_depot
  status_services
  status_api
  status_versions
  status_disque
  status_config
  printf '\n'
  if ((TB_ALERTES > 0)); then
    warn "$TB_ALERTES point(s) à regarder (en jaune ci-dessus)."
  else
    ok "Aucune alerte."
  fi
}

cmd_check() {
  [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage_cmd check; return 0; }
  if preflight; then
    ok "Docker, docker-compose.yml et $TB_ENV sont valides."
  else
    die "Configuration invalide : corriger les points ci-dessus avant toute opération."
  fi
}
