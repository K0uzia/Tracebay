/**
 * Mise à jour des installations Linux par paquet (.deb, .rpm) : type d'installation, scripts
 * du helper détaché (attente de la fin de l'application, une seule élévation pkexec,
 * installation, relance vérifiée) et contrôle d'intégrité du fichier téléchargé.
 * Sans import Electron : testé avec Jest, scripts testés en conteneur (CI).
 */
const crypto = require('crypto');
const fs = require('fs');

/**
 * Type d'installation : AppImage, deb, rpm (paquets fpm d'electron-builder, d'après
 * resources/package-type), archive (tar.gz, sans mise à jour automatique), portable
 * (exécutable portable Windows), nsis, dmg.
 */
function detecterTypeInstallation({ platform, appImagePath, packageTypeFile, portableDir }) {
    if (platform === 'linux') {
        if (appImagePath) {
            return 'AppImage';
        }
        const type = String(packageTypeFile || '').trim();
        return type === 'deb' || type === 'rpm' ? type : 'archive';
    }
    if (platform === 'win32') {
        return portableDir ? 'portable' : 'nsis';
    }
    if (platform === 'darwin') {
        return 'dmg';
    }
    return 'unknown';
}

/** Contenu de resources/package-type (écrit par electron-builder pour deb, rpm), sinon null. */
function lireTypePaquet(fichier) {
    try {
        return fs.readFileSync(fichier, 'utf8').trim();
    } catch (_) {
        return null;
    }
}

/** sha512 (base64, format de latest-*.yml) d'un fichier, calculé par flux. */
function sha512Fichier(fichier) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha512');
        fs.createReadStream(fichier)
            .on('data', (d) => hash.update(d))
            .on('error', reject)
            .on('end', () => resolve(hash.digest('base64')));
    });
}

