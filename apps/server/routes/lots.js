const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { dbPromise } = require('../database.js');
const { renderLotPDF, convertHtmlToPdf } = require('../lib/pdfTemplateHelper.js');

// Helper: compute lot finished status
async function computeAndUpdateLotFinished(lotId) {
  const row = await dbPromise.get(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN state IS NULL OR state = '' THEN 1 ELSE 0 END) AS pending
     FROM lot_items WHERE lot_id = ?`, [lotId]
  );
  const pending = row?.pending || 0;
  const total = row?.total || 0;

  // Un lot est terminé si tous les items ont un état défini
  if (total > 0 && pending === 0) {
    // Vérifier si le lot était déjà terminé
    const lot = await dbPromise.get('SELECT finished_at FROM lots WHERE id = ?', [lotId]);
    const wasFinished = lot?.finished_at !== null;

    // Marquer comme terminé avec la date actuelle si pas déjà fait
    await dbPromise.run('UPDATE lots SET finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP) WHERE id = ?', [lotId]);

    // Générer le PDF automatiquement si le lot vient d'être terminé
    if (!wasFinished) {
      console.log(`🎉 Lot ${lotId} terminé - Génération automatique du PDF...`);
      await generatePDF(lotId);
    }

    return true;
  }
  return false;
}

/**
 * Génère le PDF pour un lot
 * @param {number} lotId - ID du lot
 * @returns {Promise<string>} Chemin du PDF généré
 */
async function generatePDF(lotId) {
  try {
    // Récupérer les données du lot
    const lot = await dbPromise.get('SELECT * FROM lots WHERE id = ?', [lotId]);
    if (!lot) throw new Error('Lot introuvable');

    // Récupérer les items du lot avec les noms de marque et modèle
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
    `, [lotId]);

    // Générer le HTML du PDF en utilisant le template
    const html = renderLotPDF(lot, items);

    // Créer le répertoire s'il n'existe pas
    const pdfDir = path.join(__dirname, '..', 'public', 'pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    // Générer le PDF avec Puppeteer
    const pdfFilePath = path.join(pdfDir, `lot-${lotId}.pdf`);
    await convertHtmlToPdf(html, pdfFilePath);

    // Mettre à jour la base de données avec le chemin du PDF
    const publicPath = `/pdfs/lot-${lotId}.pdf`;
    await dbPromise.run('UPDATE lots SET pdf_path = ? WHERE id = ?', [publicPath, lotId]);

    console.log(`✅ PDF généré: ${publicPath}`);
    return publicPath;
  } catch (error) {
    console.error(`❌ Erreur génération PDF pour lot ${lotId}:`, error);
    throw error;
  }
}

