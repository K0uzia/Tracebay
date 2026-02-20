# Correctifs backend chat (branche proxmox)

À appliquer **sur la branche `proxmox`** (fichier `proxmox/app/src/main.ts`).

## 1. Compteur = nombre de connexions + broadcast à chaque auth/setPseudo (recommandé)

```bash
git checkout proxmox
git apply proxmox-chat-fix-count-and-broadcast.patch
```

- **Compteur** : `count = connectedUsers.size` (nombre de connexions : 0, 1, 2…).
- **Broadcast** : après `auth` et après `setPseudo`, appelle `sendUserCount()` pour que tous les clients reçoivent le nouveau compteur (le 2ᵉ client qui se connecte met à jour l’affichage du 1ᵉʳ).

Si tu avais appliqué `proxmox-userCount-unique-usernames.patch` auparavant, ce patch le remplace (même zone modifiée).

## 1bis. Ancien correctif (compteur = pseudos uniques)

```bash
git apply proxmox-userCount-unique-usernames.patch
```

Envoie des **pseudos uniques** dans `userCount`. Préférer le patch ci‑dessus pour « 2 clients = 2 ».

## 2. Bloquer deux connexions du même compte (deux postes)

**Ne pas appliquer** `proxmox-login-replace-session.patch` si vous voulez interdire qu’un même compte soit connecté sur deux postes en même temps. Le code actuel (sans ce patch) renvoie déjà `ALREADY_LOGGED_IN` dans ce cas.

## 3. Libérer la session à la déconnexion WebSocket

Déjà corrigé sur proxmox (commit « fix(auth): libérer la session à la déconnexion WebSocket »). Quand le dernier WebSocket d’un utilisateur se ferme, son compte est retiré de `activeSessions`, il peut se reconnecter depuis un autre poste.

## 4. Messages en direct

Le serveur proxmox diffuse déjà les messages avec `type: 'message:new'`. Le client gère ce type et aussi `type: 'message'` avec `data.data`. Si les messages n’apparaissent pas, vérifier que le serveur utilisé est bien celui de la branche proxmox (avec le `broadcast(outbound)` dans le `case 'message':`).
