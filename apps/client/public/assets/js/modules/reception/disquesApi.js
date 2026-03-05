/**
 * Module API pour les sessions de disques shreddés (traçabilité).
 * Utilisé par la page Disques de la réception.
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';

const logger = getLogger();

function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
    };
}

/**
 * Liste des sessions de disques shreddés.
 * @param {{ year?: number, month?: number }} params - Filtres optionnels
 * @returns {Promise<Array>}
 */
export async function getSessions(params = {}) {
    const serverUrl = api.getServerUrl();
    const endpoint = window.SERVER_CONFIG?.getEndpoint?.('disques.sessions') || '/api/disques/sessions';
    let url = `${serverUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const search = new URLSearchParams();
    if (params.year != null) search.set('year', String(params.year));
    if (params.month != null) search.set('month', String(params.month));
    if (search.toString()) url += `?${search.toString()}`;

    const response = await fetch(url, { method: 'GET', headers: getHeaders() });
    if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const list = Array.isArray(data) ? data : (data.sessions || data.items || []);
    return list;
}

/**
 * Créer une session (date + liste de disques). Le serveur génère le PDF.
 * @param {{ date?: string, disks: Array<{ serial: string, type: string, size: string }> }} payload
 * @returns {Promise<Object>} Session créée (avec id, etc.)
 */
export async function createSession(payload) {
    const serverUrl = api.getServerUrl();
    const endpoint = window.SERVER_CONFIG?.getEndpoint?.('disques.sessions') || '/api/disques/sessions';
    const url = `${serverUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * Détail d'une session (avec liste des disques).
 * @param {string|number} id
 * @returns {Promise<Object>}
 */
export async function getSession(id) {
    const serverUrl = api.getServerUrl();
    const endpoint = window.SERVER_CONFIG?.getEndpoint?.('disques.sessions') || '/api/disques/sessions';
    const path = `${endpoint.startsWith('/') ? endpoint : '/' + endpoint}/${id}`;
    const url = `${serverUrl}${path}`;

    const response = await fetch(url, { method: 'GET', headers: getHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

/**
 * URL du PDF d'une session (pour ouverture dans un nouvel onglet ou téléchargement).
 * @param {string|number} id
 * @returns {string}
 */
export function getSessionPdfUrl(id) {
    const serverUrl = api.getServerUrl();
    const endpoint = window.SERVER_CONFIG?.getEndpoint?.('disques.sessionsPdf') || '/api/disques/sessions/:id/pdf';
    const path = endpoint.replace(':id', String(id));
    return `${serverUrl}${path.startsWith('/') ? path : '/' + path}`;
}
