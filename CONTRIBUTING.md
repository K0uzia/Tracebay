# Contribution

En soumettant une contribution, vous acceptez le [code de conduite](CODE_OF_CONDUCT.md) et concédez votre travail sous la [Workspace Source-Available License](LICENSE).

## Périmètre

| Composant | Chemin |
| --------- | ------ |
| Client Electron | `apps/client/` |
| Backend | `proxmox/app/` |
| Démo | `demo/` |
| Documentation | `README.md`, `docs/`, `FONCTIONNEMENT-APPLICATION.md` |

L’interface actuelle est **Agenda** et **Réception**. La démo ne doit contenir aucune donnée d’organisation réelle.

## Préparation

Node.js ≥ 18.

```bash
npm ci
npm start
```

```bash
cd proxmox/app && npm install && npm run dev
```

```bash
npm run lint:check
npm test
```

Ne pas versionner de secrets, JWT, fichiers `.env` ou `connection.json` d’un environnement réel.

## Issues

Utiliser les modèles du dépôt (anomalie, évolution, documentation).

Les rapports de vulnérabilité relèvent exclusivement de la [politique de sécurité](SECURITY.md).

## Demandes de fusion

1. Brancher depuis `main` (`fix/`, `feat/`, `docs/`).
2. Limiter la demande à un sujet.
3. Aligner `demo/` lorsque le flux visible du client change.
4. Renseigner le modèle de PR et lier l’issue (`Fixes #…`).

La CI construit le client sur `apps/client/` et publie la démo lorsque `demo/` est modifié.

Interface et documentation utilisateur en français. Éviter les refactors hors sujet.
