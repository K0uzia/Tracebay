/**
 * Paramètres > Données et confidentialité : effacer le nom d'un technicien de tout le matériel
 * (droit à l'effacement). Seul ce champ est vidé ; possible même en lecture seule de la licence.
 */
import api from '../../config/api.js';
import { escapeHtml } from '../../utils/html.js';

const NB = '\u00a0';

function elements(n) {
    return n === 1 ? '1 élément' : `${n} éléments`;
}

/** Remplit le bloc container (liste des noms, confirmation, effacement). notifier(message, type). */
export async function afficherEffacementTechnicien(container, { notifier } = {}) {
    container.innerHTML = '<p class="settings-block__hint">Chargement des noms…</p>';
    let technicians = [];
    try {
        const res = await api.get('/api/lots/technicians', { useCache: false });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        technicians = (await res.json()).technicians || [];
    } catch (_) {
        container.innerHTML = '<p class="settings-error" role="alert">Liste des techniciens indisponible. Rouvrez les Paramètres pour réessayer.</p>';
        return;
    }
    if (!technicians.length) {
        container.innerHTML = '<p class="settings-block__hint">Aucun nom de technicien enregistré sur le matériel.</p>';
        return;
    }
    const options = technicians.map((t, i) => `<option value="${i}">${escapeHtml(t.name)} (${elements(t.count)})</option>`).join('');
    container.innerHTML = `
        <div class="post-settings" data-role="effacement">
            <label class="post-settings__label" for="settingsTechnicienNom">Technicien</label>
            <select class="post-settings__input" id="settingsTechnicienNom">${options}</select>
            <p class="post-settings__hint" data-role="question" hidden></p>
            <div class="settings-actions">
                <button type="button" class="settings-btn settings-btn--ghost" data-action="demander">
                    <i class="fa-solid fa-user-slash" aria-hidden="true"></i> Effacer ce nom…
                </button>
                <button type="button" class="settings-btn settings-btn--primary" data-action="confirmer" hidden>Effacer le nom</button>
                <button type="button" class="settings-btn settings-btn--ghost" data-action="annuler" hidden>Annuler</button>
            </div>
            <p class="settings-error hidden" role="alert"></p>
        </div>`;
    const choix = container.querySelector('select');
    const question = container.querySelector('[data-role="question"]');
    const demander = container.querySelector('[data-action="demander"]');
    const confirmer = container.querySelector('[data-action="confirmer"]');
    const annuler = container.querySelector('[data-action="annuler"]');
    const erreur = container.querySelector('.settings-error');
    const basculer = (enConfirmation) => {
        question.hidden = !enConfirmation;
        confirmer.hidden = !enConfirmation;
        annuler.hidden = !enConfirmation;
        demander.hidden = enConfirmation;
        choix.disabled = enConfirmation;
    };
    choix.addEventListener('change', () => basculer(false));
    demander.addEventListener('click', () => {
        const t = technicians[Number(choix.value)];
        question.textContent = `Effacer «${NB}${t.name}${NB}» de ${elements(t.count)}${NB}? Le matériel est conservé, seul le nom du technicien est retiré. Les PDF déjà produits et les sauvegardes ne sont pas modifiés.`;
        erreur.classList.add('hidden');
        basculer(true);
        confirmer.focus();
    });
    annuler.addEventListener('click', () => {
        basculer(false);
        demander.focus();
    });
    confirmer.addEventListener('click', async () => {
        const t = technicians[Number(choix.value)];
        confirmer.disabled = true;
        try {
            const res = await api.post('/api/lots/technicians/anonymize', { name: t.name });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || `HTTP ${res.status}`);
            }
            notifier?.(`Nom «${NB}${t.name}${NB}» effacé de ${elements(body.anonymises ?? 0)}.`, 'success');
            await afficherEffacementTechnicien(container, { notifier });
        } catch (err) {
            erreur.textContent = `Effacement impossible${NB}: ${err.message}`;
            erreur.classList.remove('hidden');
            confirmer.disabled = false;
        }
    });
}
