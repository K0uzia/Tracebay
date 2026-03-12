# API Raccourcis – Contrat backend

Le client envoie le **JWT** dans l’en-tête `Authorization: Bearer <token>` pour toutes les requêtes raccourcis.  
Le **serveur doit** :

1. **Vérifier le JWT** et en extraire l’identifiant de l’utilisateur connecté (`user_id` ou équivalent).
2. **Filtrer toutes les réponses par cet utilisateur** :
   - **GET /api/shortcuts/categories** : ne retourner que les catégories dont `user_id` (ou champ équivalent) correspond à l’utilisateur authentifié.
   - **GET /api/shortcuts** : ne retourner que les raccourcis appartenant à des catégories de cet utilisateur (ou directement liés à `user_id` si le schéma le prévoit).
3. **Associer les créations à l’utilisateur** :
   - **POST /api/shortcuts/categories** : enregistrer la nouvelle catégorie avec le `user_id` issu du JWT.
   - **POST /api/shortcuts** : enregistrer le nouveau raccourci dans une catégorie appartenant à l’utilisateur, ou avec un `user_id` dérivé du JWT.
4. **Vérifier la propriété sur les modifications/suppressions** :
   - **PUT /api/shortcuts/categories/:id**, **DELETE /api/shortcuts/categories/:id** : n’autoriser que si la catégorie appartient à l’utilisateur.
   - **PUT /api/shortcuts/:id**, **DELETE /api/shortcuts/:id**, **PUT /api/shortcuts/reorder** : n’autoriser que si le raccourci / la catégorie concernée appartient à l’utilisateur.

Sans ce filtrage, tous les comptes connectés verront les mêmes données (ex. les raccourcis d’un autre utilisateur comme « Sandersonn » au lieu de « Test »).
