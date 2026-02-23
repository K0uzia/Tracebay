#!/usr/bin/env bash
# Évite les ECONNRESET lors du téléchargement d'Electron quand le projet
# est dans un chemin avec caractères spéciaux (ex. "Développement").
# Utilise un cache Electron hors du projet.
export ELECTRON_CACHE="${ELECTRON_CACHE:-$HOME/.cache/electron}"
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
exec npm install "$@"
