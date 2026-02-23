# Correctif : "Déjà connecté sur un autre poste" après fermeture des clients

## Problème
Quand une connexion WebSocket est fermée (stale, fermeture navigateur, ou reconnexion), le serveur ne retire pas le username de `activeSessions`. Au prochain login avec le même compte, le serveur croit que l’utilisateur est encore connecté et renvoie "Compte déjà connecté sur un autre poste."

## Solution (branche proxmox, fichier `proxmox/app/src/main.ts`)

Dans le **handler `socket.on('close', ...)`** du WebSocket, il faut **retirer le username de `activeSessions`** quand la connexion se ferme.

1. Repérer le bloc qui gère la fermeture, par exemple :
   ```ts
   socket.on('close', (code?: number, reason?: Buffer) => {
     const hadEntry = connectedUsers.has(userId);
     const sizeBefore = connectedUsers.size;
     const normalizedUsername = String(username).trim().toLowerCase();
     // ... clearInterval(pingInterval) ...
     connectedUsers.delete(userId);
     // ...
     if (others.length === 0) activeSessions.delete(normalized);
     broadcastUserCount();
   });
   ```

2. S’assurer que **dès qu’on supprime l’entrée de `connectedUsers`**, on fait bien **`activeSessions.delete(normalizedUsername)`** pour le username de **cette** connexion (pas seulement quand "others.length === 0").

   Comportement correct :
   - À la fermeture de la socket, on enlève **toujours** ce user de `activeSessions` (pour le username associé à cette connexion).
   - Ensuite, si d’autres connexions avec le même username existent encore, elles restent dans `connectedUsers` ; mais comme on a supprimé **cette** entrée, il faut enlever **cette** session de `activeSessions` uniquement si c’était la dernière connexion pour ce username.

   En pratique : **à chaque `close`, retirer le `username` de cette socket de `activeSessions`**. Par exemple juste après `connectedUsers.delete(userId)` :

   ```ts
   activeSessions.delete(normalizedUsername);
   ```

   (avec `normalizedUsername` = username de cette connexion, normalisé en minuscules comme ailleurs dans le fichier).

3. Vérifier qu’il n’y a pas une condition du type "if (others.length === 0) activeSessions.delete(...)" qui empêche de supprimer quand il reste d’autres connexions : on doit supprimer **cette** session à chaque close, et ne garder dans `activeSessions` que les usernames qui ont **au moins une** connexion encore ouverte (en recalculant si besoin après le delete).

   Variante simple et sûre : **à chaque fermeture, faire `activeSessions.delete(normalizedUsername)`**. Ensuite, si tu maintiens `activeSessions` uniquement pour "un compte = une connexion", au prochain auth avec ce username il n’y aura plus d’entrée et la connexion sera acceptée.
   Si ailleurs dans le code tu ajoutes à `activeSessions` uniquement à l’auth, alors supprimer au close suffit.

## Résumé
Dans `socket.on('close', ...)` du WebSocket, après `connectedUsers.delete(userId)`, ajouter :

```ts
activeSessions.delete(normalizedUsername);
```

(où `normalizedUsername` est le username de cette connexion, normalisé comme dans le reste du fichier, ex. `String(username).trim().toLowerCase()`).

Puis rebuild et redéployer le backend Proxmox.
