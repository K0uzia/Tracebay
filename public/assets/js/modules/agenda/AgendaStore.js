/**
 * AgendaStore.js
 * Gestion du stockage des événements
 * Support localStorage (démo) et API BDD
 */

class AgendaStore {
    constructor() {
        this.storageKey = 'workspace_events';
        this.apiUrl = '/api/agenda';
        this.useApi = false; // Basculer à true quand serveur prêt
        this.initializeStore();
    }

    /**
     * Initialiser le store avec des données de démo si vide
     */
    initializeStore() {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored && !this.useApi) {
            this.initializeDemoData();
        }
    }

    /**
     * Initialiser avec des données de démo
     */
    initializeDemoData() {
        const today = new Date();
        const demoEvents = [
            {
                id: '1',
                title: 'Réunion d\'équipe',
                start: `${this.formatDate(today)}T09:00:00`,
                end: `${this.formatDate(today)}T10:00:00`,
                color: '#3788d8',
                description: 'Réunion hebdomadaire avec l\'équipe'
            },
            {
                id: '2',
                title: 'Déjeuner client',
                start: `${this.formatDate(today)}T12:00:00`,
                end: `${this.formatDate(today)}T13:30:00`,
                color: '#43c466',
                description: 'Déjeuner avec le client ABC'
            },
            {
                id: '3',
                title: 'Deadline projet',
                start: `${this.addDays(today, 3)}T17:00:00`,
                end: `${this.addDays(today, 3)}T17:00:00`,
                color: '#fdb544',
                description: 'Remise du projet à la date limite'
            },
            {
                id: '4',
                title: 'Conférence',
                start: `${this.addDays(today, 5)}T14:00:00`,
                end: `${this.addDays(today, 5)}T16:00:00`,
                color: '#3788d8',
                description: 'Conférence sur les nouvelles technologies'
            }
        ];
        this.saveEvents(demoEvents);
    }

    /**
     * Récupérer tous les événements
     */
    async getAllEvents() {
        if (this.useApi) {
            try {
                const response = await fetch(`${this.apiUrl}/events?start=1900-01-01&end=2100-12-31`);
                const data = await response.json();
                return data.success ? data.data : [];
            } catch (error) {
                console.error('❌ Erreur récupération API:', error);
                return [];
            }
        }
        
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    /**
     * Récupérer les événements dans une plage de dates
     */
    async getEventsByRange(startDate, endDate) {
        if (this.useApi) {
            try {
                const response = await fetch(
                    `${this.apiUrl}/events?start=${startDate}&end=${endDate}`
                );
                const data = await response.json();
                return data.success ? data.data : [];
            } catch (error) {
                console.error('❌ Erreur récupération API:', error);
                return [];
            }
        }

        const all = await this.getAllEvents();
        return all.filter(event => {
            const eventStart = new Date(event.start);
            const start = new Date(startDate);
            const end = new Date(endDate);
            return eventStart >= start && eventStart <= end;
        });
    }

    /**
     * Ajouter un événement
     */
    async addEvent(event) {
        if (this.useApi) {
            try {
                const response = await fetch(`${this.apiUrl}/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(event)
                });
                const data = await response.json();
                if (data.success) {
                    return data.data;
                } else {
                    throw new Error(data.message);
                }
            } catch (error) {
                console.error('❌ Erreur création API:', error);
                throw error;
            }
        }

        const events = await this.getAllEvents();
        const newEvent = {
            id: Date.now().toString(),
            ...event,
            createdAt: new Date().toISOString()
        };
        events.push(newEvent);
        this.saveEvents(events);
        return newEvent;
    }

    /**
     * Mettre à jour un événement
     */
    async updateEvent(id, updates) {
        if (this.useApi) {
            try {
                const response = await fetch(`${this.apiUrl}/events/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                const data = await response.json();
                if (data.success) {
                    return data.data;
                } else {
                    throw new Error(data.message);
                }
            } catch (error) {
                console.error('❌ Erreur modification API:', error);
                throw error;
            }
        }

        const events = await this.getAllEvents();
        const eventIndex = events.findIndex(e => e.id === id);
        if (eventIndex !== -1) {
            events[eventIndex] = {
                ...events[eventIndex],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.saveEvents(events);
            return events[eventIndex];
        }
        return null;
    }

    /**
     * Supprimer un événement
     */
    async deleteEvent(id) {
        if (this.useApi) {
            try {
                const response = await fetch(`${this.apiUrl}/events/${id}`, {
                    method: 'DELETE'
                });
                const data = await response.json();
                if (data.success) {
                    return true;
                } else {
                    throw new Error(data.message);
                }
            } catch (error) {
                console.error('❌ Erreur suppression API:', error);
                throw error;
            }
        }

        const events = await this.getAllEvents();
        const filtered = events.filter(e => e.id !== id);
        this.saveEvents(filtered);
        return filtered.length < events.length;
    }

    /**
     * Sauvegarder tous les événements (localStorage seulement)
     */
    saveEvents(events) {
        localStorage.setItem(this.storageKey, JSON.stringify(events));
    }

    /**
     * Formater une date en YYYY-MM-DD
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Ajouter des jours à une date
     */
    addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return this.formatDate(result);
    }

    /**
     * Exporter les données (pour migration BDD future)
     */
    async exportData() {
        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            events: await this.getAllEvents()
        };
    }

    /**
     * Importer les données (pour restauration depuis BDD)
     */
    importData(data) {
        if (data.events && Array.isArray(data.events)) {
            this.saveEvents(data.events);
            return true;
        }
        return false;
    }

    /**
     * Réinitialiser complètement le store
     */
    resetStore() {
        localStorage.removeItem(this.storageKey);
        this.initializeDemoData();
    }

    /**
     * Basculer vers API
     */
    switchToApi(shouldUse = true) {
        this.useApi = shouldUse;
    }
}

export default new AgendaStore();

