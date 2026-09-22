# Contribution

En soumettant une contribution, vous acceptez le [code de conduite](CODE_OF_CONDUCT.md) et concédez votre travail sous la [Tracebaie Source-Available License](LICENSE).

## Branches

| Branche | Périmètre |
| ------- | --------- |
| **`main`** | App client Electron, démo, documentation côté application |
| **`proxmox`** | Backend / serveur (API, DB, Docker, scripts de déploiement) |

Ne pas ajouter le backend dans `main`. Les changements serveur se font sur `proxmox`.

## Périmètre (`main`)

| Composant | Chemin |
| --------- | ------ |
| Client Electron | `apps/client/` |
| Démo | `demo/` |
| Documentation | `README.md`, `docs/`, `FONCTIONNEMENT-APPLICATION.md` |

L’interface actuelle est **Agenda** et **Réception**. La démo ne doit contenir aucune donnée d’organisation réelle.

## Préparation (app, branche `main`)

Node.js ≥ 18.

```bash
npm ci
npm start
```

```bash
npm run lint:check
npm test
```

Backend : checkout de la branche `proxmox`, puis les commandes indiquées dans le README de cette branche.

Ne pas versionner de secrets, JWT, fichiers `.env` ou `connection.json` d’un environnement réel.

## Issues

Utiliser les modèles du dépôt (anomalie, évolution, documentation).

Les rapports de vulnérabilité relèvent exclusivement de la [politique de sécurité](SECURITY.md).

## Demandes de fusion

1. App / démo / docs client → brancher depuis **`main`** (`fix/`, `feat/`, `docs/`).
2. Backend / serveur → brancher depuis **`proxmox`**.
3. Limiter la demande à un sujet.
4. Sur `main` : aligner `demo/` lorsque le flux visible du client change.
5. Renseigner le modèle de PR et lier l’issue (`Fixes #…`).

La CI construit le client sur `apps/client/` et publie la démo lorsque `demo/` est modifié.

Interface et documentation utilisateur en français. Éviter les refactors hors sujet.
