/**
 * Options OS pour les lots (traçabilité) : valeur, libellé, icône Font Awesome (fa-brands).
 * Utilisé dans inventaire, historique, tableaux et PDF.
 */
export const OS_OPTIONS = [
    { value: 'linux', label: 'Linux', icon: 'linux' },
    { value: 'windows', label: 'Windows', icon: 'windows' },
    { value: 'chrome', label: 'Chrome OS', icon: 'chrome' },
    { value: 'apple', label: 'Apple', icon: 'apple' },
    { value: 'android', label: 'Android', icon: 'android' },
    { value: 'bsd', label: 'BSD', icon: 'freebsd' }
];

const BY_VALUE = Object.fromEntries(OS_OPTIONS.map(o => [o.value, o]));

/**
 * @param {string} osValue - Valeur os (linux, windows, chrome, apple, android, bsd)
 * @returns {{ value: string, label: string, icon: string }}
 */
export function getOsOption(osValue) {
    const v = (osValue || 'linux').toLowerCase().trim();
    return BY_VALUE[v] || BY_VALUE.linux;
}

/**
 * Icône Font Awesome (classe fa-brands fa-xxx) pour un OS
 * @param {string} osValue
 * @returns {string} ex. 'windows', 'linux', 'chrome'
 */
export function getOsIcon(osValue) {
    return getOsOption(osValue).icon;
}

/**
 * Libellé affiché pour un OS
 * @param {string} osValue
 * @returns {string}
 */
export function getOsLabel(osValue) {
    return getOsOption(osValue).label;
}
