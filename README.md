# Workspace v3

Application de bureau (Electron) conçue pour centraliser et gérer les activités quotidiennes d'une structure. Elle s'appuie sur un serveur backend déployé séparément (sur Proxmox) auquel elle se connecte via HTTP REST et WebSocket.

---

## Ce que fait l'application

Workspace est une interface unifiée qui regroupe plusieurs modules fonctionnels accessibles depuis un seul client :

### Accueil
Page principale affichant un tableau de bord avec l'heure et la date en temps réel, ainsi qu'un aperçu des informations importantes de la structure (La Capsule).

### Agenda
Calendrier interactif permettant de consulter et gérer les événements. Les vues semaine, mois et année sont disponibles. Les événements sont créés, modifiés et supprimés directement depuis l'interface.

### Réception
Module dédié à la gestion du matériel reconditionné, composé de quatre sous-sections :
- **Entrée** : saisie des nouveaux lots de machines (numéros de série, marques, modèles)
- **Inventaire** : état des stocks en cours, filtrage par état, assignation des techniciens
- **Historique** : suivi de l'ensemble des mouvements de matériel
- **Traçabilité** : lien entre les machines et leur historique de reconditionnement

### Dossier interne
Gestionnaire de fichiers donnant accès aux documents internes de la structure, organisés par entité.

### Applications
Raccourcis vers les applications internes regroupées par catégorie (Développement, Streaming, Bureautique, etc.), gérées dynamiquement depuis le serveur.

### Raccourcis
Accès rapide aux liens et outils fréquemment utilisés.

### Options
Paramètres de l'application : configuration de la connexion au serveur, préférences d'affichage et gestion du compte utilisateur.

---

## Architecture

L'application suit une architecture client/serveur distincte :

- Le **client Electron** tourne localement sur la machine de l'utilisateur. Il gère l'interface, les interactions utilisateur et toutes les communications avec le serveur via un module API centralisé (`api.js`).
- Le **serveur backend** est déployé sur une machine Proxmox (192.168.1.62:4000). Il expose une API REST et un canal WebSocket pour les mises à jour en temps réel.

La configuration de connexion (URL du serveur, endpoints) est centralisée dans un unique fichier `connection.json`, ce qui permet de basculer facilement entre les environnements local, Proxmox et production.

L'authentification est gérée par JWT : chaque client s'authentifie et toutes les requêtes sont automatiquement signées par le module API.

```
┌─────────────────────────┐        HTTP / WebSocket        ┌──────────────────────────┐
│   Client Electron       │  ◄────────────────────────►    │   Serveur Backend        │
│   (machine locale)      │                                 │   (Proxmox :4000)        │
│                         │                                 │                          │
│   Interface utilisateur │                                 │   API REST + WebSocket   │
│   Module API centralisé │                                 │   Authentification JWT   │
└─────────────────────────┘                                 └──────────────────────────┘
```

---

## Structure du projet

```
workspace/
├── apps/
│   └── client/                   Application Electron
│       ├── public/
│       │   ├── pages/            Pages HTML de chaque section
│       │   ├── components/       Composants réutilisables (header, footer, modales)
│       │   ├── assets/
│       │   │   └── js/
│       │   │       ├── config/
│       │   │       │   └── api.js        Module API centralisé
│       │   │       └── modules/          Modules fonctionnels (agenda, chat, reception…)
│       │   └── index.html        Point d'entrée de l'interface
│       ├── config/
│       │   └── connection.json   Configuration serveur et endpoints
│       ├── main.js               Point d'entrée Electron
│       └── preload.js            Bridge sécurisé Electron/renderer
│
├── data/                         Données locales
├── docs/                         Documentation complémentaire
├── Jarvis/                       Standards et patterns du projet
└── package.json                  Monorepo npm workspaces
```

---

## Déploiement et mises à jour

Le client est distribué sous forme d'exécutable (AppImage sur Linux, installeur sur Windows/Mac). Les mises à jour sont gérées automatiquement par `electron-updater` : l'application détecte si une version plus récente est disponible sur les Releases GitHub et propose la mise à jour à l'utilisateur sans intervention manuelle.

**Build en local** (depuis `apps/client`) : `npm run build:linux` (ou `build:prod:linux:local` pour un build prod sans publication). Aucun token nécessaire.  
**Publication (Release GitHub)** : effectuée uniquement par la CI (`.github/workflows/build-client.yml`) au push sur `main` ; le token est fourni par le secret du dépôt (`GH_TOKEN` ou `GITHUB_TOKEN`), jamais en clair dans les fichiers.

---

## Sécurité

- **Content Security Policy (CSP)** configurée dans Electron pour limiter les ressources autorisées
- **Authentification JWT** : chaque session est authentifiée, les tokens sont gérés automatiquement par le module API
- **Preload Electron** : isolation stricte entre le processus principal et le renderer via contextBridge

---