/**
 * PDF CONFIG - Configuration centralisée des PDFs
 * 
 * Format:
 * {
 *   buttonId: 'id-du-bouton',
 *   pdfFile: 'nom-du-fichier.pdf',
 *   title: 'Titre de la fenêtre'
 * }
 */

export const pdfConfig = [
    {
        buttonId: 'rules-pdf-btn',
        pdfFile: 'Règlement_intérieur_chantier_num.pdf',
        title: 'Réglement intérieur'
    },
    {
        buttonId: 'fonte-pdf-btn',
        pdfFile: 'fonte.pdf',
        title: 'Fonte Pédagogique'
    },
    {
        buttonId: 'livret-pdf-btn',
        pdfFile: 'livret_d_accueil_mini.pdf',
        title: 'Livret d\'accueil'
    },
    {
        buttonId: 'members-list-btn',
        pdfFile: 'adherant_2025_2026.pdf',
        title: 'Liste des adhérents'
    },
    // Ajoute d'autres PDFs ici comme ceci :
    // {
    //     buttonId: 'open-guide-btn',
    //     pdfFile: 'Guide_utilisateur.pdf',
    //     title: 'Guide utilisateur'
    // }
];

export default pdfConfig;
