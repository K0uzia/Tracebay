# Correctifs backend chat (branche proxmox)

À appliquer **sur la branche `proxmox`** (fichier `proxmox/app/src/main.ts`).

## 1. Compteur = nombre de comptes (pas de connexions)

```bash
git checkout proxmox
git apply proxmox-userCount-unique-usernames.patch
```

Envoie des **pseudos uniques** dans `userCount` pour que le client affiche le bon nombre de comptes connectés.

## 2. Bloquer deux connexions du même compte (deux postes)

**Ne pas appliquer** `proxmox-login-replace-session.patch` si vous voulez interdire qu’un même compte soit connecté sur deux postes en même temps. Le code actuel (sans ce patch) renvoie déjà `ALREADY_LOGGED_IN` dans ce cas.

## 3. Libérer la session à la déconnexion WebSocket

Déjà corrigé sur proxmox (commit « fix(auth): libérer la session à la déconnexion WebSocket »). Quand le dernier WebSocket d’un utilisateur se ferme, son compte est retiré de `activeSessions`, il peut se reconnecter depuis un autre poste.

## 4. Messages en direct

Le serveur proxmox diffuse déjà les messages avec `type: 'message:new'`. Le client gère ce type et aussi `type: 'message'` avec `data.data`. Si les messages n’apparaissent pas, vérifier que le serveur utilisé est bien celui de la branche proxmox (avec le `broadcast(outbound)` dans le `case 'message':`).
