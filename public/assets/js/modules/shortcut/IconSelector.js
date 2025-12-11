/**
 * IconSelector - Gestion de la sélection d'icônes Font Awesome
 */

class IconSelector {
    constructor(callback) {
        this.callback = callback;
        this.selectedIcon = 'fas fa-link';
        
        // Liste des icônes populaires groupées par catégorie
        this.icons = {
            'Web & Social': [
                'fab fa-google',
                'fab fa-facebook',
                'fab fa-twitter',
                'fab fa-github',
                'fab fa-linkedin',
                'fab fa-instagram',
                'fab fa-discord',
                'fab fa-slack',
                'fab fa-reddit',
                'fab fa-youtube',
                'fab fa-twitch',
                'fab fa-tiktok',
                'fab fa-pinterest',
                'fab fa-whatsapp',
                'fab fa-telegram',
            ],
            'Productivité': [
                'fas fa-file-alt',
                'fas fa-file-excel',
                'fas fa-file-pdf',
                'fas fa-tasks',
                'fas fa-calendar-alt',
                'fas fa-chart-line',
                'fas fa-presentation',
                'fas fa-database',
                'fas fa-terminal',
                'fas fa-code',
                'fas fa-sticky-note',
                'fas fa-clipboard',
                'fas fa-project-diagram',
            ],
            'Communication': [
                'fas fa-envelope',
                'fas fa-comments',
                'fas fa-phone',
                'fas fa-video',
                'fas fa-headset',
                'fas fa-bell',
                'fas fa-message',
                'fas fa-comment-dots',
                'fas fa-paper-plane',
            ],
            'Stockage & Cloud': [
                'fas fa-cloud',
                'fas fa-cloud-upload-alt',
                'fas fa-cloud-download-alt',
                'fas fa-folder',
                'fas fa-folder-open',
                'fas fa-file',
                'fas fa-box',
                'fas fa-cube',
                'fas fa-save',
            ],
            'Design & Médias': [
                'fas fa-image',
                'fas fa-video',
                'fas fa-music',
                'fas fa-palette',
                'fas fa-pen-fancy',
                'fas fa-camera',
                'fas fa-film',
                'fas fa-icons',
                'fas fa-layer-group',
            ],
            'Utilitaires': [
                'fas fa-link',
                'fas fa-lock',
                'fas fa-unlock',
                'fas fa-key',
                'fas fa-shield-alt',
                'fas fa-tools',
                'fas fa-cog',
                'fas fa-server',
                'fas fa-wifi',
                'fas fa-plug',
                'fas fa-power-off',
                'fas fa-flash',
            ],
            'Navigation': [
                'fas fa-home',
                'fas fa-arrow-right',
                'fas fa-arrow-left',
                'fas fa-arrow-up',
                'fas fa-arrow-down',
                'fas fa-check',
                'fas fa-times',
                'fas fa-star',
                'fas fa-heart',
                'fas fa-bookmark',
                'fas fa-search',
            ]
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderIconGrid();
    }

    setupEventListeners() {
        const modal = document.getElementById('modal-icon-selector');
        const searchInput = document.getElementById('icon-search');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterIcons(e.target.value);
            });
        }

        // Fermer le modal en cliquant en dehors
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.close();
                }
            });
        }
    }

    renderIconGrid() {
        const grid = document.getElementById('icons-grid');
        if (!grid) return;

        grid.innerHTML = '';

        for (const [category, iconList] of Object.entries(this.icons)) {
            const categorySection = document.createElement('div');
            categorySection.className = 'icon-category';

            const categoryTitle = document.createElement('h3');
            categoryTitle.className = 'icon-category-title';
            categoryTitle.textContent = category;
            categorySection.appendChild(categoryTitle);

            const iconContainer = document.createElement('div');
            iconContainer.className = 'icon-list';

            iconList.forEach(iconClass => {
                const iconBtn = document.createElement('button');
                iconBtn.type = 'button';
                iconBtn.className = 'icon-btn';
                iconBtn.dataset.icon = iconClass;
                iconBtn.title = iconClass;

                const iconEl = document.createElement('i');
                iconEl.className = iconClass;

                iconBtn.appendChild(iconEl);
                iconBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.selectIcon(iconClass);
                });

                iconContainer.appendChild(iconBtn);
            });

            categorySection.appendChild(iconContainer);
            grid.appendChild(categorySection);
        }
    }

    filterIcons(searchTerm) {
        const grid = document.getElementById('icons-grid');
        if (!grid) return;

        const searchLower = searchTerm.toLowerCase();
        const categories = grid.querySelectorAll('.icon-category');

        categories.forEach(category => {
            let hasMatch = false;
            const buttons = category.querySelectorAll('.icon-btn');

            buttons.forEach(btn => {
                const iconClass = btn.dataset.icon;
                if (iconClass.toLowerCase().includes(searchLower)) {
                    btn.style.display = 'block';
                    hasMatch = true;
                } else {
                    btn.style.display = 'none';
                }
            });

            category.style.display = hasMatch ? 'block' : 'none';
        });
    }

    selectIcon(iconClass) {
        this.selectedIcon = iconClass;
        
        // Mettre à jour l'input et le preview
        const input = document.getElementById('shortcut-icon');
        const preview = document.getElementById('selected-icon-preview');

        if (input) {
            input.value = iconClass;
        }

        if (preview) {
            preview.innerHTML = `<i class="${iconClass}"></i>`;
        }

        // Fermer le modal
        const modal = document.getElementById('modal-icon-selector');
        if (modal) {
            modal.close();
        }

        // Appeler le callback si fourni
        if (this.callback) {
            this.callback(iconClass);
        }
    }

    open() {
        const modal = document.getElementById('modal-icon-selector');
        if (modal) {
            modal.showModal();
        }
    }
}

export default IconSelector;
