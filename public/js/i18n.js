/**
 * i18n.js — Lightweight client-side internationalization engine for Sarathi.
 *
 * Usage:
 *   HTML: <span data-i18n="nav.planner">Launch AI Planner</span>
 *   JS:   const label = t('plans.viewItinerary');
 *
 * Supports inner HTML via data-i18n-html attribute for strings containing <br> etc.
 * Fires a 'langchange' CustomEvent on document when language switches.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'sarathi-lang';
    const SUPPORTED = ['en', 'hi'];
    const DEFAULT_LANG = 'en';

    /** @type {Object<string, object>} Cached translation bundles */
    const cache = {};

    /** @type {string} Current language */
    let currentLang = DEFAULT_LANG;

    /**
     * Resolve a dotted key path from a nested object.
     * @param {object} obj
     * @param {string} path - e.g. 'nav.planner'
     * @returns {string|undefined}
     */
    function resolve(obj, path) {
        return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
    }

    /**
     * Fetch and cache a translation bundle.
     * @param {string} lang
     * @returns {Promise<object>}
     */
    async function loadBundle(lang) {
        if (cache[lang]) return cache[lang];
        try {
            const res = await fetch(`/i18n/${lang}.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            cache[lang] = await res.json();
        } catch (e) {
            console.error(`[i18n] Failed to load ${lang}.json:`, e);
            cache[lang] = {};
        }
        return cache[lang];
    }

    /**
     * Apply translations to all elements with [data-i18n] or [data-i18n-html].
     */
    function applyTranslations() {
        const bundle = cache[currentLang] || {};

        // Text content replacement
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const val = resolve(bundle, key);
            if (val !== undefined) el.textContent = val;
        });

        // HTML content replacement (for strings with <br> etc.)
        document.querySelectorAll('[data-i18n-html]').forEach((el) => {
            const key = el.getAttribute('data-i18n-html');
            const val = resolve(bundle, key);
            if (val !== undefined) el.innerHTML = val;
        });

        // Placeholder replacement
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            const val = resolve(bundle, key);
            if (val !== undefined) el.placeholder = val;
        });

        // Title attribute replacement
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            const val = resolve(bundle, key);
            if (val !== undefined) el.title = val;
        });

        // Update <html lang> attribute
        document.documentElement.lang = currentLang;

        // Update toggle button label
        const toggleBtn = document.getElementById('langToggleBtn');
        if (toggleBtn) {
            const toggleLabel = resolve(bundle, 'lang.toggle') || (currentLang === 'en' ? 'हि' : 'EN');
            const currentLabel = resolve(bundle, 'lang.current') || currentLang.toUpperCase();
            toggleBtn.innerHTML = `<span class="lang-current">${currentLabel}</span><span class="lang-divider">|</span><span class="lang-alt">${toggleLabel}</span>`;
        }
    }

    /**
     * Get translated string by key for use in JS-rendered content.
     * @param {string} key - Dotted key path, e.g. 'plans.viewItinerary'
     * @param {string} [fallback] - Fallback if key not found
     * @returns {string}
     */
    function t(key, fallback) {
        const bundle = cache[currentLang] || {};
        const val = resolve(bundle, key);
        return val !== undefined ? val : (fallback || key);
    }

    /**
     * Get the current language.
     * @returns {string}
     */
    function getLang() {
        return currentLang;
    }

    /**
     * Switch the active language.
     * @param {string} lang
     */
    async function setLang(lang) {
        if (!SUPPORTED.includes(lang)) return;
        currentLang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        await loadBundle(lang);
        applyTranslations();
        document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
    }

    /**
     * Toggle between EN and HI.
     */
    function toggleLang() {
        const next = currentLang === 'en' ? 'hi' : 'en';
        setLang(next);
    }

    /**
     * Initialize i18n on DOMContentLoaded.
     */
    async function init() {
        // Restore saved preference
        const saved = localStorage.getItem(STORAGE_KEY);
        currentLang = SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;

        // Load current bundle
        await loadBundle(currentLang);
        applyTranslations();

        // Wire up toggle button
        const toggleBtn = document.getElementById('langToggleBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleLang();
            });
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API globally
    window.i18n = { t, getLang, setLang, toggleLang, applyTranslations };
})();
