// --- public/ui-logic.js ---
/**
 * ==============================================================================
 * FILE: ui-logic.js
 *
 * DESCRIPTION:
 * Handles UI logic and DOM manipulation for elements outside the main game canvas.
 * Manages the main menu display and navigation (modes, forms), form submissions
 * (login, create account), leaderboard visibility and updates, authentication state
 * display (welcome message, button visibility), notification system, skin/appearance
 * form interactions, sound form triggering, credits/help panel, and keyboard navigation.
 * Initializes i18next for the main application.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully.
 * - Keep DOM manipulations efficient. Interact with other modules (Game, SoundManager) via their public interfaces.
 * ==============================================================================
 */

// Interacts with Game, SoundManager. Manages the global 'loggedInUsername'.
// Assumes global 'i18next' libraries are loaded from index.html.

// --- Global Variables (accessible by game.js) ---
let socket;
let myId = null;
let loggedInUsername = null; // Store the logged-in username
let isAdmin = false; // Track admin status client-side
let accountData = null; // Stores { username, headColor, bodyColor, skinData } for logged-in users
let wasLoggedInBeforeDisconnect = false; // Flag to remember login state during disconnect
let gameHasStarted = false; // Flag to track if game loop/rendering has begun
const clientNotificationCooldown = 5000; // Min time (ms) between notifications for the same user client-side
const lastClientNotificationTimes = {}; // { username: timestamp }
let focusedButtonIndex = -1;
let menuButtons = []; // Will hold currently visible menu buttons
const konamiSequence = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
];
let konamiInput = [];
let zeroGravityActive = false;
let zeroGravityInterval = null;
// Default skin data (used before login or if account data is missing)
let currentSkinData = {
  bodyType: 'single',
  headColor: '#ff0000', // Default head color added
  bodyColor: '#ffff00', // Default body color
  patternColors: [],
  trailEffect: 'none',
};

// --- UI Elements (Variables declared here) ---
let gameOverOverlay,
  replayButton,
  backToMenuButton,
  startMenuOverlay,
  welcomeMessage,
  modeSelector,
  tempForm,
  loginForm,
  createForm,
  soundForm,
  skinForm,
  tempModeBtn,
  loginModeBtn,
  createModeBtn,
  skinModeBtn,
  customSoundsBtn,
  ghostModeBtn,
  logoutBtn,
  deleteAccountBtn,
  backModeBtn1,
  backModeBtn2,
  backModeBtn3,
  backModeBtn4,
  backModeBtn6,
  loginUsernameInput,
  loginPasswordInput,
  createUsernameInput,
  createPasswordInput,
  createHeadColorInput,
  createBodyColorInput,
  startButton,
  loginButton,
  createButton,
  saveSkinButton,
  leaderboardPanel,
  leaderboardToggleBtn,
  showLeaderboardBtn,
  leaderboardContent,
  adminMessageOverlay,
  adminLink,
  notificationContainer,
  minimapCanvas,
  exitGhostButton,
  ghostShortcutGuide,
  creditsHelpBtn,
  creditsHelpPanel,
  closeCreditsHelpBtn;
// Skin form elements
let skinBodyTypeRadios,
  skinSingleColorSection,
  skinHeadColorInput,
  skinBodyColorInput,
  skinPatternSection,
  patternColorPickersContainer,
  addPatternColorBtn,
  removePatternColorBtn,
  trailEffectSelect;

// --- Function to get references to UI elements ---
// Moved definition before DOMContentLoaded listener
function initializeUIElements() {
  gameOverOverlay = document.getElementById('gameOverOverlay');
  replayButton = document.getElementById('replayButton');
  backToMenuButton = document.getElementById('backToMenuButton');
  startMenuOverlay = document.getElementById('startMenuOverlay');
  welcomeMessage = document.getElementById('welcomeMessage');
  modeSelector = document.getElementById('modeSelector');
  tempForm = document.getElementById('tempForm');
  loginForm = document.getElementById('loginForm');
  createForm = document.getElementById('createForm');
  soundForm = document.getElementById('soundForm');
  skinForm = document.getElementById('skinForm');
  tempModeBtn = document.getElementById('tempModeBtn');
  loginModeBtn = document.getElementById('loginModeBtn');
  createModeBtn = document.getElementById('createModeBtn');
  skinModeBtn = document.getElementById('skinModeBtn');
  customSoundsBtn = document.getElementById('customSoundsBtn');
  ghostModeBtn = document.getElementById('ghostModeBtn');
  logoutBtn = document.getElementById('logoutBtn');
  deleteAccountBtn = document.getElementById('deleteAccountBtn');
  backModeBtn1 = document.getElementById('backModeBtn1');
  backModeBtn2 = document.getElementById('backModeBtn2');
  backModeBtn3 = document.getElementById('backModeBtn3');
  backModeBtn4 = document.getElementById('backModeBtn4');
  backModeBtn6 = document.getElementById('backModeBtn6'); // Changed from 5
  loginUsernameInput = document.getElementById('loginUsernameInput');
  loginPasswordInput = document.getElementById('loginPasswordInput');
  createUsernameInput = document.getElementById('createUsernameInput');
  createPasswordInput = document.getElementById('createPasswordInput');
  createHeadColorInput = document.getElementById('createHeadColorInput');
  createBodyColorInput = document.getElementById('createBodyColorInput');
  startButton = document.getElementById('startButton');
  loginButton = document.getElementById('loginButton');
  createButton = document.getElementById('createButton');
  saveSkinButton = document.getElementById('saveSkinButton');
  leaderboardPanel = document.getElementById('leaderboard');
  leaderboardToggleBtn = document.getElementById('leaderboardToggleBtn');
  showLeaderboardBtn = document.getElementById('showLeaderboardBtn');
  leaderboardContent = document.getElementById('leaderboardContent');
  adminMessageOverlay = document.getElementById('adminMessageOverlay');
  adminLink = document.getElementById('adminLink');
  notificationContainer = document.getElementById('notificationContainer');
  minimapCanvas = document.getElementById('minimapCanvas');
  exitGhostButton = document.getElementById('exitGhostButton');
  ghostShortcutGuide = document.getElementById('ghostShortcutGuide');
  creditsHelpBtn = document.getElementById('creditsHelpBtn');
  creditsHelpPanel = document.getElementById('creditsHelpPanel');
  closeCreditsHelpBtn = document.getElementById('closeCreditsHelpBtn');
  // Skin form elements
  skinBodyTypeRadios = document.querySelectorAll('input[name="bodyType"]');
  skinSingleColorSection = document.getElementById('skinSingleColorSection');
  skinHeadColorInput = document.getElementById('skinHeadColorInput'); // Added
  skinBodyColorInput = document.getElementById('skinBodyColorInput');
  skinPatternSection = document.getElementById('skinPatternSection');
  patternColorPickersContainer = document.getElementById('patternColorPickers');
  addPatternColorBtn = document.getElementById('addPatternColorBtn');
  removePatternColorBtn = document.getElementById('removePatternColorBtn');
  trailEffectSelect = document.getElementById('trailEffectSelect');
}

