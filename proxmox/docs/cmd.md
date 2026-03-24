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

// Mock ciblé des routes config + réception + no-op sur save
api = async (method, path, body) => {
  const url = String(path || '');
  const cleanPath = url.split('?')[0];

  // Jeux de données visuels pour réception
  const lotsData = [
    { id: 101, name: 'Lot Mars A', status: 'received', date: '2026-03-01T09:30:00Z', item_count: 6, pdf_path: '/tmp/lots/lot-101.pdf' },
    { id: 102, name: 'Lot Mars B', status: 'in_progress', date: '2026-03-08T11:10:00Z', item_count: 4, pdf_path: '/tmp/lots/lot-102.pdf' },
    { id: 103, name: 'Lot Mars C', status: 'finished', date: '2026-03-14T15:45:00Z', item_count: 9, pdf_path: '/tmp/lots/lot-103.pdf' }
  ];
  const commandesData = [
    { id: 5001, name: 'Commande Atelier 01', date: '2026-03-03T10:00:00Z', lot_name: 'Lot Mars A', link_url: 'https://shop.example/cmd-5001', shipping_cost: 12.5, total_price: 245.9, pdf_path: '/tmp/commandes/cmd-5001.pdf' },
    { id: 5002, name: 'Commande Atelier 02', date: '2026-03-07T08:20:00Z', lot_name: 'Lot Mars B', link_url: 'https://shop.example/cmd-5002', shipping_cost: 0, total_price: 119.0, pdf_path: '/tmp/commandes/cmd-5002.pdf' },
    { id: 5003, name: 'Commande Atelier 03', date: '2026-03-11T16:50:00Z', lot_name: 'Lot Mars C', link_url: 'https://shop.example/cmd-5003', shipping_cost: 8.9, total_price: 412.3, pdf_path: '/tmp/commandes/cmd-5003.pdf' }
  ];
  const donsData = [
    { id: 7001, lot_name: 'Lot Mars A', date: '2026-03-05T14:00:00Z', donor_name: 'Association Solidaire', pdf_path: '/tmp/dons/don-7001.pdf' },
    { id: 7002, lot_name: 'Lot Mars B', date: '2026-03-09T09:40:00Z', donor_name: 'Entreprise Alpha', pdf_path: '/tmp/dons/don-7002.pdf' }
  ];
  const disquesSessionsData = [
    { id: 9001, name: 'Lot disques Semaine 10', date: '2026-03-06T13:00:00Z', disk_count: 12, pdf_path: '/tmp/disques/session-9001.pdf' },
    { id: 9002, name: 'Lot disques Semaine 11', date: '2026-03-13T13:00:00Z', disk_count: 8, pdf_path: '/tmp/disques/session-9002.pdf' }
  ];

  // Applications (6 lots avec noms + commandes)
  if (method === 'GET' && cleanPath === '/api/admin/config/apps') {
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
        },
        ops: {
          apps: [
            { name: 'htop', command: 'gnome-terminal', icon: 'fa-heart-pulse', args: ['--', 'htop'] },
            { name: 'Nautilus logs', command: 'nautilus', icon: 'fa-folder-open', args: ['/var/log'] },
            { name: 'Journalctl', command: 'gnome-terminal', icon: 'fa-file-lines', args: ['--', 'bash', '-lc', 'journalctl -f'] }
          ]
        },
        comm: {
          apps: [
            { name: 'Slack', command: 'slack', icon: 'fa-comments', args: [] },
            { name: 'Discord', command: 'discord', icon: 'fa-gamepad', args: [] }
          ]
        },
        media: {
          apps: [
            { name: 'VLC', command: 'vlc', icon: 'fa-circle-play', args: [] },
            { name: 'OBS Studio', command: 'obs', icon: 'fa-video', args: [] }
          ]
        }
      }
    };
  }

  // Dossiers (lots standards + lots de disques)
  if (method === 'GET' && cleanPath === '/api/admin/config/folders') {
    return {
      fileManagers: {
        team:    { basePath: '/mnt/team/#TEAM/', blacklist: ['node_modules', '.git'] },
        users:   { basePath: '/home/goupil', blacklist: ['.cache', '.local/share/Trash'] },
        projects:{ basePath: '/home/goupil/Développement/workspace', blacklist: ['dist', 'build'] },
        docs:    { basePath: '/home/goupil/Documents', blacklist: ['.tmp'] },
        disk_ssd: { basePath: '/mnt/disk-ssd', blacklist: ['lost+found', '.Trash-1000'] },
        disk_hdd: { basePath: '/mnt/disk-hdd', blacklist: ['lost+found', '.cache'] },
        disk_backup: { basePath: '/mnt/disk-backup', blacklist: ['snapshots/tmp'] }
      },
      // Optionnel: méta "lots de disques" pour enrichir le visuel si affiché
      diskLots: [
        { name: 'SSD principal', mount: '/mnt/disk-ssd', totalGb: 1000, freeGb: 420 },
        { name: 'HDD data', mount: '/mnt/disk-hdd', totalGb: 4000, freeGb: 1730 },
        { name: 'Backup', mount: '/mnt/disk-backup', totalGb: 8000, freeGb: 5020 }
      ],
      ignoreExtensions: ['.tmp', '.log', '.bak'],
      ignoreSuffixes: ['~', '.old']
    };
  }

  // Sauvegardes: succès fake
  if (method === 'PUT' && (cleanPath === '/api/admin/config/apps' || cleanPath === '/api/admin/config/folders')) {
    return { success: true };
  }

  // Réception - lots
  if (method === 'GET' && cleanPath === '/api/admin/lots') {
    return { lots: lotsData };
  }
  if (method === 'GET' && /^\/api\/admin\/lots\/\d+$/.test(cleanPath)) {
    const id = Number(cleanPath.split('/').pop());
    const lot = lotsData.find(x => x.id === id) || lotsData[0];
    return {
      lot: {
        ...lot,
        items: [
          { id: 1, category: 'PC Portable', brand: 'Dell', model: 'Latitude 5420', serial: 'DL5420-AX1', state: 'ok', technician: 'Nadia' },
          { id: 2, category: 'Ecran', brand: 'LG', model: '24MK', serial: 'LG24-Z91', state: 'repair', technician: 'Liam' },
          { id: 3, category: 'Clavier', brand: 'Logitech', model: 'K120', serial: 'K120-332', state: 'ok', technician: 'Nadia' }
        ]
      }
    };
  }
  if (method === 'PUT' && /^\/api\/admin\/lots\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'DELETE' && /^\/api\/admin\/lots\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'PUT' && /^\/api\/admin\/lots\/items\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'POST' && /^\/api\/lots\/\d+\/pdf$/.test(cleanPath)) return { success: true };

  // Réception - commandes
  if (method === 'GET' && cleanPath === '/api/admin/commandes') {
    return { data: commandesData };
  }
  if (method === 'GET' && /^\/api\/admin\/commandes\/\d+$/.test(cleanPath)) {
    const id = Number(cleanPath.split('/').pop());
    const cmd = commandesData.find(x => x.id === id) || commandesData[0];
    return {
      commande: {
        ...cmd,
        lignes: [
          { product_name_ref: 'SSD 512Go', quantity: 2, unit_price: 49.9, shipping_cost: 4.9, link: 'https://shop.example/ssd-512' },
          { product_name_ref: 'RAM DDR4 16Go', quantity: 4, unit_price: 34.5, shipping_cost: 0, link: 'https://shop.example/ram-16' },
          { product_name_ref: 'Pate thermique', quantity: 3, unit_price: 6.9, shipping_cost: 2.5, link: 'https://shop.example/pate' }
        ]
      }
    };
  }
  if (method === 'DELETE' && /^\/api\/admin\/commandes\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'PUT' && /^\/api\/admin\/commandes\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'POST' && /^\/api\/commandes\/\d+\/regenerate-pdf$/.test(cleanPath)) return { success: true };

  // Réception - dons
  if (method === 'GET' && cleanPath === '/api/admin/dons') {
    return { data: donsData };
  }
  if (method === 'GET' && /^\/api\/admin\/dons\/\d+$/.test(cleanPath)) {
    const id = Number(cleanPath.split('/').pop());
    const don = donsData.find(x => x.id === id) || donsData[0];
    return {
      don: {
        ...don,
        lines: [
          { materiel: 'PC fixe', modele: 'HP ProDesk 600', type: 'Unite centrale', serial_number: 'HP-UC-0001', date: '2026-03-05T10:30:00Z', nom: 'Martin', prenom: 'Jean' },
          { materiel: 'Ecran', modele: 'Dell P2219H', type: 'Moniteur', serial_number: 'DELL-ECR-0092', date: '2026-03-05T10:35:00Z', nom: 'Dupont', prenom: 'Sarah' }
        ]
      }
    };
  }
  if (method === 'DELETE' && /^\/api\/admin\/dons\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'PUT' && /^\/api\/admin\/dons\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'POST' && /^\/api\/dons\/\d+\/regenerate-pdf$/.test(cleanPath)) return { success: true };

  // Édition générique (utilisée par la modale db-row)
  if (method === 'PUT' && /^\/api\/admin\/db\/tables\/[^/]+\/rows\/\d+$/.test(cleanPath)) return { success: true };

  // Réception - lots de disques
  if (method === 'GET' && cleanPath === '/api/admin/disques/sessions') {
    return { sessions: disquesSessionsData };
  }
  if (method === 'GET' && /^\/api\/admin\/disques\/sessions\/\d+$/.test(cleanPath)) {
    const id = Number(cleanPath.split('/').pop());
    const s = disquesSessionsData.find(x => x.id === id) || disquesSessionsData[0];
    return {
      session: {
        ...s,
        disks: [
          { id: 1, brand: 'Seagate', model: 'ST1000DM010', capacity: '1To', interface: 'SATA', health: 'good' },
          { id: 2, brand: 'WD', model: 'Blue 500', capacity: '500Go', interface: 'SATA', health: 'warning' }
        ]
      }
    };
  }
  if (method === 'PUT' && /^\/api\/admin\/disques\/sessions\/\d+$/.test(cleanPath)) return { success: true };
  if (method === 'DELETE' && /^\/api\/admin\/disques\/sessions\/\d+$/.test(cleanPath)) return { success: true };

  // Matériels commandables
  if (method === 'GET' && cleanPath === '/api/commandes/products') {
    return {
      items: [
        { id: 1, name: 'SSD 512Go' },
        { id: 2, name: 'RAM DDR4 16Go' },
        { id: 3, name: 'Batterie laptop universelle' }
      ]
    };
  }
  if (['POST', 'PUT', 'DELETE'].includes(method) && /^\/api\/commandes\/products(\/\d+)?$/.test(cleanPath)) return { success: true };

  // Fallback générique
  return { success: true, data: [], users: [], lots: [], sessions: [] };
};

// Ouvrir directement les pages concernées
navigateTo('monitoring');
setTimeout(() => showSubTab?.('commandes'), 250);