#!/bin/sh
# Lancement d'un paquet Linux de Tracebay dans un conteneur, sous Xvfb (job test-paquets).
# Usage : test-paquet-conteneur.sh appimage|deb|rpm   (paquets montés en lecture seule dans /p)
# Le conteneur tourne en root : --no-sandbox est donc obligatoire ici (le bac à sable réel est testé
# par test-maj-deb.sh, avec un utilisateur normal sur le runner).
set -eu
MODE="$1"
# shellcheck source=/dev/null
. /etc/os-release
echo "Distribution : $PRETTY_NAME, glibc : $(ldd --version 2>/dev/null | head -n 1)"

apt_installer() {
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends "$@" >/dev/null
}

case "$MODE" in
    appimage)
        if command -v apt-get >/dev/null 2>&1; then
            apt_installer xvfb x11-utils libgtk-3-0 libnss3 libxss1 libxtst6 libgbm1 libasound2 libsecret-1-0
        else
            dnf install -y -q xorg-x11-server-Xvfb xwininfo gtk3 nss libXScrnSaver libXtst mesa-libgbm alsa-lib libsecret >/dev/null
        fi
        cp /p/workspace.AppImage /tmp/workspace.AppImage
        chmod +x /tmp/workspace.AppImage
        echo "Sans FUSE (pas de /dev/fuse dans le conteneur) :"
        timeout 20 /tmp/workspace.AppImage --no-sandbox > /tmp/sans-fuse.log 2>&1 || echo "  code de sortie $?"
        head -n 5 /tmp/sans-fuse.log | sed 's/^/  | /'
        export APPIMAGE_EXTRACT_AND_RUN=1
        set -- /tmp/workspace.AppImage
        ;;
    deb)
        # Dépendances déclarées par le paquet seulement (plus Xvfb) : vérifie la liste du .deb.
        apt_installer xvfb x11-utils
        cp /p/workspace.deb /tmp/workspace.deb
        apt_installer /tmp/workspace.deb
        dpkg -s workspace | grep -E '^(Version|Depends)'
        ls -l /usr/bin/workspace /opt/Tracebay/chrome-sandbox
        set -- /usr/bin/workspace
        ;;
    rpm)
        dnf install -y -q xorg-x11-server-Xvfb xwininfo >/dev/null
        dnf install -y -q /p/workspace.rpm
        rpm -q workspace
        ls -l /usr/bin/workspace /opt/Tracebay/chrome-sandbox
        set -- /usr/bin/workspace
        ;;
    *)
        echo "Mode inconnu : $MODE"
        exit 2
        ;;
esac

Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
export DISPLAY=:99
sleep 2
"$@" --no-sandbox > /tmp/app.log 2>&1 &
APP=$!
sleep 20
if ! kill -0 "$APP" 2>/dev/null; then
    echo "ÉCHEC : l'application s'est arrêtée avant 20 s"
    tail -n 40 /tmp/app.log
    exit 1
fi
fenetre=$(xwininfo -root -tree 2>/dev/null | grep -i '"tracebay' | head -n 1 || true)
if [ -z "$fenetre" ]; then
    echo "ÉCHEC : application vivante mais aucune fenêtre Tracebay"
    tail -n 40 /tmp/app.log
    exit 1
fi
echo "OK : application lancée, fenêtre$fenetre"
kill "$APP" 2>/dev/null || true