// --- i18next Instance ---
// Ensure i18next is available globally (from CDN in index.html)
const i18next = window.i18next;
const i18nextHttpBackend = window.i18nextHttpBackend;
const i18nextBrowserLanguageDetector = window.i18nextBrowserLanguageDetector;

// --- i18next Initialization ---
async function initializeI18n() {
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
        debug: false, // Set to true for debugging
        fallbackLng: 'en',
        supportedLngs: [
          'en',
          'fr',
          'es',
          'de',
          'zh',
          'ar',
          'pt',
          'ru',
          'ja',
          'hi',
          'ko',
          'it',
          'tr',
          'id',
          'pl',
          'bn',
          'ur',
          'vi',
          'th',
          'fil',
          'fa',
          'ms',
          'nl',
          'uk',
          'el',
          'sv',
          'fi',
          'hu',
          'ro',
          'cs',
          'sw',
          'ha',
          'yo',
          'ig',
          'zht',
        ],
        load: 'languageOnly', // Important for mapping 'fr-FR' to 'fr'
        nonExplicitSupportedLngs: true, // Important for mapping 'fr-FR' to 'fr'
        backend: {
          loadPath: '/locales/{{lng}}.json', // Path to translation files
        },
        detection: {
          order: ['navigator', 'htmlTag'], // Detect language from browser/HTML tag
          caches: [], // Disable language caching
        },
      });
    console.log('[i18n] Main App Init complete. Detected/Fallback language:', i18next.language);

    // Add listeners for i18next events
    i18next.on('initialized', () => {
      console.log(
        "[i18n] Event 'initialized' fired. Loaded languages:",
        Object.keys(i18next.services.resourceStore.data || {})
      );
      updateContent(); // Initial translation after init
    });

    i18next.on('languageChanged', lng => {
      console.log("[i18n] Event 'languageChanged' fired. New language:", lng);
      // No need to explicitly load languages here if backend does it automatically
      updateContent(); // Update UI when language changes
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
function updateContent() {
  if (!i18next || !i18next.isInitialized) {
    console.warn('[updateContent] Aborted: i18next not initialized.');
    return;
  }
  console.log(`[updateContent] Running for language: ${i18next.language}`);

  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    let options = {}; // Add options if needed (e.g., for interpolation)
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
          // Avoid replacing if key not found
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

  // Update dynamic elements if needed (e.g., leaderboard status, welcome message)
  updateLoginStateUI(); // Re-translate welcome message
  // If leaderboard is visible, potentially re-render it to update status/dates
  if (leaderboardPanel && leaderboardPanel.classList.contains('visible')) {
    // Assuming getLeaderboardData() fetches or holds the data
    // updateLeaderboard(getLeaderboardData()); // Re-call leaderboard update
  }
}

// --- Helper Function (already defined in previous steps) ---
// Helper to safely get translations (used by functions below)
function t(key, options = {}) {
  if (window.i18next && window.i18next.isInitialized) {
    return window.i18next.t(key, options);
  }
  console.warn(`i18next not ready, using fallback for key: ${key}`);
  const fallback = key.split('.').pop();
  return options.defaultValue || fallback || key;
}

// --- DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM fully loaded and parsed');
  initializeUIElements(); // Call the function to get element references

  // --- Initialize i18next FIRST ---
  const i18nReady = await initializeI18n();
  if (!i18nReady) {
    console.error('Aborting UI logic setup due to i18n initialization failure.');
    return; // Stop further execution if i18n fails
  }
  // --- End i18next Initialization ---

  loadInitialColors(); // Load default colors into skin form
  setupEventListeners();
  gameOverOverlay.style.display = 'none';
  gameOverOverlay.style.opacity = '0';
  adminMessageOverlay.style.display = 'none';
  adminMessageOverlay.classList.remove('visible');
  adminLink.style.display = 'none';
  exitGhostButton.style.display = 'none';
  ghostShortcutGuide.style.display = 'none';
  if (typeof SoundManager !== 'undefined') SoundManager.init(); // Initialize Sound Manager
  creditsHelpPanel.classList.remove('visible');
  checkAuthentication(); // Check auth status (will update UI and skin form)
  applyInitialLeaderboardState();
  const snakeSizeDisplay = document.getElementById('snakeSizeDisplay');
  if (snakeSizeDisplay) {
    snakeSizeDisplay.textContent = '';
    snakeSizeDisplay.style.opacity = '0';
  }
  if (minimapCanvas) minimapCanvas.style.display = 'none'; // Hide minimap initially
  document.body.classList.remove('real-mode'); // Ensure body class is reset
  showForm(null); // Show main mode selector initially

  // Initial content update after i18n is ready
  updateContent();
});

