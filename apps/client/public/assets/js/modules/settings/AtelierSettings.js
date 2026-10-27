/**
 * Paramètres > Branding et Types (édition serveur) : réglages d'atelier enregistrés sur le
 * serveur et partagés par tous les postes. Lecture seule pour tous (« Défini par l'administrateur
 * de l'atelier ») ;
 * modification après connexion d'un compte administrateur : le processus principal garde le jeton
 * « atelier » (1 h, trois routes), le renderer ne le voit jamais.
 * Même balisage et mêmes classes que le formulaire de la portable (PostSettingsForm.js).
 */
import api from '../../config/api.js';
import { escapeHtml } from '../../utils/html.js';
import { getMaterialTypesInfo, invalidateMaterialTypes, usageParType } from './materialTypes.js';

const NB = String.fromCharCode(160);
const PDF_BLUE = '#2D3073';
const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Contraste WCAG avec le blanc (même calcul que le serveur, pour prévenir avant l'envoi). */
function contrastWithWhite(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 1.05 / (0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] + 0.05);
}

const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** Couleur dominante d'un logo (comme la portable), assombrie pour 4,5:1 sur blanc ; null sinon. */
async function dominantLogoColor(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const ratio = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
    const [w, h] = [img.naturalWidth || size, img.naturalHeight || size];
    ctx.drawImage(img, 0, 0, w * ratio, h * ratio);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (a < 200 || max < 40 || max - min < 40) {
            continue;
        }
        const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
        const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        bucket.n += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        buckets.set(key, bucket);
    }
    const best = [...buckets.values()].sort((x, y) => y.n - x.n)[0];
    if (!best || best.n < 12) {
        return null;
    }
    let rgb = [best.r / best.n, best.g / best.n, best.b / best.n];
    for (let i = 0; i < 20 && contrastWithWhite(toHex(rgb)) < 4.5; i++) {
        rgb = rgb.map((c) => c * 0.9);
    }
    return toHex(rgb);
}

function lireFichier(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(file);
    });
}

// Première version du serveur qui a les réglages Branding et Types (route /api/material-types)
const VERSION_SERVEUR_REGLAGES = '3.8.0';

/**
 * Cause d'indisponibilité des réglages : serveur injoignable, plus ancien que le poste (route
 * absente, 404) ou en erreur. Version du serveur lue dans /api/health (tracebay_version) si
 * elle y figure ; le champ « version » historique (2.0.0 figé) n'est pas une version de Tracebay.
 */
async function causeIndisponibilite(statuts) {
    const repondu = statuts.filter((s) => s !== null && s !== undefined);
    if (!repondu.length) {
        return { texte: `Réglages de l'atelier indisponibles${NB}: Tracebay ne répond pas.` };
    }
    const poste = window.APP_CONFIG?.appVersion || '?';
    if (repondu.includes(404)) {
        let version = null;
        try {
            const res = await api.get('/api/health', { useCache: false });
            const v = res.ok ? (await res.json())?.tracebay_version : null;
            version = /^\d+\.\d+\.\d+/.test(String(v || '')) ? String(v) : null;
        } catch (_) { /* version inconnue */ }
        const serveur = version
            ? `est en version ${version}`
            : `est antérieur à la version ${VERSION_SERVEUR_REGLAGES}`;
        return { texte: `Le serveur Tracebay ${serveur}, ce poste en version ${poste}${NB}: mettez le serveur à jour.` };
    }
    const code = repondu.find((s) => s >= 400) || repondu[0];
    return {
        texte: `Réglages de l'atelier indisponibles${NB}: erreur du serveur Tracebay (code ${code}). `
            + 'Réessayez ; si cela continue, l\'administrateur peut consulter le journal du serveur.'
    };
}

const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const machines = (n) => (n === 1 ? '1 machine' : `${Number(n).toLocaleString('fr-FR')} machines`);

export default class AtelierSettings {
    /**
     * @param {{ brandingEl: HTMLElement, typesEl: HTMLElement, notifier?: Function }} options
     */
    constructor({ brandingEl, typesEl, notifier }) {
        this.brandingEl = brandingEl;
        this.typesEl = typesEl;
        this.notifier = notifier;
        this.session = { connecte: false };
    }

