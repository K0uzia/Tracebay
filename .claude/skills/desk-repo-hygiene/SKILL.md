---
name: desk-repo-hygiene
description: Vérifie qu'un dépôt d'application de bureau ne versionne aucun secret, certificat de signature, base locale, binaire ou dépendance installée, et que les dépendances npm et Cargo sont auditées. À utiliser avant un premier push, une release, l'ajout d'un .env ou d'un certificat, ou après une fuite suspectée.
---

# Hygiène du dépôt

## Contrôle automatique

```bash
node .claude/skills/desk-audit/scripts/check-repo.mjs
npm audit --omit=dev
cargo audit            # projets Tauri, si cargo-audit est installé
```

`check-repo.mjs` échoue si un fichier suivi correspond à : `.env`, `.env.*` (sauf `.env.example`), certificats et clés (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.p8`, profils Apple), `node_modules/`, bases (`*.sqlite`, `*.db`), `.asar`, `src-tauri/target/`, installeurs. Avertit sur un motif de jeton (GitHub, AWS, clé privée, clé de signature Tauri) et sur une IP privée en dur.

## Règles

- `.env.example` versionné avec les noms de variables, valeurs vides ou factices.
- IP d'exemple dans la doc : `203.0.113.x`. IP réelle d'un serveur : configuration utilisateur ou découverte, jamais en dur dans le code livré.
- `npm ci` en CI et pour les builds de release ; `package-lock.json` (et `Cargo.lock`) versionnés.
- Vulnérabilité `high`/`critical` dans une dépendance livrée : corrigée ou justifiée par écrit avant release. Les `devDependencies` ne sont pas livrées mais restent à surveiller (chaîne de build).
- Certificats de signature et mots de passe : secrets de CI ou trousseau du poste de build uniquement.

## En cas de fuite

1. Révoquer et remplacer le secret immédiatement (jeton GitHub, certificat, clé de signature de mise à jour). Le retirer du dépôt ne suffit pas.
2. Clé de signature de mise à jour compromise : publier une version signée avec la nouvelle clé par un canal de confiance ; les clients existants ne l'accepteront pas automatiquement si la clé publique change (Tauri) : prévoir une réinstallation.
3. Ensuite seulement, nettoyer l'historique (`git filter-repo`) et prévenir les détenteurs de clones.
