# Performance et sobriété (bureau)

Mesurer, ne pas estimer. Référentiel d'éco-conception : RGESN (volet logiciel).

## Seuils indicatifs

| Mesure | Cible |
|--------|-------|
| Démarrage à froid jusqu'à la fenêtre utilisable | < 2 s sur un poste bureautique |
| Interaction (clic → retour visible) | < 100 ms, chargement affiché au-delà de 300 ms |
| Mémoire au repos, une fenêtre | Electron < 250 Mo, Tauri < 100 Mo |
| CPU au repos | ~0 % (aucune boucle, aucun polling inutile) |
| Taille de l'installeur | Electron < 120 Mo, Tauri < 15 Mo |

## Règles

- Fenêtre affichée sur `ready-to-show` (pas d'écran blanc), écran de démarrage seulement si le chargement dépasse 1 s.
- Pas de polling réseau ou disque quand un événement existe (WebSocket, `fs.watch`, notification IPC). Polling inévitable : intervalle long, suspendu fenêtre masquée.
- Listes longues : pagination ou virtualisation au-delà de ~500 lignes. Requêtes SQL indexées, `EXPLAIN QUERY PLAN` sur les requêtes des listes.
- Paquet : exclure tests, docs, sources maps, `devDependencies` et fichiers inutiles (`files` d'electron-builder, `asar`). Vérifier le contenu réel de l'archive.
- Une seule fenêtre cachée réutilisée plutôt que recréée pour les vues fréquentes (aperçu, impression).
- Images et polices locales, compressées (WebP, WOFF2), 2 graisses maximum.
- Sobriété fonctionnelle : une fonctionnalité sans usage mesuré ou demandé n'est pas livrée.
