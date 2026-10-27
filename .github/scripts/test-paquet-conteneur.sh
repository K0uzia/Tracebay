#!/bin/sh
# Lancement d'un paquet Linux de Tracebay dans un conteneur, sous Xvfb (job test-paquets).
# Usage : test-paquet-conteneur.sh appimage|deb|rpm   (paquets montés en lecture seule dans /p)
# Le conteneur tourne en root : --no-sandbox est donc obligatoire ici (le bac à sable réel est testé
# par test-maj-deb.sh, avec un utilisateur normal sur le runner).
set -eu
# Processus principaux de Tracebay (workspace ou electron, hors sous-processus --type=) : le PID
# change quand l'application se relance pour réparer son affichage.
vivants() {
    for d in /proc/[0-9]*; do
        c=$(cat "$d/comm" 2>/dev/null) || continue
        case "$c" in workspace|electron) ;; *) continue ;; esac
        tr '\0' ' ' < "$d/cmdline" 2>/dev/null | grep -q -- '--type=' && continue
        echo "${d#/proc/}"
    done
}
MODE="$1"
# shellcheck source=/dev/null
. /etc/os-release
echo "Distribution : $PRETTY_NAME, glibc : $(ldd --version 2>/dev/null | head -n 1)"

# RHEL 10 et dérivés : plus de Xorg ni de Xvfb ; lancement en Wayland natif sous mutter
SOUS_MUTTER=0
affichage_dnf() {
    if dnf install -y -q xorg-x11-server-Xvfb >/dev/null 2>&1; then
        dnf install -y -q xwininfo >/dev/null 2>&1 || dnf install -y -q xorg-x11-utils >/dev/null
    else
        echo "Xvfb absent (RHEL 10 et dérivés) : lancement sous mutter, en Wayland natif"
        dnf install -y -q mutter dbus-daemon dbus-tools >/dev/null
        SOUS_MUTTER=1
    fi
}

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
            dnf install -y -q gtk3 nss libXtst mesa-libgbm alsa-lib libsecret >/dev/null
            affichage_dnf
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
        dpkg -l | grep -Ei 'asound|libgbm' | awk '{print "  " $2, $3}'
        ls -l /usr/bin/workspace /opt/Tracebay/chrome-sandbox
        set -- /usr/bin/workspace
        ;;
    rpm)
        dnf install -y -q /p/workspace.rpm
        rpm -q workspace
        rpm -q --requires workspace | grep -v '^rpmlib' | tr '\n' ' '; echo
        ls -l /usr/bin/workspace /opt/Tracebay/chrome-sandbox
        echo "Bibliothèques manquantes (ldd) : $(ldd /opt/Tracebay/workspace | grep -c 'not found')"
        ldd /opt/Tracebay/workspace | grep 'not found' || true
        affichage_dnf
        set -- /usr/bin/workspace
        ;;
    *)
        echo "Mode inconnu : $MODE"
        exit 2
        ;;
esac

if [ "$SOUS_MUTTER" = 1 ]; then
    export RUNNER_TEMP=/tmp
    exec dbus-run-session -- bash /s/test-wayland.sh conteneur 1440x900 "$@" --no-sandbox
fi

Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
export DISPLAY=:99
sleep 2
"$@" --no-sandbox > /tmp/app.log 2>&1 &
sleep 20
if [ -z "$(vivants)" ]; then
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
grep -E '\[(Affichage|Fenêtre)\]' /tmp/app.log | head -n 10 || true
for p in $(vivants); do kill "$p" 2>/dev/null || true; done
