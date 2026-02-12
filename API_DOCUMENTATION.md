# 📚 Documentation API

**Version**: 1.0.0  
**Date**: 12 février 2026  
**Base URL**: Configurée dans `apps/client/config/connection.json`

---

## 🔐 Authentification

Toutes les requêtes (sauf `/api/auth/*`) nécessitent un token JWT dans le header `Authorization: Bearer <token>`.

Le token est automatiquement ajouté par le module `api.js` depuis `localStorage.getItem('workspace_jwt')`.

---

## 📋 Endpoints

### Health & Monitoring

#### `GET /api/health`
Vérifie l'état du serveur.

**Réponse**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T10:00:00Z"
}
```

**Utilisé dans**: `ServerConnectionManager`, `SystemInfoManager`

---

#### `GET /api/metrics`
Récupère les métriques du serveur.

**Réponse**: Métriques système

---

#### `GET /api/monitoring/stats`
Récupère les statistiques de monitoring.

**Réponse**: Statistiques détaillées

---

### 🔑 Authentification

#### `POST /api/auth/register`
Inscription d'un nouvel utilisateur.

**Body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Réponse**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "string"
  },
  "token": "jwt_token"
}
```

**Utilisé dans**: `AuthManager.register()`

---

#### `POST /api/auth/login`
Connexion d'un utilisateur.

**Body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Réponse**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "string"
  },
  "token": "jwt_token"
}
```

**Utilisé dans**: `AuthManager.login()`

---

#### `GET /api/auth/verify`
Vérifie la validité du token JWT.

**Headers**: `Authorization: Bearer <token>`

**Réponse**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "string"
  }
}
```

**Utilisé dans**: `AuthManager.verifySession()`

---

#### `POST /api/auth/logout`
Déconnexion (invalide le token).

**Headers**: `Authorization: Bearer <token>`

**Réponse**:
```json
{
  "success": true
}
```

---

### 📦 Lots (Réception)

#### `GET /api/lots`
Récupère la liste des lots.

**Query Parameters**:
- `status` (optional): `active` | `finished` | `all`

**Réponse**:
```json
[
  {
    "id": 1,
    "name": "string",
    "status": "active",
    "created_at": "2026-02-12T10:00:00Z",
    "items": [...]
  }
]
```

**Utilisé dans**: 
- `InventaireManager.loadLots()` (status=active)
- `HistoriqueManager.loadLots()` (status=finished)
- `TracabiliteManager.loadLots()` (status=all)

---

#### `POST /api/lots`
Crée un nouveau lot.

**Body**:
```json
{
  "items": [
    {
      "serial_number": "string",
      "marque": "string",
      "modele": "string",
      "etat": "string"
    }
  ],
  "lotName": "string"
}
```

**Réponse**:
```json
{
  "success": true,
  "lot": {
    "id": 1,
    "name": "string"
  }
}
```

**Utilisé dans**: `GestionLotsManager.saveLot()`

---

#### `GET /api/lots/:id`
Récupère un lot spécifique.

**Réponse**: Objet lot complet

---

#### `PUT /api/lots/:id`
Met à jour un lot.

**Body**:
```json
{
  "lot_name": "string"  // Optionnel
}
```

**Utilisé dans**: `HistoriqueManager.updateLotName()`

---

#### `POST /api/lots/:id/pdf`
Génère le PDF d'un lot.

**Réponse**: Blob PDF

**Utilisé dans**: `TracabiliteManager.downloadPDF()`

---

#### `POST /api/lots/:id/email`
Envoie le PDF d'un lot par email.

**Body**:
```json
{
  "email": "string",
  "subject": "string",
  "message": "string"
}
```

**Réponse**:
```json
{
  "success": true,
  "message": "Email envoyé"
}
```

**Utilisé dans**: `TracabiliteManager.sendEmail()`

---

#### `GET /api/lots/items/:id`
Récupère un item spécifique d'un lot.

**Réponse**: Objet item

---

#### `PUT /api/lots/items/:id`
Met à jour un item d'un lot.

**Body**:
```json
{
  "etat": "string",
  "recovered_at": "boolean"  // Pour historique
}
```

**Utilisé dans**: 
- `InventaireManager.updateItemState()`
- `HistoriqueManager.updateItemState()`
- `HistoriqueManager.markAsRecovered()`

