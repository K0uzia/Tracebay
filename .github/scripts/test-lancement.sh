#!/usr/bin/env bash
# Lance Tracebay sans paquet (AppImage ou archive tar.gz) sur le runner, utilisateur normal, bac à sable
# réel, et vérifie qu'une fenêtre s'ouvre (job test-maj-deb). Usage : test-lancement.sh <libellé> <commande>
set -uo pipefail
NOM=$1
shift
LOG="$RUNNER_TEMP/lancement-$NOM.log"
"$@" > "$LOG" 2>&1 < /dev/null &
APP=$!
sleep 20
fenetre=$(xwininfo -root -tree 2>/dev/null | grep -i '"tracebay' | head -n 1 || true)
if kill -0 "$APP" 2>/dev/null && [ -n "$fenetre" ]; then
    echo "OK ($NOM) : fenêtre$fenetre"
    kill "$APP" 2>/dev/null || true
    exit 0
fi
echo "ÉCHEC ($NOM) : pas de fenêtre Tracebay après 20 s"
tail -n 30 "$LOG"
kill "$APP" 2>/dev/null || true
exit 1
