/**
 * Dashboard configuration
 */
const API_URL = 'http://192.168.1.62:4000';
let updateInterval;
let startTime = Date.now();

/**
 * Format uptime
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}j ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Update server status
 */
async function updateServerStatus() {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();

    // Update status indicator
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    if (response.ok) {
      indicator.className = 'status-indicator online';
      statusText.textContent = 'En ligne';
      
      // Update uptime
      const uptime = Date.now() - startTime;
      document.getElementById('server-uptime').textContent = formatUptime(uptime);
    }
  } catch (error) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    indicator.className = 'status-indicator offline';
    statusText.textContent = 'Hors ligne';
    
    console.error('Failed to fetch server status:', error);
  }
}

/**
 * Update system resources
 */
async function updateSystemResources() {
  // Simulate for now - will be replaced with real data
  const cpuUsage = Math.random() * 50;
  const memoryUsage = Math.random() * 512;
  
  document.getElementById('cpu-progress').style.width = `${cpuUsage}%`;
  document.getElementById('cpu-value').textContent = `${cpuUsage.toFixed(1)}%`;
  
  document.getElementById('memory-progress').style.width = `${(memoryUsage / 1024) * 100}%`;
  document.getElementById('memory-value').textContent = `${memoryUsage.toFixed(0)} MB`;
}

/**
 * Update database stats
 */
async function updateDatabaseStats() {
  // Will be implemented with real API endpoint
  document.getElementById('db-active').textContent = '2';
  document.getElementById('db-available').textContent = '3';
}

/**
 * Add log entry
 */
function addLogEntry(message) {
  const logContainer = document.getElementById('activity-log');
  const entry = document.createElement('p');
  entry.className = 'log-entry';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  
  logContainer.insertBefore(entry, logContainer.firstChild);
  
  // Keep only last 50 entries
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

/**
 * Check server health
 */
async function checkHealth() {
  addLogEntry('Vérification de la santé du serveur...');
  
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    
    if (response.ok) {
      addLogEntry('✓ Serveur en bonne santé');
    } else {
      addLogEntry('✗ Problème détecté sur le serveur');
    }
  } catch (error) {
    addLogEntry('✗ Impossible de contacter le serveur');
  }
}

/**
 * View logs (placeholder)
 */
function viewLogs() {
  addLogEntry('Affichage des logs (fonctionnalité à implémenter)');
}

/**
 * Restart server (placeholder)
 */
function restartServer() {
  const confirmed = confirm('Êtes-vous sûr de vouloir redémarrer le serveur ?');
  
  if (confirmed) {
    addLogEntry('⚠️ Redémarrage du serveur demandé');
    // Will be implemented with IPC
  }
}

/**
 * Initialize dashboard
 */
function initDashboard() {
  addLogEntry('Dashboard initialisé');
  addLogEntry('Connexion au serveur backend...');
  
  // Initial update
  updateServerStatus();
  updateSystemResources();
  updateDatabaseStats();
  
  // Periodic updates
  updateInterval = setInterval(() => {
    updateServerStatus();
    updateSystemResources();
    updateDatabaseStats();
  }, 5000);
}

// Start dashboard on load
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});