    get edition() {
        return Boolean(this.session.connecte && this.session.expiresAt > Date.now());
    }

    /** Recharge réglages et état de la session, puis affiche les deux onglets. */
    async render() {
        for (const el of [this.brandingEl, this.typesEl]) {
            el.setAttribute('aria-busy', 'true');
            el.innerHTML = '<p class="settings-block__hint">Chargement…</p>';
        }
        try {
            const [res, info, session] = await Promise.all([
                api.get('/api/branding', { useCache: false }).catch(() => null),
                getMaterialTypesInfo(),
                window.electron?.invoke ? window.electron.invoke('atelier:etat') : Promise.resolve({ connecte: false })
            ]);
            if (!res?.ok || info.indisponible) {
                const statuts = [res ? res.status : null, info.indisponible ? info.statut : null];
                this.renderErreur(await causeIndisponibilite(statuts));
                return;
            }
            this.branding = await res.json();
            this.info = info;
            this.session = session?.connecte ? session : { connecte: false };
        } catch (_) {
            this.renderErreur(await causeIndisponibilite([null]));
            return;
        }
        this.logo = this.branding.logo || null;
        this.logoModifie = false;
        this.types = [...this.info.types];
        this.renderBranding();
        this.renderTypes();
        for (const el of [this.brandingEl, this.typesEl]) {
            el.removeAttribute('aria-busy');
        }
    }

    renderErreur(cause) {
        for (const el of [this.brandingEl, this.typesEl]) {
            el.removeAttribute('aria-busy');
            el.innerHTML = `
                <div class="post-settings">
                    <p class="settings-error" role="alert">${escapeHtml(cause.texte)}</p>
                    <div class="settings-actions">
                        <button type="button" class="settings-btn settings-btn--ghost" data-action="reessayer">Réessayer</button>
                    </div>
                </div>`;
            el.querySelector('[data-action="reessayer"]').addEventListener('click', () => this.render());
        }
    }

    /** Bandeau commun : qui définit ces réglages, et accès administrateur. */
    accesHtml(onglet) {
        if (this.edition) {
            return `
                <div class="atelier-acces atelier-acces--edition" role="status">
                    <i class="fa-solid fa-unlock" aria-hidden="true"></i>
                    <span>Modification ouverte pour ${escapeHtml(this.session.username)} jusqu'à ${heure(this.session.expiresAt)}. Les changements valent pour tous les postes.</span>
                    <button type="button" class="settings-btn settings-btn--ghost" data-action="terminer">Terminer</button>
                </div>`;
        }
        return `
            <div class="atelier-acces">
                <i class="fa-solid fa-lock" aria-hidden="true"></i>
                <span>${onglet === 'branding'
        ? 'Seul un administrateur peut modifier le branding. Il s\'applique à tous les postes.'
        : 'Défini par l\'administrateur de l\'atelier, pour tous les postes.'}</span>
                <button type="button" class="settings-btn settings-btn--ghost" data-action="modifier">Modifier (administrateur)…</button>
            </div>`;
    }

    brancherAcces(el) {
        el.querySelector('[data-action="modifier"]')?.addEventListener('click', (e) => this.ouvrirConnexion(e.currentTarget));
        el.querySelector('[data-action="terminer"]')?.addEventListener('click', async () => {
            await window.electron.invoke('atelier:deconnexion');
            this.session = { connecte: false };
            this.notifier?.('Modification des réglages de l\'atelier terminée.', 'info');
            await this.render();
        });
    }

    // ---------- Branding ----------

