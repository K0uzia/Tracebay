# Changelog - Workspace v2.0

## [2.0.0] - 2025-12-18

### 🎉 Refactorisation majeure

#### Architecture
- ✅ Migration vers architecture monorepo (npm workspaces)
- ✅ Séparation complète backend/frontend dans `apps/`
- ✅ Backend 100% TypeScript avec strict mode
- ✅ Frontend Vanilla JS + Web Components

#### Backend
- ✅ Migration Express → Fastify 4.24+
- ✅ TypeScript 5.3+ avec strict mode activé
- ✅ SQLite3 avec connection pooling (5 connexions max)
- ✅ Middleware d'authentification JWT
- ✅ Gestion d'erreurs centralisée
- ✅ Logger personnalisé
- ✅ Modèles User, Event, Message avec CRUD complet
- ✅ Configuration via .env centralisée
- ✅ Sécurité renforcée (Helmet, CORS, bcrypt 12 rounds)

#### Frontend
- ✅ Structure modulaire avec composants réutilisables
- ✅ API client centralisé
- ✅ Design system implémenté (couleurs, spacing, typography)
- ✅ Components: header, footer
- ✅ Pages: home (avec health check)

#### Database
- ✅ Schéma SQLite complet
- ✅ Connection pooling avec gestion automatique
- ✅ Migrations prévues
- ✅ Indexes pour performance
- ✅ Foreign keys avec CASCADE

#### Configuration
- ✅ TypeScript config (strict mode)
- ✅ ESLint + Prettier
- ✅ .env avec toutes les variables
- ✅ .gitignore complet
- ✅ Package.json avec scripts

#### Documentation
- ✅ README complet
- ✅ Instructions pour développeurs (Jarvis/Instructions.mdc)
- ✅ Standards AI (.ai-core/)
- ✅ Changelog

### 🔄 Préparation Phase 2
- Structure prête pour PostgreSQL migration
- Abstraction database via models
- WebSocket handlers structure (à implémenter)
- Routes API structure (à implémenter)

### 📋 À venir
- [ ] Routes API auth, agenda, chat
- [ ] WebSocket implementation
- [ ] Tests Jest
- [ ] Monitoring dashboard
- [ ] Migration PostgreSQL

---

## [1.x] - Versions précédentes

Voir historique Git pour les versions antérieures.
