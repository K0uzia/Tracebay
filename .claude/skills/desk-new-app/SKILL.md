---
name: desk-new-app
description: Cadre une nouvelle application de bureau ou une refonte - questions de cadrage, choix Electron ou Tauri, architecture (local, client/serveur, hybride), structure de dépôt, rôles à mobiliser, plan de livraison. À utiliser au démarrage d'un logiciel ou quand une demande touche plusieurs couches à la fois.
---

# Démarrer une application de bureau

## 1. Cadrage (ne rien coder avant)

| Question | Pourquoi |
|----------|----------|
| Qui l'utilise, sur quels OS et quelles machines (âge, RAM, droits admin) ? | choix de la pile, installeur, signature |
| Un poste ou plusieurs postes partageant les données ? | local, serveur, ou les deux (skill `desk-dual-mode`) |
| Fonctionne-t-elle hors ligne ? | stockage local, CSP, ressources embarquées |
| Quelles données, personnelles ou non, quel volume ? | SQLite, RGPD, sauvegarde |
| Matériel ou système à piloter (imprimante, lecteur code-barres, USB, fichiers) ? | API natives, permissions |
| Comment se fait la mise à jour (auto, manuelle, parc géré) ? | updater, signature, canal |
| Contraintes : délai, budget, accessibilité exigée ? | priorités P0 |

Décisions consignées dans le `CLAUDE.md` ou le README du projet ; elles ne changent plus sans accord.

## 2. Electron ou Tauri

| Critère | Electron | Tauri 2 |
|---------|----------|---------|
| Code existant en Node / bibliothèques npm natives | oui | à réécrire en Rust ou sidecar |
| Rendu identique sur tous les OS | oui (Chromium embarqué) | webview système (WebView2, WebKitGTK, WKWebView) : tester chaque OS |
| Taille / mémoire | ~100 Mo / ~200 Mo | ~10 Mo / ~60 Mo |
| Sécurité par défaut | à configurer (rule `desk-security`) | capacités restrictives par défaut |
| Compétences de l'équipe | JavaScript seul | JavaScript + Rust |
| Mobile (iOS/Android) | non | oui |

Défaut : on garde la pile existante. Migration Electron → Tauri seulement avec un gain mesuré et validé.

## 3. Structure de dépôt

Electron :
```
apps/desktop/
  main/            processus principal (index.js, ipc/, services/, db/)
  preload/         preload.js (contextBridge uniquement)
  renderer/        HTML, CSS, JS de l'interface
  build/           icônes, entitlements, scripts d'installeur
  package.json
```

Tauri :
```
src/               interface (HTML/CSS/JS)
src-tauri/
  src/             main.rs, commands/, db/
  capabilities/
  tauri.conf.json
  Cargo.toml
```

Logique métier pure dans un dossier sans dépendance à Electron/Tauri, testée séparément.

## 4. Rôles à mobiliser

| Rôle | Responsabilité | Skills |
|------|----------------|--------|
| Chef de projet | périmètre, priorités, recette | `desk-audit`, `desk-release` |
| UX / contenu | parcours, états vides, messages | `desk-ui-states` |
| Designer d'interface | tokens, composants, thème | `desk-design-system` |
| Développeur | main, preload, renderer, données | `desk-ipc`, `desk-local-data`, `desk-dual-mode` |
| Sécurité | fenêtres, IPC, secrets, signature | `desk-security`, `desk-repo-hygiene` |
| Qualité | tests unitaires et de bout en bout | `desk-testing`, `desk-a11y-audit` |
| Conformité | RGPD, licences | `desk-legal-fr` |

## 5. Ordre de livraison

1. Cadrage validé, choix de pile consigné.
2. Squelette sécurisé : fenêtre, preload, CSP, IPC de démonstration testé (skill `desk-security`).
3. Données : schéma, migrations, sauvegarde (skill `desk-local-data`).
4. Tokens et composants de base, puis vues avec données réelles.
5. Packaging et mise à jour sur chaque OS dès les premières semaines (pas en fin de projet).
6. Recette complète (skill `desk-audit`), release (skill `desk-release`).
