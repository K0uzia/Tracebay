# Backend — Prêts matériel (réception)

Document de préparation pour implémentation sur la branche **proxmox** (API serveur). Le client Electron + web est déjà branché sur ces URLs.

Référence config : `apps/client/public/config/connection.json` → `endpoints.pretsMateriel`.

---

## 1. Routes à exposer

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `POST` | `/api/prets-materiel` | Créer une fiche après génération du PDF (corps ci-dessous + `pdf_path`). |
| `GET` | `/api/prets-materiel/tracabilite` | Liste pour **Historique** et **Traçabilité** (même usage que dons/commandes). |
| `GET` | `/api/prets-materiel/:id` | Détail d’une fiche (régénération PDF, modal détail). |
| `PUT` | `/api/prets-materiel/:id` | Mise à jour partielle ; le client envoie au minimum `{ "pdf_path": "..." }` après régénération PDF. |

Authentification : alignée sur le reste de l’API (header `Authorization: Bearer <jwt>` si applicable).

---

## 2. `POST /api/prets-materiel` — corps JSON

Champs envoyés par le client (`prets.js`, après succès IPC PDF) :

```json
{
  "reference": null,
  "date": "2026-04-20",
  "borrower_type": "personne",
  "borrower_name": "Nom ou raison sociale",
  "borrower_contact": null,
  "date_debut": "2026-04-20",
  "date_fin": "2026-05-20",
  "remuneration_gratuit": true,
  "remuneration_montant": null,
  "lines": [
    {
      "num": 1,
      "type": "pc",
      "type_detail": "",
      "marque": "…",
      "modele": "…",
      "serialNumber": "…",
      "quantite": 1,
      "description": ""
    }
  ],
  "pdf_path": "/chemin/absolu/vers/fichier.pdf"
}
```

### Règles métier (côté formulaire client)

- `borrower_type` : `"personne"` | `"societe"`.
- `date` : identique à `date_debut` (ISO date `YYYY-MM-DD`).
- `remuneration_gratuit` : si `true`, `remuneration_montant` doit être `null` ; si prêt payant, `remuneration_gratuit` = `false` et montant numérique.
- `lines[].type` : `"pc"` | `"ecran"` | `"clavier"` | `"souris"` | `"autres"`.
- `lines[].serialNumber` : chaîne vide pour `autres` et pour écran / clavier / souris.
- `lines[].marque` / `modele` / `type_detail` : pour `autres`, marque/modèle optionnels ; `type_detail` peut contenir un résumé (`marque · modèle`).
- `lines[].description` : toujours `""` aujourd’hui (réservé évolution).
- `pdf_path` : chemin absolu côté poste (réseau type `/mnt/team/...`).

Réponse attendue : **201** ou **200** avec un corps contenant au minimum un identifiant, ex. `{ "id": 123, ... }` (le client ne parse pas strictement l’id au succès create, mais **GET liste** et **GET :id** en dépendent).

Erreurs : JSON `{ "message": "..." }` ou `{ "error": "..." }` (affiché en notification).

---

## 3. `GET /api/prets-materiel/tracabilite` — liste

Utilisé par `historique.js` et `tracabilite.js` (`fetch` + `Authorization`).

Le client extrait le tableau via `extractListFromApiPayload` en cherchant **dans l’ordre** une de ces clés à la racine **ou** sous `data` :

- `prets`
- `prets_materiel`
- `pret_materiels`
- `pretMateriels`
- `items`, `data`, `results`, `rows`

Exemples acceptés :

```json
{ "prets": [ { "id": 1, "borrower_name": "...", ... } ] }
```

```json
{ "data": { "prets_materiel": [ ... ] } }
```

Chaque élément de liste devrait exposer (noms **snake_case** préférés ; le client tolère aussi **camelCase** pour certains champs) :

| Champ | Usage client |
|--------|----------------|
| `id` | Cartes, filtres, `GET`/`PUT` |
| `reference` | Titre / recherche |
| `borrower_name` | Affichage (alias : `emprunteur`) |
| `borrower_type` | Affichage (alias : `borrowerType`) |
| `borrower_contact` | Optionnel |
| `date` ou `date_debut` | Tri, affichage date |
| `date_fin` | Détail |
| `remuneration_gratuit`, `remuneration_montant` | Affichage |
| `pdf_path` | Ouverture locale / téléchargement |
| `pdf_url` | Optionnel si PDF servi par HTTP |
| `created_at` | Tri / secours date |
| `lines` | Tableau de lignes (ou clés imbriquées : `pret_lignes`, `pretLignes`, `pret_lines` — voir `extractPretLinesFromRecord`) |

---

## 4. `GET /api/prets-materiel/:id` — détail

Le client peut recevoir `{ "data": { ... } }` ou `{ "pret": { ... } }` / `pret_materiel` / etc. (`unwrapDetailRecord`).

Le détail doit permettre de reconstruire le PDF : mêmes champs que le POST + `lines` complètes.

---

## 5. `PUT /api/prets-materiel/:id`

Corps minimal observé :

```json
{ "pdf_path": "/nouveau/chemin/fiche.pdf" }
```

Réponse **200** suffisante.

---

## 6. Lignes de matériel (stockage)

Chaque ligne (table fille ou JSON) alignée sur `buildServerLines` :

- `num` (int)
- `type` (enum ci-dessus)
- `type_detail` (string, souvent vide sauf `autres`)
- `marque`, `modele` (string)
- `serialNumber` (string, vide si non applicable)
- `quantite` (int ≥ 1)
- `description` (string, souvent vide)

---

## 7. Schéma SQL suggéré (à adapter au projet)

**Table `pret_materiel`** (ou nom existant) : `id`, `reference`, `borrower_type`, `borrower_name`, `borrower_contact`, `date`, `date_debut`, `date_fin`, `remuneration_gratuit`, `remuneration_montant`, `pdf_path`, `created_at`, `updated_at`, `created_by` (si vous avez les users).

**Table `pret_materiel_line`** : `id`, `pret_id`, `num`, `type`, `type_detail`, `marque`, `modele`, `serial_number`, `quantite`, `description`.

Index utiles : `(date_debut)`, `(created_at)` pour listes / années.

---

## 8. Checklist branche proxmox

- [ ] Migrations / tables
- [ ] `POST` create + validation + persistance des lignes
- [ ] `GET` tracabilite (liste triable par date)
- [ ] `GET` by id (enrichi avec lignes)
- [ ] `PUT` pdf_path
- [ ] CORS / auth identiques aux routes `dons` / `commandes`
- [ ] Tester avec le client : page Réception → Prêts → Enregistrer, puis Historique / Traçabilité

---

*Généré pour suivi inter-branches : commit côté branche actuelle, puis implémentation serveur sur **proxmox**.*
