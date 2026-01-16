/**
 * TIME MANAGER - Gestion de l'affichage de l'heure et la date
 */

class TimeManager {
  constructor(options = {}) {
    this.dateElementId = options.dateElementId || 'current-date';
    this.timeElementId = options.timeElementId || 'current-time';
    this.format24h = options.format24h !== false; // Par défaut 24h
    this.updateInterval = options.updateInterval || 1000; // Mise à jour chaque 1000ms
    this.intervalId = null; // Stocker l'ID de l'intervalle

    this.init();
  }

  init() {
    // Afficher la date et heure immédiatement
    this.updateDateTime();

    // Mettre à jour chaque seconde
    this.intervalId = setInterval(() => this.updateDateTime(), this.updateInterval);
  }

  /**
     * Arrêter le TimeManager
     */
  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
     * Mettre à jour la date et l'heure
     */
  updateDateTime() {
    this.updateDate();
    this.updateTime();
  }

  /**
     * Mettre à jour la date
     */
  updateDate() {
    const dateElement = document.getElementById(this.dateElementId);
    if (!dateElement) {
      // Ne plus afficher de warning - l'élément peut ne pas exister sur certaines pages
      return;
    }

    const date = new Date();

    // Noms des jours et mois en français
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

    const jour = jours[date.getDay()];
    const numJour = date.getDate();
    const nomMois = mois[date.getMonth()];

    dateElement.textContent = `${jour} ${numJour} ${nomMois}`;
  }

  /**
     * Mettre à jour l'heure
     */
  updateTime() {
    const timeElement = document.getElementById(this.timeElementId);
    if (!timeElement) {
      // Ne plus afficher de warning - l'élément peut ne pas exister sur certaines pages
      return;
    }

    const date = new Date();
    const heures = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    timeElement.textContent = `${heures}:${minutes}`;
  }

  /**
     * Obtenir la date formatée
     */
  getFormattedDate() {
    const date = new Date();

    // Noms des jours et mois en français
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

    const jour = jours[date.getDay()];
    const numJour = date.getDate();
    const nomMois = mois[date.getMonth()];

    return `${jour} ${numJour} ${nomMois}`;
  }

  /**
     * Obtenir l'heure formatée
     */
  getFormattedTime() {
    const date = new Date();
    const heures = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${heures}:${minutes}`;
  }
}

export default TimeManager;