    renderBranding() {
        const b = this.branding;
        const color = (b.pdf_color || PDF_BLUE).toUpperCase();
        const ro = this.edition ? '' : 'disabled';
        const nomFixe = b.nom_impose === true;
        this.brandingEl.innerHTML = `
            ${this.accesHtml('branding')}
            <form class="post-settings" novalidate>
                <fieldset class="post-settings__group" ${ro}>
                    <legend>Branding des PDF</legend>
                    <label class="post-settings__label" for="atelierNom">Nom affiché</label>
                    <input class="post-settings__input" id="atelierNom" name="company_name" type="text" maxlength="120"
                        value="${escapeHtml(b.company_name)}" ${nomFixe ? 'readonly' : ''} aria-describedby="atelierNomHint">
                    <p class="post-settings__hint" id="atelierNomHint">${nomFixe
        ? 'Imprimé en en-tête des PDF. Il est fixé par la licence de l\'atelier.'
        : 'Imprimé en en-tête des PDF de tous les postes.'}</p>
                    <span class="post-settings__label">Logo</span>
                    <div class="post-settings__logo">
                        <div class="post-settings__logo-preview" data-role="logo-preview">${this.logoHtml()}</div>
                        <div class="post-settings__logo-actions">
                            <button type="button" class="settings-btn settings-btn--ghost" data-action="choose-logo">
                                <i class="fa-solid fa-image" aria-hidden="true"></i> Choisir un logo…
                            </button>
                            <button type="button" class="settings-btn settings-btn--ghost" data-action="remove-logo" ${this.logo ? '' : 'hidden'}>
                                <i class="fa-solid fa-trash" aria-hidden="true"></i> Retirer
                            </button>
                            <span class="post-settings__hint">PNG, JPEG ou WebP, 512 Ko maximum.</span>
                            <input type="file" accept="${LOGO_TYPES.join(',')}" data-role="logo-file" hidden>
                        </div>
                    </div>
                    <label class="post-settings__label" for="atelierCouleur">Couleur des PDF</label>
                    <div class="post-settings__color">
                        <input type="color" id="atelierCouleur" name="pdf_color" value="${escapeHtml(color.toLowerCase())}" aria-describedby="atelierCouleurHint">
                        <input class="post-settings__input post-settings__color-hex" type="text" name="pdf_color_hex" maxlength="7"
                            value="${escapeHtml(color)}" aria-label="Code de la couleur" spellcheck="false">
                        <button type="button" class="settings-btn settings-btn--ghost" data-action="reset-color">
                            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Bleu d'origine
                        </button>
                    </div>
                    <p class="post-settings__hint" id="atelierCouleurHint" data-role="color-hint">Remplace le bleu des titres, filets et libellés. Choisissez une teinte foncée${NB}: elle doit rester lisible sur fond blanc.</p>
                    <span class="post-settings__label">Aperçu de l'en-tête</span>
                    <div class="post-settings__pdf-preview" data-role="pdf-preview" aria-hidden="true"></div>
                </fieldset>
                <p class="settings-error post-settings__error" role="alert" hidden></p>
                <div class="post-settings__footer" ${this.edition ? '' : 'hidden'}>
                    <button type="submit" class="settings-btn settings-btn--primary" data-action="save">
                        <i class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
                    </button>
                </div>
            </form>`;
        this.brancherAcces(this.brandingEl);
        this.attachBranding();
    }

    logoHtml() {
        return this.logo
            ? `<img src="${escapeHtml(this.logo)}" alt="Logo ${escapeHtml(this.branding.company_name)}">`
            : '<span class="post-settings__logo-empty">Aucun logo</span>';
    }

