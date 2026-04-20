/**
 * Configuration générique pour l'ouverture de dossiers
 * Géré via le panel monitoring — ne pas modifier manuellement
 */

export const folderConfig = {
    fileManagers: {
        team: {
            basePath: '/mnt/team/#TEAM/',
            blacklist: ['#TRAÇABILITÉ', '#INTERNE', '#INVITES', '#COMMANDES', '#OVERLAYS']
        },
        guest: {
            basePath: '/mnt/team/#TEAM/#INVITES'
        },
        development: {
            basePath: '/mnt/team/#TEAM/#INTERNE/#WEB',
            blacklist: []
        },
        capsule: {
            basePath: '/mnt/team/#TEAM/#INTERNE',
            blacklist: ['#WEB']
        }
    },

    blacklist: [],
    ignoreSuffixes: ['.tmp', '.bak', '.swp', '.swo', '~'],
    ignoreExtensions: ['.tmp', '.bak', '.log', '.lock'],

    isBlacklisted(name) {
        if (this.blacklist.includes(name)) return true;
        if (name.startsWith('~$')) return true;
        if (name.startsWith('.') && name !== '.' && name !== '..') return true;
        for (const suffix of this.ignoreSuffixes) {
            if (name.endsWith(suffix)) return true;
        }
        for (const ext of this.ignoreExtensions) {
            if (name.endsWith(ext)) return true;
        }
        return false;
    },

    resolvePreset(name) {
        if (!name) return this;
        const key = name.toLowerCase();
        const preset = this.fileManagers?.[key];
        if (!preset) return this;
        return {
            ...this,
            ...preset,
            blacklist: preset.blacklist !== undefined ? preset.blacklist : this.blacklist,
            ignoreSuffixes: preset.ignoreSuffixes || this.ignoreSuffixes,
            ignoreExtensions: preset.ignoreExtensions || this.ignoreExtensions
        };
    }
};

export default folderConfig;
