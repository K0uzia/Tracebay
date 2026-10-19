---
name: desk-legal-fr
description: Prépare les éléments légaux d'un logiciel de bureau distribué en France - écran « À propos », licence, licences des dépendances livrées, information RGPD sur les données traitées localement ou sur serveur, consentement télémétrie et rapports de crash, conditions d'utilisation. À utiliser avant une release, à l'ajout d'une dépendance, d'une télémétrie ou d'un traitement de données personnelles.
---

# Éléments légaux d'un logiciel (France)

Ne jamais inventer une donnée légale : champ inconnu = marqueur à remplir signalé à l'utilisateur.

## 1. « À propos »

Nom du logiciel, version (lue depuis la source unique), éditeur (nom ou raison sociale, contact), licence, lien vers les licences tierces, emplacement des données locales, lien vers la politique de confidentialité si elle existe.

## 2. Licences tierces

```bash
npx --yes license-checker-rseidelsohn --production --summary
npx --yes license-checker-rseidelsohn --production --csv --out THIRD-PARTY-LICENSES.csv
cargo about generate about.hbs > THIRD-PARTY-LICENSES.html   # Tauri, avec cargo-about
```

- Fichier des licences inclus dans le paquet (et Chromium/Electron : `LICENSES.chromium.html` est déjà fourni par Electron).
- Logiciel propriétaire : GPL/AGPL dans une dépendance livrée = bloquant ; LGPL : vérifier le mode de liaison. Polices et icônes : licence notée (OFL, CC BY…).

## 3. Données personnelles (RGPD)

Pour chaque traitement (fiches emprunteurs, comptes utilisateurs, agenda, historique) :

| Champ | Exemple |
|-------|---------|
| Données | nom, service, matériel emprunté, dates |
| Finalité | suivi des prêts de matériel |
| Base légale | intérêt légitime de l'organisation / obligation légale |
| Lieu de stockage | poste local (`userData`) ou serveur de l'organisation |
| Durée | à fixer par l'organisation, purge proposée dans l'application |
| Droits | export et suppression d'une personne possibles depuis l'application |

- En mode local, l'organisation qui utilise le logiciel est responsable du traitement ; l'éditeur fournit les moyens (export, suppression, sauvegarde chiffrée si besoin).
- Aucune donnée ne sort du poste sans que l'utilisateur le sache.

## 4. Télémétrie, crash, mises à jour

- Vérification de mise à jour : annoncée dans « À propos » ou les réglages, désactivable si possible.
- Rapport de crash (Sentry, crashReporter) : désactivé par défaut ou consentement explicite au premier lancement, aucune donnée métier dans le rapport.
- Télémétrie d'usage : consentement préalable, refus aussi simple que l'acceptation.

## 5. Conditions d'utilisation

Logiciel interne à une organisation : la licence suffit en général. Logiciel vendu ou distribué au public : CGU/CGV, garantie légale de conformité des biens numériques, droit de rétractation selon le mode de vente.
