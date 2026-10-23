## Tracebay 3.7.1

### Paramètres > Confidentialité : effacer le nom d'un technicien
- Un nom long ne dépasse plus du panneau : il est coupé par des points de suspension.
- Libellé, liste et boutons sont espacés et à la taille du reste des Paramètres.
- Un nom enregistré avec des espaces en trop (au début, à la fin ou doublés) montre ces espaces (␣) et la mention « espaces en trop », pour ne pas le confondre avec le même nom sans espaces.
- Échap annule la confirmation sans fermer toute la fenêtre des Paramètres.
- Pendant l'effacement, le bouton indique « Effacement… ». Un échec donne un message compréhensible, et si la liste ne se charge pas, un bouton « Réessayer » la recharge.
- Après un effacement, le clavier reste sur la liste. Les grands nombres s'écrivent à la française (1 234 éléments).

### À savoir
- Aucune action sur le serveur, aucune migration de données.

## Tracebay 3.7.0

Cette version regroupe aussi les évolutions prévues pour les versions 3.6.2 et 3.6.3, qui n'ont pas été publiées séparément.

### Licence de l'atelier
- Tracebay s'utilise avec une clé de licence fournie par Kouzia. Elle vaut pour tout l'atelier et se saisit une fois sur le serveur (page de monitoring, onglet Licence), pas sur les postes.
- La clé est vérifiée hors ligne : ni le serveur ni les postes ne contactent Kouzia.
- Avec une licence valide, le nom de l'entreprise écrit dans la clé figure sur les PDF.
- Un bandeau prévient 30 jours avant l'expiration. Après l'expiration, l'écriture reste possible 15 jours (bandeau rouge), puis Tracebay passe en lecture seule : consultation, PDF, export et suppression des données personnelles restent possibles.
- Paramètres > À propos : état de la licence, titulaire et date d'expiration.

### PDF
- Le nom et le logo imprimés en en-tête des PDF (lots, disques, commandes, dons, prêts) sont désormais un réglage de l'atelier, défini par l'administrateur du serveur et commun à tous les postes. Ils ne sont plus écrits en dur dans l'application.
- Sans réglage, les PDF portent le nom « Tracebay », sans logo.
- Paramètres > À propos : nouveau bloc « Atelier », qui affiche le nom et le logo en vigueur.

### Confidentialité
- Paramètres > Confidentialité : effacer le nom d'un technicien de toutes les lignes de matériel où il figure. Le matériel et son historique sont conservés.

### Sécurité
- L'application installée ne charge plus que son propre code, vérifié à chaque démarrage : une archive de l'application modifiée après installation est refusée (Windows et macOS).
- Les options qui permettaient de détourner l'exécutable (exécution comme Node.js, variables NODE_OPTIONS, débogueur `--inspect`) sont désactivées dans la version installée.
- Les cookies enregistrés sur le poste sont chiffrés par le système.
- Sous Linux, le contrôle d'intégrité de l'archive n'existe pas (limite d'Electron) ; les autres protections s'appliquent.

### À savoir
- Ordre de déploiement : d'abord le serveur, ensuite le nom et le logo de l'atelier (commande `set-branding` du serveur ou onglet Atelier de la page de monitoring), enfin les postes. Procédure dans la documentation de déploiement du serveur. Sans réglage de l'atelier, les PDF portent le nom « Tracebay », sans logo.
- Un atelier déjà équipé avant cette version continue sans changement tant qu'aucune clé n'est saisie (mention « Licence non activée » dans À propos).
- Aucune migration de données.
