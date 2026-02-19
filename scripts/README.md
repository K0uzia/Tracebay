# Scripts

## Lancement avec mise à jour automatique

Pour lancer le client en mettant à jour automatiquement les fichiers depuis `origin/main` avant démarrage :

```bash
# À la racine du dépôt
npm run start:with-update
```

Comportement :

1. `git fetch origin main`
2. Comparaison des fichiers sous `apps/client/` avec `origin/main`
3. S’il y a des différences : `git pull origin main` puis lancement
4. Sinon : lancement direct du client (`npm start`)

En cas d’échec du fetch (pas de réseau), le client est lancé sans mise à jour.
