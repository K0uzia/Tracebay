---
name: desk-dual-mode
description: Fait tourner une application de bureau client/serveur sans serveur (mode local, poste unique) ou en deux modes - couche d'accès aux données interchangeable, portage du backend dans le processus principal, auth locale, fonctions réservées au serveur, import/export entre modes, tests croisés. À utiliser pour une version autonome, un mode hors ligne, ou pour retirer la dépendance à une API.
---

# Mode serveur / mode local

## 1. Principe

Le renderer ne connaît qu'une interface de données (`api.lots.list()`). Deux implémentations :

| Mode | Implémentation | Transport |
|------|----------------|-----------|
| Serveur | client HTTP/WebSocket vers l'API | `fetch` depuis `main` ou le renderer selon l'existant |
| Local | services métier + SQLite dans `main` | IPC (`ipcMain.handle`) |

```
renderer ──► dataApi (interface unique)
                ├── httpAdapter  ──► API serveur
                └── localAdapter ──► IPC ──► main/services ──► SQLite
```

## 2. Étapes de portage d'un backend vers le mode local

1. **Inventaire** : lister chaque appel réseau du renderer (méthode, chemin, corps, réponse) et chaque route du backend. Tableau `route → domaine → réutilisable en local ? (oui / adapter / serveur seulement)`.
2. **Contrat** : figer l'interface `dataApi` à partir des appels réels du renderer, avec les mêmes formes de réponse que l'API (le code d'affichage ne change pas).
3. **Services métier** : extraire du backend la logique pure (validation, calculs, numérotation, génération de PDF) en modules sans Express/Fastify ni `req`/`res`. Les réutiliser tels quels quand c'est possible plutôt que réécrire.
4. **Stockage** : schéma SQLite repris du serveur (skill `desk-local-data`). Si le serveur utilise PostgreSQL/MySQL : traduire les types (`SERIAL` → `INTEGER PRIMARY KEY`, `TIMESTAMP` → `TEXT` ISO, `BOOLEAN` → `INTEGER`, `JSONB` → `TEXT`), retirer ce que SQLite n'a pas (séquences, `RETURNING` selon version, fonctions spécifiques).
5. **Adaptateur local** : un handler IPC par méthode du contrat, qui appelle le service (skill `desk-ipc`).
6. **Sélection du mode** : une seule valeur de configuration (`mode: 'local' | 'server'`) lue au démarrage ; en version autonome dédiée, figée à `local` au build.
7. **Branchement** : remplacer dans le renderer chaque `fetch`/client API par `dataApi`, module par module, en gardant l'application utilisable entre deux étapes.

## 3. Ce qui change sans serveur

| Fonction serveur | En local |
|------------------|----------|
| Authentification JWT, comptes multiples | session locale : un profil, ou des profils avec mot de passe haché (Argon2id / scrypt) stocké en base ; pas de jeton réseau |
| Rôles et permissions | conservés si plusieurs utilisateurs partagent le poste, sinon simplifiés |
| Temps réel (WebSocket, chat, présence) | masqué ou remplacé par des événements IPC internes ; fonction « multi-poste » désactivée avec un message clair |
| Découverte réseau du serveur, configuration d'IP | retirée de l'interface |
| Envoi d'e-mails | désactivé ou délégué au client mail (`mailto:` via `shell.openExternal`) |
| Stockage de fichiers sur le serveur | dossier de données local |
| Sauvegarde serveur | sauvegarde locale + export (skill `desk-local-data` §4) |
| Mises à jour poussées par le serveur | updater de l'application (GitHub Releases) ou désactivé |

Une fonction indisponible en local se masque ou s'explique (« Disponible avec un serveur Tracebay »), elle ne plante pas.

## 4. Passer d'un mode à l'autre

- Export complet depuis le serveur → import dans la base locale, et l'inverse, au même format (JSON par domaine + version de schéma).
- Pas de synchronisation bidirectionnelle automatique sans demande explicite : c'est un projet à part (conflits, horodatage, suppression).

## 5. Branches

- Version autonome sur une branche dédiée longue durée (ex. `standalone`), sans toucher `main` ni la branche du serveur.
- Garder le code d'interface aussi proche que possible de `main` : les écarts sont concentrés dans l'adaptateur et la configuration, pour pouvoir reporter les correctifs (`git cherry-pick` ou fusion régulière de `main`).
- Identifiant d'application distinct si les deux versions doivent coexister sur un poste (`appId`, `productName`, dossier `userData`).

## 6. Vérifications

- [ ] Inventaire complet : aucun `fetch`/`XMLHttpRequest`/`WebSocket` restant vers le serveur en mode local (grep).
- [ ] Application lancée réseau coupé : démarrage, parcours principaux, PDF, sauvegarde.
- [ ] CSP `connect-src 'self'` en mode local, sans violation dans la console.
- [ ] Même jeu de parcours rejoué dans chaque mode, résultats identiques à l'écran.
- [ ] Import d'un export serveur réel : comptes rendus sans perte.
