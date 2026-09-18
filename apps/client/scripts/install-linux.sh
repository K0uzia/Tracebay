#!/usr/bin/env bash
# Installation Tracebaie sous Linux (Debian/Ubuntu et dérivés).
# Usage :
#   ./install-linux.sh tracebaie.AppImage
#   ./install-linux.sh tracebaie.deb
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 <tracebaie.AppImage|tracebaie.deb>"
  exit 1
fi

ABS="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
EXT="${ABS##*.}"
EXT_LOWER="$(echo "$EXT" | tr '[:upper:]' '[:lower:]')"

if [[ "$EXT_LOWER" == "appimage" ]]; then
  chmod +x "$ABS"
  INSTALL_DIR="${HOME}/Applications"
  mkdir -p "$INSTALL_DIR"
  DEST="${INSTALL_DIR}/tracebaie.AppImage"
  cp -f "$ABS" "$DEST"
  chmod +x "$DEST"

  DESKTOP_DIR="${HOME}/.local/share/applications"
  mkdir -p "$DESKTOP_DIR"
  cat > "${DESKTOP_DIR}/tracebaie.desktop" <<EOF
[Desktop Entry]
Name=Tracebaie
Comment=Tracebaie — traçabilité de matériel informatique
Exec=${DEST}
Icon=tracebaie
Terminal=false
Type=Application
Categories=Utility;
StartupWMClass=tracebaie
EOF
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  echo "AppImage installée : ${DEST}"
  echo "Lancez depuis le menu applications, ou : ${DEST}"
  exec "$DEST"
fi

if [[ "$EXT_LOWER" == "deb" ]]; then
  echo "Installation du paquet .deb (mot de passe admin demandé)…"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y "$ABS"
  else
    sudo dpkg -i "$ABS" || true
    sudo apt-get install -f -y
  fi
  echo "Installation terminée. Lancez « Tracebaie » depuis le menu applications."
  exit 0
fi

echo "Format non supporté : .${EXT} (attendu .AppImage ou .deb)"
exit 1
