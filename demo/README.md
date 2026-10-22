# Tracebay Démo statique

Copie navigable de **l’application actuelle** (pas de l’ancienne doc) : uniquement HTML, CSS et JavaScript, avec un **faux backend** en `localStorage`.

## En ligne

Démo officielle (indexée) : https://tracebay.kouzia.com/

La copie GitHub Pages (https://k0uzia.github.io/Tracebay/) renvoie vers la démo officielle : le workflow `deploy-demo-pages.yml` y ajoute `noindex`, une redirection immédiate et un lien visible, et retire `robots.txt` et `sitemap.xml`. Le dossier `demo/` tel quel (avec les logos de `apps/client/assets` copiés à la place du lien symbolique `demo/apps/client/assets`) est ce qui se publie sur tracebay.kouzia.com.

## Lancer en local

Ouvrir `demo/index.html` dans un navigateur, ou depuis la racine du dépôt :

```bash
python3 -m http.server 8080 --directory demo
```

Puis aller sur [http://localhost:8080](http://localhost:8080).

## Ce qui est inclus (app actuelle)

**Navigation**

- Logo / Tracebay → Agenda
- Agenda
- Reception
- Thème clair / sombre
- Paramètres (mises à jour simulées)

**Agenda**

- Vues semaine, mois, année
- Création, modification, suppression d’événements
- Jours fériés (métropole 2026)

**Réception**

- Flux : Lots, Disques (dont détection simulée), Commande, Dons, Prêts matériel
- Suivi : Inventaire (lots en cours, édition PC, clôture auto, PDF)
- Historique & traçabilité (fusionnés) : détails, édition, récupération, PDF (logo Tracebay), e-mail simulé

**Hors périmètre volontaire**

Pages retirées du client actuel : Accueil, Dossier, Traçabilité séparée, chat, écran de connexion.

## Données

Les données sont **entièrement fictives** (atelier NEXA, lots ORION/Helios/Lyra, chemins `/archives/nexa/…`). Aucune organisation réelle n’apparaît.  
Le bandeau **Réinitialiser** restaure le jeu de démo.
