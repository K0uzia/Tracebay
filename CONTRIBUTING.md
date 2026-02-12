# 🤝 Guide de Contribution

Merci de votre intérêt pour contribuer au projet Workspace ! Ce guide vous aidera à comprendre comment contribuer efficacement.

---

## 📋 Table des Matières

1. [Code de Conduite](#code-de-conduite)
2. [Configuration de l'Environnement](#configuration-de-lenvironnement)
3. [Standards de Code](#standards-de-code)
4. [Processus de Contribution](#processus-de-contribution)
5. [Tests](#tests)
6. [Documentation](#documentation)
7. [Commit Messages](#commit-messages)

---

## 📜 Code de Conduite

- Soyez respectueux et professionnel
- Acceptez les critiques constructives
- Aidez les autres contributeurs
- Respectez les décisions de l'équipe

---

## 🛠️ Configuration de l'Environnement

### Prérequis

- Node.js >= 18.0.0
- npm >= 8.0.0
- Git

### Installation

```bash
# Cloner le repository
git clone https://github.com/SandersonnDev/workspace.git
cd workspace

# Installer les dépendances
npm install

# Lancer les tests
npm test

# Lancer le linter
npm run lint:check
```

---

## 📝 Standards de Code

### Style de Code

- **ESLint** : Le projet utilise ESLint avec des règles strictes
- **Prettier** : Formatage automatique avec Prettier
- **Indentation** : 2 espaces (pas de tabs)
- **Quotes** : Simple quotes (`'`) pour les strings
- **Semicolons** : Toujours utiliser des points-virgules

### Vérifier le Code

```bash
# Linter avec auto-fix
npm run lint

# Linter sans modification
npm run lint:check

# Formater le code
npm run format
```

### Structure des Fichiers

```
apps/client/
├── config/              # Configuration
├── public/
│   ├── assets/
│   │   └── js/
│   │       ├── config/  # Modules de configuration
│   │       └── modules/ # Modules métier
│   └── index.html
└── package.json
```

### Conventions de Nommage

- **Fichiers** : camelCase pour JS (`authManager.js`)
- **Classes** : PascalCase (`AuthManager`)
- **Fonctions** : camelCase (`getUserData`)
- **Constantes** : UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Variables** : camelCase (`userName`)

---

## 🔄 Processus de Contribution

### 1. Créer une Branche

```bash
# Créer une branche depuis main
git checkout -b feature/ma-fonctionnalite
# ou
git checkout -b fix/mon-bug
```

**Conventions de nommage des branches** :
- `feature/` : Nouvelles fonctionnalités
- `fix/` : Corrections de bugs
- `docs/` : Documentation
- `refactor/` : Refactoring
- `test/` : Ajout de tests

### 2. Développer

- Écrire du code propre et commenté
- Suivre les standards de code
- Ajouter des tests si nécessaire
- Mettre à jour la documentation

### 3. Tester

```bash
# Lancer tous les tests
npm test

# Tests en mode watch
npm run test:watch

# Coverage
npm run test:coverage
```

### 4. Vérifier le Code

```bash
# Linter
npm run lint:check

# Formater
npm run format

# Vérifier que tout compile
npm run build
```

### 5. Commit

Voir la section [Commit Messages](#commit-messages) pour les conventions.

### 6. Push et Pull Request

```bash
# Push la branche
git push origin feature/ma-fonctionnalite
```

Ensuite, créer une Pull Request sur GitHub avec :
- Description claire de la modification
- Référence aux issues liées (si applicable)
- Captures d'écran (si UI modifiée)

---

## 🧪 Tests

### Écrire des Tests

Les tests doivent être dans des fichiers `.test.js` à côté du code source.

**Structure d'un test** :

```javascript
describe('NomDuModule', () => {
    beforeEach(() => {
        // Setup
    });

    describe('nomDeLaFonction', () => {
        it('devrait faire quelque chose', () => {
            // Arrange
            const input = 'test';
            
            // Act
            const result = fonction(input);
            
            // Assert
            expect(result).toBe('expected');
        });
    });
});
```

### Bonnes Pratiques

- Un test = une assertion principale
- Tests indépendants (pas de dépendances entre tests)
- Nommer les tests de manière descriptive
- Utiliser `beforeEach` pour le setup
- Mock les dépendances externes

### Coverage

Objectif : **80% de coverage minimum**

```bash
# Voir le coverage
npm run test:coverage
```

---

## 📚 Documentation

### JSDoc

Toutes les fonctions publiques doivent avoir des JSDoc :

```javascript
/**
 * Description de la fonction
 * @param {string} param1 - Description du paramètre
 * @param {number} [param2=0] - Paramètre optionnel avec valeur par défaut
 * @returns {Promise<Object>} Description de la valeur retournée
 * @throws {Error} Quand l'erreur se produit
 * @example
 * const result = await maFonction('test', 42);
 */
async function maFonction(param1, param2 = 0) {
    // ...
}
```

### Documentation API

Les endpoints API doivent être documentés dans `API_DOCUMENTATION.md`.

### README

Mettre à jour le `README.md` si :
- Nouvelle fonctionnalité majeure
- Changement dans l'installation
- Nouvelle dépendance importante

---

## 💬 Commit Messages

### Format

```
<type>(<scope>): <sujet>

<corps optionnel>

<footer optionnel>
```

### Types

- `feat` : Nouvelle fonctionnalité
- `fix` : Correction de bug
- `docs` : Documentation
- `style` : Formatage (pas de changement de code)
- `refactor` : Refactoring
- `test` : Ajout/modification de tests
- `chore` : Tâches de maintenance

### Exemples

```
feat(auth): ajouter vérification de session automatique

fix(api): corriger gestion des erreurs 404

docs(api): documenter endpoint /api/lots

refactor(logger): simplifier formatage des messages

test(api): ajouter tests pour api.get()
```

### Règles

- Sujet en minuscules
- Pas de point à la fin du sujet
- Utiliser l'impératif ("ajouter" pas "ajoute")
- Maximum 72 caractères pour le sujet

---

## 🎯 Modules Importants

### Modules à Documenter en Priorité

1. **api.js** : Module API centralisé
2. **Logger.js** : Système de logging
3. **ErrorHandler.js** : Gestion d'erreurs
4. **AuthManager.js** : Authentification
5. **ChatManager.js** : Gestion du chat

### Modules à Tester en Priorité

1. Modules de configuration (`config/`)
2. Modules d'authentification
3. Modules de gestion de données critiques

---

## 🐛 Signaler un Bug

### Avant de Signaler

1. Vérifier que le bug n'a pas déjà été signalé
2. Vérifier avec la dernière version
3. Essayer de reproduire le bug

### Template de Bug Report

```markdown
**Description**
Description claire du bug

**Reproduction**
1. Aller à '...'
2. Cliquer sur '...'
3. Voir l'erreur

**Comportement Attendu**
Ce qui devrait se passer

**Comportement Actuel**
Ce qui se passe réellement

**Environnement**
- OS: [ex: Linux]
- Node.js: [ex: 20.20.0]
- Version: [ex: 1.0.0]

**Logs**
Logs pertinents si disponibles
```

---

## ✨ Proposer une Fonctionnalité

### Avant de Proposer

1. Vérifier que la fonctionnalité n'existe pas déjà
2. Vérifier qu'elle n'a pas déjà été proposée
3. Vérifier qu'elle s'aligne avec les objectifs du projet

### Template de Feature Request

```markdown
**Problème**
Description du problème que cette fonctionnalité résout

**Solution Proposée**
Description de la solution

**Alternatives Considérées**
Autres solutions envisagées

**Contexte Additionnel**
Informations supplémentaires
```

---

## 📞 Contact

Pour toute question :
- Ouvrir une issue sur GitHub
- Contacter l'équipe de développement

---

## 🙏 Remerciements

Merci de contribuer au projet Workspace ! Votre aide est précieuse.

---

*Dernière mise à jour : 12 février 2026*
