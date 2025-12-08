#!/bin/bash
# Scripts Reference - Guide des scripts utilitaires

# 📍 Localisation: /scripts directory

## 1. setup-env.sh
# ================
# Fonction: Configuration sécurisée du GitHub Token
# Usage: ./scripts/setup-env.sh  ou  make setup-env
#
# Processus:
#   1. Vérifie l'existence d'un .env existant
#   2. Demande le token GitHub (saisie masquée)
#   3. Valide le format du token (ghp_ prefix)
#   4. Crée le fichier .env avec chmod 600
#   5. Affiche les instructions de révocation
#
# Input: 
#   - Token GitHub (42+ caractères, commence par ghp_)
#
# Output:
#   - .env file (600 permissions)
#
# Sécurité:
#   ✅ Saisie masquée (read -s)
#   ✅ Validation de format
#   ✅ Permissions restrictives (600)
#   ✅ Jamais affiché en plaintext
#   ✅ Affiche lien revocation si nécessaire
#
# Dépendances: bash 4+, read builtin, chmod

echo "setup-env.sh - Configuration du token GitHub"

## 2. build-publish.sh
# ====================
# Fonction: Build et préparation pour publication GitHub
# Usage: ./scripts/build-publish.sh  ou  make build-publish
#
# Processus:
#   1. Charge les variables depuis .env si existe
#   2. Valide la présence de GITHUB_TOKEN
#   3. Vérifie l'installation des dépendances (npm install si absent)
#   4. Exécute npm run build
#   5. Affiche les artifacts générés
#   6. Propose les commandes suivantes
#
# Input:
#   - .env file avec GITHUB_TOKEN (optionnel, demande sinon)
#
# Output:
#   - dist/ ou out/ directory avec les artifacts
#   - Liste des fichiers générés (AppImage, exe, dmg)
#   - Instructions pour publication
#
# Erreurs gérées:
#   ❌ Token non défini → Instructions d'installation
#   ❌ npm install échoue → Arrête le processus
#   ❌ Build échoue → Arrête avec status d'erreur
#
# Dépendances: bash, npm, electron-builder

echo "build-publish.sh - Build et préparation publication"

## 3. Workflow Makefile
# ======================
# Les commandes Makefile simplifieront l'exécution:
#
# make setup-env          → ./scripts/setup-env.sh
# make build              → npm run build (direct)
# make build-publish      → ./scripts/build-publish.sh
# make publish-github     → build-publish + electron-builder --publish
#
# Dépendances inter-commandes:
#   publish-github
#       └─→ build-publish.sh
#           └─→ npm run build
#
# Environment variables:
#   GITHUB_TOKEN         Source: .env (setup-env.sh)
#   NODE_ENV            Optionnel
#   DEBUG               Optionnel

echo "Workflow Makefile intégré"

## 4. Environment Configuration
# =============================
# .env.example
#   ├─ Template de configuration
#   ├─ GITHUB_TOKEN=ghp_...
#   ├─ Commentaires informatifs
#   └─ Variables optionnelles documentées
#
# .env (généré par setup-env.sh, JAMAIS commiter)
#   ├─ Permissions: 600
#   ├─ Contient le vrai token
#   ├─ Chargé automatiquement par build-publish.sh
#   └─ Chargé par setup-local.sh si existe
#
# .gitignore (DOIT contenir)
#   .env
#   .env.local
#   *.key
#   *.pem
#   node_modules/

echo ".env configuration structure"

## 5. Commandes Complètes
# =======================
# Setup initial:
#   make init           → setup-local.sh init
#   make deps           → setup-local.sh deps
#   make setup-env      → scripts/setup-env.sh (charger token)
#
# Développement:
#   make dev            → Electron + serveur
#   make server         → Serveur Node seul
#
# Build & Publication:
#   make build          → npm run build
#   make build-publish  → scripts/build-publish.sh
#   make publish-github → Build + GitHub Releases
#
# Maintenance:
#   make check-updates  → npm outdated
#   make update-deps    → Mise à jour interactive
#   make audit          → Audit sécurité npm
#
# Database:
#   make db.init        → Initialiser BD
#   make db.reset       → Réinitialiser BD
#   make db.shell       → Shell SQLite3
#   make db.backup      → Sauvegarde

echo "Commandes makefile - Voir make help pour l'aide"

## 6. Flux Publication Complet
# ============================
# Étape 1: Configuration (une seule fois)
#   $ make setup-env
#   Enters GitHub token...
#   → Crée .env avec GITHUB_TOKEN
#
# Étape 2: Development & Testing
#   $ make dev
#   → Lance Electron en développement
#
# Étape 3: Build & Préparation
#   $ make build-publish
#   → Vérifie token
#   → Installe dépendances
#   → Build app
#   → Affiche artifacts
#
# Étape 4: Publication GitHub
#   $ make publish-github
#   → Exécute build-publish
#   → Publie sur GitHub Releases
#   → Artifacts disponibles pour download
#
# Après publication:
#   → Vérifier: https://github.com/SandersonnDev/workspace/releases
#   → Créer release notes
#   → Annoncer la release

echo "Flux publication documenté"

## 7. Troubleshooting
# ===================
# Problème: Token non reconnu
#   Solution: make setup-env
#
# Problème: Build échoue
#   Solution: npm install && make build
#
# Problème: Publication échoue
#   Solutions:
#   - Vérifier token: echo $GITHUB_TOKEN
#   - Vérifier permissions repo
#   - Vérifier réseau/connexion GitHub
#   - Voir logs de electron-builder
#
# Problème: Token compromis
#   Solution:
#   1. https://github.com/settings/tokens → Revoke
#   2. Créer nouveau token
#   3. make setup-env → Nouveau token
#   4. Rebuild & republish

echo "Troubleshooting guide disponible"

echo ""
echo "✅ Tous les scripts sont en place!"
echo "Voir: docs/setup/GITHUB_RELEASES.md pour guide complet"
