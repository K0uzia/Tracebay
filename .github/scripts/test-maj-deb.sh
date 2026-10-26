#!/usr/bin/env bash
# Mise à jour .deb de bout en bout sur le runner Ubuntu, utilisateur normal, bac à sable réel (job test-maj-deb).
# Usage : test-maj-deb.sh <workspace.deb> <dossier de helper.sh et install-root.sh> <libellé> <dossier des journaux>
# L'application installée tourne ; le helper reçoit son environnement (/proc/PID/environ) comme dans main.js,
# puis l'application reçoit SIGTERM (main.js fait app.exit). pkexec est remplacé par sudo -n (runner sans polkit).
set -uo pipefail
# Chemin absolu : apt prend un chemin relatif sans « ./ » pour un nom de paquet
DEB=$(realpath "$1")
HELPERS=$2
NOM=$3
J=$4/$NOM
mkdir -p "$J"
W=$(mktemp -d)
echo "== $NOM =="

instances() {
    pgrep -u "$(id -u)" -a -x workspace | grep -v -- '--type=' | awk '{print $1}'
}

if ! sudo apt-get install -y -qq --reinstall "$DEB" 2>&1 | tee "$J/apt.log" > /dev/null; then
    echo "ÉCHEC : installation initiale"
    tail -n 30 "$J/apt.log"
    exit 1
fi
ls -l /usr/bin/workspace /opt/Tracebay/chrome-sandbox /etc/apparmor.d/workspace 2>&1 | tee "$J/fichiers.txt"
sysctl kernel.apparmor_restrict_unprivileged_userns kernel.unprivileged_userns_clone 2>&1 | tee -a "$J/fichiers.txt"

/usr/bin/workspace > "$J/app-avant.log" 2>&1 < /dev/null &
APP=$!
sleep 15
if ! kill -0 "$APP" 2>/dev/null; then
    echo "ÉCHEC : premier lancement (avant mise à jour)"
    tail -n 30 "$J/app-avant.log"
    exit 1
fi
echo "Application lancée, pid $APP"

cp "$DEB" "$W/workspace-install.deb"
cp "$HELPERS/helper.sh" "$HELPERS/install-root.sh" "$W/"
chmod 755 "$W/helper.sh" "$W/install-root.sh"
mapfile -d '' ENVIRONNEMENT < "/proc/$APP/environ"
LOG="$J/deb-update.log"
env -i "${ENVIRONNEMENT[@]}" \
    WS_PID="$APP" WS_PKG="$W/workspace-install.deb" WS_INSTALL_SH="$W/install-root.sh" \
    WS_LOG="$LOG" WS_RELAUNCH_LOG="$J/relaunch.log" \
    WS_DEB_PID="$APP" WS_DEB_PATH="$W/workspace-install.deb" WS_DEB_INSTALL_SH="$W/install-root.sh" WS_DEB_LOG="$LOG" \
    setsid /bin/sh "$W/helper.sh" > "$J/helper.out" 2>&1 < /dev/null &
sleep 0.25
kill -TERM "$APP"

for _ in $(seq 1 150); do
    if grep -E 'relaunch ok|launch issued|FAIL' "$LOG" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done
sleep 10
echo "-- journal du helper"
cat "$LOG" 2>/dev/null
nouvelles=$(instances | grep -vx "$APP" || true)
for p in $nouvelles; do kill "$p" 2>/dev/null || true; done
if [ -n "$nouvelles" ]; then
    echo "OK ($NOM) : application relancée après la mise à jour (pid $nouvelles)"
    exit 0
fi
echo "ÉCHEC ($NOM) : aucune instance après la mise à jour"
echo "-- sortie de la relance"
tail -n 30 "$J/relaunch.log" 2>/dev/null || true
exit 1
