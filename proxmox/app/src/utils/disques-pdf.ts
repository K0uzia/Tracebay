/**
 * Génération PDF des sessions disques shreddés (traçabilité).
 * Utilise PDFKit pour produire un PDF avec : infos session, count/size par interface, méthode, tableau des disques.
 * Stockage sous /mnt/team/#TEAM/#TRAÇABILITÉ/Disques/AAAA/Mois (convention alignée avec l'app Electron).
 */

import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';

/** Base traçabilité (override par TRACABILITE_BASE ou DISQUES_PDF_BASE) */
const TRACABILITE_BASE = process.env.TRACABILITE_BASE || '/mnt/team/#TEAM/#TRAÇABILITÉ';
/** Dossier racine des PDF disques : .../Disques */
export const DISQUES_PDF_BASE = process.env.DISQUES_PDF_BASE || path.join(TRACABILITE_BASE, 'Disques');

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export interface DisquesSessionForPath {
  id: number;
  date?: string | Date;
  name?: string | null;
}

/**
 * Calcule le chemin complet du PDF pour une session disques, crée le dossier si besoin.
 * Structure : DISQUES_PDF_BASE/AAAA/NomDuMois/NomSession_YYYY-MM-DD.pdf
 * Garantit l'existence de .../TRAÇABILITÉ/Disques puis Disques/AAAA/Mois.
 */
export function buildDisquesPdfPath(session: DisquesSessionForPath): string {
  const baseResolved = path.resolve(DISQUES_PDF_BASE);
  fs.mkdirSync(baseResolved, { recursive: true });
  const rawDate = session.date != null
    ? (typeof session.date === 'string' ? session.date : (session.date as Date).toISOString?.()?.slice(0, 10))
    : '';
  const dateStr = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const year = dateStr.slice(0, 4);
  const monthNum = parseInt(dateStr.slice(5, 7), 10) || 1;
  const monthName = MONTH_NAMES[Math.max(0, monthNum - 1)] || 'Janvier';
  const dirPath = path.join(baseResolved, year, monthName);
  fs.mkdirSync(dirPath, { recursive: true });
  const sanitizedName = (session.name != null ? String(session.name).trim() : '')
    .replace(/\s+/g, '_')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();
  const baseName = sanitizedName || `disques-session-${session.id}`;
  const fileName = `${baseName}_${dateStr}.pdf`;
  return path.resolve(path.join(dirPath, fileName));
}

/** Taille totale de tous les disques en To (somme des parseSizeToTo). */
export function getTotalSizeTo(disks: DisqueRow[]): number {
  return disks.reduce((sum, d) => sum + parseSizeToTo(d.size), 0);
}

/** Chaîne affichable pour la taille totale : "12 To", "12,5 To" ou "0 To". */
export function formatTotalSize(disks: DisqueRow[]): string {
  const to = getTotalSizeTo(disks);
  return `${formatTo(to)} To`;
}

export interface DisqueRow {
  serial: string;
  marque?: string;
  modele?: string;
  size?: string;
  disk_type?: string;
  interface?: string;
  shred?: string;
}

/**
 * Parse size string to To (number).
 * Accepte : "4 To", "4To", "4 TB", "500 Go", "500Go", "500 GB", "250 Mo", "250 Mo", etc.
 */
function parseSizeToTo(size: string | undefined): number {
  if (!size || typeof size !== 'string') return 0;
  const s = size.trim();
  if (!s) return 0;
  const numMatch = s.match(/^([\d\s,]+(?:\.[\d]+)?)\s*(To|TB|Go|GB|Mo|MB|Ko|KB)?$/i);
  if (!numMatch) return 0;
  const num = parseFloat(numMatch[1].replace(/\s/g, '').replace(',', '.')) || 0;
  const unit = (numMatch[2] || '').toLowerCase();
  if (unit === 'to' || unit === 'tb') return num;
  if (unit === 'go' || unit === 'gb') return num / 1000;
  if (unit === 'mo' || unit === 'mb') return num / 1_000_000;
  if (unit === 'ko' || unit === 'kb') return num / 1_000_000_000;
  if (unit === '') return num;
  return 0;
}

