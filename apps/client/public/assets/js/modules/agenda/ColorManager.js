export default class ColorManager {
    constructor() {
        this.storageKey = 'agenda_favorite_colors';
        this.defaultColors = ['#3788d8', '#43c466', '#fdb544'];
        this.initializeFavorites();
    }

    initializeFavorites() {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) {
            localStorage.setItem(this.storageKey, JSON.stringify(this.defaultColors));
        }
    }

    getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || this.defaultColors;
        } catch (e) {
            return this.defaultColors;
        }
    }

    addFavorite(color) {
        const favorites = this.getFavorites();
        if (!favorites.includes(color)) {
            favorites.unshift(color);
            if (favorites.length > 12) favorites.pop();
            localStorage.setItem(this.storageKey, JSON.stringify(favorites));
        }
    }

    removeFavorite(color) {
        const favorites = this.getFavorites().filter(c => c !== color);
        localStorage.setItem(this.storageKey, JSON.stringify(favorites));
    }
}
