/**
 * Module partagé pour le chargement des lots avec leurs items.
 * Utilisé par Inventaire, Historique et Traçabilité.
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();

/**
 * Charge la liste des lots avec leurs items.
 * @param {{ status: 'active' | 'finished' | 'all' }} options
 * @returns {Promise<Array>} Tableau de lots (chaque lot a .items)
 * @throws {Error} En cas d'échec HTTP ou parsing
 */
export async function loadLotsWithItems({ status }) {
    const serverUrl = api.getServerUrl();
    const url = `${serverUrl}/api/lots?status=${status}`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
    };

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawLots = Array.isArray(data) ? data : (data.items || data.lots || []);
    logger.debug('Lots liste reçus:', { status, count: rawLots.length });

    if (!Array.isArray(rawLots)) {
        logger.warn('Données lots invalides:', rawLots);
        return [];
    }

    const lotsWithItems = await Promise.all(rawLots.map(async (lot) => {
        try {
            const lotUrl = `${serverUrl}/api/lots/${lot.id}`;
            const lotResponse = await fetch(lotUrl, { method: 'GET', headers });
            if (!lotResponse.ok) {
                logger.debug(`Erreur GET lot ${lot.id}:`, lotResponse.status);
                return { ...lot, items: [] };
            }
            const lotData = await lotResponse.json();
            const items = Array.isArray(lotData.items) ? lotData.items : (lotData.item?.items || []);
            logger.debug(`Lot ${lot.id} items:`, items.length);
            return {
                ...lot,
                ...(lotData.item || {}),
                items
            };
        } catch (err) {
            logger.error(`Erreur chargement lot ${lot.id}:`, err);
            return { ...lot, items: [] };
        }
    }));

    return lotsWithItems;
}
