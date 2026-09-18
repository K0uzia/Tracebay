# Workspace — Fonctionnement de l'application

Documentation fonctionnelle du client Electron **Workspace** : architecture, pages, module Réception et flux métier.

Le code est publié sous [Workspace Source-Available License](LICENSE) (usage interne autorisé, revente soumise à accord).

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture générale](#2-architecture-générale)
3. [Coque globale](#3-coque-globale)
4. [Pages principales](#4-pages-principales)
5. [Module Réception — architecture](#5-module-réception--architecture)
6. [Flux complet : Lot PC](#6-flux-complet--lot-pc)
7. [Flux : Disques](#7-flux--disques)
8. [Flux : Commande](#8-flux--commande)
9. [Flux : Dons](#9-flux--dons)
10. [Flux : Prêts matériel](#10-flux--prêts-matériel)
11. [Inventaire](#11-inventaire)
12. [Historique](#12-historique)
13. [Traçabilité (fusionnée dans Historique)](#13-traçabilité-fusionnée-dans-historique)
14. [Comparaison des flux](#14-comparaison-des-flux)
15. [Dépendances poste / serveur](#15-dépendances-poste--serveur)
16. [Pages retirées ou non implémentées](#16-pages-retirées-ou-non-implémentées)

---

## 1. Vue d'ensemble

**Workspace** est une application de bureau (Electron) pour un atelier / une structure. L’UI actuelle a **deux espaces** :

- Un **agenda** partagé
- Un module métier de **réception et traçabilité matériel** (lots, disques, commandes, dons, prêts)

La plupart des données transitent par un **serveur backend** (PostgreSQL, JWT, API REST). Certaines actions (génération PDF, détection de disques `lsblk`, ouverture de fichiers) s’appuient sur le **poste local** via Electron.

Il n’y a plus de portail Accueil / Dossier / Applications / Raccourcis / Chat dans la navigation.

### Objectifs du projet

- **Structurer la réception** du matériel (saisie, inventaire, historique, PDF)
- **Partager un agenda** synchronisé avec le serveur

---

## 2. Architecture générale

### Fonctionnement SPA

L'application fonctionne comme une **application web à page unique** :

- Une coque fixe : en-tête, pied de page (selon la page), zone centrale `#content`
- Chaque page est chargée dynamiquement dans la zone centrale
- La **dernière page visitée** est mémorisée localement et restaurée au redémarrage

### Composants techniques

| Composant | Rôle |
|-----------|------|
| **Client Electron** | UI, navigation, appels HTTP + JWT, PDF via IPC, mises à jour auto |
| **Serveur backend** | Persistance (PostgreSQL), JWT, routes métier, génération / stockage PDF |
| **Partage réseau** | Dossier traçabilité configuré côté client (PDF lots, disques, commandes, dons, prêts) |

### Schéma logique

```
┌─────────────────────────────────────┐
│     Client Electron (poste)         │
│  Renderer (HTML/JS) ──► API module  │
│  main.js / preload.js (IPC)         │
└──────────────┬──────────────────────┘
               │ HTTP (JSON) + WebSocket
┌──────────────▼──────────────────────┐
│     Serveur backend                 │
│  API REST + JWT + WebSocket + BDD   │
└─────────────────────────────────────┘
```

### Arborescence indicative (client)

```
workspace/
├── apps/client/              # Application Electron
│   ├── main.js, preload.js
│   ├── config/connection.json
│   └── public/               # Interface (renderer)
│       ├── index.html, app.js
│       ├── pages/            # Pages HTML
│       ├── reception-pages/  # Sous-pages Réception
│       ├── components/       # header, footer, modales
│       └── assets/js/modules/
├── proxmox/app/              # Backend (branche proxmox)
└── docs/                     # Documentation technique
```

---

## 3. Coque globale

### Navigation principale

Barre en haut avec :

| Bouton | Page |
|--------|------|
| Logo / Workspace | Agenda |
| Agenda | Calendrier |
| Reception | Module métier (défaut : Lots) |
| Thème | Clair / sombre |
| Paramètres | Mises à jour uniquement |

Sur mobile, un **menu burger** remplace la barre horizontale.

### Layout par page

| Page / zone | Header | Footer |
|-------------|--------|--------|
| Agenda | Oui | Oui |
| Réception (toutes sous-pages) | Oui | **Non** |

Le module Réception possède **sa propre sidebar interne** en plus du header global. **Pas de widget chat** dans l’UI actuelle.

### Authentification

Pas d’écran ni de modale de connexion dans l’UI actuelle. Un **JWT** peut encore être lu en `localStorage` et envoyé aux API (`/api/auth/verify`). Les routes réception restent authentifiées côté serveur.

### Paramètres

Modale **uniquement dédiée aux mises à jour** Electron : vérifier, télécharger et préparer, redémarrer pour appliquer. Un point orange sur l’icône Paramètres signale une version disponible.

### Pied de page

Affiché sur **Agenda** :

- Version de l'application + lien GitHub
- **IP locale**, **RAM**, **état du serveur**, **état réseau**
- Clic sur l'IP → copie dans le presse-papiers

### Éléments transverses

- **Notifications toast** : succès, erreur, info
- **Thème** clair / sombre : toggle dans le header (sombre par défaut)

---

## 4. Pages principales

La page d’entrée est **Agenda**. Accueil et Dossier existent encore en fichiers HTML mais sont **redirigés** et absents de la navigation.

### 4.2 Agenda

Calendrier complet partagé avec le serveur.

**Vues** : semaine, mois, année, avec navigation temporelle.

**Événements** — Création, modification, suppression via modales :

- Titre, dates début/fin
- Option « toute la journée »
- Description / lieu
- Couleur

Les **jours fériés** (métropole) sont affichés en lecture seule.

**Comportement** :

- Clic sur un créneau ou événement → panneau de détail
- En environnement sans serveur : pas d’agenda métier (le client Electron cible le backend Proxmox)

---

## 5. Module Réception — architecture

### Deux familles de pages

**Lots & documents** (saisie et production) :

| Page | Rôle |
|------|------|
| **Lots** | Entrée de PC / matériel |
| **Disques** | Sessions de destruction / effacement |
| **Commande** | Bons de commande internes |
| **Dons** | Certificats de don (stagiaires AFPA) |
| **Prêts matériel** | Fiches de prêt ou location |

**Suivi** (consultation et finalisation) :

| Page | Rôle |
|------|------|
| **Inventaire** | Lots PC **en cours de traitement** |
| **Historique** | Archives **et** vue documentaire (PDF) : lots, disques, commandes, dons, prêts |

### Arborescence documentaire sur le partage réseau

Tous les PDF sont rangés sous `/mnt/team/#TEAM/` :

| Type | Dossier | Nom de fichier typique |
|------|---------|------------------------|
| Lots PC | `#TRAÇABILITÉ/AAAA/Mois/` | `NomLot_YYYY-MM-DD.pdf` |
| Disques | `#TRAÇABILITÉ/Disques/AAAA/Mois/` | `NomSession_YYYY-MM-DD.pdf` |
| Commandes | `#COMMANDES/Catégorie/` | `NomCommande_YYYY-MM-DD.pdf` |
| Dons | `#TRAÇABILITÉ/don_stagiaires/AAAA/Mois/` | `NomLot_YYYY-MM-DD.pdf` |
| Prêts | `#TRAÇABILITÉ/prets_materiel/AAAA/Mois/` | `RéférenceOuEmprunteur_YYYY-MM-DD.pdf` |

La génération PDF locale **nécessite Electron**. En navigateur seul, la saisie peut fonctionner mais pas la création de fichiers sur le partage.

### Schéma des flux

```
Lots (saisie) ──► Inventaire ──► Historique
Disques ──────────────────────► Historique
Commande ─────────────────────► Historique
Dons ─────────────────────────► Historique
Prêts ────────────────────────► Historique
```

Les **lots PC** sont le seul flux avec une **étape intermédiaire obligatoire** (Inventaire).

---

## 6. Flux complet : Lot PC

Parcours : **Entrer → Inventaire → Historique**.

### Étape 1 — Lots (saisie à la réception)

**Objectif** : enregistrer l'arrivée physique de matériel dans un lot.

**Préparation** : chargement du référentiel marques/modèles ; première ligne vide avec focus sur le S/N (douchette).

**Saisie par ligne** :

- Numéro de série (obligatoire, doublons refusés)
- Type : portable, fixe, écran, ou « autres »
- Marque et modèle (listes serveur)
- Date et heure d'entrée (auto, modifiables)
- Mode : SCAN ou MANUEL

**Modes d'ajout** :

- Scan S/N + Entrée → nouvelle ligne
- Scan code-barres global → ligne pré-remplie
- Bouton « Ajout manuel »
- Actions de masse : type / marque / modèle sur lignes sélectionnées

**Référentiel** : création marque ou modèle à la volée si absent du catalogue.

**Enregistrement** :

1. Validation de tous les champs
2. Création du lot sur le serveur (`POST /api/lots`)
3. Tentative de PDF initial côté serveur (document d'entrée, sans états de reconditionnement)
4. Redirection automatique vers **Inventaire**

**État initial** : statut `active`, items sans état ni technicien. Visible uniquement dans Inventaire.

---

### Étape 2 — Inventaire (traitement technicien)

**Objectif** : suivre chaque PC jusqu'à clôture du lot.

**Affichage** : lots `active` uniquement, cartes repliables avec compteurs (à faire, reconditionnés, HS) et barre de progression.

**Édition d'un PC** (modale) :

| Champ | Détail |
|-------|--------|
| **État** | Reconditionnés, Pour pièces, HS, Autres (libre) |
| **Technicien** | Texte libre, obligatoire |
| **OS** | Linux (défaut), Windows, Chrome OS, Apple, Android, BSD |

Un PC est **complet** si état ET technicien sont renseignés.

**Finalisation automatique** (dernier PC complet) :

1. Lot → statut `finished` + date de fin
2. Génération PDF final via Electron (états, techniciens, OS inclus)
3. Fichier : `#TRAÇABILITÉ/AAAA/Mois/NomLot_date.pdf`
4. PDF envoyé au serveur (copie de secours)
5. Lot disparaît de l'Inventaire

---

### Étape 3 — Historique (lots terminés)

**Actions** :

| Action | Détail |
|--------|--------|
| Voir détails | Tous les PC : S/N, états, techniciens, OS |
| Modifier nom du lot | Correction du libellé |
| Modifier matériel | État, technicien, OS, type, marque, modèle par PC |
| Récupérer | Marquage `recovered_at` (récupération physique) |

**Badges** : « À récupérer » / « Récupéré le … ». Le bouton Récupérer est désactivé si le lot n'est pas entièrement traité.

---

### Étape 4 — PDF et archives (depuis Historique)

Les actions documentaires (emplacement, voir, télécharger, e-mail, régénérer) se font dans **Historique**, plus depuis une page Traçabilité séparée.

| Action | Description |
|--------|-------------|
| Ouvrir l'emplacement PDF | Dossier réseau dans l'explorateur |
| Voir le PDF | Application système |
| Télécharger | Local ou serveur |
| Envoyer par e-mail | Destinataire + message → PDF en pièce jointe |
| Régénérer | Recrée le PDF (fichier perdu ou bug) |

### Cycle de vie d'un lot PC

| Phase | Statut | Visible dans | PDF |
|-------|--------|--------------|-----|
| Saisie | — | Lots | Tentative initiale (entrée) |
| En cours | `active` | Inventaire | — |
| Clôturé | `finished` | Historique | PDF final complet |
| Récupéré | `finished` + `recovered_at` | Historique | Inchangé |

---

## 7. Flux : Disques

**Objectif** : documenter une session d'effacement ou destruction physique de disques.

### Saisie (page Disques)

**Par disque** :

- S/N, type HDD/SSD, marque, modèle, taille, interface
- Destruction physique (case à cocher)
- Méthode d'effacement (auto) : SSD → « Secure E. + Sanitize », HDD → « DoD », destruction → « Destruction physique »

**Modes d'ajout** :

- Saisie / scan manuel
- **Détection automatique** (Electron/Linux) : `lsblk` → modale de sélection → pré-remplissage

**Enregistrement** :

1. Validation (S/N uniques)
2. Création session serveur (`POST /api/disques/sessions`)
3. PDF local → `#TRAÇABILITÉ/Disques/AAAA/Mois/NomSession_date.pdf`
4. PDF envoyé au serveur
5. Formulaire vidé

**Pas d'étape Inventaire** : visible immédiatement en Historique.

### Historique

- Voir détail, modifier nom de session, modifier lignes disques
- **Récupérer** : marquage administratif (`recovered_at`), sans régénération PDF

### Historique / PDF

- Filtre année + type « disques »
- Actions : emplacement PDF, voir, télécharger, **e-mail**, régénérer

---

## 8. Flux : Commande

**Objectif** : bon de commande interne (liste de produits à acheter).

### Saisie

- **En-tête** : nom de commande, catégorie (référentiel serveur, extensible)
- **Lignes** : produit, quantité, prix, frais de port, lien URL

### Enregistrement

1. Validation (nom + catégorie)
2. PDF local → `#COMMANDES/Catégorie/NomCommande_date.pdf`
3. Enregistrement serveur (`POST /api/commandes`)
4. Formulaire réinitialisé

### Historique

- Voir détail, modifier nom/catégorie, modifier lignes produits
- Pas de bouton Récupérer

### Historique / PDF

- Voir / télécharger / régénérer PDF — pas d'e-mail

---

## 9. Flux : Dons

**Objectif** : certificat de don de matériel à des stagiaires AFPA.

### Saisie

- Nom de lot optionnel
- Lignes : type, marque, modèle, S/N, date, **nom du stagiaire**

### Enregistrement

1. Validation
2. PDF → `#TRAÇABILITÉ/don_stagiaires/AAAA/Mois/NomLot_date.pdf`
3. Enregistrement serveur (`POST /api/dons`)

### Historique

- Voir détail, modifier nom du lot, modifier lignes matériel

### Historique / PDF

- Voir / télécharger / régénérer — pas d'e-mail

---

## 10. Flux : Prêts matériel

**Objectif** : fiche de prêt ou location de matériel.

### Saisie

**Métadonnées** :

- Nom de lot optionnel, référence, type emprunteur (personne/société)
- Nom, contact, dates début/fin (défaut : aujourd'hui → +1 mois)
- Gratuit ou payant (+ montant)

**Lignes** : type (PC, écran, clavier, souris, autres), marque, modèle, S/N (PC uniquement), quantité

### Enregistrement

1. Validation (emprunteur, dates, montant si payant)
2. PDF → `#TRAÇABILITÉ/prets_materiel/AAAA/Mois/RéférenceOuEmprunteur_date.pdf`
3. Enregistrement serveur (`POST /api/prets-materiel`)

### Historique

- **Consultation seule** (pas d'édition ni récupération)

### Historique / PDF

- Voir / télécharger / régénérer — pas d'e-mail

---

## 11. Inventaire

L'inventaire est **exclusivement réservé aux lots PC actifs**.

### Règles métier

| Règle | Comportement |
|-------|--------------|
| Périmètre | Lots `active` uniquement |
| PC incomplet | État vide OU technicien vide → « à faire » |
| PC complet | État + technicien renseignés |
| Lot terminé | 100 % des PC complets → clôture automatique |
| Sortie | Disparaît de l'inventaire → Historique |

### Indicateurs par lot

- **À faire** : PC sans état ou sans technicien
- **Reconditionnés** / **HS** : comptage par état
- **Barre de progression** : (total − à faire) / total

### États possibles par PC

Reconditionnés, Pour pièces, HS, Autres (libre), Non défini (vide).

### Parcours utilisateur type

1. Ouvrir un lot déplié
2. Filtrer par état si besoin
3. Cliquer sur un PC → modale → état, technicien, OS → sauvegarder
4. Répéter jusqu'à 100 %
5. Notification de clôture + PDF automatique

---

## 12. Historique

**Principe** : une seule page fusionnant **tous les types**, triés par date décroissante.

### Filtres

- Recherche textuelle
- Filtre par type : lots, disques, commandes, dons, prêts

### Capacités par type

| Type | Consultation | Édition | Récupération |
|------|-------------|---------|--------------|
| **Lot PC** | Détail complet | Nom ; matériel par PC | Oui (`recovered_at`) |
| **Session disques** | Liste disques + shred | Nom ; lignes disques | Oui (administratif) |
| **Commande** | Lignes produits, prix | Nom, catégorie, lignes | Non |
| **Don** | Matériel + stagiaire | Nom lot, lignes | Non |
| **Prêt** | Métadonnées + lignes | Consultation seule | Non |

La récupération (lots et disques) est un **marquage administratif** : ne modifie pas le PDF existant.

---

## 13. Traçabilité (fusionnée dans Historique)

La page **Traçabilité** n’est plus dans la navigation : `tracabilite` redirige vers **Historique**. Les actions PDF (ouvrir le dossier, voir, télécharger, e-mail, régénérer) se font depuis Historique.

**Principe** : en plus de la liste opérationnelle, Historique conserve une vue **documentaire** (année, type, PDF).

### Chargement

En parallèle : lots terminés, sessions disques, commandes, dons, prêts. Bandeau d'avertissement si une API est indisponible.

### Filtres

- **Année** : 10 ans en arrière, année courante par défaut
- **Type** : tout, lots, disques, commandes, dons, prêts

### Matrice des actions PDF

| Action | Lots | Disques | Commandes | Dons | Prêts |
|--------|:----:|:-------:|:---------:|:----:|:-----:|
| Ouvrir le dossier | ✓ | ✓ | ✓ | ✓ | ✓ |
| Voir le PDF | ✓ | ✓ | ✓ | ✓ | ✓ |
| Télécharger | ✓ | ✓ | ✓ | ✓ | ✓ |
| Envoyer par e-mail | ✓ | ✓ | — | — | — |
| Régénérer (Electron) | ✓ | ✓ | ✓ | ✓ | ✓ |

### Envoi par e-mail (lots et disques)

Modale : destinataire + message optionnel → PDF en pièce jointe via le serveur.

### Régénération

Utile si fichier supprimé, déplacé ou corrompu : relit les données en base, recrée le PDF localement, met à jour le serveur.

---

## 14. Comparaison des flux

| Flux | Étape intermédiaire | PDF à l'enregistrement | PDF final | E-mail | Récupération |
|------|--------------------|-----------------------|-----------|--------|--------------|
| **Lot PC** | Inventaire obligatoire | Tentative (entrée) | À la clôture inventaire | Oui | Oui |
| **Disques** | Aucune | Oui (complet) | = même PDF | Oui | Oui |
| **Commande** | Aucune | Oui (complet) | = même PDF | Non | Non |
| **Don** | Aucune | Oui (complet) | = même PDF | Non | Non |
| **Prêt** | Aucune | Oui (complet) | = même PDF | Non | Non |

### Parcours utilisateur type (journée de réception)

1. **Matin** : arrivée de portables → **Lots** → scan S/N → enregistrement → **Inventaire**
2. **Journée** : techniciens traitent PC par PC dans **Inventaire**
3. **Fin de lot** : clôture auto → PDF final → **Historique**
4. **Parallèle** : destruction disques → **Disques** → détection ou saisie → PDF immédiat
5. **Achats** : **Commande** → lignes produits → PDF dans `#COMMANDES`
6. **Don stagiaire** : **Dons** → certificat PDF
7. **Prêt** : **Prêts** → fiche emprunteur → PDF
8. **Archivage** : **Historique** → filtre année / type → PDF, e-mail
9. **Correction** : **Historique** → modifier une ligne ou marquer « Récupéré »

---

## 15. Dépendances poste / serveur

| Besoin | Electron (poste) | Serveur |
|--------|------------------|---------|
| Navigation, affichage pages | Oui | Config + données métier |
| Ouverture dossiers / PDF locaux | Oui | — |
| Détection disques (`lsblk`) | Oui (Linux) | — |
| Génération PDF réception | Oui (templates locaux) | Parfois complément serveur |
| Auth, lots, inventaire, historique | — | Oui |
| Chat WebSocket | — | Config encore présente, **pas d’UI** |
| Agenda (prod) | — | Oui |
| Mises à jour auto | Oui | GitHub Releases |
| Référentiels marques/modèles | — | Oui |
| Envoi e-mails traçabilité | — | Oui |

En **navigateur web** (sans Electron), l'interface s'affiche mais les fonctions liées au système de fichiers, à la détection disques et à la génération PDF locale sont limitées ou indisponibles.

---

## 16. Pages retirées ou non implémentées

| Élément | Statut |
|---------|--------|
| **Accueil** | Retiré de la nav ; redirect → Agenda |
| **Dossier** | Retiré de la nav ; redirect → Agenda |
| **Traçabilité** (page séparée) | Redirect → Historique |
| **Chat** | Absent de `index.html` / du header |
| **Mes raccourcis** | Retiré de la navigation |
| **Application** (lanceurs logiciels) | Retiré de la navigation |
| **Options** | Pas de page HTML → non accessible |
| **Sortie** | Mentionné dans le routeur, pas de page → non accessible |
| **Login / Signup** | Pages et modale non branchées ; JWT silencieux seulement |

---

## Références

- [README.md](./README.md) — Vue d'ensemble du projet et déploiement
- [docs/API.md](./docs/API.md) — Contrat API backend
- [docs/DATABASE.md](./docs/DATABASE.md) — Schéma base de données
- [proxmox/app/README.md](./proxmox/app/README.md) — Backend Fastify + TypeScript
