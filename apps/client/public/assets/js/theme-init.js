// Applique le thème mémorisé avant le premier rendu (évite un flash clair/sombre).
try {
    const t = localStorage.getItem('Tracebay_theme_dark');
    document.documentElement.setAttribute('data-theme-dark', t === '0' ? '0' : '1');
} catch (e) { /* stockage indisponible : thème sombre par défaut */ }
