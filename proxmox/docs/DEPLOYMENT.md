# Déploiement du serveur Tracebay (API Proxmox)

Le serveur tourne dans un conteneur LXC Debian 13 sur Proxmox, avec Docker Compose : `workspace-proxmox` (API Fastify, port 4000) et `workspace-db` (PostgreSQL 16). Tout se pilote par `tracebayctl`, lancé en root (`tracebayctl help`, ou `tracebayctl` seul pour le menu). Le serveur ne déploie que la branche `origin/proxmox`. L'ancien `proxmox/scripts/proxmox.sh` et l'ancienne commande `proxmox` restent utilisables : ils mènent à `tracebayctl` avec les mêmes noms de commandes.

## Prérequis (une fois)

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin curl git openssl util-linux
sudo systemctl enable --now docker
git clone https://github.com/K0uzia/Tracebay.git /root/workspace && cd /root/workspace && git checkout proxmox
sudo bash proxmox/scripts/tracebayctl/tracebayctl install
```

`install` génère `proxmox/docker/.env` (droits 600) avec des secrets aléatoires, construit l'image de l'API (Node et dépendances sont dans l'image : Node n'est pas nécessaire sur l'hôte), crée le schéma, installe le service systemd `proxmox-backend`, puis la commande `tracebayctl` (`install-cli`) avec la sauvegarde quotidienne.

## Secrets

`JWT_SECRET`, `ADMIN_TOKEN` et `DB_PASSWORD` n'ont aucune valeur par défaut :

- ils sont générés dans `proxmox/docker/.env` au premier déploiement (`openssl rand -hex`) ;
- l'API refuse de démarrer si l'un d'eux est absent, trop court ou vaut une ancienne valeur publiée dans le dépôt, et son journal (`tracebayctl logs`) dit quoi faire ;
- `tracebayctl check` les contrôle (sans jamais afficher leur valeur), et `update`, `install`, `backup` s'arrêtent avant toute modification dans le même cas.

Renouveler les secrets (après une fuite, ou pour quitter les anciens défauts) :

```bash
sudo tracebayctl rotate-secrets
```

Ordre suivi : copie de `.env` (`.env.avant-rotation`), nouveau mot de passe du rôle PostgreSQL (connexion locale au conteneur, l'ancien n'est pas requis), nouveau `.env` écrit d'un bloc, redémarrage, contrôle de l'API et de son accès à la base. Si une étape échoue, ou en cas d'interruption, l'ancien `.env` et l'ancien mot de passe sont remis et les conteneurs relancés : rien n'a changé. Tous les utilisateurs doivent se reconnecter. Les anciennes copies `.env.bak-*` laissées par `proxmox.sh` peuvent être supprimées.

`ADMIN_TOKEN` donne accès à `/api/admin/*`, `/api/monitoring/*` et `/api/metrics` (en-tête `x-admin-token` ou `Authorization: Bearer`, jamais en paramètre d'URL). La page `/monitoring` s'ouvre avec un compte de rôle `admin`.

L'inscription libre (`POST /api/auth/register`) est fermée : `ALLOW_REGISTRATION=false` dans `.env`. L'administrateur crée les comptes depuis la page de monitoring, ou rouvre temporairement l'inscription avec `ALLOW_REGISTRATION=true` puis `docker compose up -d`.

## Dossier partagé des PDF (lecture et écriture)

L'API lit, écrit (certificats disques) et supprime (prêts et dons effacés, PDF remplacés) des fichiers sous `TEAM_BASE_PATH` (défaut `/mnt/team/#TEAM`). Le montage se déclare dans `proxmox/docker/docker-compose.override.yml`, non suivi par git, donc conservé par `git reset --hard` :

```yaml
services:
  proxmox:
    volumes:
      - /mnt/team:/mnt/team:rw
```

Vérifier : `docker inspect workspace-proxmox --format '{{json .Mounts}}'` doit montrer `/mnt/team` avec `"RW":true`. En lecture seule, la suppression d'un prêt ou d'un don fonctionne, mais le PDF reste et le client indique son emplacement.

## Mise à jour

```bash
sudo tracebayctl update
```

1. Contrôles (Docker, `docker compose config`, secrets), liste des nouveautés de `origin/proxmox`, confirmation (`--yes` pour s'en passer).
2. Sauvegarde obligatoire de la base : si elle échoue, arrêt, rien n'a changé. `--skip-backup` s'en passe après une seconde confirmation.
3. Nouveau code (`git reset --hard origin/proxmox`), puis la suite tourne avec les scripts de la nouvelle version.
4. Compose de la nouvelle version validé et image construite pendant que l'ancienne tourne : en cas d'échec, le code revient à la version d'avant et rien n'a changé. Puis dernière image PostgreSQL de la même étiquette (`postgres:16-bookworm` : correctifs de la 16, jamais une autre version majeure) ; PostgreSQL n'est redémarré que si elle a changé (`--no-db-pull` pour s'en passer).
5. Mot de passe PostgreSQL réaligné, `schema.sql` puis migrations embarquées (`proxmox/app/src/db/migrations-embarquees.sql`), redémarrage, contrôle de la santé et de l'accès à la base. En cas d'échec : retour automatique à la version d'avant, et la commande indique la sauvegarde à restaurer si la base a déjà changé.

Une erreur de schéma reste un avertissement (comme avant) : elle est notée dans `/var/lib/tracebay/schema-erreurs.log` et sur la ligne « Dernière mise à jour » de `tracebayctl status`. Aucune donnée n'est injectée.

### Premier passage à tracebayctl (une seule fois, depuis un serveur sous proxmox.sh)

Ne pas lancer l'ancien `proxmox.sh update` pour ce passage : il construisait l'API sur l'hôte. Ordre :

```bash
cd /root/workspace
git fetch origin proxmox
git status --short --untracked-files=no        # doit être vide ; sinon, noter les fichiers modifiés à la main
git reset --hard origin/proxmox                 # code de tracebayctl (le .env, les sauvegardes et l'override sont conservés)
sudo bash proxmox/scripts/tracebayctl/tracebayctl install-cli
sudo tracebayctl check
sudo tracebayctl update --force                 # sauvegarde, image reconstruite, schémas, redémarrage, contrôles
sudo tracebayctl status
rm -rf proxmox/app/node_modules proxmox/app/dist   # restes de l'ancien build sur l'hôte, inutiles
```

- `install-cli` installe `/usr/local/bin/tracebayctl` (et fait mener l'ancienne commande `proxmox` à tracebayctl), écrit `/etc/tracebay/tracebayctl.conf`, propose de remplacer l'ancien `origin` (`SandersonnDev/workspace`) par `https://github.com/K0uzia/Tracebay.git` et active la sauvegarde quotidienne.
- `status` doit montrer : santé 200, accès à la base, Node de l'API en v22.23.4 ou plus, `docker compose config` valide, secrets « renseigné », dernière sauvegarde du jour, sauvegarde quotidienne active, aucun compte de test ni mot de passe publié.
- Node sur l'hôte n'est plus utilisé (`status` le signale) : il peut être désinstallé (`apt-get remove nodejs npm`).

## Atelier : nom et logo des PDF

Le nom et le logo imprimés en en-tête des PDF (lots, disques, commandes, dons, prêts) sont un réglage du serveur, partagé par tous les postes. Ils sont stockés dans la table `app_settings` (clés `branding.company_name` et `branding.logo`), et donc compris dans les sauvegardes `pg_dump`. Aucune migration de schéma : la table existe déjà.

- Sans réglage : nom « Tracebay », pas de logo.
- Logo : PNG, JPEG ou WebP, 512 Ko maximum. Pas de SVG (refusé).
- Lecture publique : `GET /api/branding`, utilisée par les postes au moment de générer un PDF.
- Modification réservée à l'administrateur : page `/monitoring`, onglet « Atelier », ou `PUT /api/admin/branding` et `DELETE /api/admin/branding/logo` avec `ADMIN_TOKEN`. En ligne de commande :

```bash
sudo tracebayctl set-branding --nom "NOM DE L'ATELIER" --logo /chemin/logo.png
```

### Passage à la version 3.7.0 des postes (logo par réglage)

Jusqu'à la 3.6.1, le logo de La Capsule était écrit en dur dans les gabarits PDF. À partir de la 3.7.0, il vient du réglage ci-dessus et le fichier n'est plus livré avec l'application. Pour qu'un atelier déjà installé garde son en-tête, enregistrer le réglage sur le serveur **avant** de publier la 3.7.0 des postes :

```bash
cd /root/workspace
sudo tracebayctl update
git fetch origin refs/tags/v3.6.0:refs/tags/v3.6.0
git show v3.6.0:apps/client/public/src/icons/capsule.png > /tmp/capsule.png
sudo tracebayctl set-branding --nom "LA CAPSULE" --logo /tmp/capsule.png
curl -s http://localhost:4000/api/branding | head -c 120; echo   # doit afficher "company_name":"LA CAPSULE"
```

Tant que le réglage n'est pas fait, les PDF des postes en 3.7.0 portent le nom « Tracebay », sans logo.

## Licence de l'atelier (à partir de la 3.7.0)

Une clé de licence `TB1.…`, émise par Kouzia, vaut pour tout l'atelier. Elle se saisit une fois sur le serveur, jamais sur les postes. Le serveur la vérifie hors ligne (signature Ed25519, clé publique embarquée) et ne contacte personne.

```bash
sudo tracebayctl set-licence "TB1.…"     # ou /monitoring, onglet Licence
curl -s http://localhost:4000/api/licence; echo                 # état, titulaire, expiration
```

États et effets :

| État | Écriture | Ce que voient les postes |
|---|---|---|
| Active | oui | rien |
| Expire bientôt (30 jours ou moins) | oui | bandeau avec la date |
| Expirée depuis 15 jours ou moins | oui | bandeau rouge avec la date de passage en lecture seule |
| Expirée depuis plus de 15 jours, horloge du serveur reculée, clé invalide | non (lecture seule) | bandeau rouge, refus des écritures (code 423) |
| Installation antérieure à la 3.7.0 sans clé (exemption) | oui, sans limite | mention « Licence non activée » dans À propos |
| Installation neuve sans clé | non (lecture seule) | bandeau rouge |

- Le délai de grâce après expiration (15 jours) et l'avertissement (30 jours) sont des constantes du code : `JOURS_GRACE_APRES_EXPIRATION` et `JOURS_AVERTISSEMENT`, dans `proxmox/app/src/lib/licence.ts` et `apps/client/licence.js`.
- Exemption : au premier démarrage d'un serveur 3.7.0, si la base contient déjà des données (lots, dons, prêts, commandes, sessions de disques, agenda) et qu'aucune clé n'a jamais été saisie, l'installation reste en écriture sans limite de temps. Dès qu'une clé est saisie une fois, les règles normales s'appliquent. Risque assumé : une installation créée avant la 3.7.0 reste exemptée tant qu'aucune clé n'y est saisie.
- Avec une licence valide, le nom de l'entreprise signé dans la clé remplace celui du réglage d'atelier sur les PDF. Pendant l'exemption ou le délai de grâce, c'est le nom du réglage d'atelier.
- Horloge : le serveur mémorise le dernier jour vu (heure de Paris). Une date antérieure est traitée comme une expiration.

En lecture seule, restent possibles : la consultation, les PDF et l'export ; la connexion ; la saisie de la licence et le réglage d'atelier ; l'enregistrement du chemin d'un PDF (`pdf_path` seul, sur les lots, sessions de disques, commandes, dons et prêts) ; et tout ce qui efface une personne (droit à l'effacement) :

| Effacement | Route |
|---|---|
| Don, prêt (avec leur PDF) | `DELETE /api/dons/:id`, `DELETE /api/admin/dons/:id`, `DELETE /api/prets-materiel/:id` |
| Événement d'agenda | `DELETE /api/agenda/events/:id`, `DELETE /api/admin/agenda/:id` |
| Nom d'un technicien sur le matériel | `POST /api/lots/technicians/anonymize { name }` (égalité exacte, ce seul champ) ; liste des noms : `GET /api/lots/technicians` |
| Compte utilisateur (serveur seulement) | `DELETE /api/admin/users/:id` : sessions et messages supprimés, journal d'activité anonymisé |
| Messages (serveur seulement) | `DELETE /api/admin/messages/:id`, `DELETE /api/admin/messages` |
| Remontée d'erreur d'un poste (serveur seulement) | `DELETE /api/admin/monitoring/errors/:id` |

Les destinataires des envois de PDF par e-mail ne sont pas enregistrés en base. Une adresse peut apparaître dans le journal du serveur (`proxmox/docker/logs`) si un envoi échoue : elle disparaît avec la rotation des journaux.

### Passage à la 3.7.0

1. `tracebayctl update` : la 3.7.0 du serveur fige l'exemption à son premier démarrage.
2. `set-licence` avec la clé de l'atelier, émise dans Kouzia Hub.
3. Publier les postes en 3.7.0.

## Import ponctuel de données

Aucun import automatique. Pour une reprise exceptionnelle : générer le fichier hors du dépôt (`proxmox/scripts/rebuild_import_sql_from_pdfs.py`), le relire, l'appliquer une fois, puis le supprimer. Il contient des données personnelles et ne doit jamais être commité (il est ignoré par git).

```bash
cd proxmox/docker && docker compose exec -T db psql -U Admin -d workspace_db -v ON_ERROR_STOP=1 < /chemin/import.sql
```

## Exploitation

```bash
sudo tracebayctl status                   # état complet, alertes en jaune
sudo tracebayctl logs [api|db] [-f]       # journaux
sudo tracebayctl start | stop | restart
sudo tracebayctl test-api                 # contrôles sans écriture
sudo tracebayctl users                    # comptes (jamais les hachages)
sudo tracebayctl admin-password NOM       # nouveau mot de passe, saisie masquée
sudo tracebayctl user-delete NOM          # suppression d'un compte, journal anonymisé
cd proxmox/docker && docker compose exec db psql -U Admin -d workspace_db    # PostgreSQL n'est pas publié sur le réseau
```

Une seule opération à la fois : une commande qui modifie le serveur pendant qu'une autre tourne s'arrête avec le code 75 et dit laquelle est en cours (`tracebayctl status` l'affiche aussi).

### Sauvegardes

- `tracebayctl backup` : sauvegarde vérifiée de la base dans `proxmox/docker/backups/AAAAMMJJ-HHMMSS[-étiquette]/` (`db.sql.gz` et `manifest.txt`). Les 14 plus récentes sont gardées.
- Sauvegarde quotidienne à 3 h 17 (`/etc/cron.d/tracebay-backup`, journal `/var/log/tracebay-backup.log`), activée par `install-cli` ; `tracebayctl cron off` la désactive.
- `tracebayctl restore` : liste numérotée des dernières sauvegardes (anciens `pre_update_*.sql.gz` compris), confirmation, sauvegarde de sécurité de l'état actuel, puis restauration. Si l'import échoue, la base revient à son état d'avant. `tracebayctl restore --check NOM` vérifie une sauvegarde sans rien toucher.
- Les sauvegardes contiennent des données personnelles : `proxmox/docker/backups/` est ignoré par git. Une copie hors du serveur reste à la charge de l'administrateur.

## Validation PDF disques (traçabilité)

Les certificats PDF des sessions disques sont stockés sous `/mnt/team/#TEAM/#TRAÇABILITÉ/Disques/AAAA/Mois` (ou `DISQUES_PDF_BASE`) :

1. créer une session (POST `/api/disques/sessions` avec `date` et `disks`), puis vérifier qu'un PDF existe dans le dossier du mois ;
2. GET `/api/disques/sessions/:id/pdf` renvoie 200 et le PDF ;
3. après suppression du fichier, la même requête renvoie 404 `{"error":"PDF file not found"}` ;
4. POST `/api/disques/sessions/:id/regenerate-pdf` (body `{}`) puis GET : 200.

## Restant à traiter (hors de ce lot)

- Les routes métier (`/api/lots`, `/api/dons`, `/api/prets-materiel`, `/api/agenda`, etc.) restent sans authentification : leur exposition se limite au réseau de l'atelier.
- Pas de TLS : réseau local uniquement.