/** Empreintes de latest-*.yml : { fichier: sha512 }, entrée « - url: » suivie de « sha512: ». */
function empreintesYml(texte) {
    const empreintes = {};
    const entree = /^\s*-\s*url:\s*['"]?([^\s'"#]+)['"]?\s*\n\s*sha512:\s*['"]?([\w+/=]+)/gm;
    for (const m of String(texte || '').matchAll(entree)) {
        empreintes[m[1]] = m[2];
    }
    return empreintes;
}

/** Commandes d'installation exécutées en root, une seule élévation pour toute la chaîne. */
const INSTALLATION = {
    deb: `if ! command -v dpkg >/dev/null 2>&1; then log "FAIL dpkg introuvable"; exit 1; fi
if dpkg -i "$PKG" >> "$LOG" 2>&1; then log "dpkg -i ok"; exit 0; fi
log "dpkg -i failed, apt-get -f then retry"
if command -v apt-get >/dev/null 2>&1; then apt-get install -f -y >> "$LOG" 2>&1 || true; fi
if dpkg -i "$PKG" >> "$LOG" 2>&1; then log "dpkg -i ok after apt-get -f"; exit 0; fi`,
    rpm: `if command -v dnf >/dev/null 2>&1; then
  if dnf install -y "$PKG" >> "$LOG" 2>&1; then log "dnf install ok"; exit 0; fi
elif command -v zypper >/dev/null 2>&1; then
  if zypper --non-interactive install --allow-unsigned-rpm "$PKG" >> "$LOG" 2>&1; then log "zypper install ok"; exit 0; fi
fi
if command -v rpm >/dev/null 2>&1 && rpm -U --replacepkgs "$PKG" >> "$LOG" 2>&1; then log "rpm -U ok"; exit 0; fi`
};

/** Script lancé en root par pkexec : installe le paquet ($1), journalise dans $2. */
function scriptInstallationRoot(type) {
    const commandes = INSTALLATION[type];
    if (!commandes) {
        throw new Error(`Type de paquet non pris en charge : ${type}`);
    }
    return `#!/bin/sh
PKG="$1"
LOG="$2"
log() { echo "$(date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date) [root] $*" >> "$LOG" 2>/dev/null || true; }
log "install start type=${type} pkg=$PKG"
${commandes}
log "FAIL installation définitive"
exit 1
`;
}

/**
 * Script du helper détaché (utilisateur courant). Variables : WS_PID (application à attendre),
 * WS_PKG (paquet), WS_INSTALL_SH (script root), WS_LOG (journal),
 * WS_RELAUNCH_LOG (sortie de la relance).
 */
function scriptHelper() {
    return `#!/bin/sh
log() { echo "$(date '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date) $*" >> "$WS_LOG" 2>/dev/null || true; }
log "helper start pid=$WS_PID pkg=$WS_PKG"
log "display=$DISPLAY wayland=$WAYLAND_DISPLAY xauth=$XAUTHORITY"

# 1. Attendre la fin de l'application. Si elle traîne, la terminer : une instance encore vivante
#    garderait le verrou d'instance unique et la version relancée se fermerait aussitôt.
i=0
while kill -0 "$WS_PID" 2>/dev/null; do
  sleep 0.25
  i=$((i + 1))
  if [ "$i" -eq 120 ]; then
    log "app still running after 30s: SIGTERM"
    kill -TERM "$WS_PID" 2>/dev/null || true
  fi
  if [ "$i" -ge 200 ]; then
    log "app still running after 50s: SIGKILL"
    kill -KILL "$WS_PID" 2>/dev/null || true
    sleep 1
    break
  fi
done
log "app exited"
sleep 1

if [ ! -f "$WS_PKG" ] || [ ! -f "$WS_INSTALL_SH" ]; then
  log "FAIL missing package or install script"
  exit 1
fi

# 2. Une seule élévation : la boîte polkit garde l'environnement graphique de la session.
PKEXEC_ENV=""
[ -n "$DISPLAY" ] && PKEXEC_ENV="$PKEXEC_ENV DISPLAY=$DISPLAY"
[ -n "$XAUTHORITY" ] && PKEXEC_ENV="$PKEXEC_ENV XAUTHORITY=$XAUTHORITY"
[ -n "$WAYLAND_DISPLAY" ] && PKEXEC_ENV="$PKEXEC_ENV WAYLAND_DISPLAY=$WAYLAND_DISPLAY"
[ -n "$DBUS_SESSION_BUS_ADDRESS" ] && PKEXEC_ENV="$PKEXEC_ENV DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS"
[ -n "$XDG_RUNTIME_DIR" ] && PKEXEC_ENV="$PKEXEC_ENV XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"
if ! command -v pkexec >/dev/null 2>&1; then
  log "FAIL pkexec introuvable"
  exit 1
fi
log "pkexec install"
# shellcheck disable=SC2086
if ! pkexec env $PKEXEC_ENV /bin/sh "$WS_INSTALL_SH" "$WS_PKG" "$WS_LOG"; then
  log "FAIL installation refusée ou échouée : paquet à installer à la main : $WS_PKG"
  command -v xdg-open >/dev/null 2>&1 && xdg-open "$WS_PKG" >/dev/null 2>&1
  exit 1
fi
log "install ok"
sleep 1

# 3. Relance dans la session de l'utilisateur, vérifiée.
bin=""
for c in /usr/bin/workspace /opt/Tracebay/workspace /usr/local/bin/workspace /usr/bin/Tracebay; do
  if [ -x "$c" ]; then bin="$c"; break; fi
done
if [ -z "$bin" ]; then
  log "FAIL binaire introuvable après installation"
  exit 1
fi
essai=1
while [ "$essai" -le 2 ]; do
  log "launching $bin (essai $essai)"
  setsid "$bin" > "$WS_RELAUNCH_LOG" 2>&1 < /dev/null &
  lance=$!
  sleep 8
  if kill -0 "$lance" 2>/dev/null; then
    log "relaunch ok pid=$lance"
    exit 0
  fi
  log "relaunched app exited early; last lines:"
  tail -n 15 "$WS_RELAUNCH_LOG" 2>/dev/null | while IFS= read -r l; do log "  | $l"; done
  essai=$((essai + 1))
  sleep 2
done
log "FAIL relaunch"
exit 1
`;
}

module.exports = {
    detecterTypeInstallation, lireTypePaquet, sha512Fichier, empreintesYml,
    scriptInstallationRoot, scriptHelper
};
