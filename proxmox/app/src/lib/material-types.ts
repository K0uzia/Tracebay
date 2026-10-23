/**
 * Types de matériel de l'atelier : liste partagée par tous les postes, modifiée par l'administrateur.
 * Stockée dans app_settings (clé material.types, tableau JSON de libellés). Sur un article, la valeur
 * enregistrée est le libellé lui-même (comme dans la portable) ; les anciens codes portable, fixe et
 * ecran restent lisibles côté poste, et un type retiré de la liste n'efface rien en base.
 */
import { BrandingStore } from './branding';

export const TYPES_KEY = 'material.types';
// Liste de départ tant que l'administrateur n'a rien enregistré : correspond aux codes déjà en base.
export const DEFAULT_TYPES = ['Portable', 'Fixe', 'Écran'];
export const TYPE_MAX_LENGTH = 40;
export const TYPES_MAX = 50;

export class MaterialTypesError extends Error {}

/** Normalise et valide une liste de types ; lève MaterialTypesError avec un message affichable. */
export function validateTypes(input: unknown): string[] {
  if (!Array.isArray(input)) throw new MaterialTypesError('Liste de types attendue.');
  const vus = new Set<string>();
  const types: string[] = [];
  for (const brut of input) {
    const t = String(brut ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (t.length > TYPE_MAX_LENGTH) {
      throw new MaterialTypesError(`Le type « ${t.slice(0, 20)}… » dépasse ${TYPE_MAX_LENGTH} caractères.`);
    }
    if (vus.has(t.toLowerCase())) throw new MaterialTypesError(`Le type « ${t} » est en double.`);
    vus.add(t.toLowerCase());
    types.push(t);
  }
  if (types.length > TYPES_MAX) throw new MaterialTypesError(`${TYPES_MAX} types au maximum.`);
  return types;
}

/** Liste enregistrée, ou liste de départ si rien n'est enregistré (ou valeur illisible). */
export async function readTypes(store: BrandingStore): Promise<{ types: string[]; parDefaut: boolean }> {
  const brut = (await store.get([TYPES_KEY]))[TYPES_KEY];
  if (!brut) return { types: [...DEFAULT_TYPES], parDefaut: true };
  try {
    return { types: validateTypes(JSON.parse(brut)), parDefaut: false };
  } catch {
    return { types: [...DEFAULT_TYPES], parDefaut: true };
  }
}
