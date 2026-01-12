/**
 * PDF TEMPLATE HELPER
 * Utility functions for rendering lot PDF templates
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

/**
 * Convertir une image en base64
 * @param {string} imagePath - Chemin de l'image
 * @returns {string} Data URL base64
 */
function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
  } catch (error) {
    console.error('❌ Erreur lors de la conversion de l\'image en base64:', imagePath, error);
    return '';
  }
}

/**
 * Formate une date en français
 * @param {string} dateStr - Date ISO string
 * @returns {string} Date formatée
 */
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Détermine la classe CSS pour le badge d'état
 * @param {string} state - État du lot/item
 * @returns {string} Classe CSS
 */
function getStateBadgeClass(state) {
  if (!state) return 'recond';
  
  const stateNormalized = state.trim();
  const stateMap = {
    'Reconditionnés': 'recond',
    'Reconditionné': 'recond',
    'HS': 'hs',
    'Pour pièces': 'pieces'
  };
  
  return stateMap[stateNormalized] || 'recond';
}

/**
 * Génère les lignes du tableau des items
 * @param {Array} items - Liste des items
 * @returns {string} HTML des lignes du tableau
 */
function generateItemsRows(items) {
  if (!items || items.length === 0) {
    return '<tr><td colspan="8" style="text-align: center; color: #999;">Aucun item</td></tr>';
  }

  return items.map((item, idx) => {
    const stateClass = getStateBadgeClass(item.state);
    console.log(`  📋 Item ${idx + 1}:`, {
      sn: item.serial_number,
      type: item.type,
      state: item.state,
      stateClass: stateClass,
      tech: item.technician,
      changed: item.state_changed_at
    });
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.serial_number || '-'}</td>
        <td>${item.marque_name || '-'}</td>
        <td>${item.modele_name || '-'}</td>
        <td>${item.type || '-'}</td>
        <td><span class="state-badge ${stateClass}">${item.state || '-'}</span></td>
        <td>${formatDate(item.state_changed_at)}</td>
        <td>${item.technician || '-'}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Génère la ligne du nom du lot (conditionnelle)
 * @param {Object} lot - Objet lot
 * @returns {string} HTML ou chaîne vide
 */
function generateLotNameRow(lot) {
  if (!lot.lot_name) return '';
  
  return `
    <div class="info-row">
      <span class="info-label">Nom du Lot :</span>
      <span class="info-value">${lot.lot_name}</span>
    </div>
  `;
}

/**
 * Génère la ligne des détails du lot (conditionnelle)
 * @param {Object} lot - Objet lot
 * @returns {string} HTML ou chaîne vide
 */
function generateLotDetailsRow(lot) {
  if (!lot.lot_details) return '';
  
  return `
    <div class="info-row">
      <span class="info-label">Détails :</span>
      <span class="info-value">${lot.lot_details}</span>
    </div>
  `;
}

/**
 * Remplir le template avec les données du lot
 * @param {Object} lot - Données du lot (id, created_at, finished_at, recovered_at, lot_name, lot_details)
 * @param {Array} items - Items du lot
 * @returns {string} HTML complet du PDF
 */
function renderLotPDF(lot, items) {
  // Lire le template
  const templatePath = path.join(__dirname, '..', 'public', 'templates', 'lot-template.html');
  let html = fs.readFileSync(templatePath, 'utf-8');

  // Debug: afficher les données reçues
  console.log('📄 Génération PDF - Lot:', { id: lot.id, name: lot.lot_name, finished_at: lot.finished_at });
  console.log('📄 Génération PDF - Items:', items.map(i => ({ sn: i.serial_number, state: i.state, tech: i.technician, changed: i.state_changed_at })));

  // Convertir les images en base64
  const iconsDir = path.join(__dirname, '..', 'public', 'templates', 'icons');
  const lotIcon = imageToBase64(path.join(iconsDir, 'lot.png'));
  const infoIcon = imageToBase64(path.join(iconsDir, 'info.png'));
  const pcIcon = imageToBase64(path.join(iconsDir, 'pc.png'));

  // Remplacer les chemins d'images par des data URLs
  html = html.replace(/src="\/templates\/icons\/lot\.png"/g, `src="${lotIcon}"`);
  html = html.replace(/src="\/templates\/icons\/info\.png"/g, `src="${infoIcon}"`);
  html = html.replace(/src="\/templates\/icons\/pc\.png"/g, `src="${pcIcon}"`);

  // Calculer les statistiques
  const total = items.length;
  const recond = items.filter(i => i.state === 'Reconditionnés' || i.state === 'Reconditionné').length;
  const pieces = items.filter(i => i.state === 'Pour pièces').length;
  const hs = items.filter(i => i.state === 'HS').length;

  // Remplacer les placeholders
  const replacements = {
    '{{LOT_ID}}': lot.id,
    '{{LOT_NAME_ROW}}': lot.lot_name || 'Sans nom',
    '{{CREATED_AT}}': formatDate(lot.created_at),
    '{{FINISHED_AT}}': lot.finished_at ? formatDate(lot.finished_at) : '-',
    '{{RECOVERED_AT}}': lot.recovered_at ? formatDate(lot.recovered_at) : '-',
    '{{TOTAL_PC}}': total,
    '{{RECOND_COUNT}}': recond,
    '{{PIECES_COUNT}}': pieces,
    '{{HS_COUNT}}': hs,
    '{{ITEMS_ROWS}}': generateItemsRows(items)
  };

  // Appliquer toutes les remplacements
  Object.entries(replacements).forEach(([placeholder, value]) => {
    html = html.replace(new RegExp(placeholder, 'g'), value);
  });

  return html;
}

/**
 * Convertir le HTML en PDF avec Puppeteer
 * @param {string} html - Contenu HTML
 * @param {string} outputPath - Chemin du fichier PDF de sortie
 * @returns {Promise<void>}
 */
async function convertHtmlToPdf(html, outputPath) {
  let browser;
  try {
    console.log('🖨️ Lancement de Puppeteer...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Charger le HTML avec les styles
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });
    
    // Générer le PDF
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    console.log('✅ PDF généré avec succès:', outputPath);
  } catch (error) {
    console.error('❌ Erreur lors de la conversion HTML → PDF:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  formatDate,
  getStateBadgeClass,
  generateItemsRows,
  generateLotNameRow,
  generateLotDetailsRow,
  renderLotPDF,
  convertHtmlToPdf
};
