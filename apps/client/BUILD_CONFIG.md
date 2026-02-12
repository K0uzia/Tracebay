# Configuration des Builds Electron

Ce document explique comment configurer et exécuter les builds différenciés pour le développement et la production.

## 📋 Vue d'ensemble

Le projet utilise `electron-builder` pour générer les builds, avec deux modes distincts :

- **Mode Développement** : Builds portables (dossiers) pour tester rapidement
- **Mode Production** : Installateurs complets avec publication automatique sur GitHub Releases

## 🔧 Scripts disponibles

### Mode Développement

```bash
# Build portable pour la plateforme actuelle
npm run build:dev

# Build portable Windows
npm run build:dev:win

# Build portable macOS
npm run build:dev:mac

# Build portable Linux
npm run build:dev:linux
```

**Résultat** : Dossier dans `apps/client/dist/` contenant l'application non packagée (pour tests rapides).

### Mode Production

```bash
# Build installateurs pour toutes les plateformes + publication GitHub
npm run build:prod

# Build installateur Windows + publication
npm run build:prod:win

# Build installateur macOS + publication
npm run build:prod:mac

# Build installateur Linux + publication
npm run build:prod:linux
```

**Résultat** : Installateurs dans `apps/client/dist/` + publication automatique sur GitHub Releases.

## 📦 Formats de build

### Windows (Production)
- **NSIS Installer** : Installateur Windows standard (`.exe`)
  - Permet de choisir le dossier d'installation
  - Crée des raccourcis bureau et menu démarrer
  - Option de désinstallation
- **Portable** : Version portable (`.exe`)
  - Aucune installation requise
  - Parfait pour les déploiements rapides

### macOS (Production)
- **DMG** : Image disque macOS (`.dmg`)
  - Support x64 et ARM64 (Apple Silicon)
  - Interface graphique d'installation
  - Code signé (nécessite certificat Apple Developer)

### Linux (Production)
- **AppImage** : Application portable Linux (`.AppImage`)
  - Aucune installation requise
  - Fonctionne sur la plupart des distributions
- **Debian Package** : Package Debian (`.deb`)
  - Installation système standard
  - Compatible Ubuntu, Debian, etc.

## 🔐 Configuration GitHub Releases

Pour publier automatiquement sur GitHub Releases, vous devez :

1. **Créer un token GitHub** avec les permissions `repo` :
   - Allez sur GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Créez un nouveau token avec la permission `repo`
   - Copiez le token

2. **Configurer le token** :
   ```bash
   # Linux/macOS
   export GITHUB_TOKEN=votre_token_ici
   
   # Windows (PowerShell)
   $env:GITHUB_TOKEN="votre_token_ici"
   
   # Ou créer un fichier .env (non versionné)
   echo "GITHUB_TOKEN=votre_token_ici" >> .env
   ```

3. **Lancer le build de production** :
   ```bash
   npm run build:prod
   ```

## 📁 Structure des fichiers de build

```
apps/client/
├── build/                    # Ressources de build
│   ├── icon.ico             # Icône Windows (à créer)
│   ├── icon.icns            # Icône macOS (à créer)
│   ├── icon.png             # Icône Linux (à créer)
│   ├── installer.nsh        # Script NSIS personnalisé
│   ├── entitlements.mac.plist # Permissions macOS
│   └── dmg-background.png   # Image de fond DMG (optionnel)
├── dist/                     # Sortie des builds (gitignored)
│   ├── Workspace Client-1.0.0-x64.exe    # Installateur Windows
│   ├── Workspace Client-1.0.0-portable.exe # Portable Windows
│   ├── Workspace Client-1.0.0-x64.dmg    # DMG macOS
│   ├── Workspace Client-1.0.0-x64.AppImage # AppImage Linux
│   └── Workspace Client-1.0.0-x64.deb    # Debian package
└── package.json              # Configuration electron-builder
```

## 🎨 Création des icônes

Les icônes doivent être créées manuellement et placées dans `apps/client/build/` :

- **Windows** : `icon.ico` (256x256, format ICO)
- **macOS** : `icon.icns` (512x512, format ICNS)
- **Linux** : `icon.png` (512x512, format PNG)

**Outils recommandés** :
- [IconGenerator](https://icon-generator.net/) pour convertir PNG → ICO/ICNS
- [Image2icon](http://www.img2icnsapp.com/) pour macOS
- [GIMP](https://www.gimp.org/) pour créer les images sources

## ⚙️ Configuration avancée

La configuration complète se trouve dans `apps/client/package.json` sous la clé `build`.

### Personnalisation des installateurs

- **Windows NSIS** : Modifier `build/installer.nsh`
- **macOS DMG** : Modifier la section `dmg` dans `package.json`
- **Linux** : Modifier les sections `appImage` et `deb`

### Variables d'environnement

- `NODE_ENV` : `development` ou `production` (détermine le mode de build)
- `GITHUB_TOKEN` : Token GitHub pour la publication (production uniquement)
- `CSC_LINK` : Chemin vers le certificat de signature macOS (optionnel)
- `CSC_KEY_PASSWORD` : Mot de passe du certificat macOS (optionnel)

## 🚀 Workflow recommandé

1. **Développement** :
   ```bash
   npm run build:dev:win  # Test rapide sur Windows
   ```

2. **Test local de production** :
   ```bash
   NODE_ENV=production electron-builder --win --publish=never
   ```

3. **Publication sur GitHub** :
   ```bash
   export GITHUB_TOKEN=votre_token
   npm run build:prod
   ```

## ⚠️ Notes importantes

- Les builds de production nécessitent un token GitHub valide
- La signature macOS nécessite un compte Apple Developer payant
- Les builds Windows peuvent être signés avec un certificat de code (optionnel)
- Les fichiers dans `dist/` sont automatiquement ignorés par Git

## 📚 Ressources

- [Documentation electron-builder](https://www.electron.build/)
- [Configuration NSIS](https://www.electron.build/configuration/nsis)
- [Configuration DMG](https://www.electron.build/configuration/dmg)
- [GitHub Releases](https://www.electron.build/configuration/publish#github)
