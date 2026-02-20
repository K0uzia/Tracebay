# Correctifs backend chat (branche proxmox)

À appliquer **sur la branche `proxmox`** (fichier `proxmox/app/src/main.ts`).

## 1. Compteur = nombre de connexions + broadcast à chaque auth/setPseudo (recommandé)

```bash
git checkout proxmox
git apply proxmox-chat-fix-count-and-broadcast.patch
```

- **Compteur** : `count = connectedUsers.size` (nombre de connexions : 0, 1, 2…).
- **Broadcast** : après `auth` et après `setPseudo`, appelle `sendUserCount()` pour que tous les clients reçoivent le nouveau compteur (le 2ᵉ client qui se connecte met à jour l'affichage du 1ᵉʳ).

Si tu avais appliqué `proxmox-userCount-unique-usernames.patch` auparavant, ce patch le remplace (même zone modifiée).

## 1bis. Ancien correctif (compteur = pseudos uniques)

```bash
git apply proxmox-userCount-unique-usernames.patch
```

Envoie des **pseudos uniques** dans `userCount`. Préférer le patch ci‑dessus pour « 2 clients = 2 ».

## 2. Bloquer deux connexions du même compte (deux postes)

**Ne pas appliquer** `proxmox-login-replace-session.patch` si vous voulez interdire qu'un même compte soit connecté sur deux postes en même temps. Le code actuel (sans ce patch) renvoie déjà `ALREADY_LOGGED_IN` dans ce cas.

## 3. Libérer la session à la déconnexion WebSocket

Déjà corrigé sur proxmox (commit « fix(auth): libérer la session à la déconnexion WebSocket »). Quand le dernier WebSocket d'un utilisateur se ferme, son compte est retiré de `activeSessions`, il peut se reconnecter depuis un autre poste.

## 4. Messages en direct

Le serveur proxmox diffuse déjà les messages avec `type: 'message:new'`. Le client gère ce type et aussi `type: 'message'` avec `data.data`. Si les messages n'apparaissent pas, vérifier que le serveur utilisé est bien celui de la branche proxmox (avec le `broadcast(outbound)` dans le `case 'message':`).

## 5. Dépannage : compteur, messages, « déjà connecté »

- **Compteur reste à 2 ou passe à 3 en déconnectant**  
  Vérifier qu'il n'y a qu'une seule connexion WebSocket par fenêtre (client utilise un singleton). À la fermeture d'une fenêtre, le client envoie maintenant un `beforeunload` qui ferme le WebSocket proprement pour que le serveur mette à jour le compteur.

- **Messages n'apparaissent pas sur le 2ᵉ client**  
  Si les deux clients utilisent **le même compte** : le serveur fait un « zombie cleanup » à chaque `auth` : il ne garde qu'une seule connexion par utilisateur et coupe l'ancienne. Donc le 2ᵉ client qui envoie `auth` déconnecte le 1ᵉʳ (ou l'inverse après reconnexion). Seule la connexion « gagnante » reçoit les messages. Pour avoir **deux fenêtres avec le même utilisateur** qui reçoivent toutes les deux les messages, il faut sur le serveur (proxmox) **ne plus supprimer les anciennes connexions** dans le `case 'auth':` (supprimer le bloc qui filtre `zombies` et fait `connectedUsers.delete` / `terminate`).

- **« Déjà connecté » en se reconnectant**  
  Le serveur considère qu'un compte est encore connecté tant qu'il reste une entrée dans `activeSessions`. Celle-ci est retirée quand le **dernier** WebSocket de cet utilisateur se ferme (événement `close`). Si on ferme la fenêtre sans que le WebSocket envoie un `close` (processus tué, crash), le serveur ne le sait pas et renvoie `ALREADY_LOGGED_IN`.  
  **Côté client** : à la fermeture de la fenêtre (`beforeunload` / `pagehide`), le WebSocket est maintenant fermé avec `close(true)` pour que le serveur reçoive bien le `close` et libère la session. Toujours se déconnecter via « Déconnexion » quand c'est possible.
