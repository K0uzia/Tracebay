# JWT et stockage des tokens (client Electron)

## État actuel : localStorage

L’application stocke le **token JWT** et les données de session dans le **localStorage** du renderer (contexte web de la fenêtre principale).

### Clés utilisées

| Clé | Usage |
|-----|--------|
| `workspace_jwt` | Token JWT d’authentification (Bearer) |
| `workspace_user_id` | ID utilisateur (après connexion) |
| `workspace_username` | Nom d’utilisateur |
| `workspace_client_id` | Identifiant client (persistant, utilisé pour erreurs / analytics) |

### Où c’est lu/écrit

- **AuthManager** (`public/assets/js/modules/auth/AuthManager.js`) : connexion, déconnexion, vérification de session, `setSession` / `clearSession`.
- **api.js** : `getAuthToken()` et `createHeaders()` pour les requêtes HTTP.
- **ChatWebSocket** : auth WebSocket avec `workspace_jwt`.
- **ShortcutManager**, **AgendaStore**, **RecentItemsManager**, modules réception (inventaire, traçabilité, historique, etc.) : lecture du token pour les appels API.

### Risques et limites

- **localStorage** est lié à l’origine (protocol + host). En Electron avec `file://`, l’origine est celle du fichier chargé ; les données persistent tant que le profil utilisateur (userData) est conservé.
- **Pas de chiffrement** : le token est en clair dans le stockage du renderer. Un accès au disque au répertoire userData (ou une exfiltration via DevTools / script injecté) pourrait le récupérer.
- **XSS** : en cas de faille XSS dans l’app, un script pourrait lire `localStorage` et envoyer le JWT à un tiers. Mitigation : bonnes pratiques (pas d’`innerHTML` non sanitisé, CSP, revue des entrées utilisateur).

---

## Évolution possible : keychain / secret storage

Pour renforcer la sécurité, on peut envisager de stocker le JWT dans le **secret storage** du système (keychain) plutôt que dans le localStorage.

### Intérêt

- Chiffrement par le système (Keychain sur macOS, Credential Vault sur Windows, libsecret / keyring sur Linux).
- Réduction de l’exposition en cas d’accès au profil Electron sans accès au keychain.

### Pistes techniques (Electron)

- **safeStorage** (Electron) : `electron.safeStorage.encryptString()` / `decryptString()` pour chiffrer/déchiffrer avec le keychain du système. Le main process peut exposer via IPC des handlers du type `get-secure-token` / `set-secure-token` ; le renderer ne stocke plus le JWT en clair.
- Implémentation typique : au login, le renderer envoie le token au main ; le main chiffre avec `safeStorage` et écrit dans un fichier dans userData (ou ne garde qu’en mémoire et persiste chiffré au besoin). À chaque requête, le renderer demande le token au main (ou le main ajoute le header côté main pour des appels faits depuis le main).

### Contraintes

- Disponibilité de `safeStorage` selon la plateforme et la configuration (voir doc Electron).
- Refactor non trivial : tous les appels qui lisent `localStorage.getItem('workspace_jwt')` devraient passer par une couche qui récupère le token via IPC (ou une API centralisée alimentée par le main).
- Gestion du premier lancement et des migrations (anciens tokens en localStorage à migrer vers le keychain puis effacement du localStorage).

### Recommandation

- **Court terme** : garder le stockage actuel en localStorage, en documentant son usage (ce document) et en appliquant les bonnes pratiques (pas d’innerHTML non sanitisé, CSP, durcissement du preload).
- **Moyen terme** : si le niveau de sensibilité le justifie, planifier une évolution vers **safeStorage** (Electron) avec une API centralisée (ex. `getAuthToken()` côté renderer qui appelle le main) et migration des sessions existantes.

---

*Document de référence pour l’audit application (Priorité 3, point 8). Dernière mise à jour : mars 2025.*
