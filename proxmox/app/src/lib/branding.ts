/**
 * Réglage d'atelier imprimé sur les PDF : nom et logo, partagés par tous les postes.
 * Stocké dans app_settings (clés branding.*), lu publiquement, modifié par l'administrateur.
 */

export const BRANDING_KEYS = { name: 'branding.company_name', logo: 'branding.logo', pdfColor: 'branding.pdf_color' } as const;
export const DEFAULT_COMPANY_NAME = 'Tracebay';
export const LOGO_MAX_BYTES = 512 * 1024;
export const NAME_MAX_LENGTH = 120;
// Bleu des gabarits PDF, remplacé par la couleur de l'atelier ; même seuil que la portable.
export const PDF_BLUE = '#2D3073';
export const PDF_COLOR_MIN_CONTRAST = 3;

export interface Branding {
  company_name: string;
  logo: string | null;
  pdf_color: string | null;
}

export interface BrandingStore {
  get(keys: string[]): Promise<Record<string, string | null>>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// Pas de SVG : il peut contenir du script et serait rendu dans la fenêtre de génération des PDF.
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

export class BrandingError extends Error {}

/** Renvoie un data URL normalisé, ou lève BrandingError avec un message affichable. */
export function validateLogo(dataUrl: unknown): string {
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl ?? '').trim());
  if (!m) throw new BrandingError('Logo invalide : image PNG, JPEG ou WebP attendue.');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length === 0) throw new BrandingError('Logo vide.');
  if (bytes.length > LOGO_MAX_BYTES) throw new BrandingError('Le logo dépasse 512 Ko.');
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) throw new BrandingError('Format de logo accepté : PNG, JPEG ou WebP (pas de SVG).');
  return `data:${sig.mime};base64,${bytes.toString('base64')}`;
}

export function validateName(name: unknown): string {
  const value = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!value) throw new BrandingError("Le nom de l'atelier est obligatoire.");
  if (value.length > NAME_MAX_LENGTH) throw new BrandingError(`Le nom de l'atelier dépasse ${NAME_MAX_LENGTH} caractères.`);
  return value;
}

/** Contraste d'une couleur #RRVVBB avec le blanc (WCAG). */
export function contrastWithWhite(hex: string): number {
  const lum = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return 1.05 / (l + 0.05);
}

/** Couleur des en-têtes de PDF : #RRVVBB assez foncé pour un texte blanc ; renvoyée en majuscules. */
export function validateColor(color: unknown): string {
  const value = String(color ?? '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new BrandingError('Couleur invalide : format attendu #RRVVBB.');
  if (contrastWithWhite(value) < PDF_COLOR_MIN_CONTRAST) {
    throw new BrandingError('Couleur trop claire : le texte des PDF deviendrait illisible sur fond blanc. Choisissez une teinte plus foncée.');
  }
  return value.toUpperCase();
}

export async function readBranding(store: BrandingStore): Promise<Branding> {
  const rows = await store.get([BRANDING_KEYS.name, BRANDING_KEYS.logo, BRANDING_KEYS.pdfColor]);
  return {
    company_name: rows[BRANDING_KEYS.name]?.trim() || DEFAULT_COMPANY_NAME,
    logo: rows[BRANDING_KEYS.logo] || null,
    pdf_color: rows[BRANDING_KEYS.pdfColor] || null,
  };
}
