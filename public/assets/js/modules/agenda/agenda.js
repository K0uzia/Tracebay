import AgendaController from './AgendaController.js';

let agendaController = null;

if (document.getElementById('dashboard-calendar-grid')) {
    if (agendaController) {
        agendaController.destroy();
    }
    
    agendaController = new AgendaController();
    agendaController.init().catch(err => console.error('❌ Erreur initialisation calendrier:', err));
}