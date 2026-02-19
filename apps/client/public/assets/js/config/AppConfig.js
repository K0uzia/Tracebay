/**
 * Configuration pour le lancement d'applications
 */

export const appConfig = {
    // Presets nommés accessibles via {{appmanager<nom>}}
    appManagers: {
        dev: {
            apps: [
                {
                    name: 'VSCode',
                    command: 'code',
                    icon: 'fa-code',
                    args: []
                },
                {
                    name: 'Terminal',
                    command: 'gnome-terminal',
                    icon: 'fa-terminal',
                    args: []
                },
                {
                    name: 'Github Desktop',
                    command: 'flatpak run io.github.shiftey.Desktop',
                    icon: 'fa-github',
                    args: []
                },
                {
                    name: 'VMM',
                    command: 'virt-manager',
                    icon: 'fa-desktop',
                    args: []
                }
            ]
        },
        stream: {
            apps: [
                {
                    name: 'Remmina',
                    command: 'remmina',
                    icon: 'fa-desktop'
                }
            ]
        },
        texte: {
            apps: [
                {
                    name: 'Typora',
                    command: 'typora',
                    icon: 'fa-file-text',
                    args: []
                },
                {
                    name: 'Gedit',
                    command: 'gedit',
                    icon: 'fa-desktop',
                    args: []
                },
            ]
        },
        office: {
            apps: [
                {
                    name: 'Office Writer',
                    command: 'libreoffice --writer',
                    icon: 'fa-file-word',
                    args: []
                },
                {
                    name: 'Office Calc',
                    command: 'libreoffice --calc',
                    icon: 'fa-table',
                    args: []
                },
                {
                    name: 'Office Impress',
                    command: 'libreoffice --impress',
                    icon: 'fa-presentation',
                    args: []
                },
                {
                    name: 'Office Draw',
                    command: 'libreoffice --draw',
                    icon: 'fa-image',
                    args: []
                }
            ]
        }
    },

    /**
     * Récupère la config d'un preset
     */
    resolvePreset(name) {
        if (!name) return null;
        const key = name.toLowerCase();
        return this.appManagers?.[key] || null;
    }
};

export default appConfig;
