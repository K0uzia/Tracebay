# Scripts du serveur

- `tracebayctl/` : outil d'exploitation du serveur (installation, état, mise à jour, sauvegardes, secrets, atelier, licence, comptes). Aide : `tracebayctl help`. Procédures : `proxmox/docs/DEPLOYMENT.md`.
- `proxmox.sh` : ancien point d'entrée, gardé pour la compatibilité ; il mène à `tracebayctl` avec les mêmes noms de commandes.
- `rebuild_import_sql_from_pdfs.py` : reprise ponctuelle de données (voir « Import ponctuel de données » dans `DEPLOYMENT.md`).

Tests de tracebayctl (sans Docker) : `bats proxmox/scripts/tracebayctl/tests` et `shellcheck -x proxmox/scripts/tracebayctl/tracebayctl proxmox/scripts/tracebayctl/*.sh`.