// --- Helper Functions ---
function checkColorBrightness(hex) {
  if (!hex || hex.length < 7) return 255;
  let r = parseInt(hex.substr(1, 2), 16);
  let g = parseInt(hex.substr(3, 2), 16);
  let b = parseInt(hex.substr(5, 2), 16);
  return r * 0.299 + g * 0.587 + b * 0.114;
}
function enforceLightColor(inputElem) {
  if (checkColorBrightness(inputElem.value) < 50) {
    // Use translated alert
    alert(t('ui.alerts.colorTooDark'));
  }
}
function showForm(formToShow) {
  if (!modeSelector || !tempForm || !loginForm || !createForm || !soundForm || !skinForm) return;
  modeSelector.classList.remove('active');
  tempForm.classList.remove('active');
  loginForm.classList.remove('active');
  createForm.classList.remove('active');
  soundForm.classList.remove('active');
  skinForm.classList.remove('active');
  if (formToShow) {
    formToShow.classList.add('active');
  } else {
    modeSelector.classList.add('active');
  }
  updateFocusableButtons();
}
function loadInitialColors() {
  if (!skinHeadColorInput || !skinBodyColorInput) return;
  skinHeadColorInput.value = localStorage.getItem('headColor') || '#ff0000';
  skinBodyColorInput.value = localStorage.getItem('bodyColor') || '#ffff00';
  currentSkinData.headColor = skinHeadColorInput.value;
  currentSkinData.bodyColor = skinBodyColorInput.value;
}
function formatDateTime(timestamp) {
  if (!timestamp) return t('leaderboard.status.never'); // Translate "Never"
  const date = new Date(timestamp);
  const now = new Date();
  const diffSeconds = Math.round((now - date) / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  // Use translated relative time formats
  if (diffSeconds < 60) return t('leaderboard.time.secondsAgo', { count: diffSeconds });
  if (diffMinutes < 60) return t('leaderboard.time.minutesAgo', { count: diffMinutes });
  if (diffHours < 24) return t('leaderboard.time.hoursAgo', { count: diffHours });
  if (diffDays === 1) return t('leaderboard.time.yesterday');
  if (diffDays < 7) return t('leaderboard.time.daysAgo', { count: diffDays });
  // Use locale-specific date format for older dates
  return date.toLocaleDateString(i18next.language || 'default');
}

// --- Notification Function ---
function showNotification(message, type = 'info') {
  if (!notificationContainer) return;
  const now = Date.now();
  // Use message itself as key for client-side cooldown
  const messageKeyForCooldown = typeof message === 'string' ? message : JSON.stringify(message);
  const lastTime = lastClientNotificationTimes[messageKeyForCooldown] || 0;

  if (now - lastTime < clientNotificationCooldown) {
    return;
  }
  lastClientNotificationTimes[messageKeyForCooldown] = now;

  const notif = document.createElement('div');
  notif.classList.add('notification', `notification-${type}`);
  // The message received might already be translated if it's from ui-logic itself,
  // or it might be a key if it came from the server (handled elsewhere).
  // For simplicity here, assume 'message' is the final text to display.
  notif.textContent = message;
  notificationContainer.appendChild(notif);
  requestAnimationFrame(() => {
    notif.style.opacity = 1;
    notif.style.transform = 'translateX(0)';
  });
  setTimeout(() => {
    notif.style.opacity = 0;
    notif.style.transform = 'translateX(100%)';
    setTimeout(() => {
      notif.remove();
    }, 500);
  }, 4000);
}

// --- Skin Form Logic ---
function applySkinDataToForm() {
  if (!currentSkinData) {
    console.warn('applySkinDataToForm called with null currentSkinData, resetting to default.');
    currentSkinData = {
      bodyType: 'single',
      headColor: localStorage.getItem('headColor') || '#ff0000',
      bodyColor: localStorage.getItem('bodyColor') || '#ffff00',
      patternColors: [],
      trailEffect: 'none',
    };
  }

  if (skinHeadColorInput) skinHeadColorInput.value = currentSkinData.headColor || '#ff0000';

  const radioToCheck = document.querySelector(
    `input[name="bodyType"][value="${currentSkinData.bodyType}"]`
  );
  if (radioToCheck) radioToCheck.checked = true;
  else {
    const singleRadio = document.querySelector('input[name="bodyType"][value="single"]');
    if (singleRadio) singleRadio.checked = true;
    currentSkinData.bodyType = 'single';
  }

  if (skinBodyColorInput) skinBodyColorInput.value = currentSkinData.bodyColor || '#ffff00';

  if (trailEffectSelect) {
    const validOption = Array.from(trailEffectSelect.options).some(
      opt => opt.value === currentSkinData.trailEffect
    );
    trailEffectSelect.value = validOption ? currentSkinData.trailEffect : 'none';
    if (!validOption) currentSkinData.trailEffect = 'none';
  }

  const colors = Array.isArray(currentSkinData.patternColors) ? currentSkinData.patternColors : [];
  if (patternColorPickersContainer) populatePatternPickers(colors);

  toggleSkinSections();
}
function toggleSkinSections() {
  if (!skinSingleColorSection || !skinPatternSection) return;
  const selectedTypeRadio = document.querySelector('input[name="bodyType"]:checked');
  const selectedType = selectedTypeRadio ? selectedTypeRadio.value : 'single';
  skinSingleColorSection.style.display = selectedType === 'single' ? 'block' : 'none';
  skinPatternSection.style.display = selectedType === 'pattern' ? 'block' : 'none';
}
function populatePatternPickers(colors) {
  if (!patternColorPickersContainer) return;
  patternColorPickersContainer.innerHTML = '';
  colors.forEach((color, index) => {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = color;
    input.dataset.index = index;
    input.tabIndex = 0;
    patternColorPickersContainer.appendChild(input);
  });
}
function addPatternColor() {
  const currentColors = getPatternColorsFromPickers();
  if (currentColors.length < 8) {
    const newColor =
      '#' +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
    populatePatternPickers([...currentColors, newColor]);
  } else {
    // Use translated alert
    alert(t('ui.alerts.maxPatternColors', { max: 8 }));
  }
}
function removePatternColor() {
  const currentColors = getPatternColorsFromPickers();
  if (currentColors.length > 1) {
    populatePatternPickers(currentColors.slice(0, -1));
  }
}
function getPatternColorsFromPickers() {
  if (!patternColorPickersContainer) return [];
  return Array.from(patternColorPickersContainer.querySelectorAll('input[type="color"]')).map(
    input => input.value
  );
}

// --- Keyboard Navigation & Focus ---
function updateFocusableButtons() {
  const activeForm = document.querySelector('.modeForm.active');
  let container = activeForm || modeSelector;
  if (!container) return;

  menuButtons = Array.from(
    container.querySelectorAll(
      'button, input[type="color"], input[type="radio"], input[type="file"], select'
    )
  ).filter(el => el.offsetParent !== null && !el.disabled);

  if (focusedButtonIndex >= menuButtons.length) {
    focusedButtonIndex = -1;
  }
  applyFocus();
}
function changeFocus(delta) {
  if (menuButtons.length === 0) return;
  if (focusedButtonIndex >= 0 && focusedButtonIndex < menuButtons.length) {
    menuButtons[focusedButtonIndex].classList.remove('focused');
  }
  focusedButtonIndex += delta;
  if (focusedButtonIndex >= menuButtons.length) focusedButtonIndex = 0;
  else if (focusedButtonIndex < 0) focusedButtonIndex = menuButtons.length - 1;
  applyFocus();
}
function applyFocus() {
  menuButtons.forEach((btn, index) => {
    if (index === focusedButtonIndex) {
      btn.classList.add('focused');
      btn.focus();
    } else {
      btn.classList.remove('focused');
    }
  });
}
function handleMenuKeyDown(event) {
  if (!startMenuOverlay || startMenuOverlay.style.display === 'none') return;
  if (
    document.activeElement &&
    ((document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') ||
      document.activeElement.tagName === 'TEXTAREA' ||
      (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'password')) // Include password fields
  ) {
    if (event.key === 'Enter') activateFocusedButton(); // Allow Enter in text fields to submit form
    return; // Don't interfere with typing
  }
  if (creditsHelpPanel && creditsHelpPanel.classList.contains('visible')) {
    if (event.key === 'Escape') closeCreditsHelpPanel();
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
    case 'Tab':
      event.preventDefault();
      changeFocus(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      changeFocus(-1);
      break;
    case 'Enter':
      event.preventDefault();
      activateFocusedButton();
      break;
    case 'Escape': {
      const activeForm = document.querySelector('.modeForm.active');
      if (activeForm) showForm(null);
      else if (creditsHelpPanel.classList.contains('visible')) closeCreditsHelpPanel();
      break;
    }
  }
  handleKonamiInput(event.code);
}
function activateFocusedButton() {
  if (focusedButtonIndex >= 0 && focusedButtonIndex < menuButtons.length) {
    menuButtons[focusedButtonIndex].click();
  }
}

// --- Konami Code Logic ---
function handleKonamiInput(keyCode) {
  konamiInput.push(keyCode);
  konamiInput = konamiInput.slice(-konamiSequence.length);
  if (konamiInput.join('') === konamiSequence.join('')) {
    console.log('Konami Code Activated!');
    toggleZeroGravity();
    konamiInput = [];
  }
}
function toggleZeroGravity() {
  zeroGravityActive = !zeroGravityActive;
  const innerContainer = document.getElementById('menu-inner-container');
  if (!innerContainer) return;
  if (zeroGravityActive) {
    innerContainer.classList.add('zero-gravity');
    const elementsToFloat = innerContainer.querySelectorAll('.modeSelector button, .modeForm');
    elementsToFloat.forEach(el => {
      el.style.position = 'absolute';
      el.style.transition = 'top 0.5s ease-out, left 0.5s ease-out';
    });
    zeroGravityInterval = setInterval(
      () => moveFloatingElements(innerContainer, elementsToFloat),
      1000
    );
    moveFloatingElements(innerContainer, elementsToFloat);
  } else {
    innerContainer.classList.remove('zero-gravity');
    clearInterval(zeroGravityInterval);
    zeroGravityInterval = null;
    const elementsToReset = innerContainer.querySelectorAll('.modeSelector button, .modeForm');
    elementsToReset.forEach(el => {
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.transition = '';
    });
    const activeForm = document.querySelector('.modeForm.active');
    showForm(activeForm);
  }
}
function moveFloatingElements(container, elements) {
  const containerRect = container.getBoundingClientRect();
  elements.forEach(el => {
    if (!zeroGravityActive) return;
    const elRect = el.getBoundingClientRect();
    const maxX = containerRect.width - elRect.width;
    const maxY = containerRect.height - elRect.height;
    const newX = Math.random() * maxX;
    const newY = Math.random() * maxY;
    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;
  });
}

// --- Credits/Help Panel Logic ---
function openCreditsHelpPanel() {
  if (creditsHelpPanel) creditsHelpPanel.classList.add('visible');
}
function closeCreditsHelpPanel() {
  if (creditsHelpPanel) creditsHelpPanel.classList.remove('visible');
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  if (!skinHeadColorInput) return; // Guard

  skinHeadColorInput.addEventListener('change', () => {
    enforceLightColor(skinHeadColorInput);
    currentSkinData.headColor = skinHeadColorInput.value;
    localStorage.setItem('headColor', currentSkinData.headColor);
  });
  skinBodyColorInput.addEventListener('change', () => {
    enforceLightColor(skinBodyColorInput);
    currentSkinData.bodyColor = skinBodyColorInput.value;
    localStorage.setItem('bodyColor', currentSkinData.bodyColor);
  });
  createHeadColorInput.addEventListener('change', () => {
    enforceLightColor(createHeadColorInput);
    localStorage.setItem('headColor', createHeadColorInput.value);
    skinHeadColorInput.value = createHeadColorInput.value;
  });
  createBodyColorInput.addEventListener('change', () => {
    enforceLightColor(createBodyColorInput);
    localStorage.setItem('bodyColor', createBodyColorInput.value);
    skinBodyColorInput.value = createBodyColorInput.value;
  });

  tempModeBtn.addEventListener('click', () => {
    startMenuOverlay.style.display = 'none';
    adminLink.style.display = 'none';
    gameHasStarted = false;
    const tempSkinData = {
      bodyType: document.querySelector('input[name="bodyType"]:checked').value,
      headColor: skinHeadColorInput.value,
      bodyColor: skinBodyColorInput.value,
      patternColors: getPatternColorsFromPickers(),
      trailEffect: trailEffectSelect.value,
    };
    initSocket({
      mode: 'temp',
      headColor: tempSkinData.headColor,
      bodyColor: tempSkinData.bodyColor,
      skinData: tempSkinData,
    });
  });
  loginModeBtn.addEventListener('click', () => showForm(loginForm));
  createModeBtn.addEventListener('click', () => showForm(createForm));
  skinModeBtn.addEventListener('click', () => {
    applySkinDataToForm();
    showForm(skinForm);
  });
  customSoundsBtn.addEventListener('click', () => {
    if (typeof SoundManager !== 'undefined') SoundManager.updateStatus();
    showForm(soundForm);
  });
  ghostModeBtn.addEventListener('click', () => {
    // Use translated confirm
    if (isAdmin && confirm(t('ui.confirms.enterGhostMode'))) {
      startMenuOverlay.style.display = 'none';
      adminLink.style.display = 'none';
      gameHasStarted = false;
      initSocket({ mode: 'ghost', username: loggedInUsername });
    }
  });
  backModeBtn1.addEventListener('click', () => showForm(null));
  backModeBtn2.addEventListener('click', () => showForm(null));
  backModeBtn3.addEventListener('click', () => showForm(null));
  backModeBtn4.addEventListener('click', () => showForm(null));
  backModeBtn6.addEventListener('click', () => showForm(null));

  startButton.addEventListener('click', () => {
    tempModeBtn.click();
  });
  loginButton.addEventListener('click', () => {
    const username = loginUsernameInput.value;
    const password = loginPasswordInput.value;
    if (!username || !password)
      // Use translated alert
      return alert(t('ui.alerts.missingCredentials'));
    fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    })
      .then(response =>
        response.ok
          ? response.json() // Expect JSON now
          : response.json().then(errData => {
              // Expect JSON error too
              throw new Error(t(errData.messageKey, errData.messageOptions || {})); // Translate server error key
            })
      )
      .then(data => {
        if (data.success) {
          // Login successful, now update UI but stay on menu
          showNotification(t(data.messageKey)); // Show success message from server
          checkAuthentication(); // This will fetch user data and update UI state
          showForm(null); // Go back to the main mode selector view
          // DO NOT CALL initSocket() or startGame here
        } else {
          // Alert with translated message from server
          alert(t(data.messageKey, data.messageOptions || {}));
        }
      })
      .catch(error => alert(t('ui.alerts.loginError', { error: error.message }))); // Translate error
  });
  createButton.addEventListener('click', () => {
    const username = createUsernameInput.value;
    const password = createPasswordInput.value;
    const headColor = createHeadColorInput.value;
    const bodyColor = createBodyColorInput.value;
    if (!username || !password)
      // Use translated alert
      return alert(t('ui.alerts.missingCredentials'));
    if (username.length < 3 || username.length > 15)
      // Use translated alert
      return alert(t('ui.alerts.usernameLength', { min: 3, max: 15 }));
    if (password.length < 4)
      // Use translated alert
      return alert(t('ui.alerts.passwordLength', { min: 4 }));
    fetch('/createAccount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&headColor=${encodeURIComponent(headColor)}&bodyColor=${encodeURIComponent(bodyColor)}`,
    })
      .then(response =>
        response.ok
          ? response.json() // Expect JSON
          : response.json().then(errData => {
              // Expect JSON error
              throw new Error(t(errData.messageKey, errData.messageOptions || {})); // Translate server error key
            })
      )
      .then(data => {
        if (data.success) {
          // Use translated alert
          alert(t(data.messageKey));
          accountData = {
            username,
            headColor,
            bodyColor,
            skinData: {
              bodyType: 'single',
              bodyColor: bodyColor,
              patternColors: [],
              trailEffect: 'none',
            },
          };
          loggedInUsername = username;
          wasLoggedInBeforeDisconnect = true;
          currentSkinData = accountData.skinData;
          checkAuthentication();
          startMenuOverlay.style.display = 'flex'; // Ensure menu is visible
          // adminLink visibility will be handled by updateLoginStateUI called within checkAuthentication
          showForm(null); // Show main mode selector
          gameHasStarted = false; // Ensure game state is reset
          startMenuOverlay.style.display = 'flex';
          adminLink.style.display = isAdmin ? 'block' : 'none';
          showForm(null);
          gameHasStarted = false;
        } else {
          // Alert with translated message from server
          alert(t(data.messageKey, data.messageOptions || {}));
        }
      })
      .catch(error => alert(t('ui.alerts.creationError', { error: error.message }))); // Translate error
  });
  saveSkinButton.addEventListener('click', () => {
    const skinDataToSave = {
      headColor: skinHeadColorInput.value,
      bodyType: document.querySelector('input[name="bodyType"]:checked').value,
      bodyColor: skinBodyColorInput.value,
      patternColors: getPatternColorsFromPickers(),
      trailEffect: trailEffectSelect.value,
    };

    if (loggedInUsername) {
      console.log('Sending skin update for logged in user:', loggedInUsername);
      console.log('Data to send:', {
        headColor: skinDataToSave.headColor,
        skinData: {
          bodyType: skinDataToSave.bodyType,
          bodyColor: skinDataToSave.bodyColor,
          patternColors: skinDataToSave.patternColors,
          trailEffect: skinDataToSave.trailEffect,
        },
      });
      fetch('/updateSkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headColor: skinDataToSave.headColor,
          skinData: {
            bodyType: skinDataToSave.bodyType,
            bodyColor: skinDataToSave.bodyColor,
            patternColors: skinDataToSave.patternColors,
            trailEffect: skinDataToSave.trailEffect,
          },
        }),
      })
        .then(response => {
          if (!response.ok) {
            return response.json().then(errData => {
              // Expect JSON error
              throw new Error(t(errData.messageKey, errData.messageOptions || {})); // Translate server error
            });
          }
          return response.json(); // Expect JSON success
        })
        .then(result => {
          if (result.success) {
            // Use translated alert
            alert(t(result.messageKey));
            if (accountData) {
              accountData.headColor = skinDataToSave.headColor;
              accountData.bodyColor = skinDataToSave.bodyColor;
              accountData.skinData = {
                bodyType: skinDataToSave.bodyType,
                bodyColor: skinDataToSave.bodyColor,
                patternColors: skinDataToSave.patternColors,
                trailEffect: skinDataToSave.trailEffect,
              };
            }
            currentSkinData = {
              bodyType: skinDataToSave.bodyType,
              headColor: skinDataToSave.headColor,
              bodyColor: skinDataToSave.bodyColor,
              patternColors: skinDataToSave.patternColors,
              trailEffect: skinDataToSave.trailEffect,
            };
            localStorage.setItem('headColor', skinDataToSave.headColor);
            localStorage.setItem('bodyColor', skinDataToSave.bodyColor);
            showForm(null);
          } else {
            // Alert with translated message from server
            alert(t(result.messageKey, result.messageOptions || {}));
          }
        })
        .catch(error => {
          console.error('Error updating skin:', error);
          // Use translated alert
          alert(t('ui.alerts.skinUpdateError', { error: error.message }));
        });
    } else {
      console.log('Updating skin for temporary user.');
      currentSkinData = skinDataToSave;
      localStorage.setItem('headColor', currentSkinData.headColor);
      localStorage.setItem('bodyColor', currentSkinData.bodyColor);
      // Use translated alert
      alert(t('ui.alerts.skinUpdatedTemp'));
      showForm(null);
    }
  });

  leaderboardToggleBtn.addEventListener('click', () => setLeaderboardVisibility(false));
  showLeaderboardBtn.addEventListener('click', () => setLeaderboardVisibility(true));

  logoutBtn.addEventListener('click', () => {
    fetch('/logout', { method: 'POST' })
      .then(response => response.json()) // Expect JSON
      .then(data => {
        if (!data.success) console.error('Error during server logout');
        loggedInUsername = null;
        accountData = null;
        isAdmin = false;
        wasLoggedInBeforeDisconnect = false;
        updateLoginStateUI();
        showForm(null);
        console.log('Local logout completed.');
        if (socket && socket.connected) socket.disconnect();
      })
      .catch(error => {
        console.error('Error during logout fetch:', error);
        loggedInUsername = null;
        accountData = null;
        isAdmin = false;
        wasLoggedInBeforeDisconnect = false;
        updateLoginStateUI();
        showForm(null);
        if (socket && socket.connected) socket.disconnect();
      });
  });

  deleteAccountBtn.addEventListener('click', () => {
    if (!loggedInUsername) return;
    // Use translated confirm
    if (confirm(t('ui.confirms.deleteAccount', { username: loggedInUsername }))) {
      fetch('/deleteAccount', { method: 'DELETE' })
        .then(response => response.json()) // Expect JSON
        .then(result => {
          if (result.success) {
            // Use translated alert
            alert(t(result.messageKey));
            loggedInUsername = null;
            accountData = null;
            isAdmin = false;
            wasLoggedInBeforeDisconnect = false;
            updateLoginStateUI();
            showForm(null);
            if (socket && socket.connected) socket.disconnect();
          } else {
            // Alert with translated message from server
            alert(t(result.messageKey, result.messageOptions || {}));
          }
        })
        .catch(error => {
          console.error('Error deleting account:', error);
          // Use translated alert
          alert(t('ui.alerts.deleteAccountError'));
        });
    }
  });

  replayButton.addEventListener('click', () => {
    gameOverOverlay.style.display = 'none';
    gameOverOverlay.style.opacity = '0';
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    gameHasStarted = false;
    if (socket && socket.connected) socket.disconnect();
    socket = null;
    myId = null;
    startMenuOverlay.style.display = 'flex';
    adminLink.style.display = isAdmin ? 'block' : 'none';
    showForm(null);
    if (wasLoggedInBeforeDisconnect && loggedInUsername) updateLoginStateUI();
    else checkAuthentication();
    loadInitialColors();
    applySkinDataToForm();
    applyInitialLeaderboardState();

    let joinData;
    if (loggedInUsername && accountData) {
      joinData = { mode: 'account', username: loggedInUsername };
    } else {
      const tempSkinData = {
        bodyType: document.querySelector('input[name="bodyType"]:checked').value,
        headColor: skinHeadColorInput.value,
        bodyColor: skinBodyColorInput.value,
        patternColors: getPatternColorsFromPickers(),
        trailEffect: trailEffectSelect.value,
      };
      joinData = {
        mode: 'temp',
        headColor: tempSkinData.headColor,
        bodyColor: tempSkinData.bodyColor,
        skinData: tempSkinData,
      };
    }
    startMenuOverlay.style.display = 'none';
    adminLink.style.display = 'none';
    initSocket(joinData);
  });

  backToMenuButton.addEventListener('click', () => {
    gameOverOverlay.style.display = 'none';
    gameOverOverlay.style.opacity = '0';
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    gameHasStarted = false;
    if (socket && socket.connected) socket.disconnect();
    socket = null;
    myId = null;
    startMenuOverlay.style.display = 'flex';
    adminLink.style.display = isAdmin ? 'block' : 'none';
    showForm(null);
    checkAuthentication();
    loadInitialColors();
    applySkinDataToForm();
    applyInitialLeaderboardState();
  });

  exitGhostButton.addEventListener('click', () => {
    if (socket && socket.connected) socket.disconnect();
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    gameHasStarted = false;
    socket = null;
    myId = null;
    startMenuOverlay.style.display = 'flex';
    adminLink.style.display = isAdmin ? 'block' : 'none';
    showForm(null);
    checkAuthentication();
    loadInitialColors();
    applySkinDataToForm();
    applyInitialLeaderboardState();
    exitGhostButton.style.display = 'none';
    ghostShortcutGuide.style.display = 'none';
  });

  skinBodyTypeRadios.forEach(radio => {
    radio.addEventListener('change', toggleSkinSections);
  });
  addPatternColorBtn.addEventListener('click', addPatternColor);
  removePatternColorBtn.addEventListener('click', removePatternColor);

  creditsHelpBtn.addEventListener('click', openCreditsHelpPanel);
  closeCreditsHelpBtn.addEventListener('click', closeCreditsHelpPanel);

  document.addEventListener('keydown', handleMenuKeyDown);
}

