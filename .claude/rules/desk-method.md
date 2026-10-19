# Méthode de travail (logiciel de bureau)

Adapté de `web-method` (CapsuleOS) pour les applications Electron et Tauri.

## Décider

- Une seule action possible et sans risque : la faire sans demander.
- Action irréversible ou visible de l'extérieur (push, tag poussé, publication de release, signature, envoi d'une mise à jour automatique, suppression de données utilisateur, migration de base non réversible) : validation humaine explicite à chaque fois.
- Commit et fusion en local sur une branche de travail : autorisés sans redemander une fois tout vérifié (lint, tests, contrôles du skill `desk-audit`). Push vers GitHub : seulement après vérification locale et accord explicite (même politique que l'ERP Kouzia, décision du 16/10/2026).
- Avant d'agir sur l'existant : observer (fichiers, application lancée, journaux, base locale), lister les écarts réels, ne corriger que ceux-là. Ne jamais deviner une mesure qu'on peut relever.
- Une hypothèse est fausse si le contrôle qui la teste échoue. On corrige le code, jamais le contrôle pour qu'il passe.

## Écrire peu, au bon endroit

- Avant d'ajouter un fichier, un module, une dépendance npm ou une crate : un besoin réel l'exige-t-il ? un existant peut-il être étendu ? est-ce de la donnée plutôt que de la logique ? Trois non : ne pas l'ajouter.
- Chaque dépendance native (module `.node`, crate avec `build.rs`) se justifie par écrit : elle complique le packaging sur chaque OS.
- Une source de vérité par information (version, identifiant d'application, schéma de base, contrat IPC, tokens). Le reste en est dérivé. Un fichier généré ne se modifie jamais à la main.
- Diff minimal : une intention, une zone, un contrôle vert. Pas de refactor hors demande.
- Commentaires seulement pour un invariant non évident. Pas de commentaire narratif, pas de TODO non classé.
- Pas de nouvelle doc parallèle quand un document existant couvre le sujet.

## Écarts et dette

- Tout écart connu est noté et classé : P0 bloquant (perte ou corruption de données, faille, crash au démarrage, installeur cassé), P1 visible mais contournable, P2 finition.
- Absence d'une donnée réelle : échec visible ou section masquée, jamais un substitut inventé.

## Vérifier

- Pendant le travail : contrôle minimal du périmètre touché (skill `desk-audit`).
- Avant de déclarer terminé : lancer l'application, faire le parcours touché, lire la console du renderer et les journaux du processus principal. « Ça devrait marcher » ne vaut pas preuve.
- Avant une release : recette complète du skill `desk-audit`, sur un paquet installé, pas seulement en mode dev.
- Compte rendu honnête : ce qui est vérifié, sur quel OS, ce qui ne l'est pas, ce qui reste rouge.
