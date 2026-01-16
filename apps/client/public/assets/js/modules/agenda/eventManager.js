/**
 * Module de gestion des événements du calendrier
 */
import { DOM_SELECTORS } from '../constants.js';
import { getElement, getAllElements, addEventListenerSafe } from '../utils/dom.js';

/**
 * Affiche la modal de création d'événement
 */
function showCreateEventModal() {
  const modal = getElement(DOM_SELECTORS.MODAL_CREATE_EVENT);
  if (modal) {
    modal.style.display = 'flex';
  }
}

/**
 * Cache la modal de création d'événement
 */
function hideCreateEventModal() {
  const modal = getElement(DOM_SELECTORS.MODAL_CREATE_EVENT);
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Bascule l'affichage des détails d'un événement
 * @param {HTMLElement} container - Conteneur de l'événement
 */
function toggleEventDetails(container) {
  const detailDiv = container.querySelector('.detail');
  if (detailDiv) {
    detailDiv.hidden = !detailDiv.hidden;
  }
}

/**
 * Initialise la gestion des événements du calendrier
 */
export function initEventManager() {
  // Bouton d'ouverture de la modal
  const openModalBtn = getElement(DOM_SELECTORS.BTN_OPEN_MODAL);
  addEventListenerSafe(openModalBtn, 'click', showCreateEventModal);

  // Bouton de fermeture de la modal
  const closeModalBtn = getElement(DOM_SELECTORS.CLOSE_MODAL);
  addEventListenerSafe(closeModalBtn, 'click', hideCreateEventModal);

  // Gestion des clics sur les conteneurs d'événements
  const eventContainers = getAllElements(DOM_SELECTORS.EVENT_CONTAINER);
  eventContainers.forEach(container => {
    addEventListenerSafe(container, 'click', () => toggleEventDetails(container));
  });
}
