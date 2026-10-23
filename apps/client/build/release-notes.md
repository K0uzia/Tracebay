## Tracebay 3.6.3

### Sécurité
- L'application installée ne charge plus que son propre code, vérifié à chaque démarrage : une archive de l'application modifiée après installation est refusée (Windows et macOS).
- Les options qui permettaient de détourner l'exécutable (exécution comme Node.js, variables NODE_OPTIONS, débogueur `--inspect`) sont désactivées dans la version installée.
- Les cookies enregistrés sur le poste sont chiffrés par le système.

### À savoir
- Aucun changement visible dans l'utilisation, aucune migration de données, aucune action sur le serveur.
- Sous Linux, le contrôle d'intégrité de l'archive n'existe pas (limite d'Electron) ; les autres protections s'appliquent.
