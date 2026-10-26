/**
 * Paramètres > Connexion : adresse du serveur de l'atelier, propre à ce poste. Le processus
 * principal valide, teste (/api/health), enregistre dans <userData>/connection.json puis relance
 * Tracebay, qui lit l'adresse au démarrage.
 */
const NB = String.fromCharCode(160);

const SOURCES = {
    poste: 'Enregistrée sur ce poste.',
    paquet: 'Adresse livrée avec Tracebay : enregistrez celle de votre serveur.',
    developpement: 'Choisie par SERVER_MODE (développement) : elle ne se modifie pas ici.'
};

/**
 * @param {HTMLElement} el conteneur du panneau
 * @param {{ notifier?: Function }} options
 */
export async function afficherConnexion(el, { notifier } = {}) {
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = '<p class="settings-block__hint">Chargement…</p>';
    let etat;
    try {
        etat = await window.electron.invoke('connexion:adresse');
        if (!etat?.success) {
            throw new Error(etat?.error || 'indisponible');
        }
    } catch (_) {
        el.removeAttribute('aria-busy');
        const erreur = document.createElement('p');
        erreur.className = 'settings-error';
        erreur.setAttribute('role', 'alert');
        erreur.textContent = `Adresse du serveur illisible${NB}: redémarrez Tracebay.`;
        el.replaceChildren(erreur);
        return;
    }
    el.removeAttribute('aria-busy');
    // Balisage fixe ; adresse, origine et chemin du fichier posés ensuite en texte
    el.innerHTML = `
        <form class="post-settings" novalidate>
            <fieldset class="post-settings__group">
                <legend>Serveur de l'atelier</legend>
                <label class="post-settings__label" for="connexionAdresse">Adresse du serveur</label>
                <input class="post-settings__input" id="connexionAdresse" name="adresse" type="text"
                    inputmode="url" autocomplete="off" spellcheck="false" maxlength="200"
                    aria-describedby="connexionAdresseAide connexionAdresseEtat">
                <p class="post-settings__hint" id="connexionAdresseAide"></p>
                <p class="post-settings__hint" id="connexionAdresseEtat" role="status" aria-live="polite"></p>
                <div class="settings-actions">
                    <button type="button" class="settings-btn settings-btn--ghost" data-action="tester">Tester</button>
                    <button type="submit" class="settings-btn settings-btn--primary">Enregistrer et redémarrer</button>
                </div>
            </fieldset>
        </form>`;

    const form = el.querySelector('form');
    const champ = form.querySelector('#connexionAdresse');
    champ.value = etat.serverUrl || '';
    form.querySelector('#connexionAdresseAide').textContent = `${SOURCES[etat.source] || ''} `
        + `Exemple${NB}: http://192.0.2.10:4000. Fichier${NB}: ${etat.fichier || ''}`;
    form.querySelector('fieldset').disabled = etat.source === 'developpement';
    const etatEl = form.querySelector('#connexionAdresseEtat');
    const boutons = [...form.querySelectorAll('button')];
    const message = (texte, erreur) => {
        etatEl.textContent = texte;
        etatEl.classList.toggle('settings-error', Boolean(erreur));
        champ.setAttribute('aria-invalid', erreur ? 'true' : 'false');
    };
    const occupe = (oui) => boutons.forEach((b) => {
        b.disabled = oui;
    });

    form.querySelector('[data-action="tester"]').addEventListener('click', async () => {
        occupe(true);
        message('Test en cours…', false);
        const r = await window.electron.invoke('connexion:tester', { adresse: champ.value });
        occupe(false);
        message(r.success ? `Serveur Tracebay joint à ${r.serverUrl}.` : r.error, !r.success);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        occupe(true);
        message('Vérification du serveur…', false);
        const test = await window.electron.invoke('connexion:tester', { adresse: champ.value });
        if (!test.success) {
            occupe(false);
            message(`${test.error} Adresse non enregistrée.`, true);
            champ.focus();
            return;
        }
        const r = await window.electron.invoke('connexion:enregistrer', { adresse: champ.value });
        if (!r.success) {
            occupe(false);
            message(r.error, true);
            return;
        }
        message('Adresse enregistrée. Tracebay redémarre…', false);
        notifier?.('Adresse du serveur enregistrée : redémarrage.', 'success');
    });
}

/** Bandeau quand le serveur ne répond plus : adresse en cause et accès à Paramètres > Connexion. */
export function bandeauConnexion(echec, serverUrl, ouvrir) {
    let el = document.getElementById('connexionBanner');
    if (!echec) {
        if (el) {
            el.hidden = true;
        }
        return;
    }
    if (!el) {
        el = document.createElement('div');
        el.id = 'connexionBanner';
        el.className = 'licence-banner licence-banner--alerte connexion-banner';
        el.setAttribute('role', 'alert');
        el.innerHTML = `<span data-role="texte"></span>
            <button type="button" class="settings-btn settings-btn--ghost" data-action="adresse">Adresse du serveur…</button>`;
        el.querySelector('[data-action="adresse"]').addEventListener('click', () => ouvrir());
        const header = document.getElementById('header');
        if (header?.parentNode) {
            header.parentNode.insertBefore(el, header.nextSibling);
        } else {
            document.body.prepend(el);
        }
    }
    el.querySelector('[data-role="texte"]').textContent =
        `Tracebay ne joint pas le serveur ${serverUrl || ''}. Vérifiez le réseau, ou l'adresse du serveur.`;
    el.hidden = false;
}
