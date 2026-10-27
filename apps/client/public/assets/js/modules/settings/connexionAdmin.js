/**
 * Connexion d'un administrateur de l'atelier dans un <dialog> (Branding, Types, effacement d'un
 * nom de technicien). Le processus principal garde le jeton « atelier » ; le mot de passe n'est
 * gardé nulle part, le renderer ne voit jamais de jeton.
 */

/**
 * @param {object} options
 * @param {HTMLElement} [options.declencheur] bouton qui a ouvert le dialogue
 * @param {string} options.aide texte d'explication
 * @param {(session: object) => Promise<void>|void} options.onConnecte après une connexion réussie
 * @param {() => boolean} [options.rendreFocus] rendre le focus au déclencheur à la fermeture
 */
export function ouvrirConnexionAdmin({ declencheur, aide, onConnecte, rendreFocus = () => true }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'atelier-dialog';
    dialog.setAttribute('aria-labelledby', 'atelierConnexionTitre');
    dialog.innerHTML = `
        <form class="post-settings" method="dialog" novalidate>
            <h3 id="atelierConnexionTitre">Compte administrateur</h3>
            <p class="post-settings__hint" data-role="aide"></p>
            <label class="post-settings__label" for="atelierUtilisateur">Nom d'utilisateur</label>
            <input class="post-settings__input" id="atelierUtilisateur" name="username" type="text" autocomplete="username" maxlength="50" required>
            <label class="post-settings__label" for="atelierMotDePasse">Mot de passe</label>
            <input class="post-settings__input" id="atelierMotDePasse" name="password" type="password" autocomplete="current-password" maxlength="200" required>
            <p class="settings-error" role="alert" hidden></p>
            <div class="settings-actions">
                <button type="submit" class="settings-btn settings-btn--primary" data-action="connexion">Se connecter</button>
                <button type="button" class="settings-btn settings-btn--ghost" data-action="annuler">Annuler</button>
            </div>
        </form>`;
    dialog.querySelector('[data-role="aide"]').textContent = aide;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    const erreur = form.querySelector('.settings-error');
    const user = form.querySelector('[name="username"]');
    const pass = form.querySelector('[name="password"]');
    const valider = form.querySelector('[data-action="connexion"]');
    user.value = localStorage.getItem('workspace_username') || '';
    const fermer = () => {
        pass.value = '';
        dialog.close();
    };
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (rendreFocus()) {
            declencheur?.isConnected && declencheur.focus();
        }
    });
    form.querySelector('[data-action="annuler"]').addEventListener('click', fermer);
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        erreur.hidden = true;
        if (!user.value.trim() || !pass.value) {
            erreur.textContent = 'Indiquez le nom d\'utilisateur et le mot de passe.';
            erreur.hidden = false;
            (user.value.trim() ? pass : user).focus();
            return;
        }
        valider.disabled = true;
        valider.textContent = 'Connexion…';
        const res = await window.electron.invoke('atelier:connexion', { username: user.value.trim(), password: pass.value })
            .catch(() => ({ success: false, error: 'Connexion impossible.' }));
        pass.value = '';
        valider.disabled = false;
        valider.textContent = 'Se connecter';
        if (!res?.success) {
            erreur.textContent = res?.error || 'Connexion refusée.';
            erreur.hidden = false;
            pass.focus();
            return;
        }
        fermer();
        await onConnecte(res);
    });
    dialog.showModal();
    (user.value ? pass : user).focus();
    return dialog;
}