// --- Leaderboard Toggle Logic ---
function setLeaderboardVisibility(show) {
  if (!leaderboardPanel || !startMenuOverlay || !showLeaderboardBtn) return;
  const isHidden = !show;
  const currentlyHidden = leaderboardPanel.classList.contains('hidden');
  if (isHidden !== currentlyHidden) {
    leaderboardPanel.classList.toggle('hidden', isHidden);
    leaderboardPanel.classList.toggle('visible', !isHidden);
    localStorage.setItem('leaderboardHidden', isHidden);
    showLeaderboardBtn.style.display = isHidden ? 'block' : 'none';
    updateFocusableButtons();
  }
}
function applyInitialLeaderboardState() {
  const initiallyHidden = localStorage.getItem('leaderboardHidden') === 'true';
  setLeaderboardVisibility(!initiallyHidden);
  leaderboardPanel.classList.toggle('hidden', initiallyHidden);
  leaderboardPanel.classList.toggle('visible', !initiallyHidden);
}

// --- Check Authentication State ---
function checkAuthentication() {
  fetch('/check-auth')
    .then(response => response.json())
    .then(data => {
      loggedInUsername = data.loggedIn ? data.username : null;
      isAdmin = data.isAdmin || false;
      if (loggedInUsername) {
        wasLoggedInBeforeDisconnect = true;
        accountData = {
          username: data.username,
          headColor: data.headColor || '#ff0000',
          bodyColor: data.bodyColor || '#ffff00',
          skinData: data.skinData,
        };
        currentSkinData = accountData.skinData || {
          bodyType: 'single',
          headColor: accountData.headColor,
          bodyColor: accountData.bodyColor,
          patternColors: [],
          trailEffect: 'none',
        };
        localStorage.setItem('headColor', currentSkinData.headColor);
        localStorage.setItem('bodyColor', currentSkinData.bodyColor);
      } else {
        wasLoggedInBeforeDisconnect = false;
        isAdmin = false;
        accountData = null;
        currentSkinData = {
          bodyType: 'single',
          headColor: localStorage.getItem('headColor') || '#ff0000',
          bodyColor: localStorage.getItem('bodyColor') || '#ffff00',
          patternColors: [],
          trailEffect: 'none',
        };
      }
      updateLoginStateUI();
    })
    .catch(error => {
      console.error('Error checking authentication:', error);
      updateLoginStateUI();
      currentSkinData = {
        bodyType: 'single',
        headColor: localStorage.getItem('headColor') || '#ff0000',
        bodyColor: localStorage.getItem('bodyColor') || '#ffff00',
        patternColors: [],
        trailEffect: 'none',
      };
      applySkinDataToForm();
      if (typeof SoundManager !== 'undefined') SoundManager.updateStatus();
    });
}
function updateLoginStateUI() {
  if (
    !leaderboardPanel ||
    !welcomeMessage ||
    !logoutBtn ||
    !loginModeBtn ||
    !createModeBtn ||
    !tempModeBtn ||
    !showLeaderboardBtn ||
    !customSoundsBtn ||
    !ghostModeBtn ||
    !adminLink ||
    !skinModeBtn ||
    !deleteAccountBtn
  )
    return;
  const isLeaderboardHidden = leaderboardPanel.classList.contains('hidden');
  const displayUsername = loggedInUsername;

  if (displayUsername) {
    // Use translated welcome message
    welcomeMessage.textContent = t('ui.welcomeMessage', {
      username: displayUsername,
      context: isAdmin ? 'admin' : '',
    });
    welcomeMessage.style.display = 'block';
    logoutBtn.style.display = 'block';
    deleteAccountBtn.style.display = 'block';
    customSoundsBtn.style.display = 'block';
    skinModeBtn.style.display = 'block';
    ghostModeBtn.style.display = isAdmin ? 'block' : 'none';
    adminLink.style.display = isAdmin ? 'block' : 'none';
    loginModeBtn.style.display = 'none';
    createModeBtn.style.display = 'none';
    // Use translated button text with the new key
    tempModeBtn.textContent = t('ui.buttons.playAsUser', { username: displayUsername });
    applySkinDataToForm();
  } else {
    welcomeMessage.textContent = '';
    welcomeMessage.style.display = 'none';
    logoutBtn.style.display = 'none';
    deleteAccountBtn.style.display = 'none';
    customSoundsBtn.style.display = 'block'; // Keep visible even if logged out
    skinModeBtn.style.display = 'block'; // Always allow skin customization
    ghostModeBtn.style.display = 'none';
    adminLink.style.display = 'none';
    loginModeBtn.style.display = 'block';
    createModeBtn.style.display = 'block';
    // Use translated button text
    tempModeBtn.textContent = t('ui.buttons.playGuest');
    applySkinDataToForm();
  }
  if (typeof SoundManager !== 'undefined') SoundManager.updateStatus();
  showLeaderboardBtn.style.display = isLeaderboardHidden ? 'block' : 'none';
  updateFocusableButtons();
}

