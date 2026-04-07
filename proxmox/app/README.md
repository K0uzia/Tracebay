# Backend Workspace (API)

Serveur **REST** et **WebSocket** pour l’application desktop Workspace : authentification, données métier (agenda, réception, chat, etc.), fichiers partagés et génération de PDF (ex. traçabilité disques). Il est développé en **TypeScript** avec **Fastify** et **PostgreSQL**.

> **Branche Git** : le code source complet de ce backend est versionné sur la branche **`proxmox`** de ce dépôt (pas sur `main`). Après clone :  
> `git fetch origin && git checkout proxmox`  
> puis travailler sous `proxmox/app/`.  
> Sur `main`, ce dossier peut ne contenir qu’un fichier minimal (ex. `package-lock.json`) en attendant une fusion des branches.

Documentation complémentaire (fichiers présents après `git checkout proxmox`) :

- `README_APP.md` (ce dossier) — rappels setup rapide
- `proxmox/docs/DEPLOYMENT.md` — déploiement infrastructure
- `proxmox/docker/README.md` — conteneurisation
- `proxmox/README.md` — scripts et commandes d’exploitation
- À la racine du dépôt : `docs/API.md`, `docs/DATABASE.md`, `docs/WEBSOCKET.md`

---

## Stack technique

| Élément | Technologie |
|--------|---------------|
| Runtime | Node.js **≥ 20.11** |
| Framework HTTP | Fastify 4 |
| Langage | TypeScript (build → `dist/`) |
| Base de données | PostgreSQL (`pg`, schéma SQL dans `src/db/`) |
| Auth | JWT (`jsonwebtoken`), mots de passe hashés (`bcryptjs`) |
| Temps réel | `@fastify/websocket` |
| Durcissement | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/compress` |
| PDF / email | `pdfkit`, `nodemailer` |
| Observabilité | routes monitoring, métriques, buffer de logs (voir `src/api/monitoring.ts`, `src/utils/`) |

---

## Structure du code (`proxmox/app/`)

```
proxmox/app/
├── package.json, tsconfig.json, .env.example
├── db/                    # SQL d’installation PostgreSQL
├── scripts/               # ex. smoke tests
└── src/
    ├── main.ts            # entrée Fastify
    ├── api/, config/, db/, lib/, middleware/, models/, utils/, views/, ws/
    └── …                  # routes, schéma SQL, WebSocket, page monitoring, etc.
```

---

## Configuration

1. Copier l’environnement : `cp .env.example .env` et renseigner les variables (port API, secrets JWT, chaîne PostgreSQL, chemins type `TEAM_BASE_PATH` pour les partages, SMTP si besoin).
2. Initialiser la base : scripts SQL sous `db/` et `src/db/schema.sql` (détails dans `docs/DATABASE.md` une fois sur la branche `proxmox`).

---

## Développement et build

```bash
cd proxmox/app
npm install
npm run dev          # tsx watch src/main.ts
npm run build        # tsc + copie des vues monitoring
npm start            # node dist/main.js
npm run type-check
npm run lint
```

Smoke test d’intégration (si présent) : `./scripts/integration-smoke.sh`.

---

## Déploiement

- **Docker** : répertoire `proxmox/docker/` (compose, Dockerfile, `.env.example`) sur la branche `proxmox`.
- **Hôte bare-metal / VM** : procédures dans `proxmox/docs/DEPLOYMENT.md` et script d’administration décrit dans `proxmox/README.md`.

L’URL et le port exposés au client Electron doivent correspondre à `connection.json` côté `apps/client/`.

---

## Cybersécurité (aperçu)

- **Helmet**, **CORS** et **rate limiting** configurés côté Fastify (voir `src/middleware/`, `src/config/security.config.ts`).
- Secrets (**JWT**, mots de passe DB, SMTP) uniquement via **variables d’environnement**, jamais commités.
- Mots de passe utilisateurs : **bcrypt** ; API : **Bearer JWT**.
- Recommandations : TLS terminé (reverse proxy), réseau privé ou VPN, sauvegardes PG, mise à jour des dépendances (`npm audit`).

---

## Relation avec le client

Le dépôt racine documente le **client Electron** dans `README.md` à la racine. Ce fichier couvre uniquement le **backend** sous `proxmox/app/`.
