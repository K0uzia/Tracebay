## Tracebay 3.8.0

### Paramètres : Branding et Types, réglages de l'atelier
- Deux nouveaux onglets en tête des Paramètres, comme dans l'édition portable.
- Branding : nom affiché, logo et couleur des PDF (lots, disques, commandes, dons, prêts), avec un aperçu de l'en-tête. La couleur remplace le bleu des titres et des filets ; une teinte trop claire est refusée. Au choix d'un logo, sa couleur dominante est proposée.
- Types : la liste des types de matériel proposés dans les lots, l'inventaire, l'historique et les dons, avec le nombre de machines par type. « Autre (préciser) » reste toujours disponible.
- Ces réglages valent pour tous les postes. Chacun les voit, avec la mention « Défini par l'administrateur de l'atelier ». Pour les modifier : « Modifier (administrateur) », puis le nom et le mot de passe d'un compte administrateur ; la modification reste ouverte une heure sur le poste. La page de monitoring du serveur propose les mêmes réglages.

### Types de matériel
- Les listes de types des lots, de l'inventaire, de l'historique et des dons viennent désormais de la liste de l'atelier, au lieu d'être écrites dans l'application.
- Retirer un type de la liste ne modifie aucune machine : le type reste affiché tel quel dans l'inventaire et l'historique, et l'onglet Types indique combien de machines l'utilisent encore.
- Les anciens types (portable, fixe, écran) s'affichent avec leur libellé et sont comptés ensemble dans le résumé des PDF.

### Connexion au serveur
- Nouvel onglet Paramètres > Connexion : l'adresse du serveur de l'atelier se règle sur chaque poste, avec un bouton « Tester ». « Enregistrer et redémarrer » vérifie d'abord que le serveur répond, puis relance Tracebay.
- Si le serveur ne répond plus, un bandeau l'indique, avec un accès direct à l'adresse du serveur.
- À la mise à jour, chaque poste garde l'adresse qu'il utilisait : elle est enregistrée dans le dossier de données de Tracebay (fichier connection.json), sans rien à faire.

### Paquets et mises à jour
- Chaque version est publiée dans tous les formats : AppImage, .deb, .rpm et archive .tar.gz pour Linux, installateur et version portable pour Windows, avec un fichier SHA256SUMS.txt pour vérifier les téléchargements.
- Nouveau paquet .rpm (Fedora, RHEL, openSUSE) : Tracebay s'y met à jour comme avec le .deb.
- Avant d'installer une mise à jour (AppImage, .deb, .rpm), Tracebay vérifie que le fichier téléchargé est identique à celui de la publication ; un fichier différent est supprimé et la mise à jour refusée.
- Après l'installation d'une mise à jour .deb ou .rpm, la relance de Tracebay est contrôlée : si l'ancienne fenêtre ne se ferme pas, elle est fermée ; si la relance échoue, elle est retentée et la raison est notée dans le journal de mise à jour.
- L'archive .tar.gz et la version portable Windows ne se mettent pas à jour seules : Tracebay l'indique et renvoie vers la page des versions.
- Le paquet .deb déclare toutes les bibliothèques dont Tracebay a besoin (libgbm1 manquait), et installe la bonne bibliothèque son sur Ubuntu 24.04.

### Quel fichier télécharger ?
- Ubuntu, Debian, Linux Mint : workspace.deb (installation par double-clic ou `sudo apt install ./workspace.deb`, mises à jour automatiques). Sur Ubuntu 24.04 et plus récent, c'est le format à prendre : il installe la règle de sécurité (AppArmor) dont Tracebay a besoin pour démarrer.
- Fedora, RHEL, openSUSE : workspace.rpm (`sudo dnf install ./workspace.rpm`, mises à jour automatiques).
- Autre distribution, ou sans droits administrateur : workspace.AppImage. Le navigateur retire le droit d'exécution au téléchargement : `chmod +x workspace.AppImage`, ou Propriétés > Autoriser l'exécution. Sans FUSE sur le poste : `./workspace.AppImage --appimage-extract-and-run`. L'AppImage ne démarre pas sur Ubuntu 24.04 et plus récent (restriction de sécurité d'Ubuntu) : y prendre le .deb.
- Sans installation ni FUSE : workspace.tar.gz, à décompresser (`tar xzf workspace.tar.gz`) puis lancer `workspace` dans le dossier obtenu. Pas de mise à jour automatique. Sur Ubuntu 24.04 et plus récent, une fois après la décompression, dans ce dossier : `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox`.
- Windows : Tracebay-Setup.exe (installation, mises à jour automatiques) ou Tracebay-Portable.exe (sans installation, mise à jour à la main).
- Vérifier un fichier : `sha256sum -c SHA256SUMS.txt --ignore-missing` dans le dossier de téléchargement.

### À savoir
- Mettre à jour le serveur avant les postes : la version 3.8.0 du serveur apporte ces réglages. Sans elle, les onglets Branding et Types indiquent que les réglages sont indisponibles, et les listes reprennent Portable, Fixe, Écran.
- Sans réglage enregistré, la liste de départ est Portable, Fixe, Écran et la couleur est le bleu d'origine.
- Aucune migration de données.

## Tracebay 3.7.2

### Paramètres
- Nouvel onglet Apparence :
  - « Suivre le thème du système » est activé par défaut : Tracebay passe en clair ou en sombre comme l'ordinateur, y compris quand celui-ci change ;
  - « Thème sombre » permet de choisir soi-même, et ce choix reste mémorisé sur le poste ;
  - « Lancer au démarrage » ouvre Tracebay à l'ouverture de la session.
- La fenêtre des Paramètres s'agrandit avec l'écran (jusqu'aux écrans de 2560 px), le texte gardant une largeur de lecture confortable.

### Lisibilité
- Les contours des listes, champs, interrupteurs et boutons secondaires sont plus marqués, dans les deux thèmes, pour être bien visibles (contraste conforme aux règles d'accessibilité).

### Messages
- Les messages d'erreur de l'effacement d'un nom de technicien parlent de « Tracebay » plutôt que du « serveur ».

### À savoir
- Un poste qui n'avait jamais changé de thème suit désormais le thème du système : sur un ordinateur réglé en clair, Tracebay s'ouvre en clair. Le choix reste possible dans Paramètres > Apparence.
- Aucune action sur le serveur, aucune migration de données.

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