// --- Socket.IO Handling ---
function initSocket(joinData) {
  if (socket) {
    console.log('Disconnecting previous socket before creating new one.');
    socket.disconnect();
    socket = null;
  }
  gameHasStarted = false;

  let finalJoinData = { mode: joinData.mode };
  if (joinData.mode === 'account' || joinData.mode === 'ghost') {
    finalJoinData.username = joinData.username;
  } else {
    finalJoinData.headColor = joinData.headColor;
    finalJoinData.bodyColor = joinData.bodyColor;
    finalJoinData.skinData = joinData.skinData;
  }

  console.log('Attempting new socket connection...');
  socket = io({ reconnectionAttempts: 5, timeout: 10000 });

  socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected with ID:', myId);
    if (loggedInUsername) wasLoggedInBeforeDisconnect = true;
    console.log('Emitting joinGame:', finalJoinData);
    socket.emit('joinGame', finalJoinData);

    const textOverlayCanvas = document.getElementById('textOverlayCanvas');
    if (!textOverlayCanvas) {
      console.error('Fatal Error: Text overlay canvas element not found!');
      // Use translated alert
      alert(t('ui.alerts.canvasError'));
      if (socket) socket.disconnect();
      return;
    }

    if (typeof Game !== 'undefined' && typeof Game.initializeAndStart === 'function') {
      Game.initializeAndStart(socket, myId, textOverlayCanvas);
      gameHasStarted = true;
      exitGhostButton.style.display = finalJoinData.mode === 'ghost' ? 'block' : 'none';
      ghostShortcutGuide.style.display = finalJoinData.mode === 'ghost' ? 'block' : 'none';
      if (minimapCanvas) minimapCanvas.style.display = 'block'; // Show minimap when game starts
      document.body.classList.add('real-mode'); // Add class for fullscreen game view
    } else {
      console.error('Game object or initializeAndStart function not found!');
      // Use translated alert
      alert(t('ui.alerts.gameModuleError'));
      if (socket) socket.disconnect();
    }
  });

  // Handle gameOver with keys and options
  socket.on('gameOver', data => {
    console.log("Received 'gameOver' event:", data);
    if (typeof showGameOverOverlay === 'function')
      showGameOverOverlay(data.reasonKey, data.reasonOptions, data.kill, data.finalSize);
    else alert(t(data.reasonKey, data.reasonOptions) + ' - Game Over'); // Fallback alert
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    else console.error('Game.stopGame() function not found!');
    gameHasStarted = false;
    if (minimapCanvas) minimapCanvas.style.display = 'none'; // Hide minimap
    document.body.classList.remove('real-mode'); // Remove game view class
  });

  socket.on('leaderboard', data => {
    updateLeaderboard(data);
  });
  socket.on('adminMessage', data => {
    showAdminMessage(data.text); // Admin message text is not translated client-side
  });
  // Handle loginFailed with keys
  socket.on('loginFailed', data => {
    // Use translated alert
    alert(t(data.messageKey, data.messageOptions || {}));
    startMenuOverlay.style.display = 'flex';
    adminLink.style.display = isAdmin ? 'block' : 'none';
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    gameHasStarted = false;
    exitGhostButton.style.display = 'none';
    ghostShortcutGuide.style.display = 'none';
    loggedInUsername = null;
    isAdmin = false;
    wasLoggedInBeforeDisconnect = false;
    updateLoginStateUI();
    if (minimapCanvas) minimapCanvas.style.display = 'none';
    document.body.classList.remove('real-mode');
  });
  socket.on('disconnect', reason => {
    console.log(`Disconnected from server: ${reason}`);
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    if (gameHasStarted && reason !== 'io client disconnect')
      // Use translated reason for disconnect overlay
      showGameOverOverlay('socket.disconnectReason', { reason: reason }, false, 0);
    else {
      startMenuOverlay.style.display = 'flex';
      adminLink.style.display = isAdmin ? 'block' : 'none';
      checkAuthentication();
    }
    myId = null;
    gameHasStarted = false;
    exitGhostButton.style.display = 'none';
    ghostShortcutGuide.style.display = 'none';
    socket = null;
    if (zeroGravityActive) toggleZeroGravity();
    if (minimapCanvas) minimapCanvas.style.display = 'none';
    document.body.classList.remove('real-mode');
  });
  socket.on('connect_error', err => {
    console.error('Connection error:', err.message);
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    if (window.location.pathname !== '/offline.html') window.location.href = '/offline.html';
    gameHasStarted = false;
    exitGhostButton.style.display = 'none';
    ghostShortcutGuide.style.display = 'none';
    socket = null;
    if (zeroGravityActive) toggleZeroGravity();
    if (minimapCanvas) minimapCanvas.style.display = 'none';
    document.body.classList.remove('real-mode');
  });
  // Handle user connect/disconnect with keys
  socket.on('userConnected', data => {
    if (data.messageOptions.username !== loggedInUsername)
      showNotification(t(data.messageKey, data.messageOptions), 'success');
  });
  socket.on('userDisconnected', data => {
    if (data.messageOptions.username !== loggedInUsername)
      showNotification(t(data.messageKey, data.messageOptions), 'error');
  });
  socket.on('configUpdate', data => {
    if (typeof Game !== 'undefined' && typeof Game.updateConfig === 'function')
      Game.updateConfig(data);
  });
  // Handle admin feedback with keys
  socket.on('adminActionFeedback', data => {
    showNotification(
      t(data.messageKey, data.messageOptions || {}),
      data.success ? 'success' : 'error'
    );
  });
  // Handle kick/ban with keys
  socket.on('kicked', data => {
    alert(t(data.reasonKey, data.reasonOptions || {}));
    if (socket) socket.disconnect();
  });
  socket.on('banned', data => {
    alert(t(data.reasonKey, data.reasonOptions || {}));
    if (socket) socket.disconnect();
  });
}

