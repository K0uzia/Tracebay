/**
 * Paramètres > Connexion : adresse du serveur de l'atelier, propre à ce poste. Le processus
 * principal valide, teste (/api/health), enregistre dans <userData>/connection.json puis relance
 * Tracebay, qui lit l'adresse au démarrage. Édition serveur, 3.8.3 : après la première connexion à
 * un serveur qui a un code administrateur des postes, l'adresse est en lecture seule ; ce code
 * (vérifié par le processus principal, même serveur injoignable) l'ouvre pour 10 minutes.
 */
const NB = String.fromCharCode(160);

const SOURCES = {
    poste: 'Enregistrée sur ce poste.',
    aucune: 'Aucune adresse enregistrée : saisissez celle du serveur de l\'atelier, puis Tester.',
    paquet: 'Adresse livrée avec Tracebay : enregistrez celle de votre serveur.',
    developpement: 'Choisie par SERVER_MODE (développement) : elle ne se modifie pas ici.'
};

const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Saisie du code administrateur des postes dans un <dialog> ; le code n'est gardé nulle part. */
function ouvrirCode(declencheur, onOuvert) {
    const dialog = document.createElement('dialog');
    dialog.className = 'atelier-dialog';
    dialog.setAttribute('aria-labelledby', 'connexionCodeTitre');
    dialog.innerHTML = `
        <form class="post-settings" method="dialog" novalidate>
            <h3 id="connexionCodeTitre">Code administrateur des postes</h3>
            <p class="post-settings__hint">Défini sur le serveur par un administrateur de l'atelier. Il ouvre la modification de l'adresse pendant 10 minutes.</p>
            <label class="post-settings__label" for="connexionCode">Code</label>
            <input class="post-settings__input" id="connexionCode" name="code" type="password" autocomplete="off" maxlength="128" required>
            <p class="settings-error" role="alert" hidden></p>
            <div class="settings-actions">
                <button type="submit" class="settings-btn settings-btn--primary">Valider</button>
                <button type="button" class="settings-btn settings-btn--ghost" data-action="annuler">Annuler</button>
            </div>
        </form>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    const code = form.querySelector('[name="code"]');
    const erreur = form.querySelector('[role="alert"]');
    const valider = form.querySelector('button[type="submit"]');
    let ouvert = false;
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (!ouvert) {
            declencheur?.isConnected && declencheur.focus();
        }
    });
    form.querySelector('[data-action="annuler"]').addEventListener('click', () => {
        code.value = '';
        dialog.close();
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        erreur.hidden = true;
        valider.disabled = true;
        const r = await window.electron.invoke('connexion:deverrouiller', { code: code.value })
            .catch(() => ({ success: false, error: 'Vérification impossible.' }));
        code.value = '';
        if (r?.success) {
            ouvert = true;
            dialog.close();
            await onOuvert(r);
            return;
        }
        erreur.textContent = r?.error || 'Code incorrect.';
        erreur.hidden = false;
        // Trop d'essais : bouton bloqué pendant l'attente indiquée
        valider.disabled = Number(r?.attenteMs) > 0;
        code.focus();
    });
    dialog.showModal();
    code.focus();
    return dialog;
}

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
    const verrouille = Boolean(etat.verrouille) && !(Number(etat.ouvertJusqua) > Date.now());
    // Balisage fixe ; adresse, origine, verrou et chemin du fichier posés ensuite en texte
    el.innerHTML = `
        <form class="post-settings" novalidate>
            <div class="atelier-acces" data-role="verrou" hidden>
                <i class="fa-solid fa-lock" aria-hidden="true"></i>
                <span data-role="verrou-texte"></span>
                <button type="button" class="settings-btn settings-btn--ghost" data-action="deverrouiller">Modifier (code administrateur)…</button>
            </div>
            <div class="atelier-acces atelier-acces--edition" data-role="ouvert" role="status" hidden>
                <i class="fa-solid fa-unlock" aria-hidden="true"></i>
                <span data-role="ouvert-texte"></span>
            </div>
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
    champ.readOnly = verrouille;
    form.querySelector('button[type="submit"]').hidden = verrouille;
    const identifiant = etat.poste ? `. Identifiant du poste${NB}: ${etat.poste}` : '';
    form.querySelector('#connexionAdresseAide').textContent = `${SOURCES[etat.source] || ''} `
        + `Exemple${NB}: http://192.0.2.10:4000. Fichier${NB}: ${etat.fichier || ''}${identifiant}`;
    form.querySelector('fieldset').disabled = etat.source === 'developpement';
    if (verrouille) {
        form.querySelector('[data-role="verrou"]').hidden = false;
        form.querySelector('[data-role="verrou-texte"]').textContent = 'Adresse verrouillée : une erreur couperait ce poste '
            + `du serveur. La changer demande le code administrateur des postes (identifiant du poste${NB}: ${etat.poste || '-'}).`;
        form.querySelector('[data-action="deverrouiller"]').addEventListener('click', (e) => {
            ouvrirCode(e.currentTarget, async () => {
                await afficherConnexion(el, { notifier });
                el.querySelector('#connexionAdresse')?.focus();
            });
        });
    } else {
        form.querySelector('[data-role="verrou"]').remove();
    }
    if (!verrouille && Number(etat.ouvertJusqua) > Date.now()) {
        form.querySelector('[data-role="ouvert"]').hidden = false;
        form.querySelector('[data-role="ouvert-texte"]').textContent = `Modification ouverte jusqu'à ${heure(etat.ouvertJusqua)}.`;
    }
    const etatEl = form.querySelector('#connexionAdresseEtat');
    const boutons = [...form.querySelectorAll('fieldset button')];
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
        if (champ.readOnly) {
            return;
        }
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

/**
 * Premier lancement d'un poste jamais configuré (aucune adresse livrée ni enregistrée) : dialogue
 * modal qui ne se ferme pas avant l'enregistrement de l'adresse (Tracebay redémarre alors).
 */
export async function ouvrirPremierLancement({ notifier } = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'atelier-dialog premier-lancement';
    dialog.setAttribute('aria-labelledby', 'premierLancementTitre');
    dialog.innerHTML = `
        <h3 id="premierLancementTitre">Bienvenue dans Tracebay</h3>
        <p class="post-settings__hint">Indiquez l'adresse du serveur de votre atelier (fournie par la personne qui l'administre).</p>
        <div data-role="connexion"></div>`;
    // Échap ne ferme pas : sans adresse, Tracebay ne peut rien afficher
    dialog.addEventListener('cancel', (e) => e.preventDefault());
    document.body.appendChild(dialog);
    dialog.showModal();
    await afficherConnexion(dialog.querySelector('[data-role="connexion"]'), { notifier });
    dialog.querySelector('#connexionAdresse')?.focus();
    return dialog;
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
