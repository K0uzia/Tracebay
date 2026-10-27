#!/usr/bin/env bash
# Lance Tracebay en Wayland natif sous mutter (compositeur de GNOME) sans écran, journal à l'appui
# (jobs test-wayland, test-paquets EL10). Usage : test-wayland.sh <libellé> <largeur>x<hauteur> <commande…>
# À lancer dans dbus-run-session. Code 0 si l'application tourne encore après 20 s.
# Échanges Wayland (WAYLAND_DEBUG) gardés pour xdg_surface, xdg_toplevel et set_window_geometry.
set -uo pipefail
NOM=$1
ECRAN=$2
shift 2
J="$RUNNER_TEMP/journaux-wayland"
mkdir -p "$J"
XDG_RUNTIME_DIR=$(mktemp -d)
chmod 700 "$XDG_RUNTIME_DIR"
export XDG_RUNTIME_DIR

mutter --headless --wayland --no-x11 --virtual-monitor "$ECRAN" > "$J/mutter-$NOM.log" 2>&1 &
MUTTER=$!
for _ in $(seq 1 50); do
    [ -S "$XDG_RUNTIME_DIR/wayland-0" ] && break
    sleep 0.2
done
if [ ! -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
    echo "ÉCHEC ($NOM) : mutter n'a pas ouvert de socket Wayland"
    tail -n 20 "$J/mutter-$NOM.log"
    kill "$MUTTER" 2>/dev/null
    exit 1
fi

BRUT="$XDG_RUNTIME_DIR/brut.log"
env -u DISPLAY WAYLAND_DISPLAY=wayland-0 XDG_SESSION_TYPE=wayland WAYLAND_DEBUG=client "$@" \
    > "$BRUT" 2>&1 < /dev/null &
APP=$!
sleep 20
r=0
if kill -0 "$APP" 2>/dev/null; then
    echo "OK ($NOM, écran $ECRAN) : application vivante après 20 s"
else
    echo "ÉCHEC ($NOM, écran $ECRAN) : application arrêtée"
    r=1
fi
kill "$APP" 2>/dev/null
sleep 1
kill "$MUTTER" 2>/dev/null
# Lignes WAYLAND_DEBUG : « [  1234.567]  -> objet@id.requête(…) »
grep -E '^\[ *[0-9]+\.[0-9]+\]' "$BRUT" | grep -E 'xdg_surface|xdg_toplevel|set_window_geometry' \
    | head -n 400 > "$J/wayland-$NOM.log"
grep -vE '^\[ *[0-9]+\.[0-9]+\]' "$BRUT" > "$J/app-$NOM.log"
rm -f "$BRUT"
echo "-- application (app-$NOM.log)"
grep -iE 'Fenêtre|geometr|ozone|prête|affichée|GPU process|arrêté' "$J/app-$NOM.log" | head -n 40
echo "-- géométrie envoyée par Chromium (wayland-$NOM.log)"
grep -E 'set_window_geometry|set_min_size|set_max_size|ack_configure' "$J/wayland-$NOM.log" | head -n 12
echo "-- mutter (avertissements)"
grep -iE 'geometr|invalid' "$J/mutter-$NOM.log" | head -n 10
exit $r
