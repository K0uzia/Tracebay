/**
 * Paramètres > Données et confidentialité : effacer le nom d'un technicien de tout le matériel
 * (droit à l'effacement). Seul ce champ est vidé ; possible même en lecture seule de la licence.
 * Module identique dans l'édition serveur et la portable.
 */
import api from '../../config/api.js';
import { escapeHtml } from '../../utils/html.js';

const NB = '\u00a0';
const ESPACE_VISIBLE = '\u2423';

export function elements(n) {
    return n === 1 ? '1 élément' : `${Number(n).toLocaleString('fr-FR')} éléments`;
}

/**
 * Nom tel qu'affiché. L'effacement porte sur le nom exact : un nom avec des espaces en tête, en fin
 * ou doublés montre chaque espace (␣) pour ne pas se confondre avec sa version propre.
 */
export function nomAffiche(name) {
    const nom = String(name ?? '');
    if (nom === nom.trim() && !/\s{2,}/.test(nom)) {
        return nom;
    }
    return `${nom.replace(/\s/g, ESPACE_VISIBLE)} (espaces en trop)`;
}

/** Message lisible pour un échec réseau ou une réponse sans explication (mêmes mots partout). */
export function messageErreur(err, status) {
    if (err?.message && !/^HTTP \d+$/.test(err.message) && !(err instanceof TypeError)) {
        return err.message;
    }
    if (status) {
        return `Tracebay n'a pas pu traiter la demande (code ${status}). Réessayez ; si cela persiste, prévenez la personne qui administre Tracebay.`;
    }
    return 'Tracebay ne répond pas. Réessayez dans un instant.';
}

function afficherErreurListe(container, options) {
    container.innerHTML = `
        <div class="post-settings">
            <p class="settings-error" role="alert">Liste des techniciens indisponible${NB}: Tracebay ne répond pas.</p>
            <div class="settings-actions">
                <button type="button" class="settings-btn settings-btn--ghost" data-action="reessayer">Réessayer</button>
            </div>
        </div>`;
    const reessayer = container.querySelector('[data-action="reessayer"]');
    reessayer.addEventListener('click', () => {
        afficherEffacementTechnicien(container, { ...options, focus: true });
    });
    if (options.focus) {
        reessayer.focus();
    }
}

/**
 * Remplit le bloc container (liste des noms, confirmation, effacement). notifier(message, type).
 * focus : rend le focus au bloc après un nouveau rendu (après un effacement ou « Réessayer »).
 */
export async function afficherEffacementTechnicien(container, options = {}) {
    const { notifier, focus = false } = options;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '<p class="settings-block__hint">Chargement des noms…</p>';
    let technicians = [];
    try {
        const res = await api.get('/api/lots/technicians', { useCache: false });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        technicians = (await res.json()).technicians || [];
    } catch (_) {
        container.removeAttribute('aria-busy');
        afficherErreurListe(container, options);
        return;
    }
    container.removeAttribute('aria-busy');
    if (!technicians.length) {
        container.innerHTML = '<p class="settings-block__hint" tabindex="-1">Aucun nom de technicien enregistré sur le matériel.</p>';
        if (focus) {
            container.querySelector('p').focus();
        }
        return;
    }
    const lignes = technicians
        .map((t, i) => `<option value="${i}">${escapeHtml(nomAffiche(t.name))} (${elements(t.count)})</option>`)
        .join('');
    container.innerHTML = `
        <div class="post-settings" data-role="effacement">
            <label class="post-settings__label" for="settingsTechnicienNom">Technicien</label>
            <select class="post-settings__input" id="settingsTechnicienNom">${lignes}</select>
            <p class="post-settings__hint" id="settingsTechnicienQuestion" data-role="question" hidden></p>
            <div class="settings-actions">
                <button type="button" class="settings-btn settings-btn--ghost" data-action="demander">
                    <i class="fa-solid fa-user-slash" aria-hidden="true"></i> Effacer ce nom…
                </button>
                <button type="button" class="settings-btn settings-btn--primary" data-action="confirmer"
                    aria-describedby="settingsTechnicienQuestion" hidden>Effacer le nom</button>
                <button type="button" class="settings-btn settings-btn--ghost" data-action="annuler" hidden>Annuler</button>
            </div>
            <p class="settings-error hidden" role="alert"></p>
        </div>`;
    const bloc = container.querySelector('[data-role="effacement"]');
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
    const fermerConfirmation = () => {
        basculer(false);
        erreur.classList.add('hidden');
        demander.focus();
    };
    choix.addEventListener('change', () => basculer(false));
    demander.addEventListener('click', () => {
        const t = technicians[Number(choix.value)];
        question.textContent = `Effacer «${NB}${nomAffiche(t.name)}${NB}» de ${elements(t.count)}${NB}? Le matériel est conservé, seul le nom du technicien est retiré. Les PDF déjà produits et les sauvegardes ne sont pas modifiés.`;
        erreur.classList.add('hidden');
        basculer(true);
        confirmer.focus();
    });
    annuler.addEventListener('click', fermerConfirmation);
    // Échap annule la confirmation sans fermer toute la fenêtre des Paramètres.
    bloc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !confirmer.hidden && !confirmer.disabled) {
            e.preventDefault();
            e.stopPropagation();
            fermerConfirmation();
        }
    });
    confirmer.addEventListener('click', async () => {
        const t = technicians[Number(choix.value)];
        confirmer.disabled = true;
        annuler.disabled = true;
        confirmer.textContent = 'Effacement…';
        bloc.setAttribute('aria-busy', 'true');
        let status = 0;
        try {
            const res = await api.post('/api/lots/technicians/anonymize', { name: t.name });
            status = res.status;
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body?.error || `HTTP ${res.status}`);
            }
            notifier?.(`Nom «${NB}${nomAffiche(t.name)}${NB}» effacé de ${elements(body.anonymises ?? 0)}.`, 'success');
            await afficherEffacementTechnicien(container, { notifier, focus: true });
        } catch (err) {
            bloc.removeAttribute('aria-busy');
            erreur.textContent = `Effacement impossible${NB}: ${messageErreur(err, status)}`;
            erreur.classList.remove('hidden');
            confirmer.textContent = 'Effacer le nom';
            confirmer.disabled = false;
            annuler.disabled = false;
            confirmer.focus();
        }
    });
    if (focus) {
        choix.focus();
    }
}
