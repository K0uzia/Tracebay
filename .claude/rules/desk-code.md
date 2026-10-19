# Code (processus principal, renderer, Rust)

- Pas de framework, préprocesseur ou bibliothèque sans besoin prouvé. Chaque dépendance ajoutée est justifiée par écrit (et vérifiée pour sa compatibilité Electron/Node ou sa licence).
- Open source d'abord : avant d'écrire un utilitaire non trivial de zéro, chercher une bibliothèque viable. Critères : licence permissive (MIT, Apache-2.0, BSD, ISC), maintenue, légère, sans module natif si une alternative existe. Sinon, écrire le code et noter pourquoi en une ligne de commentaire.
- Bibliothèques de référence (déjà validées sur l'ERP Kouzia) : `zod` (validation des entrées IPC et API), `argon2` (mots de passe), `vitest` ou `jest` (tests), `pdfkit` (PDF), `nodemailer` (e-mail). À ne pas introduire sans validation : bibliothèque de composants complète (MUI, AG Grid).
- HTML sémantique avant ARIA : `button` pour une action, `a` pour une navigation, `dialog` pour une modale, `details` pour un dépliant.
- Interdit à l'exécution : `eval`, `new Function`, `innerHTML` avec une donnée externe non échappée, `document.write`, `window.prompt`/`alert`/`confirm` comme interface (utiliser `dialog` HTML ou `dialog.showMessageBox`).
- Événements : délégation sur un conteneur, initialisation une seule fois (marqueur `data-*`), écouteurs retirés quand une vue est détruite. Les identifiants partagés entre HTML, CSS et JS sont stables.
- Processus principal : aucune opération synchrone longue (`fs.*Sync`, requête SQL lourde) sur un chemin chaud ; elle gèle toutes les fenêtres. `better-sqlite3` est synchrone : requêtes courtes et indexées, ou thread de travail.
- Erreurs : chaque `invoke`/`handle` renvoie un résultat ou une erreur métier lisible ; aucune promesse rejetée silencieusement. `process.on('uncaughtException')` journalise puis informe l'utilisateur, ne masque pas.
- Stockage navigateur (`localStorage`) : seulement des préférences d'interface légères. Données métier : base locale ou serveur.
- Rust (Tauri) : `clippy` sans avertissement, pas de `unwrap()` sur une entrée utilisateur ou un I/O, erreurs typées (`thiserror`).
- Formatage : Prettier / ESLint du projet (`rustfmt` pour Rust). Pas de reformatage de fichiers hors périmètre.
- Chemins et URLs : jamais de chemin absolu de la machine de dev, jamais d'IP réelle du réseau en dur (configuration ou découverte).