/** Build count_by_interface: "5 SATA, 3 SAS — Total : 8 disques" */
export function buildCountByInterface(disks: DisqueRow[]): string {
  const byIf: Record<string, number> = {};
  for (const d of disks) {
    const iface = (d.interface || '-').trim() || '-';
    byIf[iface] = (byIf[iface] || 0) + 1;
  }
  const parts = Object.entries(byIf)
    .filter(([, n]) => n > 0)
    .map(([iface, n]) => `${n} ${iface}`)
    .sort((a, b) => a.localeCompare(b));
  const total = disks.length;
  if (parts.length === 0) return `Total : ${total} disque(s)`;
  return `${parts.join(', ')} — Total : ${total} disque(s)`;
}

/** Build size_by_interface: "SATA : 9 To, SAS : 6 To" — affiche toutes les interfaces, même 0 To */
export function buildSizeByInterface(disks: DisqueRow[]): string {
  const byIf: Record<string, number> = {};
  for (const d of disks) {
    const iface = (d.interface || '-').trim() || '-';
    const to = parseSizeToTo(d.size);
    byIf[iface] = (byIf[iface] || 0) + to;
  }
  const parts = Object.entries(byIf)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([iface, to]) => `${iface} : ${formatTo(to)} To`);
  return parts.length ? parts.join(', ') : '—';
}

function formatTo(to: number): string {
  if (to % 1 === 0) return String(Math.round(to));
  return to.toFixed(2).replace(/\.?0+$/, '');
}

function escapePdfText(s: string | undefined): string {
  if (s == null) return '-';
  return String(s).trim() || '-';
}

/** Couleurs alignées sur le template CSS (disques.html / disques.css) */
const PDF_COLORS = {
  primary: '#2D3073',
  value: '#3E3B8C',
  text: '#1a1a1a',
  label: '#444444',
  tableHeaderBg: '#f5f5f5',
  tableBorder: '#2D3073',
  rowAlt: '#fafafa',
  borderLight: '#e0e0e0'
};

/**
 * Generate PDF buffer for a disques session.
 * Style aligné sur le template (en-tête #2D3073, bordures, tableau, taille totale affichée).
 */
