/**
 * Script pour régénérer tous les PDFs des lots terminés
 */

const db = require('./database.js');
const { renderLotPDF, convertHtmlToPdf } = require('./lib/pdfTemplateHelper.js');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const dbPromise = {
  all: promisify(db.all.bind(db)),
  get: promisify(db.get.bind(db)),
  run: promisify(db.run.bind(db))
};

async function regenerateAllPDFs() {
  try {
    console.log('🔄 Régénération de tous les PDFs...\n');

    // Récupérer tous les lots terminés
    const lots = await dbPromise.all(`SELECT * FROM lots WHERE finished_at IS NOT NULL`);
    
    if (lots.length === 0) {
      console.log('ℹ️  Aucun lot terminé trouvé.');
      process.exit(0);
    }

    console.log(`📦 ${lots.length} lot(s) terminé(s) trouvé(s)\n`);

    for (const lot of lots) {
      console.log(`📄 Génération du PDF pour le lot #${lot.id}...`);
      
      // Récupérer les items du lot
      const items = await dbPromise.all(`
        SELECT 
          li.id,
          li.lot_id,
          li.serial_number,
          li.type,
          li.marque_id,
          li.modele_id,
          li.state,
          li.state_changed_at,
          li.technician,
          m.name as marque_name, 
          mod.name as modele_name
        FROM lot_items li
        LEFT JOIN marques m ON li.marque_id = m.id
        LEFT JOIN modeles mod ON li.modele_id = mod.id
        WHERE li.lot_id = ? 
        ORDER BY li.id ASC
      `, [lot.id]);

      // Générer le HTML
      const html = renderLotPDF(lot, items);

      // Créer le répertoire s'il n'existe pas
      const pdfDir = path.join(__dirname, 'public', 'pdfs');
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
      
      // Générer le PDF avec Puppeteer
      const pdfFilePath = path.join(pdfDir, `lot-${lot.id}.pdf`);
      await convertHtmlToPdf(html, pdfFilePath);

      // Mettre à jour la base de données
      const publicPath = `/pdfs/lot-${lot.id}.pdf`;
      await dbPromise.run(`UPDATE lots SET pdf_path = ? WHERE id = ?`, [publicPath, lot.id]);
      
      console.log(`✅ PDF généré: ${publicPath}\n`);
    }

    console.log('🎉 Tous les PDFs ont été régénérés avec succès !');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la régénération des PDFs:', error);
    process.exit(1);
  }
}

// Attendre que la DB soit initialisée
setTimeout(() => {
  regenerateAllPDFs();
}, 1000);
