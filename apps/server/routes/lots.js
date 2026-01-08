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
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Aucun item à enregistrer' });
    }
    let lotId;
    await dbPromise.transaction(async () => {
      const result = await dbPromise.run(`INSERT INTO lots DEFAULT VALUES`);
      lotId = result.id;
      for (const it of items) {
        await dbPromise.run(
          `INSERT INTO lot_items (lot_id, serial_number, type, marque_id, modele_id, entry_type, date, time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [lotId, it.serialNumber || null, it.type || null, it.marqueId || null, it.modeleId || null, it.entryType || null, it.date || null, it.time || null]
        );
      }
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
      SELECT l.id, l.created_at, l.finished_at, l.pdf_path,
             COUNT(li.id) as total,
             SUM(CASE WHEN li.state = 'À faire' THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN li.state = 'Reconditionné' THEN 1 ELSE 0 END) as recond,
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
        SELECT id, serial_number, type, marque_id, modele_id, entry_type, date, time, state, technician
        FROM lot_items WHERE lot_id = ? ORDER BY id ASC
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
    const lot = await dbPromise.get(`SELECT id, created_at, finished_at, pdf_path FROM lots WHERE id = ?`, [id]);
    if (!lot) return res.status(404).json({ success: false, message: 'Lot introuvable' });
    const items = await dbPromise.all(`
      SELECT id, serial_number, type, marque_id, modele_id, entry_type, date, time, state, technician
      FROM lot_items WHERE lot_id = ? ORDER BY id ASC
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
    await dbPromise.run(`UPDATE lot_items SET state = COALESCE(?, state), technician = COALESCE(?, technician) WHERE id = ?`, [state || null, technician || null, id]);
    const item = await dbPromise.get(`SELECT * FROM lot_items WHERE id = ?`, [id]);
    const finished = await computeAndUpdateLotFinished(item.lot_id);
    res.json({ success: true, item, lotFinished: finished });
  } catch (error) {
    console.error('❌ PATCH /api/lots/items/:id error:', error);
    res.status(500).json({ success: false, message: 'Erreur mise à jour' });
  }
});

// Generate a simple HTML as PDF placeholder
router.post('/:id/pdf', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const lot = await dbPromise.get(`SELECT * FROM lots WHERE id = ?`, [id]);
    if (!lot) return res.status(404).json({ success: false, message: 'Lot introuvable' });
    const items = await dbPromise.all(`SELECT * FROM lot_items WHERE lot_id = ? ORDER BY id ASC`, [id]);

    const total = items.length;
    const recond = items.filter(i => i.state === 'Reconditionné').length;
    const hs = items.filter(i => i.state === 'HS').length;

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Lot ${id}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#222}
h1{margin:0 0 8px 0}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:16px}
.small{color:#666;font-size:12px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #ccc;padding:6px;font-size:12px}
th{background:#f2f2f2;text-align:left}
.badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px}
.badge.todo{background:#ffe9b3}
.badge.ok{background:#b8e0c8}
.badge.hs{background:#f6c1c1}
</style></head><body>
<div class="header">
  <div>
    <h1>Fiche Lot #${id}</h1>
    <div class="small">Date PDF: ${new Date().toLocaleString('fr-FR')}</div>
  </div>
  <div class="small">Entreprise: Votre Société</div>
</div>
<div>
  <p><strong>Créé le:</strong> ${lot.created_at || ''} &nbsp; | &nbsp; <strong>Terminé le:</strong> ${lot.finished_at || '-'} </p>
  <p><strong>Total:</strong> ${total} &nbsp; | &nbsp; <strong>Reconditionnés:</strong> ${recond} &nbsp; | &nbsp; <strong>HS:</strong> ${hs}</p>
</div>
<table>
  <thead><tr><th>#</th><th>Numéro de série</th><th>Type</th><th>Modèle</th><th>État</th><th>Technicien</th></tr></thead>
  <tbody>
  ${items.map((it, idx) => `<tr>
    <td>${idx + 1}</td>
    <td>${it.serial_number || ''}</td>
    <td>${it.type || ''}</td>
    <td>${it.modele_id || ''}</td>
    <td>${it.state || ''}</td>
    <td>${it.technician || ''}</td>
  </tr>`).join('')}
  </tbody>
</table>
</body></html>`;

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

// (Optional) email endpoint placeholder
router.post('/:id/email', async (req, res) => {
  res.status(501).json({ success: false, message: 'Envoi email non configuré' });
});

module.exports = router;