---

#### `POST /api/lots/reorder`
Réorganise l'ordre des items dans un lot.

**Body**:
```json
{
  "lot_id": 1,
  "item_ids": [1, 2, 3]
}
```

---

### 🔖 Raccourcis (Shortcuts)

#### `GET /api/shortcuts`
Récupère tous les raccourcis de l'utilisateur.

**Réponse**:
```json
[
  {
    "id": 1,
    "name": "string",
    "url": "string",
    "category_id": 1,
    "order": 0
  }
]
```

**Utilisé dans**: `ShortcutManager.loadShortcuts()`

---

#### `POST /api/shortcuts`
Crée un nouveau raccourci.

**Body**:
```json
{
  "category_id": 1,
  "name": "string",
  "url": "string"
}
```

**Réponse**: Objet raccourci créé

**Utilisé dans**: `ShortcutManager.createShortcut()`

---

#### `GET /api/shortcuts/:id`
Récupère un raccourci spécifique.

**Réponse**: Objet raccourci

---

#### `PUT /api/shortcuts/:id`
Met à jour un raccourci.

**Body**:
```json
{
  "name": "string",
  "url": "string"
}
```

**Réponse**: Objet raccourci mis à jour

**Utilisé dans**: `ShortcutManager.updateShortcut()`

---

#### `DELETE /api/shortcuts/:id`
Supprime un raccourci.

**Réponse**:
```json
{
  "success": true
}
```

**Utilisé dans**: `ShortcutManager.deleteShortcut()`

---

#### `PUT /api/shortcuts/reorder`
Réorganise l'ordre des raccourcis.

**Body**:
```json
{
  "category_id": 1,
  "shortcut_ids": [1, 2, 3]
}
```

**Réponse**:
```json
{
  "success": true
}
```

**Utilisé dans**: `ShortcutManager.reorderShortcuts()`

---

### 📁 Catégories de Raccourcis

#### `GET /api/shortcuts/categories`
Récupère toutes les catégories de raccourcis.

**Réponse**:
```json
[
  {
    "id": 1,
    "name": "string",
    "order": 0
  }
]
```

**Utilisé dans**: `ShortcutManager.loadCategories()`

---

#### `POST /api/shortcuts/categories`
Crée une nouvelle catégorie.

**Body**:
```json
{
  "name": "string"
}
```

**Réponse**: Objet catégorie créée

**Utilisé dans**: `ShortcutManager.createCategory()`

---

#### `GET /api/shortcuts/categories/:id`
Récupère une catégorie spécifique.

**Réponse**: Objet catégorie

---

#### `PUT /api/shortcuts/categories/:id`
Met à jour une catégorie.

**Body**:
```json
{
  "name": "string"
}
```

**Réponse**: Objet catégorie mis à jour

**Utilisé dans**: `ShortcutManager.renameCategory()`

---

#### `DELETE /api/shortcuts/categories/:id`
Supprime une catégorie.

**Réponse**:
```json
{
  "success": true
}
```

**Utilisé dans**: `ShortcutManager.deleteCategory()`

---

### 🏷️ Marques & Modèles

#### `GET /api/marques`
Récupère la liste des marques.

**Réponse**:
```json
[
  {
    "id": 1,
    "name": "string"
  }
]
```

**Utilisé dans**: `GestionLotsManager.loadReferenceData()`

---

#### `GET /api/marques/all`
Récupère toutes les marques avec leurs modèles.

**Réponse**:
```json
[
  {
    "id": 1,
    "name": "string",
    "modeles": [
      {
        "id": 1,
        "name": "string"
      }
    ]
  }
]
```

**Utilisé dans**: `GestionLotsManager.loadReferenceData()`

---

#### `GET /api/marques/:id/modeles`
Récupère les modèles d'une marque.

**Réponse**:
```json
[
  {
    "id": 1,
    "name": "string"
  }
]
```

---

#### `POST /api/marques`
Crée une nouvelle marque.

**Body**:
```json
{
  "name": "string"
}
```

**Réponse**: Objet marque créée

**Utilisé dans**: `GestionLotsManager.submitMarque()`

---

#### `POST /api/marques/:id/modeles`
Crée un nouveau modèle pour une marque.

**Body**:
```json
{
  "name": "string"
}
```

