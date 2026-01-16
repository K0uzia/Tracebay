/**
 * RecentItemsManager - Gestion des éléments récemment visités
 */
class RecentItemsManager {
  constructor(options = {}) {
    this.maxItems = options.maxItems || 5;
    this.containerSelector = options.containerSelector || '.block-content';
    this.userId = this.getCurrentUserId();
    this.storageKey = this.getStorageKey();
    this.recentItems = this.loadRecentItems();
  }

  /**
     * Obtenir l'ID utilisateur courant
     */
  getCurrentUserId() {
    try {
      const userId = localStorage.getItem('workspace_user_id');
      return userId ? parseInt(userId) : null;
    } catch (error) {
      console.error('❌ Erreur récupération user ID:', error);
      return null;
    }
  }

  /**
     * Générer la clé de stockage basée sur l'utilisateur
     */
  getStorageKey() {
    if (this.userId) {
      return `workspace_recent_items_user_${this.userId}`;
    }
    // Fallback pour utilisateur non connecté
    return 'workspace_recent_items_anonymous';
  }

  /**
     * Charger les éléments récents du localStorage
     */
  loadRecentItems() {
    try {
      // Vérifier s'il y a des anciennes données à migrer
      const oldStorageKey = 'workspace_recent_items';
      const oldData = localStorage.getItem(oldStorageKey);

      // Charger les données du profil courant
      const stored = localStorage.getItem(this.storageKey);
      let items = stored ? JSON.parse(stored) : [];

      // Si c'est un nouvel utilisateur et qu'il y a des anciennes données globales, les utiliser comme fallback
      if (!stored && oldData && this.userId) {
        items = JSON.parse(oldData);
        // Sauvegarder dans le nouveau format
        this.saveRecentItems();
        console.log('🔄 Données récentes migrées depuis format global');
      }

      return items;
    } catch (error) {
      console.error('❌ Erreur chargement éléments récents:', error);
      return [];
    }
  }

