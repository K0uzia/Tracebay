/**
 * Exemple de config locale (clés API, etc.).
 * Copier ce fichier vers app-config.local.js et remplir les valeurs.
 * app-config.local.js n'est pas versionné (.gitignore).
 *
 * Alternatives pour la clé Giphy (sans mettre de secret dans le dépôt) :
 * - Ce fichier (app-config.local.js) avec giphyApiKey
 * - Variable d'environnement GIPHY_API_KEY au lancement
 * - Fichier workspace-config.json dans le dossier userData de l'app (clé "giphyApiKey")
 * - En dev : config/local.json (copier config/local.json.example)
 */
(function () {
    window.APP_CONFIG = window.APP_CONFIG || {};
    // Clé API Giphy pour la recherche de GIFs dans le chat (https://developers.giphy.com/dashboard/)
    window.APP_CONFIG.giphyApiKey = 'VOTRE_CLE_GIPHY_ICI';
})();
