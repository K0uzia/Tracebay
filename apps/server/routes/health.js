const express = require('express');
const os = require('os');

const router = express.Router();

function formatBytesToGb(bytes) {
  return (bytes / (1024 ** 3)).toFixed(2);
}

/**
 * GET /api/health
 * Health check endpoint pour la vérification de connexion client
 */
router.get('/', (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usedPercent = ((usedMem / totalMem) * 100).toFixed(0);

  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
    data: {
      ram: {
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedBytes: usedMem,
        total: formatBytesToGb(totalMem),
        free: formatBytesToGb(freeMem),
        used: formatBytesToGb(usedMem),
        usedPercent
      },
      ip: req.socket.remoteAddress?.replace('::ffff:', '') || null
    }
  });
});

module.exports = router;
