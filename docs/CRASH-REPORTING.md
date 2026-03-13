# Crash reporting et performance au démarrage

## CrashReporter (Electron)

Le client utilise le **crashReporter** d’Electron pour enregistrer les plantages du process principal et des processus de rendu.

- **Par défaut** : les minidumps sont générés et stockés localement (répertoire Crashpad dans userData). Aucune donnée n’est envoyée à un serveur.
- **Envoi à un serveur** : définir la variable d’environnement `CRASH_REPORT_URL` avec l’URL de soumission (ex. endpoint Sentry, Bugsnag). Les rapports seront alors envoyés automatiquement.

Exemple pour Sentry :

1. Créer un projet Electron dans Sentry et récupérer l’URL DSN / endpoint de crash.
2. Lancer l’app avec : `CRASH_REPORT_URL=https://... node_modules/.bin/electron .` (ou configurer la variable dans le script de lancement / package de production).

Les dumps locaux restent utiles pour le debug (analyse avec breakpad/minidump).

## Mesure de performance au démarrage

- **Métrique** : temps entre `app.ready` et l’affichage de la fenêtre principale (après `did-finish-load` du renderer).
- **Console** : un log du type `⏱️ Démarrage (ready → fenêtre affichée): XXX ms` est écrit au premier affichage.
- **Fichier** : la dernière valeur est enregistrée dans `userData/startup-metrics.json` (`lastStartupMs`, `timestamp`) pour suivi ou alertes.

---

*Document de référence pour l’audit application (Priorité 3, point 11). Dernière mise à jour : mars 2025.*
