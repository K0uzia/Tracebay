(() => {
  // 1) CSS local (bon chemin)
  const cssHref = 'file:///home/goupil/D%C3%A9veloppement/workspace/proxmox/app/src/views/monitoring.css';
  let css = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.href === cssHref);
  if (!css) {
    css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = cssHref;
    document.head.appendChild(css);
  }

  // 2) Forcer l'affichage de l'app, masquer login
  const login = document.getElementById('login-screen');
  const app = document.getElementById('app');
  if (login) login.style.cssText = 'display:none !important;';
  if (app) app.style.cssText = 'display:flex !important; width:100% !important; min-height:100vh !important;';
  if (app) app.classList.add('visible');

  // 3) Forcer une page visible
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-dashboard')?.classList.add('active');

  // 4) Neutraliser les erreurs API
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [], users: [], connectedUsers: [], anonymousUsers: [], count: 0 }),
    text: async () => ''
  });

  // 5) Marquer un user visuel
  const u = document.getElementById('sidebar-username');
  if (u) u.textContent = 'local-dev';
})();

// Mock ciblé des routes config + no-op sur save
api = async (method, path, body) => {
  // Applications (3 presets)
  if (method === 'GET' && path === '/api/admin/config/apps') {
    return {
      appManagers: {
        dev: {
          apps: [
            { name: 'VS Code', command: 'code', icon: 'fa-code', args: [] },
            { name: 'Terminal', command: 'gnome-terminal', icon: 'fa-terminal', args: [] },
            { name: 'Postman', command: 'postman', icon: 'fa-flask', args: [] }
          ]
        },
        web: {
          apps: [
            { name: 'Chrome', command: 'google-chrome', icon: 'fa-globe', args: ['--new-window'] },
            { name: 'Firefox', command: 'firefox', icon: 'fa-firefox', args: [] }
          ]
        },
        tools: {
          apps: [
            { name: 'DBeaver', command: 'dbeaver', icon: 'fa-database', args: [] },
            { name: 'Insomnia', command: 'insomnia', icon: 'fa-mug-hot', args: [] }
          ]
        }
      }
    };
  }

  // Dossiers (4 presets)
  if (method === 'GET' && path === '/api/admin/config/folders') {
    return {
      fileManagers: {
        team:    { basePath: '/mnt/team/#TEAM/', blacklist: ['node_modules', '.git'] },
        users:   { basePath: '/home/goupil', blacklist: ['.cache', '.local/share/Trash'] },
        projects:{ basePath: '/home/goupil/Développement/workspace', blacklist: ['dist', 'build'] },
        docs:    { basePath: '/home/goupil/Documents', blacklist: ['.tmp'] }
      },
      ignoreExtensions: ['.tmp', '.log', '.bak'],
      ignoreSuffixes: ['~', '.old']
    };
  }

  // Sauvegardes: succès fake
  if (method === 'PUT' && (path === '/api/admin/config/apps' || path === '/api/admin/config/folders')) {
    return { success: true };
  }

  // Fallback générique
  return { success: true, data: [], users: [] };
};

// Ouvrir directement les pages concernées
navigateTo('config-apps');
setTimeout(() => navigateTo('config-folders'), 300);