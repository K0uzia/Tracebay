/**
 * Génération PDF des sessions disques shreddés (traçabilité).
 * Utilise PDFKit pour produire un PDF avec : infos session, count/size par interface, méthode, tableau des disques.
 */

import PDFDocument from 'pdfkit';

export interface DisqueRow {
  serial: string;
  marque?: string;
  modele?: string;
  size?: string;
  disk_type?: string;
  interface?: string;
  shred?: string;
}

/** Parse size string to To (number). "4 To" -> 4, "500 Go" -> 0.5, "autre"/"" -> 0 */
function parseSizeToTo(size: string | undefined): number {
  if (!size || typeof size !== 'string') return 0;
  const s = size.trim();
  const toMatch = s.match(/^([\d,]+(?:\.[\d]+)?)\s*To$/i);
  if (toMatch) return parseFloat(toMatch[1].replace(',', '.')) || 0;
  const goMatch = s.match(/^([\d,]+(?:\.[\d]+)?)\s*Go$/i);
  if (goMatch) return (parseFloat(goMatch[1].replace(',', '.')) || 0) / 1000;
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

/** Build size_by_interface: "SATA : 9 To, SAS : 6 To" */
export function buildSizeByInterface(disks: DisqueRow[]): string {
  const byIf: Record<string, number> = {};
  for (const d of disks) {
    const iface = (d.interface || '-').trim() || '-';
    const to = parseSizeToTo(d.size);
    byIf[iface] = (byIf[iface] || 0) + to;
  }
  const parts = Object.entries(byIf)
    .filter(([, to]) => to > 0)
    .map(([iface, to]) => `${iface} : ${formatTo(to)} To`)
    .sort((a, b) => a.localeCompare(b));
  return parts.length ? parts.join(', ') : '-';
}

function formatTo(to: number): string {
  if (to % 1 === 0) return String(Math.round(to));
  return to.toFixed(2).replace(/\.?0+$/, '');
}

function escapePdfText(s: string | undefined): string {
  if (s == null) return '-';
  return String(s).trim() || '-';
}

/**
 * Generate PDF buffer for a disques session.
 */
export function generateDisquesPdf(sessionDate: string, disks: DisqueRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const title = 'Certificat d\'effacement sécurisé des données';
    doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Date : ${escapePdfText(sessionDate)}`, { align: 'left' });
    doc.text(`Nombre de disques : ${buildCountByInterface(disks)}`, { align: 'left' });
    doc.text(`Taille totale par interface : ${buildSizeByInterface(disks)}`, { align: 'left' });
    doc.moveDown(1);

    doc.fontSize(11).font('Helvetica-Bold').text('Méthode', { align: 'left' });
    doc.fontSize(9).font('Helvetica');
    doc.text('Méthode utilisée pour les HDD', { continued: false });
    doc.text('Le protocole DoD 5220.22-M via la commande « shred » très souvent utilisé et présent sur tous les logiciels phare du marché. Quatre passes sont appliquées sur chaque disque dur. Ceci permet l\'assurance d\'un niveau « clear » absolu.', { align: 'justify' });
    doc.text('Méthode utilisée pour les SSD', { continued: false });
    doc.text('Secure Erase + Sanitize : niveau « clear » en une passe sur support Flash (E). Ceci permet de préserver les SSD fonctionnels et réemployables à 98 %.', { align: 'justify' });
    doc.text('Méthode utilisée pour les disques endommagés', { continued: false });
    doc.text('Destruction physique par perçage ; niveaux H2-H3 et E1-E2 (DIN).', { align: 'justify' });
    doc.moveDown(1);

    doc.fontSize(11).font('Helvetica-Bold').text('Détail des disques', { align: 'left' });
    doc.moveDown(0.3);

    const colWidths = [25, 80, 50, 55, 45, 35, 50, 75];
    const headers = ['N°', 'S/N', 'Marque', 'Modèle', 'Taille', 'Type', 'Interface', 'Shred'];
    const startY = doc.y;
    doc.fontSize(8).font('Helvetica-Bold');
    let x = 50;
    headers.forEach((h, i) => {
      doc.text(h, x, startY, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    doc.moveDown(0.4);
    let rowY = doc.y;
    doc.font('Helvetica');
    disks.forEach((d, idx) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }
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
      x = 50;
      row.forEach((cell, i) => {
        doc.text(cell, x, rowY, { width: colWidths[i], align: 'left' });
        x += colWidths[i];
      });
      rowY += 18;
    });

    doc.end();
  });
}
