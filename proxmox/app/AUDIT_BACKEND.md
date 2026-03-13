# Audit du backend Proxmox (proxmox/app)

**Périmètre** : `proxmox/app` (Fastify + TypeScript, branche proxmox)  
**Date** : mars 2025

---

## 1. Vue d’ensemble

| Élément | État |
|--------|------|
| **Stack** | Node 20+, Fastify 4, TypeScript, PostgreSQL (pg) |
| **Structure** | `src/` : api/, config/, db/, lib/, middleware/, models/, utils/, views/, main.ts |
| **Tests** | Aucun (`npm run test` = echo "No tests for proxmox") |
| **Build** | `tsc` + copie des vues (monitoring.html/css, favicon) dans `dist/` |

---

## 2. Sécurité

### 2.1 Points positifs

- **Authentification admin** : JWT signé (HMAC-SHA256) + token statique `ADMIN_TOKEN` en repli ; `checkAdminAuth()` utilisé sur toutes les routes admin.
- **CORS** : configuré via `ALLOWED_ORIGINS` (pas d’origine sauvage en prod si bien configuré).
- **Helmet** : activé (CSP désactivée pour compatibilité).
- **Rate limiting** : global (1000 req/min) + liste blanche localhost ; `skipOnError: true` pour ne pas casser l’API en cas d’erreur du plugin.
- **Client errors** : rate limit dédié (100 erreurs/min par client), validation du body (taille max 10 KB), sanitization des champs.
- **Requêtes SQL** : usage systématique de paramètres préparés (`$1`, `$2`, …) ; noms de tables admin (DB) limités par whitelist + `replace(/[^a-z0-9_]/gi, '')`.

### 2.2 Points d’attention / risques

| Risque | Détail | Recommandation |
|--------|--------|----------------|
| **Secrets par défaut** | `JWT_SECRET` et `ADMIN_TOKEN` ont des valeurs par défaut ("SECRET_RETIRE", "SECRET_RETIRE"). En prod, si `.env` est absent, le secret est faible. | Imposer des variables d’environnement en prod (démarrer en erreur si absentes) ou générer un secret au premier lancement. |
| **JWT en plusieurs endroits** | `JWT_SECRET` est lu directement dans `main.ts` et `admin.ts` avec des fallbacks légèrement différents ("changeme" vs "SECRET_RETIRE"). | Centraliser dans un module `config` ou `security.config` et l’utiliser partout. |
| **Config sécurité inutilisée** | `config/security.config.ts` (exigences mot de passe, HSTS, etc.) n’est importé nulle part. | Soit l’utiliser (validation mot de passe, headers), soit le supprimer pour éviter la confusion. |
| **Auth monitoring** | `client-errors.ts` utilise `MONITORING_ADMIN_TOKEN` / `SECRET_RETIRE` et un JWT custom ; pas d’usage de `checkAdminAuth` partagé. | Aligner sur l’auth admin (même JWT / même token) pour une seule politique d’accès monitoring. |
| **CSP désactivée** | `contentSecurityPolicy: false` pour Helmet. | Réactiver une CSP minimaliste si la page monitoring n’a pas besoin d’inline non sécurisé. |

---

## 3. Base de données

### 3.1 Connexion et pool

- Pool PostgreSQL avec config (min/max, timeouts) lisible depuis l’env.
- `testConnection()` au démarrage ; `initializeDatabase()` charge `schema.sql` puis exécute des migrations en dur (colonnes/tables additionnelles).
- Helper `query()` avec log des requêtes lentes (> 100 ms) et des erreurs.
- `transaction()` pour BEGIN/COMMIT/ROLLBACK.

### 3.2 Schéma et déploiement

| Problème | Détail |
|----------|--------|
| **schema.sql absent après build local** | `npm run build` ne copie pas `src/db/schema.sql` dans `dist/db/`. Au lancement avec `node dist/main.js`, `initializeDatabase()` échoue (fichier introuvable). Le Dockerfile, lui, copie bien `schema.sql` dans `dist/db/`. | Ajouter dans `build:copy-views` (ou un script dédié) : `cp src/db/schema.sql dist/db/schema.sql`. |
| **Dérive schéma `users`** | Le code suppose `users.role` et `users.deleted_at` (admin, main.ts), alors que `schema.sql` ne définit pas ces colonnes. Aucune migration dans `initializeDatabase()` ne les ajoute. | Ajouter dans le schéma ou dans les migrations : `role`, `deleted_at` sur `users`, et documenter la compatibilité avec bases existantes. |

### 3.3 Migrations

- Migrations gérées en dur dans `db/index.ts` (ALTER TABLE, CREATE TABLE IF NOT EXISTS, etc.) avec gestion d’erreurs non bloquantes.
- Pas de système de versions (pas de table de migrations type `schema_version`). Risque de double exécution ou d’ordre incohérent sur des déploiements variés.

**Recommandation** : à moyen terme, introduire un mécanisme de migrations versionnées (fichiers numérotés ou outil type node-pg-migrate) et une table `schema_migrations`.

---

## 4. API et logique métier

### 4.1 Organisation

- **Admin** : `api/admin.ts` (très volumineux) — users, agenda, messages, réception, config apps/dossiers, SMTP, logs, DB, serveur (status/start/stop/restart), commandes, entrées.
- **Monitoring** : `api/monitoring.ts` — stats, logs, users connectés, messages/events, **issues** (CRUD sur `client_errors`).
- **Client errors** : `api/client-errors.ts` — POST erreurs, GET liste/stats, PATCH resolve, routes monitoring (page, assets).

