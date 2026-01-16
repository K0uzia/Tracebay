/**
 * PDF MANAGER - Gestion des PDFs
 * Ouvre les PDFs dans une nouvelle fenêtre de l'application
 */

class PDFManager {
  constructor() {
    this.pdfWindows = new Map(); // Stocker les références des fenêtres PDF
  }

  /**
     * Ouvrir un PDF dans une nouvelle fenêtre
     * @param {string} pdfFile - Nom du fichier PDF
     * @param {string} title - Titre de la fenêtre
     */
  openPDF(pdfFile, title = 'PDF Viewer') {
    // Envoyer une requête au processus principal
    window.electron.invoke('open-pdf-window', {
      pdfFile: pdfFile,
      title: title
    }).then(result => {
      if (result.success) {
        // PDF opened successfully
      } else {
        console.error(`❌ Erreur ouverture PDF: ${result.error}`);
      }
    }).catch(error => {
      console.error('❌ Erreur IPC:', error);
    });
  }

  /**
     * Initialiser les listeners des boutons PDF
     * @param {Array} config - Configuration des PDFs
     */
  attachPDFListeners(config) {
    config.forEach(pdfConfig => {
      const btn = document.getElementById(pdfConfig.buttonId);
      if (btn) {
        // Cloner pour retirer les anciens listeners
        const newBtn = btn.cloneNode(true);
        btn.replaceWith(newBtn);

        // Ajouter le nouveau listener
        const finalBtn = document.getElementById(pdfConfig.buttonId);
        finalBtn.addEventListener('click', () => {
          this.openPDF(pdfConfig.pdfFile, pdfConfig.title);
        });
      }
    });
  }
}

export default PDFManager;
