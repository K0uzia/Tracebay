#!/usr/bin/env bash
# Ancien point d'entrée, gardé pour la compatibilité : tout passe par tracebayctl
# (proxmox/scripts/tracebayctl, « tracebayctl help »). Mêmes noms de commandes qu'avant.

set -euo pipefail

ICI="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CTL="$ICI/tracebayctl/tracebayctl"

echo "proxmox.sh est remplacé par tracebayctl (tracebayctl help)." >&2

if [[ $# -eq 0 ]]; then
  exec bash "$CTL"
fi
commande="$1"
shift
case "$commande" in
  restore-backup) exec bash "$CTL" restore "$@" ;;
  purge-safe) exec bash "$CTL" purge "$@" ;;
  api-test) exec bash "$CTL" test-api "$@" ;;
  *) exec bash "$CTL" "$commande" "$@" ;;
esac