export function generateDisquesPdf(sessionDate: string, disks: DisqueRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = 50;
    let y = margin;

    // —— En-tête (style .pdf-header) ———
    doc.fontSize(22).font('Helvetica-Bold').fillColor(PDF_COLORS.primary);
    doc.text('Certificat d\'effacement sécurisé des données', margin, y);
    y = doc.y + 12;
    doc.moveTo(margin, y).lineTo(545, y).strokeColor(PDF_COLORS.tableBorder).lineWidth(2).stroke();
    y += 16;

    // —— Bloc infos session (style .pdf-info) ———
    doc.fontSize(12).font('Helvetica-Bold').fillColor(PDF_COLORS.text).text('Informations de la session', margin, y);
    y += 14;
    doc.fontSize(10).font('Helvetica');
    doc.fillColor(PDF_COLORS.label).text('Date : ', margin, y);
    doc.fillColor(PDF_COLORS.value).text(escapePdfText(sessionDate), margin + 120, y);
    y += 14;
    doc.fillColor(PDF_COLORS.label).text('Nombre de disques : ', margin, y);
    doc.fillColor(PDF_COLORS.value).text(buildCountByInterface(disks), margin + 120, y);
    y += 14;
    doc.fillColor(PDF_COLORS.label).text('Taille totale : ', margin, y);
    doc.fillColor(PDF_COLORS.value).text(formatTotalSize(disks), margin + 120, y);
    y += 14;
    doc.fillColor(PDF_COLORS.label).text('Taille totale par interface : ', margin, y);
    doc.fillColor(PDF_COLORS.value).text(buildSizeByInterface(disks), margin + 120, y);
    y += 20;

    // —— Méthode (style .pdf-method) ———
    doc.fontSize(12).font('Helvetica-Bold').fillColor(PDF_COLORS.text).text('Méthode', margin, y);
    y += 14;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(PDF_COLORS.primary).text('Méthode utilisée pour les HDD', margin, y);
    y = doc.y + 6;
    doc.fontSize(10).font('Helvetica').fillColor(PDF_COLORS.text);
    doc.text('Le protocole DoD 5220.22-M via la commande « shred » très souvent utilisé et présent sur tous les logiciels phare du marché. Quatre passes sont appliquées sur chaque disque dur. Ceci permet l\'assurance d\'un niveau « clear » absolu.', margin, y, { align: 'justify', width: 495 });
    y = doc.y + 10;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(PDF_COLORS.primary).text('Méthode utilisée pour les SSD', margin, y);
    y = doc.y + 6;
    doc.fontSize(10).font('Helvetica').fillColor(PDF_COLORS.text);
    doc.text('Secure Erase + Sanitize : niveau « clear » en une passe sur support Flash (E). Ceci permet de préserver les SSD fonctionnels et réemployables à 98 %.', margin, y, { align: 'justify', width: 495 });
    y = doc.y + 10;
    doc.fontSize(11).font('Helvetica-Bold').fillColor(PDF_COLORS.primary).text('Méthode utilisée pour les disques endommagés', margin, y);
    y = doc.y + 6;
    doc.fontSize(10).font('Helvetica').fillColor(PDF_COLORS.text);
    doc.text('Destruction physique par perçage ; niveaux H2-H3 et E1-E2 (DIN).', margin, y, { align: 'justify', width: 495 });
    y = doc.y + 18;

    // —— Détail des disques (style .pdf-detail / .pdf-table) ———
    doc.fontSize(12).font('Helvetica-Bold').fillColor(PDF_COLORS.text).text('Détail des disques', margin, y);
    y += 14;

    const colWidths = [25, 80, 50, 55, 45, 35, 50, 75];
    const headers = ['N°', 'S/N', 'Marque', 'Modèle', 'Taille', 'Type', 'Interface', 'Shred'];
    const tableLeft = margin;
    const headerY = y;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(PDF_COLORS.text);
    let x = tableLeft;
    headers.forEach((h, i) => {
      doc.rect(x, headerY - 4, colWidths[i], 18).fillAndStroke(PDF_COLORS.tableHeaderBg, PDF_COLORS.tableBorder);
      doc.fillColor(PDF_COLORS.text).text(h, x + 4, headerY + 2, { width: colWidths[i] - 6, align: 'left' });
      x += colWidths[i];
    });
    y = headerY + 18;
    doc.moveTo(tableLeft, y).lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), y).strokeColor(PDF_COLORS.tableBorder).lineWidth(1).stroke();
    y += 10;

    let rowY = y;
    doc.font('Helvetica').fontSize(9);
    disks.forEach((d, idx) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }
      if (idx % 2 === 1) {
        let rx = tableLeft;
        colWidths.forEach((w) => {
          doc.rect(rx, rowY - 2, w, 16).fillColor(PDF_COLORS.rowAlt).strokeColor(PDF_COLORS.borderLight).fillAndStroke();
          rx += w;
        });
      }
      doc.fillColor(PDF_COLORS.text);
      const row = [
        String(idx + 1),
        escapePdfText(d.serial),
        escapePdfText(d.marque),
        escapePdfText(d.modele),
        escapePdfText(d.size),
        escapePdfText(d.disk_type),
        escapePdfText(d.interface),
        escapePdfText(d.shred)
      ];
      x = tableLeft;
      row.forEach((cell, i) => {
        doc.text(cell, x + 4, rowY + 2, { width: colWidths[i] - 6, align: 'left' });
        x += colWidths[i];
      });
      rowY += 16;
    });

    doc.end();
  });
}
