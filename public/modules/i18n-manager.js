/**
 * ==============================================================================
 * FILE: i18n-manager.js
 * 
 * DESCRIPTION:
 * Manages internationalization (i18n) system initialization and translation updates.
 * Handles i18next library setup, language detection, and DOM content translation.
 * 
 * ==============================================================================
 */

// --- i18next Instance ---
// Ensure i18next is available globally (from CDN in index.html)
const i18next = window.i18next;
const i18nextHttpBackend = window.i18nextHttpBackend;
const i18nextBrowserLanguageDetector = window.i18nextBrowserLanguageDetector;

// --- i18next Initialization ---
export async function initializeI18n() {
  if (!i18next || !i18nextHttpBackend || !i18nextBrowserLanguageDetector) {
    console.error('i18next libraries not loaded! Check index.html.');
    // Display a critical error message if libraries are missing
    const errorDiv = document.getElementById('startMenuOverlay') || document.body;
    errorDiv.innerHTML =
      '<h2 style="color: red;">Critical Error: Language library failed to load.</h2>';
    return false;
  }
  try {
    await i18next
      .use(i18nextHttpBackend)
      .use(i18nextBrowserLanguageDetector)
      .init({
        debug: false,
        fallbackLng: 'en',
        supportedLngs: [
          'en', 'fr', 'es', 'de', 'zh', 'ar', 'pt', 'ru', 'ja', 'hi',
          'ko', 'it', 'tr', 'id', 'pl', 'bn', 'ur', 'vi', 'th', 'fil',
          'fa', 'ms', 'nl', 'uk', 'el', 'sv', 'fi', 'hu', 'ro', 'cs',
          'sw', 'ha', 'yo', 'ig', 'zht',
        ],
        load: 'languageOnly',
        nonExplicitSupportedLngs: true,
        backend: {
          loadPath: '/locales/{{lng}}.json',
        },
        detection: {
          order: ['navigator', 'htmlTag'],
          caches: [],
        },
      });
    console.log('[i18n] Main App Init complete. Detected/Fallback language:', i18next.language);

    // Add listeners for i18next events
    i18next.on('initialized', () => {
      console.log(
        "[i18n] Event 'initialized' fired. Loaded languages:",
        Object.keys(i18next.services.resourceStore.data || {})
      );
      updateContent();
    });

    i18next.on('languageChanged', lng => {
      console.log("[i18n] Event 'languageChanged' fired. New language:", lng);
      updateContent();
    });

    i18next.on('failedLoading', (lng, ns, msg) => {
      console.error(`[i18n] CRITICAL: Failed loading language '${lng}' namespace '${ns}': ${msg}`);
      const errorDiv = document.getElementById('startMenuOverlay') || document.body;
      errorDiv.innerHTML = `<h2 style="color: red;">Error loading translations (${lng}). Some text may be missing.</h2>`;
    });

    return true;
  } catch (error) {
    console.error('[i18n] Initialization failed:', error);
    const errorDiv = document.getElementById('startMenuOverlay') || document.body;
    errorDiv.innerHTML = '<h2 style="color: red;">Failed to initialize translations.</h2>';
    return false;
  }
}

// --- Function to update DOM elements with translations ---
export function updateContent() {
  if (!i18next || !i18next.isInitialized) {
    console.warn('[updateContent] Aborted: i18next not initialized.');
    return;
  }
  console.log(`[updateContent] Running for language: ${i18next.language}`);

  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    let options = {};
    let translation = '';

    try {
      if (key.startsWith('[')) {
        // Attribute translation: [attr]key
        const match = key.match(/^\[(.*?)\](.*)$/);
        if (match) {
          const attr = match[1];
          const realKey = match[2];
          translation = i18next.t(realKey, { ...options, defaultValue: `[[${realKey}]]` });
          el.setAttribute(attr, translation);
        }
      } else if (key.startsWith('[html]')) {
        // HTML content: [html]key
        const realKey = key.substring(6);
        const translation = i18next.t(realKey, {
          ...options,
          defaultValue: `[[html]${realKey}]`,
          interpolation: { escapeValue: false },
        });
        el.innerHTML = translation;
      } else {
        // Default: textContent
        translation = i18next.t(key, { ...options, defaultValue: `[[${key}]]` });
        if (translation !== `[[${key}]]`) {
          el.textContent = translation;
        } else {
          console.warn(`[updateContent] No translation found for key: ${key}`);
        }
      }
    } catch (e) {
      console.error(`[updateContent] Error translating key "${key}":`, e);
    }
  });

  // Update page title specifically
  const titleKey = document.querySelector('title[data-i18n]')?.getAttribute('data-i18n');
  if (titleKey) {
    document.title = i18next.t(titleKey, { defaultValue: 'Slither Clone SIO' });
  }

  // Update dynamic elements if needed
  if (typeof updateLoginStateUI === 'function') updateLoginStateUI();
  if (typeof applyInitialLeaderboardState === 'function') applyInitialLeaderboardState();
}

// --- Helper Function to safely get translations ---
export function t(key, options = {}) {
  if (window.i18next && window.i18next.isInitialized) {
    return window.i18next.t(key, options);
  }
  console.warn(`i18next not ready, using fallback for key: ${key}`);
  const fallback = key.split('.').pop();
  return options.defaultValue || fallback || key;
}