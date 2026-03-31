export function formatLocalISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseYmd(ymd) {
    if (typeof ymd !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month, day };
}

/**
 * Parse une date YYYY-MM-DD en Date locale (minuit local).
 * On évite `new Date("YYYY-MM-DD")` car il est interprété en UTC.
 */
export function parseLocalDate(ymd) {
    const parts = parseYmd(ymd);
    if (!parts) return null;
    return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

/**
 * Parse une date/heure "locale" à partir d'une chaîne type:
 * - "YYYY-MM-DDTHH:mm:ss"
 * - "YYYY-MM-DD HH:mm:ss"
 * - variantes avec millisecondes / suffixe Z / offset (ignorés volontairement)
 *
 * But: préserver l'heure "horloge" telle qu'affichée, sans décalage timezone.
 */
export function parseLocalDateTime(dateTime) {
    if (typeof dateTime !== 'string') return null;
    const normalized = dateTime.trim().replace(' ', 'T');
    const core = normalized.slice(0, 19); // YYYY-MM-DDTHH:mm:ss
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(core);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6] ?? '0');
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
    return new Date(year, month - 1, day, hour, minute, second, 0);
}

export function formatDateFR(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

export function formatLocalDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getDateRange(currentDate, currentView) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    let startDate, endDate;

    if (currentView === 'week') {
        startDate = new Date(currentDate);
        const day = startDate.getDay();
        const diff = startDate.getDate() - (day === 0 ? 6 : day - 1);
        startDate.setDate(diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
    } else if (currentView === 'month') {
        startDate = new Date(year, month, 1);
        const dayOfWeek = startDate.getDay();
        const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(1 - adjustedDay);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 41);
    } else if (currentView === 'year') {
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31);
    }

    return {
        startDate: formatLocalISODate(startDate),
        endDate: formatLocalISODate(endDate)
    };
}

export function syncDateInputs(startId, endId, options = {}) {
    const startInput = document.getElementById(startId);
    const endInput = document.getElementById(endId);
    if (!startInput || !endInput) return;

    const ensureOrder = () => {
        if (!startInput.value) return;

        endInput.min = startInput.value;

        if (!endInput.value || endInput.value < startInput.value) {
            // Inputs de type="date" attendent strictement "YYYY-MM-DD".
            // Ne pas injecter de "YYYY-MM-DDTHH:mm" (valeur invalide => comportements bizarres selon navigateur).
            endInput.value = startInput.value;
        }
    };

    if (!startInput.dataset.syncBound) {
        ['change', 'input'].forEach(evt => {
            startInput.addEventListener(evt, ensureOrder);
        });
        startInput.dataset.syncBound = 'true';
    }

    if (options.forceUpdate) {
        ensureOrder();
    }
}
