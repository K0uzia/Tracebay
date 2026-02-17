# Templates PDF – Lots (traçabilité)

Les PDF des lots sont générés à partir des fichiers de ce dossier. Vous pouvez modifier **lot.html** et **lot.css** pour personnaliser entièrement le rendu.

## Fichiers

- **lot.html** : structure du document. Utilisez les placeholders ci-dessous pour injecter les données.
- **lot.css** : mise en forme. Le CSS est chargé automatiquement (inliné dans le PDF).

## Placeholders disponibles

| Placeholder         | Description                          |
|---------------------|--------------------------------------|
| `{{lotId}}`         | Identifiant du lot                   |
| `{{lotName}}`       | Nom du lot                           |
| `{{created_at}}`    | Date/heure de création (formatée)    |
| `{{finished_at}}`   | Date/heure de fin (formatée)         |
| `{{recovered_at}}`  | Date/heure de récupération (formatée)|
| `{{totalItems}}`    | Nombre total de machines             |
| `{{type_summary}}`  | Bloc HTML : quantités par type (ex. Portable : 5) |
| `{{state_summary}}` | Bloc HTML : quantités par état (Reconditionnés, Pour pièces, HS, Non défini), y compris 0 |
| `{{items_rows}}`    | Bloc HTML : lignes `<tr>` du tableau (N°, S/N, Type, Marque, Modèle, État, Technicien, Date/Heure) |

Les valeurs sont échappées pour l’affichage HTML. Si un template n’existe pas ou une erreur survient, l’application utilise l’ancienne génération PDF (PDFKit).