**Réponse**: Objet modèle créé

**Utilisé dans**: `GestionLotsManager.submitModele()`

---

### 📅 Agenda

#### `GET /api/agenda/events`
Récupère les événements de l'agenda.

**Query Parameters**:
- `start` (optional): Date de début (ISO 8601)
- `end` (optional): Date de fin (ISO 8601)

**Réponse**:
```json
[
  {
    "id": 1,
    "title": "string",
    "start": "2026-02-12T10:00:00Z",
    "end": "2026-02-12T11:00:00Z",
    "description": "string"
  }
]
```

**Utilisé dans**: `AgendaStore.fetchEvents()`

---

#### `POST /api/agenda/events`
Crée un nouvel événement.

**Body**:
```json
{
  "title": "string",
  "start": "2026-02-12T10:00:00Z",
  "end": "2026-02-12T11:00:00Z",
  "description": "string"
}
```

**Réponse**: Objet événement créé

**Utilisé dans**: `AgendaStore.createEvent()`

---

#### `PUT /api/agenda/events/:id`
Met à jour un événement.

**Body**:
```json
{
  "title": "string",
  "start": "2026-02-12T10:00:00Z",
  "end": "2026-02-12T11:00:00Z",
  "description": "string"
}
```

**Réponse**: Objet événement mis à jour

**Utilisé dans**: `AgendaStore.updateEvent()`

---

#### `DELETE /api/agenda/events/:id`
Supprime un événement.

**Réponse**:
```json
{
  "success": true
}
```

**Utilisé dans**: `AgendaStore.deleteEvent()`

---

### 💬 Messages & Événements (Chat)

#### `GET /api/messages`
Récupère les messages du chat.

**Réponse**: Liste de messages

---

#### `POST /api/messages`
Envoie un message dans le chat.

**Body**:
```json
{
  "message": "string",
  "pseudo": "string"
}
```

**Réponse**: Message créé

---

#### `GET /api/events`
Récupère les événements système.

**Réponse**: Liste d'événements

---

#### `POST /api/events`
Crée un événement système.

**Body**:
```json
{
  "type": "string",
  "data": {}
}
```

**Réponse**: Événement créé

---

## 🔌 WebSocket

### Connexion
L'URL WebSocket est configurée dans `connection.json` (ex: `ws://192.168.1.62:4000`).

### Messages

#### Authentification
```json
{
  "type": "auth",
  "token": "jwt_token"
}
```

#### Définir le pseudo
```json
{
  "type": "setPseudo",
  "pseudo": "string"
}
```

#### Envoyer un message
```json
{
  "type": "message",
  "text": "string"
}
```

#### Supprimer le chat
```json
{
  "type": "clearChat",
  "pseudo": "string"
}
```

### Réponses

#### Historique
```json
{
  "type": "history",
  "messages": [...]
}
```

#### Nouveau message
```json
{
  "type": "newMessage",
  "message": {
    "id": 1,
    "pseudo": "string",
    "message": "string",
    "created_at": "2026-02-12T10:00:00Z"
  }
}
```

#### Compteur d'utilisateurs
```json
{
  "type": "userCount",
  "count": 5,
  "users": ["user1", "user2", ...]
}
```

#### Chat supprimé
```json
{
  "type": "chatCleared",
  "clearedBy": "string"
}
```

#### Succès
```json
{
  "type": "success",
  "message": "string"
}
```

#### Erreur
```json
{
  "type": "error",
  "message": "string"
}
```

---

## ⚠️ Codes d'Erreur HTTP

- `400` - Bad Request: Requête invalide
- `401` - Unauthorized: Token manquant ou invalide
- `403` - Forbidden: Accès refusé
- `404` - Not Found: Ressource non trouvée
- `500` - Internal Server Error: Erreur serveur

Toutes les erreurs sont gérées automatiquement par `ErrorHandler.js` qui affiche des messages utilisateur-friendly.

---

## 📝 Notes

- Tous les endpoints retournent du JSON
- Les dates sont au format ISO 8601
- Le module `api.js` gère automatiquement l'authentification
- Les erreurs réseau sont gérées automatiquement avec reconnexion
- Le WebSocket se reconnecte automatiquement en cas de déconnexion

---

*Documentation générée le 12 février 2026*
