# Mises à Jour - Workspace Electron

## Vue d'ensemble

Workspace utilise **electron-updater** pour les mises à jour manuelles (pas d'updates automatiques).

## 🔄 Mises à jour npm

### Vérifier les mises à jour disponibles

```bash
./setup-local.sh check-updates
# ou
make check-updates
```

Affiche toutes les dépendances qui ont des mises à jour disponibles.

### Mettre à jour les dépendances

```bash
./setup-local.sh update-deps
# ou
make update-deps
```

Vous avez 3 options :

1. **Mise à jour standard** (`npm update`)
   - Met à jour les versions mineures et patches
   - Les versions majeures sont ignorées

2. **Mode interactif** (`npm update -i`)
   - Choisissez manuellement chaque package à mettre à jour
   - Plus contrôlé, recommandé pour les projets en production

3. **Vérification uniquement**
   - Affiche les packages outdated sans faire de changements

## 🔵 Mise à jour Electron

### Vérifier la version actuelle

```bash
npm list electron
```

### Mettre à jour Electron

```bash
./setup-local.sh update-electron
# ou
make update-electron
```

**Processus** :
1. Détecte la version actuelle
2. Affiche la dernière version disponible
3. Vous demande confirmation
4. Installe la nouvelle version
5. Recompile les dépendances natives (sqlite3, etc.)

### Updates automatiques dans l'app (optionnel)

Si vous avez un menu ou des paramètres, vous pouvez ajouter un bouton pour vérifier les updates :

```javascript
// Depuis renderer process
ipcRenderer.invoke('update:check').then(result => {
    if (result && result.updateInfo) {
        console.log('Mise à jour disponible:', result.updateInfo.version);
        // Afficher une notification à l'utilisateur
    }
});
```

## 🔒 Audit de sécurité

### Vérifier les vulnérabilités

```bash
./setup-local.sh audit
# ou
make audit
```

Cherche les vulnérabilités dans les dépendances et propose de les corriger.

### Options

- **Audit seulement** : Affiche les problèmes sans les corriger
- **Auto-fix** : Applique les correctifs automatiques

## 📦 Configuration electron-builder

### Build sans publication

```bash
npm run build:win    # Windows uniquement
npm run build:mac    # macOS uniquement
npm run build:linux  # Linux uniquement
```

### Build avec publication (GitHub Releases)

```bash
npm run build:publish
```

**Attention** : Nécessite un token GitHub en variable d'environnement `GH_TOKEN`.

```bash
export GH_TOKEN=your_github_token
npm run build:publish
```

## 🔧 Configuration electron-updater dans main.js

Pour inclure les updates manuelles dans l'app :

```javascript
const { initUpdater, setupUpdateIPC } = require('./updates.js');

// Dans createWindow()
initUpdater(mainWindow);
setupUpdateIPC();

// Dans app.on('ready')
autoUpdater.checkForUpdates();
```

## 📋 Workflow typique de mise à jour

### En développement

```bash
# Vérifier les updates
make check-updates

# Mettre à jour Electron (si nécessaire)
make update-electron

# Mettre à jour les autres dépendances
make update-deps
# Choisir l'option interactive pour être sûr

# Tester l'app
make dev

# Commit les changements
git add package.json package-lock.json
git commit -m "chore: update dependencies"
```

### En production

```bash
# Vérifier les updates
make check-updates

# Tester les updates en dev
make dev

# Vérifier les tests
npm test  # si vous avez des tests

# Build l'app
make build

# Publier sur GitHub Releases (avec GH_TOKEN)
npm run build:publish

# Tag la version
git tag v1.1.0
git push origin v1.1.0
```

## 🔐 Considérations de sécurité

### 1. Vérifications de mises à jour
- Ne vérifier que si l'utilisateur le demande (pas d'auto-check)
- Afficher un dialog de confirmation avant d'installer

### 2. Dépendances
- Toujours faire un `npm audit` avant de publier
- Utiliser `npm update -i` pour examiner les changements

### 3. Sécurité GitHub
- Ne jamais committer le token GitHub
- Utiliser les GitHub Secrets en CI/CD
- Révoquer immédiatement le token s'il est exposé

## 📊 Audit npm

```bash
# Vérifier les vulnérabilités
make audit

# Voir les détails
npm audit

# Corriger automatiquement
npm audit fix

# Corriger les majeures aussi
npm audit fix --force
```

## 🎯 Bonnes pratiques

✅ **À faire** :
- Vérifier les updates régulièrement
- Tester les nouvelles versions en dev d'abord
- Committer les changements de dépendances
- Utiliser le mode interactif pour les updates

❌ **À éviter** :
- Updates automatiques sans test
- Forcer les mises à jour majeures sans vérifier
- Négliger les audits de sécurité
- Committer les tokens d'accès

## 📚 Ressources

- [Electron Updater](https://www.electron.build/auto-update)
- [npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [npm update](https://docs.npmjs.com/cli/v10/commands/npm-update)
- [Electron Update Best Practices](https://www.electronjs.org/docs/latest/api/auto-updater)