### 4.2 Validation des entrées

- **Problème** : peu de schémas Fastify (un seul repéré : body de `POST /api/monitoring/errors`). Le reste repose sur des vérifications manuelles (présence de champs, types).
- **Risque** : champs inattendus acceptés, types incorrects (ex. string au lieu de number) pouvant provoquer des erreurs SQL ou des incohérences.

**Recommandation** : ajouter des schémas (params, query, body) pour les routes sensibles (admin, commandes, entrées, issues) et utiliser `reply.code(400).send({ error: '...' })` en cas d’échec de validation.

### 4.3 Gestion des erreurs

- Pas de hook global `onError` Fastify qui formaterait toutes les réponses d’erreur.
- Les routes renvoient souvent `{ error: '...' }` avec `reply.statusCode = 4xx/5xx` ; les exceptions non attrapées ne sont pas normalisées.
- Le module `lib/errors.ts` (classes d’erreur + `formatError` / `asyncHandler`) n’est pas utilisé par les routes.

**Recommandation** : utiliser les classes d’erreur existantes et un formateur global pour des réponses d’erreur homogènes (structure JSON, codes, pas de fuite de stack en prod).

---

## 5. Performance et exploitation

### 5.1 Points positifs

- Compression (middleware) et rate limit global.
- Body limit 1 Mo.
- Log des requêtes lentes en base (> 100 ms).
- Pool de connexions configurable.

### 5.2 Points d’attention

- **Rate limit** : 1000 req/min en global ; liste blanche 127.0.0.1 / ::1. En production derrière un reverse proxy, l’IP vue peut être celle du proxy (toutes les requêtes partagent la même clé) — à prendre en compte si on durcit les limites.
- **Compression** : désactivée dans `performance.config.ts` (`enabled: false`) ; à réactiver et tester si on vise une meilleure bande passante.
- **Pas de timeout HTTP** : pas de timeout explicite par requête côté Fastify (souhaitable pour éviter des requêtes bloquantes).

---

## 6. Logs et observabilité

- Pino avec niveau configurable (`LOG_LEVEL`), multistream : console + buffer pour la page monitoring (dernières lignes).
- Chaque requête HTTP est loguée (method, url, status, temps, ip).
- Erreurs DB et erreurs métier loguées dans les handlers (fastify.log.error).

Manques possibles : pas de trace de corrélation (request id), pas d’export structuré vers un système externe (fichier JSON, syslog, etc.) documenté.

---

## 7. Configuration et déploiement

- **.env** : `.env.example` présent et documenté (DB, JWT, CORS, SMTP, etc.). Pas de `SERVICE_NAME`, `PROXMOX_CLI`, `CONTAINER_API_NAME`, `CONTAINER_DB_NAME` dans l’exemple alors qu’ils sont utilisés (admin, docker-compose).
- **Docker** : Dockerfile propre (Node 20, tini, copie schema + views + config), healthcheck côté compose.
- **Build local** : comme indiqué plus haut, copier `schema.sql` dans `dist/db/` pour que `npm run start` (hors Docker) fonctionne.

---

## 8. Synthèse des actions recommandées

| Priorité | Action |
|----------|--------|
| **Haute** | Copier `schema.sql` dans `dist/db/` lors du build (script ou npm) pour exécution en production hors Docker. |
| **Haute** | Aligner le schéma `users` avec le code : ajouter `role` et `deleted_at` (schéma ou migrations). |
| **Haute** | En production, refuser le démarrage si `JWT_SECRET` ou `ADMIN_TOKEN` sont absents ou égaux aux valeurs par défaut. |
| **Moyenne** | Centraliser JWT_SECRET (et si possible ADMIN_TOKEN) dans un seul module de config. |
| **Moyenne** | Utiliser ou supprimer `config/security.config.ts` ; si utilisé, appliquer au moins la validation des mots de passe et les headers. |
| **Moyenne** | Ajouter des schémas Fastify (validation) sur les routes admin et monitoring sensibles. |
| **Moyenne** | Hook global de gestion d’erreurs et utilisation de `lib/errors.ts` pour des réponses d’erreur homogènes. |
| **Basse** | Documenter dans `.env.example` : SERVICE_NAME, PROXMOX_CLI, CONTAINER_API_NAME, CONTAINER_DB_NAME. |
| **Basse** | Introduire des tests (au moins health + login admin + une route protégée). |
| **Basse** | Migrations versionnées pour la base (fichiers + table de versions). |

---

## 9. Fichiers principaux audités

- `src/main.ts` — bootstrap, CORS, WebSocket, enregistrement des routes
- `src/db/index.ts` — pool, query, transaction, initializeDatabase
- `src/db/schema.sql` — schéma principal
- `src/api/admin.ts` — routes admin et auth
- `src/api/monitoring.ts` — routes monitoring et issues
- `src/api/client-errors.ts` — erreurs clients et page monitoring
- `src/config/security.config.ts` — non utilisé
- `src/config/performance.config.ts` — rate limit, compression
- `src/middleware/rate-limit.ts` — rate limiting
- `src/lib/errors.ts` — classes d’erreur (peu utilisées)
- `package.json` — scripts build (sans copie schema)
- `proxmox/docker/Dockerfile` — copie schema + views
