# 📦 Guide de Publication GitHub Releases

## Vue d'ensemble

Ce guide explique comment publier votre application Electron sur GitHub Releases avec token d'authentification sécurisé.

## Architecture

```
scripts/
├── setup-env.sh        # Configuration sécurisée du token
└── build-publish.sh    # Build et préparation publication

.env.example            # Modèle de configuration
.env (IGNORÉ)           # Fichier réel avec token (jamais commiter)

Makefile
├── make setup-env      # Charger token
├── make build-publish  # Builder et préparer
└── make publish-github # Build + publication GitHub
```

## Processus complet

### 1️⃣ Configuration initiale (une seule fois)

```bash
# Créer et configurer le token GitHub
make setup-env

# Cela va:
# ✅ Demander ton token GitHub (saisie masquée)
# ✅ Valider le format (ghp_ prefix)
# ✅ Créer .env avec permissions 600
# ✅ Charger automatiquement les variables
```

### 2️⃣ Build et test publication

```bash
# Builder l'application (test seulement)
make build-publish

# Cela va:
# ✅ Charger le token depuis .env
# ✅ Installer dépendances si nécessaire
# ✅ Exécuter npm run build
# ✅ Afficher les artifacts générés
# ✅ Afficher les prochaines étapes
```

### 3️⃣ Publication sur GitHub

```bash
# Publication automatique sur GitHub Releases
make publish-github

# Cela va:
# ✅ Charger le token depuis .env
# ✅ Exécuter build-publish avec flag --publish
# ✅ Utiliser npm run build:publish (= electron-builder --publish always)
# ✅ Uploader les artifacts sur GitHub Releases
# ✅ Créer/mettre à jour la release avec les artifacts
```

## Obtenir un token GitHub

1. **Va à**: https://github.com/settings/tokens
2. **Clique**: "Generate new token (classic)"
3. **Permissions minimales requises**:
   - ✅ `repo` (accès complet aux repos privés et publics)
4. **Copie** le token (visible une seule fois!)
5. **Exécute**: `make setup-env` et colle le token

## Fichiers de configuration

### .env (généré, JAMAIS commiter)

```bash
# Généré par make setup-env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Sécurité**:
- Permissions: `600` (lecture/écriture pour l'user seul)
- Jamais commité (dans .gitignore)
- Jamais en plaintext dans le code

### .env.example (documentation)

```bash
# Modèle documentant les variables nécessaires
# À copier en .env et remplir les valeurs
```

## Dépannage

### Erreur: "GITHUB_TOKEN non défini"

**Solution**:
```bash
make setup-env
# Ou exporte manuellement:
export GITHUB_TOKEN="ghp_..."
```

### Erreur: "Authentication failed"

**Vérifier**:
1. Token est valide: https://github.com/settings/tokens
2. Token n'a pas expiré
3. Token a les permissions `repo`
4. Token n'est pas révoqué

### Erreur: "Repository not found"

**Vérifier dans package.json**:
```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "SandersonnDev",
    "repo": "workspace"
  }
}
```

### Vérifier manuellement

```bash
# Vérifier le token
echo $GITHUB_TOKEN

# Tester la connexion GitHub
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user

# Voir les releases existantes
gh release list --repo SandersonnDev/workspace
```

## Workflow complet

### Pour une nouvelle release

```bash
# 1. Modifier version dans package.json
# 2. Commit & push
git commit -am "chore: release v1.0.1"
git push

# 3. Builder et publier
make setup-env        # Au besoin
make publish-github   # Build + publication automatique

# 4. Vérifier sur GitHub
# https://github.com/SandersonnDev/workspace/releases
```

## Sécurité

### ✅ Bonnes pratiques

- **Token masqué**: `read -s` dans setup-env.sh (pas visible en saisissant)
- **Permissions restreintes**: Fichier .env avec chmod 600
- **Jamais committer**: .env dans .gitignore
- **Expiration**: Configurer une expiration sur GitHub
- **Scope minimal**: Utiliser `repo` (pas `admin:repo_hook`, etc.)

### ⚠️ En cas de compromission

```bash
# 1. Révoque le token immédiatement
# https://github.com/settings/tokens

# 2. Crée un nouveau token
# https://github.com/settings/tokens/new

# 3. Mets à jour setup-env.sh
make setup-env

# 4. Force push ou crée une nouvelle build sécurisée
```

## Variables d'environnement avancées

Optionnel dans .env:

```bash
# Debug mode
DEBUG=true

# Environment
NODE_ENV=production

# Publish config
PUBLISH_PROVIDER=github
PUBLISH_OWNER=SandersonnDev
PUBLISH_REPO=workspace
```

## Commandes rapides

```bash
# Configuration
make setup-env              # Configurer token

# Build
make build                  # Build simple
make build-publish          # Build avec préparation
make publish-github         # Build + publication complète

# Maintenance
make check-updates          # Vérifier mises à jour
make audit                  # Audit sécurité npm

# Database
make db.init                # Initialiser BD
make db.backup              # Sauvegarder BD
```

## Ressources

- 📖 [electron-builder docs](https://www.electron.build/)
- 🔐 [GitHub Token docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- 🚀 [GitHub Releases API](https://docs.github.com/en/rest/releases)
- 🛡️ [Security best practices](https://docs.github.com/en/code-security)

---

**Dernière mise à jour**: Décembre 2024
**Version**: 1.0 - Publication avec GitHub Releases