// --- UI Update Functions ---
function updateLeaderboard(data) {
  if (!leaderboardContent) return;
  leaderboardContent.innerHTML = '';
  if (!data || data.length === 0) {
    // Use translated message
    leaderboardContent.innerHTML = `<tr><td colspan="6" class="leaderboard-message">${t('leaderboard.noPlayers')}</td></tr>`;
    return;
  }
  data.slice(0, 10).forEach((item, index) => {
    const row = document.createElement('tr');
    row.className = `status-${item.status || 'offline'}`;
    const username = (item.username || 'Unknown')
      .toString()
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    row.insertCell().textContent = `${index + 1}. ${username}`;
    const statusCell = row.insertCell();
    // Use translated status
    let statusText = t(`leaderboard.status.${item.status || 'offline'}`);
    statusCell.textContent = statusText;
    if (item.status !== 'ingame' && item.lastLogin)
      // Use translated title
      statusCell.title = t('leaderboard.lastLoginTitle', { date: formatDateTime(item.lastLogin) });
    else if (item.status === 'ingame')
      // Use translated title
      statusCell.title = t('leaderboard.status.ingameTitle');
    row.insertCell().textContent = item.totalSize || 0;
    row.insertCell().textContent = item.totalKills || 0;
    row.insertCell().textContent = item.totalDeaths || 0;
    row.insertCell().textContent = item.kdRatio || t('leaderboard.status.na'); // Translate N/A
    leaderboardContent.appendChild(row);
  });
}
// Updated to handle reasonKey and reasonOptions
function showGameOverOverlay(reasonKey, reasonOptions, kill, finalSize) {
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const gameOverText = document.getElementById('gameOverText');
  const exitGhostButton = document.getElementById('exitGhostButton');
  const ghostShortcutGuide = document.getElementById('ghostShortcutGuide');
  const snakePositionDisplay = document.getElementById('snakePositionDisplay');
  const snakeSizeDisplay = document.getElementById('snakeSizeDisplay');

  if (!gameOverOverlay || !gameOverText) {
    console.error('Cannot show Game Over overlay, required elements missing.');
    // Fallback alert with translated reason
    alert(
      `${t(reasonKey, reasonOptions)} - ${t('gameOver.finalSizeLabel', { size: finalSize || 0 })}`
    );
    return;
  }
  console.log(`Showing Game Over: ReasonKey='${reasonKey}', Kill=${kill}, Size=${finalSize}`);
  gameOverOverlay.style.background = kill
    ? 'linear-gradient(rgba(0, 100, 0, 0.85), rgba(0, 150, 0, 0.95))'
    : 'linear-gradient(rgba(100, 0, 0, 0.85), rgba(150, 0, 0, 0.95))';
  // Translate reason and size label
  gameOverText.textContent = `${t(reasonKey, reasonOptions)} - ${t('gameOver.finalSizeLabel', { size: finalSize || 0 })}`;
  gameOverOverlay.style.display = 'flex';
  requestAnimationFrame(() => {
    gameOverOverlay.style.opacity = '1';
  });
  if (exitGhostButton) exitGhostButton.style.display = 'none';
  if (ghostShortcutGuide) ghostShortcutGuide.style.display = 'none';
  if (snakePositionDisplay) snakePositionDisplay.style.opacity = '0';
  if (snakeSizeDisplay) snakeSizeDisplay.style.opacity = '0';
  if (typeof SoundManager !== 'undefined') SoundManager.playSound('death');
}

function showAdminMessage(text) {
  if (!adminMessageOverlay) return;
  if (!text) {
    adminMessageOverlay.classList.remove('visible');
    adminMessageOverlay.textContent = '';
    adminMessageOverlay.removeAttribute('data-text');
    return;
  }
  adminMessageOverlay.textContent = text; // Admin message is not translated client-side
  adminMessageOverlay.dataset.text = text;
  adminMessageOverlay.style.display = 'flex';
  requestAnimationFrame(() => {
    adminMessageOverlay.classList.add('visible');
  });
}

// --- Prevent Browser Zoom ---
window.addEventListener(
  'wheel',
  function (event) {
    if (event.ctrlKey) event.preventDefault();
  },
  { passive: false }
);
window.addEventListener('keydown', function (event) {
  if (
    event.ctrlKey &&
    (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '0')
  )
    event.preventDefault();
});
console.log('Browser zoom prevention listeners added.');

// --- Initial Page Setup ---
// Moved to DOMContentLoaded listener
