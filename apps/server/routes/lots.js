const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { dbPromise } = require('../database.js');

// Helper: compute lot finished status
async function computeAndUpdateLotFinished(lotId) {
  const row = await dbPromise.get(
    `SELECT SUM(CASE WHEN state = 'À faire' THEN 1 ELSE 0 END) AS pending
     FROM lot_items WHERE lot_id = ?`, [lotId]
  );
  const pending = row?.pending || 0;
  if (pending === 0) {
    await dbPromise.run(`UPDATE lots SET finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP) WHERE id = ?`, [lotId]);
    return true;
  }
  return false;
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
        `INSERT INTO lots (lot_name, lot_details) VALUES (?, ?)`,
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
      SELECT l.id, l.created_at, l.finished_at, l.pdf_path, l.lot_name, l.lot_details,
             COUNT(li.id) as total,
             SUM(CASE WHEN li.state = 'À faire' THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN li.state = 'Prêt pour remise' THEN 1 ELSE 0 END) as recond,
             SUM(CASE WHEN li.state = 'Pour pièces' THEN 1 ELSE 0 END) as hs
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
    const lot = await dbPromise.get(`SELECT id, created_at, finished_at, pdf_path, lot_name, lot_details FROM lots WHERE id = ?`, [id]);
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

// Update item state/technician
router.patch('/items/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { state, technician } = req.body || {};
    await dbPromise.run(`UPDATE lot_items SET state = COALESCE(?, state), technician = COALESCE(?, technician), state_changed_at = CURRENT_TIMESTAMP WHERE id = ?`, [state || null, technician || null, id]);
    const item = await dbPromise.get(`SELECT * FROM lot_items WHERE id = ?`, [id]);
    const finished = await computeAndUpdateLotFinished(item.lot_id);
    res.json({ success: true, item, lotFinished: finished });
  } catch (error) {
    console.error('❌ PATCH /api/lots/items/:id error:', error);
    res.status(500).json({ success: false, message: 'Erreur mise à jour' });
  }
});

