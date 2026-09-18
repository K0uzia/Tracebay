# Démo Workspace

Interface navigateur de l’application actuelle (Agenda et Réception). HTML, CSS et JavaScript uniquement ; persistance en `localStorage`.

## Accès

- En ligne : [https://k0uzia.github.io/workspace/](https://k0uzia.github.io/workspace/)
- En local :

```bash
python3 -m http.server 8080 --directory demo
```

[http://localhost:8080](http://localhost:8080)

## Couverture

| Zone | Contenu |
| ---- | ------- |
| Navigation | Agenda, Reception, thème, paramètres simulés |
| Agenda | Semaine, mois, année ; événements ; jours fériés |
| Réception | Lots, disques (détection simulée), commande, dons, prêts |
| Suivi | Inventaire, historique (détail, édition, PDF, e-mail simulé) |

Hors démo, comme hors produit : Accueil, Dossier, Chat, écran de connexion.

## Données

Jeu entièrement fictif (atelier NEXA). Aucune organisation réelle. Le bandeau **Réinitialiser** restaure l’échantillon.
