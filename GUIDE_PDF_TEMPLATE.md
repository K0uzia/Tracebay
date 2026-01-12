# 📄 Système de Template PDF pour Lots

## 📋 Architecture

Le système de génération PDF utilise une architecture basée sur 3 fichiers :

### 1. **Template HTML** (`/apps/server/public/templates/lot-template.html`)
- Fichier HTML de base avec placeholders (`{{PLACEHOLDER}}`)
- Contient la structure complète du PDF
- Agnostique aux données
- Facile à modifier visuellement

### 2. **Feuille de styles** (`/apps/server/public/css/lot-template.css`)
- Tous les styles CSS du PDF
- Styles d'impression optimisés
- Styles responsifs
- Facile à personnaliser

### 3. **Helper de rendu** (`/apps/server/lib/pdfTemplateHelper.js`)
- Module utilitaire Node.js
- Charge le template HTML
- Remplace les placeholders par les données
- Formate les dates et états
- Génère les lignes du tableau

## 🔄 Flux d'utilisation

```
Client: generatePDF(lotId)
    ↓
POST /api/lots/:id/pdf
    ↓
renderLotPDF(lot, items)
    ├─ Lit lot-template.html
    ├─ Remplace {{PLACEHOLDER}} par les données
    ├─ Génère les lignes du tableau
    └─ Retourne le HTML complet
    ↓
Sauvegarde: /apps/server/public/pdfs/lot-{id}.html
    ↓
BDD: UPDATE lots SET pdf_path = '/pdfs/lot-{id}.html'
    ↓
Affichage dans Electron
```

## 📝 Placeholders disponibles

Dans `lot-template.html`, vous pouvez utiliser :

| Placeholder | Description | Exemple |
|---|---|---|
| `{{LOT_ID}}` | ID du lot | `1` |
| `{{REPORT_DATE}}` | Date/heure du rapport | `12 janvier 2026 à 09:31` |
| `{{LOT_STATUS}}` | Statut du lot | `En cours` ou `Terminé` |
| `{{CREATED_AT}}` | Date de création formatée | `12 janvier 2026 à 08:31` |
| `{{FINISHED_AT}}` | Date de fin formatée | `12 janvier 2026 à 09:31` ou `-` |
| `{{LOT_NAME_ROW}}` | Div avec nom du lot (ou vide) | HTML conditionnel |
| `{{LOT_DETAILS_ROW}}` | Div avec détails (ou vide) | HTML conditionnel |
| `{{TOTAL_PC}}` | Nombre total de PC | `25` |
| `{{RECOND_COUNT}}` | Nombre de PC reconditionnés | `20` |
| `{{HS_COUNT}}` | Nombre de PC HS | `3` |
| `{{PENDING_COUNT}}` | Nombre de PC en attente | `2` |
| `{{ITEMS_ROWS}}` | Lignes du tableau des items | `<tr>...</tr><tr>...</tr>...` |

## 🎨 Personnalisation

### Ajouter un nouveau placeholder

1. **Dans `lot-template.html`** : Ajouter le placeholder
```html
<div class="info-row">
  <span class="info-label">Responsable :</span>
  <span class="info-value">{{RESPONSIBLE_NAME}}</span>
</div>
```

2. **Dans `pdfTemplateHelper.js`** : Ajouter la génération du placeholder
```javascript
function renderLotPDF(lot, items) {
  // ... code existant ...
  
  const replacements = {
    // ... existants ...
    '{{RESPONSIBLE_NAME}}': lot.responsible || 'Non assigné',
  };
  // ... reste du code ...
}
```

3. **Dans `lots.js`** : S'assurer que les données sont disponibles
```javascript
const lot = await dbPromise.get(`
  SELECT l.*, u.name as responsible
  FROM lots l
  LEFT JOIN users u ON l.responsible_id = u.id
  WHERE l.id = ?
`, [id]);
```

### Modifier les styles

Éditez simplement `/apps/server/public/css/lot-template.css` :

```css
/* Exemple: changer la couleur du header */
.header {
  border-bottom: 3px solid #votre-couleur;
}

/* Exemple: ajouter du contenu personnalisé */
.footer::before {
  content: 'Document confidentiel - ';
}
```

### Ajouter une section complète

1. **Ajouter le HTML dans le template** :
```html
<div class="info-section">
  <h2>📊 Nouvelle Section</h2>
  {{NEW_SECTION_CONTENT}}
</div>
```

2. **Créer une fonction dans le helper** :
```javascript
function generateNewSection(data) {
  return `
    <div class="info-row">
      <span class="info-label">Label :</span>
      <span class="info-value">${data.value}</span>
    </div>
  `;
}
```

3. **Ajouter à renderLotPDF** :
```javascript
const replacements = {
  // ... existants ...
  '{{NEW_SECTION_CONTENT}}': generateNewSection(lot),
};
```

## 🔧 Fonctions utilitaires disponibles

### `formatDate(dateStr)`
Formate une date ISO en français
```javascript
formatDate('2026-01-12T08:31:00Z') 
// → "12 janvier 2026 à 08:31"
```

### `getStateBadgeClass(state)`
Retourne la classe CSS du badge selon l'état
```javascript
getStateBadgeClass('À faire')      // → 'todo'
getStateBadgeClass('Reconditionné') // → 'recond'
getStateBadgeClass('HS')            // → 'hs'
getStateBadgeClass('Pour réparation') // → 'repair'
getStateBadgeClass('Pour pièces')   // → 'pieces'
```

### `generateItemsRows(items)`
Génère les lignes du tableau HTML
```javascript
const html = generateItemsRows(items);
```

## 📊 Données disponibles

### Objet `lot`
```javascript
{
  id: 1,
  lot_name: "Lot test",
  lot_details: "Détails du lot",
  created_at: "2026-01-12T08:31:00Z",
  finished_at: "2026-01-12T09:31:00Z", // ou null
  // ... autres champs de la table lots
}
```

### Objet `items` (array)
```javascript
[
  {
    id: 1,
    lot_id: 1,
    serial_number: "ABC123",
    type: "Laptop",
    marque_name: "Dell",
    modele_name: "Latitude",
    state: "À faire",
    state_changed_at: "2026-01-12T08:31:00Z",
    technician: "Jean Dupont",
    // ... autres champs de la table lot_items
  },
  // ... autres items
]
```

## 🚀 Déployer les changements

Après modification des fichiers :

1. **Redémarrer le serveur**
```bash
npm restart
```

2. **Générer un nouveau PDF** (il utilisera le template mis à jour)
```javascript
POST /api/lots/{id}/pdf
```

Les anciens PDFs (fichiers HTML) resteront inchangés jusqu'à ce qu'ils soient régénérés.

## ⚠️ Important

- Les placeholders doivent être entourés de `{{` et `}}`
- Les chemins relatifs dans le template doivent pointer vers `/css/lot-template.css`
- Les données complexes peuvent être générées par des fonctions (comme `generateItemsRows`)
- N'oubliez pas d'ajouter la génération du placeholder dans `renderLotPDF`

## 📂 Fichiers à connaître

| Fichier | Rôle |
|---------|------|
| `/apps/server/public/templates/lot-template.html` | Template HTML base |
| `/apps/server/public/css/lot-template.css` | Feuille de styles |
| `/apps/server/lib/pdfTemplateHelper.js` | Module de rendu |
| `/apps/server/routes/lots.js` | Route API (ligne 150+) |
| `/apps/server/public/pdfs/lot-*.html` | PDFs générés |