// Generate a comprehensive PDF with complete lot information
router.post('/:id/pdf', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lot = await dbPromise.get(`SELECT * FROM lots WHERE id = ?`, [id]);
    if (!lot) return res.status(404).json({ success: false, message: 'Lot introuvable' });
    const items = await dbPromise.all(`
      SELECT li.*, m.name as marque_name, mod.name as modele_name
      FROM lot_items li
      LEFT JOIN marques m ON li.marque_id = m.id
      LEFT JOIN modeles mod ON li.modele_id = mod.id
      WHERE li.lot_id = ? 
      ORDER BY li.id ASC
    `, [id]);

    const total = items.length;
    const recond = items.filter(i => i.state === 'Reconditionné').length;
    const hs = items.filter(i => i.state === 'HS').length;

    // Format dates
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Lot #${id}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 30px;
      color: #333;
      line-height: 1.6;
    }
    .header {
      border-bottom: 3px solid #3e3b8c;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0 0 5px 0;
      color: #3e3b8c;
      font-size: 28px;
    }
    .header-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 15px;
      font-size: 14px;
      color: #666;
    }
    .info-section {
      margin-bottom: 30px;
      background: #f9f9f9;
      padding: 20px;
      border-left: 4px solid #3e3b8c;
      border-radius: 4px;
    }
    .info-section h2 {
      margin: 0 0 15px 0;
      color: #3e3b8c;
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .info-row {
      display: grid;
      grid-template-columns: 150px 1fr;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      color: #555;
    }
    .info-value {
      color: #333;
    }
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-top: 15px;
    }
    .stat-box {
      background: white;
      padding: 15px;
      border-radius: 4px;
      text-align: center;
      border: 1px solid #e0e0e0;
    }
    .stat-number {
      font-size: 24px;
      font-weight: bold;
      color: #3e3b8c;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      background: white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    thead {
      background: #3e3b8c;
      color: white;
    }
    th {
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #3e3b8c;
    }
    td {
      padding: 12px;
      border: 1px solid #e0e0e0;
      font-size: 13px;
    }
    tbody tr:nth-child(even) {
      background: #f5f5f5;
    }
    tbody tr:hover {
      background: #efefef;
    }
    .state-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .state-todo {
      background: #fff3cd;
      color: #856404;
    }
    .state-recond {
      background: #d4edda;
      color: #155724;
    }
    .state-hs {
      background: #f8d7da;
      color: #721c24;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Fiche de Lot #${id}</h1>
    <div class="header-meta">
      <div><strong>Date du rapport :</strong> ${formatDate(new Date().toISOString())}</div>
      <div><strong>Statut :</strong> ${lot.finished_at ? 'Terminé' : 'En cours'}</div>
    </div>
  </div>

  <div class="info-section">
    <h2>📋 Informations Générales du Lot</h2>
    <div class="info-row">
      <span class="info-label">Numéro du Lot :</span>
      <span class="info-value">#${id}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date de création :</span>
      <span class="info-value">${formatDate(lot.created_at)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date de fin :</span>
      <span class="info-value">${lot.finished_at ? formatDate(lot.finished_at) : '-'}</span>
    </div>
    ${lot.lot_name ? `<div class="info-row">
      <span class="info-label">Nom du Lot :</span>
      <span class="info-value">${lot.lot_name}</span>
    </div>` : ''}
    ${lot.lot_details ? `<div class="info-row">
      <span class="info-label">Détails :</span>
      <span class="info-value">${lot.lot_details}</span>
    </div>` : ''}

    <div class="summary-stats">
      <div class="stat-box">
        <div class="stat-number">${total}</div>
        <div class="stat-label">Total PC</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${recond}</div>
        <div class="stat-label">Reconditionnés</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${hs}</div>
        <div class="stat-label">HS</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${total - recond - hs}</div>
        <div class="stat-label">En attente</div>
      </div>
    </div>
  </div>

  <div class="info-section">
    <h2>💻 Détail des Machines</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 5%;">#</th>
          <th style="width: 15%;">Numéro de Série</th>
          <th style="width: 10%;">Modèle</th>
          <th style="width: 10%;">Config</th>
          <th style="width: 12%;">État</th>
          <th style="width: 18%;">Date du Changement</th>
          <th style="width: 15%;">Technicien</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, idx) => `<tr>
          <td>${idx + 1}</td>
          <td>${it.serial_number || '-'}</td>
          <td>${it.marque_name || '-'} ${it.modele_name || '-'}</td>
          <td>${it.type || '-'}</td>
          <td><span class="state-badge state-${it.state === 'À faire' ? 'todo' : it.state === 'Reconditionné' ? 'recond' : 'hs'}">${it.state || '-'}</span></td>
          <td>${formatDate(it.state_changed_at)}</td>
          <td>${it.technician || '-'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>Ce document a été généré automatiquement. Tous les détails du lot sont archivés dans la base de données.</p>
  </div>
</body>
</html>`;

    const pdfDir = path.join(__dirname, '..', 'public', 'pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const filePath = path.join(pdfDir, `lot-${id}.html`);
    fs.writeFileSync(filePath, html, 'utf-8');

    const publicPath = `/pdfs/lot-${id}.html`;
    await dbPromise.run(`UPDATE lots SET pdf_path = ? WHERE id = ?`, [publicPath, id]);
    res.json({ success: true, path: publicPath });
  } catch (error) {
    console.error('❌ POST /api/lots/:id/pdf error:', error);
    res.status(500).json({ success: false, message: 'Erreur génération PDF' });
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

    const lot = await dbPromise.get(`SELECT * FROM lots WHERE id = ?`, [id]);
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
      message: `Email prêt à être envoyé (mode démo)`,
      pdfUrl: pdfUrl
    });
  } catch (error) {
    console.error('❌ POST /api/lots/:id/email error:', error);
    res.status(500).json({ success: false, message: 'Erreur envoi email' });
  }
});

module.exports = router;
