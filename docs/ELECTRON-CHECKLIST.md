# Checklist Electron – revue de code

À utiliser à chaque évolution sensible du client Electron (nouveaux IPC, chemins, rendu HTML, build, etc.).

## 1. IPC (Inter-Process Communication)

- [ ] **Nouveaux canaux** : tout nouveau `ipcMain.handle` / `ipcMain.on` est documenté et listé dans le preload avec une API minimale (pas d’exposition générique de Node).
- [ ] **Preload** : le preload n’expose que les canaux nécessaires ; pas de `contextBridge.exposeInMainWorld` avec des fonctions trop larges (ex. `require`, `process`).
- [ ] **Validation des arguments** : les handlers IPC valident types et contenu des payloads (chemins, URLs, commandes) avant toute opération.
- [ ] **Erreurs** : les handlers renvoient des erreurs structurées (ex. `{ success: false, error: '...' }`) plutôt que de faire crasher le main.

## 2. Chemins et système de fichiers

- [ ] **Restriction des chemins** : toute lecture/écriture de fichier ou dossier utilise les helpers de restriction (ex. `isPathAllowed`, `getAllowedPathPrefixes`) pour limiter aux répertoires autorisés (home, userData, documents, temp, traçabilité, commandes).
- [ ] **Pas de chemins utilisateur bruts** : ne pas utiliser directement un chemin fourni par le renderer sans `path.resolve` et vérification.
- [ ] **list-folders / open-path / read-file-as-base64** : s’assurer que les nouveaux usages restent dans le périmètre autorisé.

## 3. Rendu et injection (XSS)

- [ ] **innerHTML** : pas d’assignation `element.innerHTML = ...` avec des données utilisateur ou serveur sans sanitization (ou préférer `textContent` / attributs sécurisés).
- [ ] **eval / new Function** : pas d’évaluation de chaînes provenant du réseau ou de l’utilisateur.
- [ ] **URLs** : les liens ou iframes ouverts (y compris via IPC) vérifient le schéma (http/https/mailto ou whitelist explicite).

## 4. Lancement d’applications et commandes

- [ ] **launch-app** : utilisation de la whitelist et de `execFile` (pas de shell) ; pas de nouvelle porte dérobée (ex. `exec(cmd)` avec une chaîne utilisateur).
- [ ] **Autres exécutions** : toute exécution de commande (scripts, outils système) utilise des paramètres contrôlés (pas de concaténation naïve avec des entrées utilisateur).

## 5. Configuration et secrets

- [ ] **Secrets** : pas de clés API, mots de passe ou tokens en dur dans le code (utiliser variables d’environnement ou fichier de config utilisateur, ex. `workspace-config.json` dans userData).
- [ ] **Fichiers de config** : les configs sensibles ne sont pas versionnées (ou sont des exemples sans secrets).

## 6. Build et distribution

- [ ] **CSP** : Content-Security-Policy définie et restreinte (pas de `unsafe-inline` / `unsafe-eval` si évitable).
- [ ] **nodeIntegration** : désactivée dans les BrowserWindow du renderer ; accès au Node uniquement via preload + IPC.
- [ ] **Mises à jour** : le flux de mise à jour (electron-updater) utilise des URLs et paramètres contrôlés ; pas de téléchargement d’exécutables depuis des sources non maîtrisées.

## 7. Revue ciblée rapide

Lors d’un PR ou d’un merge touchant :

- **main.js** ou **preload.js** → revoir la section IPC + chemins de cette checklist.
- **Rendu HTML/JS côté client** → revoir la section Rendu et injection.
- **Nouvelle dépendance ou script externe** → vérifier intégrité et surface d’attaque.

---

*Document de référence pour l’audit application (Priorité 3, point 10). Dernière mise à jour : mars 2025.*
