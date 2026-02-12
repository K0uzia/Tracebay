/**
 * @fileoverview Utilitaires de debouncing et throttling
 * @module debounce
 */

/**
 * Crée une fonction debounced qui reporte son exécution
 * @param {Function} func - Fonction à debouncer
 * @param {number} wait - Délai d'attente en millisecondes
 * @param {boolean} [immediate=false] - Exécuter immédiatement au premier appel
 * @returns {Function} Fonction debounced
 * @example
 * const debouncedSearch = debounce(searchFunction, 300);
 * input.addEventListener('input', debouncedSearch);
 */
export function debounce(func, wait, immediate = false) {
    let timeout;
    
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        
        const callNow = immediate && !timeout;
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        
        if (callNow) func(...args);
    };
}

/**
 * Crée une fonction throttled qui limite la fréquence d'exécution
 * @param {Function} func - Fonction à throttler
 * @param {number} limit - Délai minimum entre les exécutions en millisecondes
 * @returns {Function} Fonction throttled
 * @example
 * const throttledScroll = throttle(handleScroll, 100);
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle(func, limit) {
    let inThrottle;
    
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Crée une fonction debounced avec annulation
 * @param {Function} func - Fonction à debouncer
 * @param {number} wait - Délai d'attente en millisecondes
 * @returns {Object} Objet avec la fonction debounced et une méthode cancel
 * @example
 * const { debounced, cancel } = debounceWithCancel(searchFunction, 300);
 * input.addEventListener('input', debounced);
 * // Pour annuler
 * cancel();
 */
export function debounceWithCancel(func, wait) {
    let timeout;
    
    const debounced = function executedFunction(...args) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
    
    debounced.cancel = () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };
    
    return { debounced, cancel: debounced.cancel };
}

export default { debounce, throttle, debounceWithCancel };