  /**
     * Sauvegarder les éléments récents
     */
  saveRecentItems() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.recentItems));
      const userInfo = this.userId ? ` (Profil: ${this.userId})` : ' (Anonyme)';
      console.log('💾 Éléments récents sauvegardés' + userInfo);
    } catch (error) {
      console.error('❌ Erreur sauvegarde éléments récents:', error);
    }
  }

  /**
     * Ajouter un élément récent
     * @param {Object} item - {type, name, url/path, icon, action}
     */
  addItem(item) {
    const now = new Date().toISOString();
    const newItem = {
      ...item,
      timestamp: now,
      id: `${item.type}_${item.name}_${now}`
    };

    // Supprimer les doublons (même type et même name/url)
    this.recentItems = this.recentItems.filter(
      existingItem => !(existingItem.type === item.type && existingItem.name === item.name)
    );

    // Ajouter au début
    this.recentItems.unshift(newItem);

    // Limiter à maxItems
    this.recentItems = this.recentItems.slice(0, this.maxItems);

    this.saveRecentItems();
    const userInfo = this.userId ? ` (Profil: ${this.userId})` : ' (Anonyme)';
    console.log('📌 Élément récent ajouté:' + userInfo, item.name);
  }

  /**
     * Obtenir les derniers éléments
     */
  getRecent(limit = this.maxItems) {
    return this.recentItems.slice(0, limit);
  }

  /**
     * Rendre les éléments récents dans le HTML
     */
  render() {
    const recent = this.getRecent();

    if (recent.length === 0) {
      return '<p style="color: var(--gris); font-size: 0.9rem;">Aucun élément récent</p>';
    }

    return recent.map((item, index) => `
            <div class="recent-item" data-type="${item.type}" data-action="${item.action || ''}" data-path="${item.path || ''}" data-url="${item.url || ''}" title="${item.name}" style="cursor: pointer;">
                <i class="${item.icon}"></i>
                <span class="recent-item-name">${this.escapeHtml(item.name)}</span>
                ${item.url ? `<a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="recent-item-link" title="Ouvrir ${item.name}" onclick="event.stopPropagation();"><i class="fas fa-external-link-alt"></i></a>` : ''}
            </div>
        `).join('');
  }

  /**
     * Afficher les éléments récents dans le DOM
     */
  display() {
    try {
      // Chercher le bloc "Récents"
      const blocks = document.querySelectorAll('.block');
      blocks.forEach(block => {
        const title = block.querySelector('.block-title h3');
        if (title && title.textContent.trim() === 'Récents') {
          const content = block.querySelector('.block-content');
          if (content) {
            content.innerHTML = this.render();
            this.attachRecentItemListeners();
          }
        }
      });
    } catch (error) {
      console.error('❌ Erreur affichage éléments récents:', error);
    }
  }

  /**
     * Attacher les listeners aux éléments récents
     */
  attachRecentItemListeners() {
    try {
      document.querySelectorAll('.recent-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const action = item.dataset.action;
          const path = item.dataset.path;
          const url = item.dataset.url;
          const name = item.querySelector('.recent-item-name').textContent;

          if (action === 'navigate' && path) {
            console.log('🔗 Navigation vers:', path);
            // Naviguer vers la page
            if (window.app) {
              window.app.loadPage(path);
            }
          } else if (action === 'open-url' && url) {
            console.log('🌐 Ouverture URL:', url);
            // Ouvrir l'URL dans le navigateur par défaut
            if (window.electronAPI && window.electronAPI.openExternal) {
              window.electronAPI.openExternal(url);
            } else {
              window.open(url, '_blank');
            }
          } else if (action === 'open-folder' && path) {
            console.log('📁 Ouverture dossier:', path);
            // Ouvrir le dossier
            if (window.electronAPI && window.electronAPI.openPath) {
              window.electronAPI.openPath(path);
            }
          }
        });
      });
    } catch (error) {
      console.error('❌ Erreur attache listeners:', error);
    }
  }

  /**
     * Tracker une page visitée
     */
  trackPageVisit(pageName, pageLabel = null) {
    const label = pageLabel || this.formatPageName(pageName);

    // Mapper les pages aux icones et chemins
    const pageMap = {
      'home': { icon: 'fas fa-home', type: 'page', action: 'navigate' },
      'agenda': { icon: 'fas fa-calendar-alt', type: 'page', action: 'navigate' },
      'dossier': { icon: 'fas fa-folder-open', type: 'page', action: 'navigate' },
      'application': { icon: 'fas fa-window-maximize', type: 'page', action: 'navigate' },
      'option': { icon: 'fas fa-sliders-h', type: 'page', action: 'navigate' },
      'shortcut': { icon: 'fas fa-link', type: 'page', action: 'navigate' },
      'reception': { icon: 'fas fa-inbox', type: 'page', action: 'navigate' },
      'entrer': { icon: 'fas fa-plus', type: 'subpage', action: 'navigate' },
      'sortie': { icon: 'fas fa-minus', type: 'subpage', action: 'navigate' },
      'inventaire': { icon: 'fas fa-list', type: 'subpage', action: 'navigate' },
      'historique': { icon: 'fas fa-history', type: 'subpage', action: 'navigate' },
      'tracabiliter': { icon: 'fas fa-barcode', type: 'subpage', action: 'navigate' }
    };

    const pageInfo = pageMap[pageName] || { icon: 'fas fa-file', type: 'page', action: 'navigate' };

    this.addItem({
      type: pageInfo.type,
      name: label,
      path: pageName,
      icon: pageInfo.icon,
      action: pageInfo.action
    });
  }

  /**
     * Tracker un shortcut cliqué
     */
  trackShortcutClick(shortcutName, shortcutUrl) {
    this.addItem({
      type: 'shortcut',
      name: shortcutName,
      url: shortcutUrl,
      icon: 'fas fa-link',
      action: 'open-url'
    });

    // Ouvrir l'URL dans le navigateur par défaut
    if (window.electronAPI && window.electronAPI.openExternal) {
      console.log('🌐 Ouverture raccourci dans navigateur par défaut:', shortcutUrl);
      window.electronAPI.openExternal(shortcutUrl);
    } else {
      window.open(shortcutUrl, '_blank');
    }
  }

  /**
     * Tracker un PDF ouvert
     */
  trackPdfOpen(pdfName, pdfPath) {
    this.addItem({
      type: 'pdf',
      name: pdfName,
      path: pdfPath,
      icon: 'fas fa-file-pdf',
      action: 'open-file'
    });
  }

  /**
     * Tracker une application lancée
     */
  trackAppLaunch(appName, appPath) {
    this.addItem({
      type: 'app',
      name: appName,
      path: appPath,
      icon: 'fas fa-window-maximize',
      action: 'open-app'
    });
  }
  /**
     * Tracker un dossier ouvert
     */
  trackFolderOpen(folderName, folderPath) {
    this.addItem({
      type: 'folder',
      name: folderName,
      path: folderPath,
      icon: 'fas fa-folder-open',
      action: 'open-folder'
    });
    // NE PAS appeler openPath ici - le FolderManager s'en charge déjà
  }    /**
     * Formater le nom de la page
     */
  formatPageName(pageName) {
    const names = {
      'home': 'Accueil',
      'agenda': 'Agenda',
      'dossier': 'Dossier',
      'application': 'Applications',
      'option': 'Options',
      'shortcut': 'Raccourcis',
      'reception': 'Réception',
      'entrer': 'Entrée',
      'sortie': 'Sortie',
      'inventaire': 'Inventaire',
      'historique': 'Historique',
      'tracabiliter': 'Traçabilité'
    };
    return names[pageName] || pageName;
  }

  /**
     * Échapper HTML
     */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
     * Effacer les éléments récents
     */
  clear() {
    this.recentItems = [];
    this.saveRecentItems();
    this.display();
    console.log('🗑️ Éléments récents effacés');
  }

  /**
     * Mettre à jour après changement d'utilisateur
     */
  updateForNewUser() {
    this.userId = this.getCurrentUserId();
    this.storageKey = this.getStorageKey();
    this.recentItems = this.loadRecentItems();
    this.display();
    console.log('🔄 Récents mis à jour pour nouvel utilisateur (ID: ' + (this.userId || 'anonyme') + ')');
  }
}

export default RecentItemsManager;