// Create a new lot with items
router.post('/', async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const { lotName, lotDetails } = req.body || {};
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Aucun item à enregistrer' });
    }
    const lotId = await dbPromise.transaction(async () => {
      const result = await dbPromise.run(
        'INSERT INTO lots (lot_name, lot_details) VALUES (?, ?)',
        [lotName || null, lotDetails || null]
      );
      const id = result.id;
      for (const it of items) {
        await dbPromise.run(
          `INSERT INTO lot_items (lot_id, serial_number, type, marque_id, modele_id, entry_type, date, time, state_changed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [id, it.serialNumber || null, it.type || null, it.marqueId || null, it.modeleId || null, it.entryType || null, it.date || null, it.time || null]
        );
      }
      return id;
    });
    res.json({ success: true, id: lotId, total: items.length });
  } catch (error) {
    console.error('❌ POST /api/lots error:', error);
    res.status(500).json({ success: false, message: 'Erreur création lot' });
  }
});

// List lots with items; status=active|finished|all
router.get('/', async (req, res) => {
  try {
    const status = (req.query.status || 'all').toLowerCase();
    // Get lots
    const lots = await dbPromise.all(`
      SELECT l.id, l.created_at, l.finished_at, l.recovered_at, l.pdf_path, l.lot_name, l.lot_details,
             COUNT(li.id) as total,
             SUM(CASE WHEN li.state = 'À faire' THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN li.state = 'Reconditionnés' THEN 1 ELSE 0 END) as recond,
             SUM(CASE WHEN li.state = 'Pour pièces' THEN 1 ELSE 0 END) as pieces,
             SUM(CASE WHEN li.state = 'HS' THEN 1 ELSE 0 END) as hs
      FROM lots l
      LEFT JOIN lot_items li ON li.lot_id = l.id
      GROUP BY l.id
      ORDER BY l.id DESC
    `);

    let filtered = lots;
    if (status === 'active') filtered = lots.filter(l => (l.pending || 0) > 0);
    else if (status === 'finished') filtered = lots.filter(l => (l.pending || 0) === 0 && (l.total || 0) > 0);

    // Attach items for each lot
    const withItems = [];
    for (const lot of filtered) {
      const items = await dbPromise.all(`
        SELECT li.id, li.serial_number, li.type, li.marque_id, li.modele_id, 
               m.name as marque_name, mod.name as modele_name,
               li.entry_type, li.date, li.time, li.state, li.technician, li.state_changed_at
        FROM lot_items li
        LEFT JOIN marques m ON li.marque_id = m.id
        LEFT JOIN modeles mod ON li.modele_id = mod.id
        WHERE li.lot_id = ? ORDER BY li.id ASC
      `, [lot.id]);
      withItems.push({ ...lot, items });
    }

    res.json({ success: true, items: withItems });
  } catch (error) {
    console.error('❌ GET /api/lots error:', error);
    res.status(500).json({ success: false, message: 'Erreur récupération lots' });
  }
});

// Get one lot with items
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lot = await dbPromise.get('SELECT id, created_at, finished_at, pdf_path, lot_name, lot_details FROM lots WHERE id = ?', [id]);
    if (!lot) return res.status(404).json({ success: false, message: 'Lot introuvable' });
    const items = await dbPromise.all(`
      SELECT li.id, li.serial_number, li.type, li.marque_id, li.modele_id,
             m.name as marque_name, mod.name as modele_name,
             li.entry_type, li.date, li.time, li.state, li.technician, li.state_changed_at
      FROM lot_items li
      LEFT JOIN marques m ON li.marque_id = m.id
      LEFT JOIN modeles mod ON li.modele_id = mod.id
      WHERE li.lot_id = ? ORDER BY li.id ASC
    `, [id]);
    res.json({ success: true, item: { ...lot, items } });
  } catch (error) {
    console.error('❌ GET /api/lots/:id error:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
});

// Update lot (lot_name)
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { lot_name, recovered_at } = req.body || {};

    // Si lot_name est fourni, le mettre à jour
    if (lot_name !== undefined) {
      await dbPromise.run('UPDATE lots SET lot_name = ? WHERE id = ?', [lot_name, id]);
    }

    // Si recovered_at est fourni (true pour marquer comme récupéré, false pour annuler)
    if (recovered_at !== undefined) {
      const value = recovered_at ? new Date().toISOString() : null;
      await dbPromise.run('UPDATE lots SET recovered_at = ? WHERE id = ?', [value, id]);

      // Régénérer le PDF avec la date de récupération
      if (recovered_at) {
        console.log(`📦 Lot ${id} marqué comme récupéré - Régénération du PDF...`);
        await generatePDF(id);
      }
    }

    const lot = await dbPromise.get('SELECT id, created_at, finished_at, recovered_at, lot_name, lot_details FROM lots WHERE id = ?', [id]);
    res.json({ success: true, item: lot });
  } catch (error) {
    console.error('❌ PATCH /api/lots/:id error:', error);
    res.status(500).json({ success: false, message: 'Erreur mise à jour lot' });
  }
});

// Update item state/technician
router.patch('/items/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const { state, technician } = req.body || {};
    await dbPromise.run('UPDATE lot_items SET state = COALESCE(?, state), technician = COALESCE(?, technician), state_changed_at = CURRENT_TIMESTAMP WHERE id = ?', [state || null, technician || null, id]);
    const item = await dbPromise.get('SELECT * FROM lot_items WHERE id = ?', [id]);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item introuvable' });
    }

    const finished = await computeAndUpdateLotFinished(item.lot_id);
    res.json({ success: true, item, lotFinished: finished });
  } catch (error) {
    console.error('❌ PATCH /api/lots/items/:id error:', error);
    res.status(500).json({ success: false, message: 'Erreur mise à jour' });
  }
});

// Generate a comprehensive PDF with complete lot information (manuel ou debug)
router.post('/:id/pdf', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const publicPath = await generatePDF(id);
    res.json({ success: true, path: publicPath });
  } catch (error) {
    console.error('❌ POST /api/lots/:id/pdf error:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur génération PDF' });
  }
});

// (Optional) email endpoint - generates shareable link
router.post('/:id/email', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { recipient, message } = req.body || {};

    if (!recipient) {
      return res.status(400).json({ success: false, message: 'Adresse email requise' });
    }

    const lot = await dbPromise.get('SELECT * FROM lots WHERE id = ?', [id]);
    if (!lot) return res.status(404).json({ success: false, message: 'Lot introuvable' });

    // Vérifier que le PDF existe
    if (!lot.pdf_path) {
      return res.status(400).json({ success: false, message: 'PDF non généré' });
    }

    // NOTE: Pour une implémentation complète, vous devriez:
    // 1. Installer nodemailer: npm install nodemailer
    // 2. Configurer des variables d'environnement SMTP
    // 3. Envoyer un email réel avec le lien de téléchargement

    // Pour maintenant, on retourne un succès avec un URL partageable
    const pdfUrl = `${process.env.PUBLIC_URL || 'http://localhost:8060'}${lot.pdf_path}`;

    console.log(`📧 Email envoyé à ${recipient} avec le PDF du lot #${id}`);
    console.log(`   Fichier: ${pdfUrl}`);
    console.log(`   Message: ${message || '(aucun)'}`);

    // Dans une vraie implémentation, envoyer l'email ici
    // TODO: Ajouter l'intégration email avec nodemailer

    res.json({
      success: true,
      message: 'Email prêt à être envoyé (mode démo)',
      pdfUrl: pdfUrl
    });
  } catch (error) {
    console.error('❌ POST /api/lots/:id/email error:', error);
    res.status(500).json({ success: false, message: 'Erreur envoi email' });
  }
});

module.exports = router;
