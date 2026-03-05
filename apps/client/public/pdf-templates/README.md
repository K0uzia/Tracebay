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

---

## Template PDF – Sessions disques

- **disques.html** : même structure que lot, adapté aux disques (date, nombre, tableau complet).
- **disques.css** : même mise en page que lot.css.

### Placeholders session disques

| Placeholder       | Description |
|-------------------|-------------|
| `{{date}}`        | Date de la session (ex. 2026-03-05) |
| `{{count_by_interface}}` | Nombre par interface puis total. Ex. : « 5 SATA, 3 SAS — Total : 8 disques » (n’afficher que les interfaces présentes). |
| `{{size_by_interface}}` | Taille totale par interface. Ex. : « SATA : 9 To, SAS : 6 To ». Pour chaque interface, sommer les tailles des disques (parser « X To » → X, « X Go » → X/1000 ; « autre »/custom au choix). |
| `{{summary_block}}` | Bloc HTML : résumé (ex. X disque(s) au total) |
| `{{items_rows}}`  | Lignes `<tr>` : N°, S/N, Marque, Modèle, Taille, Type (HDD/SSD), Interface, Shred |

**Calcul côté backend (exemple)**  
- `count_by_interface` : grouper les disques par `interface`, compter, puis formater « n1 SATA, n2 SAS, … — Total : N disques ».  
- `size_by_interface` : grouper par `interface`, pour chaque disque parser `size` (ex. « 4 To » → 4, « 500 Go » → 0.5), sommer par interface, formater « SATA : 9 To, SAS : 6 To ».

**Important : PDF généré côté serveur**  
Le PDF des sessions disques est généré par le serveur (PDFKit), pas à partir du template HTML de ce dossier. Il n’y a donc pas d’application de CSS comme pour le template ; le rendu dépend uniquement du code serveur. Le serveur **doit** inclure dans le PDF la ligne **« Taille totale par interface »** (valeur `size_by_interface`) pour que l’utilisateur voie le total. Les templates `disques.html` et `disques.css` servent de référence visuelle uniquement.
