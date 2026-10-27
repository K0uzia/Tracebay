#!/usr/bin/env bash
# Lance Tracebay sans paquet (AppImage ou archive tar.gz) sur le runner, utilisateur normal, bac à sable
# réel, et vérifie qu'une fenêtre s'ouvre (job test-maj-deb). Usage : test-lancement.sh <libellé> <commande>
set -uo pipefail
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
NOM=$1
shift
mkdir -p "$RUNNER_TEMP/journaux"
LOG="$RUNNER_TEMP/journaux/lancement-$NOM.log"
"$@" > "$LOG" 2>&1 < /dev/null &
sleep 20
fenetre=$(xwininfo -root -tree 2>/dev/null | grep -i '"tracebay' | head -n 1 || true)
if [ -n "$(vivants)" ] && [ -n "$fenetre" ]; then
    echo "OK ($NOM) : fenêtre$fenetre"
    for p in $(vivants); do kill "$p" 2>/dev/null || true; done
    exit 0
fi
echo "ÉCHEC ($NOM) : pas de fenêtre Tracebay après 20 s"
tail -n 30 "$LOG"
for p in $(vivants); do kill "$p" 2>/dev/null || true; done
exit 1