    attachBranding() {
        const form = this.brandingEl.querySelector('form');
        const errorEl = form.querySelector('.post-settings__error');
        const nameInput = form.querySelector('[name="company_name"]');
        const colorInput = form.querySelector('[name="pdf_color"]');
        const hexInput = form.querySelector('[name="pdf_color_hex"]');
        const colorHint = form.querySelector('[data-role="color-hint"]');
        const fileInput = form.querySelector('[data-role="logo-file"]');
        const showError = (message) => {
            errorEl.textContent = message || '';
            errorEl.hidden = !message;
        };
        const preview = () => {
            const el = form.querySelector('[data-role="pdf-preview"]');
            const hex = hexInput.value.trim();
            const color = /^#[0-9a-f]{6}$/i.test(hex) ? hex : (this.branding.pdf_color || PDF_BLUE);
            el.style.setProperty('--pdf-preview-color', color);
            el.innerHTML = `
                <div class="post-settings__pdf-head">
                    <span class="post-settings__pdf-title">Fiche du lot</span>
                    <span class="post-settings__pdf-brand">
                        ${this.logo ? `<img src="${escapeHtml(this.logo)}" alt="">` : ''}
                        <span>${escapeHtml(nameInput.value.trim() || this.branding.company_name)}</span>
                    </span>
                </div>
                <div class="post-settings__pdf-section">Informations du lot</div>`;
        };
        const checkColor = () => {
            const hex = hexInput.value.trim();
            const valid = /^#[0-9a-f]{6}$/i.test(hex);
            const tooLight = valid && contrastWithWhite(hex) < 3;
            hexInput.setAttribute('aria-invalid', !valid || tooLight ? 'true' : 'false');
            colorHint.classList.toggle('post-settings__hint--warn', !valid || tooLight);
            colorHint.textContent = !valid
                ? `Format attendu${NB}: #RRVVBB (par exemple #2D3073).`
                : tooLight
                    ? `Couleur trop claire${NB}: le texte des PDF serait illisible sur fond blanc.`
                    : `Remplace le bleu des titres, filets et libellés. Choisissez une teinte foncée${NB}: elle doit rester lisible sur fond blanc.`;
            return valid && !tooLight;
        };
        const setColor = (hex) => {
            colorInput.value = hex.toLowerCase();
            hexInput.value = hex.toUpperCase();
            checkColor();
            preview();
        };
        const setLogo = (dataUrl) => {
            this.logo = dataUrl;
            this.logoModifie = true;
            form.querySelector('[data-role="logo-preview"]').innerHTML = this.logoHtml();
            form.querySelector('[data-action="remove-logo"]').hidden = !dataUrl;
            preview();
        };

        nameInput.addEventListener('input', preview);
        colorInput.addEventListener('input', () => setColor(colorInput.value));
        hexInput.addEventListener('input', () => {
            if (checkColor()) {
                colorInput.value = hexInput.value.trim().toLowerCase();
            }
            preview();
        });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) {
                return;
            }
            if (!LOGO_TYPES.includes(file.type)) {
                showError('Logo refusé : PNG, JPEG ou WebP uniquement (pas de SVG).');
                return;
            }
            if (file.size > LOGO_MAX_BYTES) {
                showError('Logo refusé : 512 Ko au maximum.');
                return;
            }
            showError('');
            const dataUrl = await lireFichier(file).catch(() => null);
            if (!dataUrl) {
                showError('Lecture du logo impossible.');
                return;
            }
            setLogo(dataUrl);
            // Couleur dominante proposée, modifiable, enregistrée avec le formulaire
            const detected = await dominantLogoColor(dataUrl).catch(() => null);
            if (detected) {
                setColor(detected);
                colorHint.classList.remove('post-settings__hint--warn');
                colorHint.textContent = `Couleur ${detected} détectée sur le logo. Modifiable ; cliquez sur Enregistrer pour l'appliquer aux PDF.`;
            }
        });
        form.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn || btn.type === 'submit') {
                return;
            }
            showError('');
            if (btn.dataset.action === 'choose-logo') {
                fileInput.click();
            } else if (btn.dataset.action === 'remove-logo') {
                setLogo(null);
                form.querySelector('[data-action="choose-logo"]').focus();
            } else if (btn.dataset.action === 'reset-color') {
                setColor(PDF_BLUE);
            }
        });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.edition) {
                return;
            }
            showError('');
            if (!checkColor()) {
                hexInput.focus();
                return;
            }
            const patch = {};
            const name = nameInput.value.trim();
            if (!this.branding.nom_impose && name !== this.branding.company_name) {
                if (!name) {
                    showError('Indiquez le nom affiché sur les PDF.');
                    nameInput.focus();
                    return;
                }
                patch.company_name = name;
            }
            if (this.logoModifie) {
                patch.logo = this.logo;
            }
            const couleur = hexInput.value.trim().toUpperCase();
            if (couleur !== (this.branding.pdf_color || PDF_BLUE).toUpperCase()) {
                patch.pdf_color = couleur === PDF_BLUE ? null : couleur;
            }
            if (!Object.keys(patch).length) {
                showError('Aucun changement à enregistrer.');
                return;
            }
            await this.enregistrer(form, 'atelier:enregistrer-branding', patch, showError,
                'Branding enregistré : il s\'applique aux prochains PDF de tous les postes.');
        });
        preview();
    }

    // ---------- Types ----------

    renderTypes() {
        const ro = this.edition ? '' : 'disabled';
        const usage = usageParType(this.types, this.info.usage);
        const horsListe = usage.filter((u) => !u.dansLaListe);
        this.typesEl.innerHTML = `
            ${this.accesHtml('types')}
            <form class="post-settings" novalidate>
                <fieldset class="post-settings__group" ${ro}>
                    <legend>Types de matériel</legend>
                    <p class="post-settings__hint">Proposés dans les lots, l'inventaire, l'historique et les dons de tous les postes. « Autre (préciser) » reste toujours disponible. Retirer un type ne modifie aucune machine.</p>
                    <ul class="post-settings__types" data-role="types-list" aria-label="Types de matériel"></ul>
                    <div class="post-settings__type-add" ${this.edition ? '' : 'hidden'}>
                        <label class="visually-hidden" for="atelierTypeNouveau">Nouveau type</label>
                        <input class="post-settings__input" id="atelierTypeNouveau" name="type_new" type="text" maxlength="40"
                            placeholder="Ex. : Portable, Unité centrale, Écran…" autocomplete="off">
                        <button type="button" class="settings-btn settings-btn--ghost" data-action="add-type">
                            <i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter
                        </button>
                    </div>
                </fieldset>
                ${horsListe.length ? `
                <div class="settings-block">
                    <h4>Types hors liste encore utilisés</h4>
                    <p class="settings-block__hint">Affichés tels quels dans l'inventaire et l'historique ; ils ne sont plus proposés pour les nouvelles saisies.</p>
                    <ul class="settings-list">${horsListe.map((u) => `<li>${escapeHtml(u.label)}${NB}: utilisé par ${machines(u.count)}</li>`).join('')}</ul>
                </div>` : ''}
                <p class="settings-error post-settings__error" role="alert" hidden></p>
                <div class="post-settings__footer" ${this.edition ? '' : 'hidden'}>
                    <button type="submit" class="settings-btn settings-btn--primary" data-action="save">
                        <i class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
                    </button>
                </div>
            </form>`;
        this.brancherAcces(this.typesEl);
        this.renderTypesList();
        this.attachTypes();
    }

    renderTypesList() {
        const list = this.typesEl.querySelector('[data-role="types-list"]');
        if (!this.types.length) {
            list.innerHTML = '<li class="post-settings__types-empty">Aucun type défini.</li>';
            return;
        }
        const parType = usageParType(this.types, this.info.usage);
        const usage = new Map(parType.map((u) => [u.label.toLowerCase(), u.count]));
        list.innerHTML = this.types.map((t, i) => {
            const n = usage.get(t.toLowerCase()) || 0;
            const boutons = this.edition ? `
                <button type="button" class="post-settings__icon-btn" data-action="type-up" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter ${escapeHtml(t)}"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
                <button type="button" class="post-settings__icon-btn" data-action="type-down" data-index="${i}" ${i === this.types.length - 1 ? 'disabled' : ''} aria-label="Descendre ${escapeHtml(t)}"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
                <button type="button" class="post-settings__icon-btn post-settings__icon-btn--danger" data-action="type-remove" data-index="${i}" aria-label="Retirer ${escapeHtml(t)}${n ? ` (utilisé par ${machines(n)})` : ''}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : '';
            return `
            <li class="post-settings__type">
                <span class="post-settings__type-label">${escapeHtml(t)}</span>
                <span class="post-settings__hint atelier-usage">${n ? `utilisé par ${machines(n)}` : 'aucune machine'}</span>
                ${boutons}
            </li>`;
        }).join('');
    }

    attachTypes() {
        const form = this.typesEl.querySelector('form');
        const errorEl = form.querySelector('.post-settings__error');
        const typeInput = form.querySelector('[name="type_new"]');
        const showError = (message) => {
            errorEl.textContent = message || '';
            errorEl.hidden = !message;
        };
        const addType = () => {
            const t = typeInput.value.replace(/\s+/g, ' ').trim();
            if (!t) {
                return true;
            }
            if (this.types.some((x) => x.toLowerCase() === t.toLowerCase())) {
                showError(`Le type « ${t} » existe déjà.`);
                return false;
            }
            this.types.push(t);
            typeInput.value = '';
            this.renderTypesList();
            typeInput.focus();
            return true;
        };
        typeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                showError('');
                addType();
            }
        });
        form.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn || btn.type === 'submit' || !this.edition) {
                return;
            }
            showError('');
            const action = btn.dataset.action;
            if (action === 'add-type') {
                addType();
            } else if (action === 'type-remove' || action === 'type-up' || action === 'type-down') {
                const i = Number(btn.dataset.index);
                if (action === 'type-remove') {
                    this.types.splice(i, 1);
                } else {
                    const j = action === 'type-up' ? i - 1 : i + 1;
                    [this.types[i], this.types[j]] = [this.types[j], this.types[i]];
                }
                this.renderTypesList();
                const cible = action === 'type-up' ? i - 1 : action === 'type-down' ? i + 1 : i;
                const again = this.typesEl.querySelector(`[data-action="${action}"][data-index="${cible}"]`);
                (again && !again.disabled ? again : typeInput)?.focus();
            }
        });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.edition) {
                return;
            }
            showError('');
            // Saisie en cours non validée : ajoutée plutôt que perdue
            if (typeInput.value.trim() && !addType()) {
                typeInput.focus();
                return;
            }
            await this.enregistrer(form, 'atelier:enregistrer-types', { types: this.types }, showError,
                'Types de matériel enregistrés pour tous les postes.');
        });
    }

    // ---------- Enregistrement et connexion ----------

    async enregistrer(form, canal, payload, showError, succes) {
        const saveBtn = form.querySelector('[data-action="save"]');
        const libelle = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement…';
        const res = await window.electron.invoke(canal, payload).catch(() => ({ success: false, error: 'Enregistrement impossible.' }));
        saveBtn.disabled = false;
        saveBtn.innerHTML = libelle;
        if (!res?.success) {
            showError(res?.error || 'Enregistrement impossible.');
            if (res?.code === 'reconnexion') {
                this.session = { connecte: false };
                await this.render();
            }
            return;
        }
        invalidateMaterialTypes();
        window.dispatchEvent(new Event('tracebay:settings-saved'));
        this.notifier?.(succes, 'success');
        await this.render();
    }

    /** Connexion d'un administrateur dans un <dialog> ; le mot de passe n'est gardé nulle part. */
    ouvrirConnexion(declencheur) {
        const section = declencheur?.closest?.('#settingsBrandingSettings, #settingsTypesSettings');
        const dialog = document.createElement('dialog');
        dialog.className = 'atelier-dialog';
        dialog.setAttribute('aria-labelledby', 'atelierConnexionTitre');
        dialog.innerHTML = `
            <form class="post-settings" method="dialog" novalidate>
                <h3 id="atelierConnexionTitre">Compte administrateur</h3>
                <p class="post-settings__hint">Nom et logo des PDF, couleur et types de matériel valent pour tous les postes : leur modification est réservée à un compte administrateur de l'atelier. Elle reste ouverte une heure sur ce poste.</p>
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
            if (!this.edition) {
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
            this.session = res;
            fermer();
            this.notifier?.(`Modification des réglages de l'atelier ouverte jusqu'à ${heure(res.expiresAt)}.`, 'success');
            await this.render();
            section?.querySelector('input:not([readonly]):not([type="file"])')?.focus();
        });
        dialog.showModal();
        (user.value ? pass : user).focus();
    }
}
