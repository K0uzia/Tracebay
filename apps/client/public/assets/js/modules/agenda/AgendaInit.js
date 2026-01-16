/**
 * AgendaInit.js - Gestionnaire d'initialisation/cleanup pour l'agenda
 * Permet de charger et décharger l'agenda de manière propre
 */

let agendaModule = null;
let agendaInitialized = false;

export async function initAgenda() {
  try {
    // Éviter les doubles initialisations
    if (agendaInitialized) {
      console.log('⚠️ Agenda déjà initialisé');
      return;
    }

    // Charger le module agenda.js dynamiquement
    // Ajouter un timestamp pour forcer le rechargement du cache
    const timestamp = new Date().getTime();
    agendaModule = await import(`./agenda.js?t=${timestamp}`);

    agendaInitialized = true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation de l\'agenda:', error);
  }
}

export function destroyAgenda() {
  try {
    // Nettoyer les références
    agendaModule = null;
    agendaInitialized = false;

    // Nettoyer les event listeners si nécessaire
    // (agenda.js gérera son propre cleanup s'il y a une fonction destroy)
  } catch (error) {
    console.error('❌ Erreur lors de la destruction de l\'agenda:', error);
  }
}

export function isAgendaInitialized() {
  return agendaInitialized;
}
