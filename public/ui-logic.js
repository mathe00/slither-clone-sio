/**
 * ==============================================================================
 * FILE: ui-logic.js
 *
 * DESCRIPTION:
 * Main orchestrator for UI logic and DOM manipulation. This file coordinates
 * all modular components and serves as the entry point for the UI system.
 * Manages initialization and coordinates between specialized modules.
 *
 * DEVELOPER GUIDELINES:
 * - This file should remain lightweight and focus on coordination.
 * - Business logic should be moved to appropriate modules.
 * - Keep imports organized and maintain clear separation of concerns.
 * ==============================================================================
 */

// --- Module Imports ---
import { initializeI18n, updateContent, t } from './modules/i18n-manager.js';
import { initializeUIElements, uiElements } from './modules/ui-elements.js';
import { showForm, handleMenuKeyDown, updateFocusableButtons } from './modules/form-navigation.js';
import { 
  loadInitialColors, 
  applySkinDataToForm, 
  setupSkinEventHandlers,
  getCurrentSkinData 
} from './modules/skin-manager.js';
import { 
  checkAuthentication, 
  updateLoginStateUI, 
  setupAuthEventHandlers,
  getLoggedInUsername,
  isAdminUser
} from './modules/auth-manager.js';
import { showNotification } from './modules/notification-system.js';
import { 
  setLeaderboardVisibility, 
  applyInitialLeaderboardState, 
  updateLeaderboard 
} from './modules/leaderboard-manager.js';
import { initSocket, getSocket, setGameStarted } from './modules/socket-manager.js';
import { showGameOverOverlay, setupOverlayEventHandlers } from './modules/overlay-manager.js';
import { setupEventHandlers } from './modules/event-handlers.js';

// --- Global Variables (exposed for game.js compatibility) ---
window.socket = null;
window.myId = null;
window.loggedInUsername = null;
window.isAdmin = false;
window.accountData = null;
window.wasLoggedInBeforeDisconnect = false;
window.gameHasStarted = false;
window.currentSkinData = null;

// --- Browser Zoom Prevention ---
function setupZoomPrevention() {
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
}

// --- Main Application Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM fully loaded and parsed');
  
  // Initialize UI elements
  initializeUIElements();
  
  // Initialize i18n first
  const i18nReady = await initializeI18n();
  if (!i18nReady) {
    console.error('Aborting UI logic setup due to i18n initialization failure.');
    return;
  }
  
  // Initialize all modules
  loadInitialColors();
  setupEventHandlers();
  setupSkinEventHandlers();
  setupAuthEventHandlers();
  setupOverlayEventHandlers();
  
  // Initial UI state setup
  if (uiElements.gameOverOverlay) {
    uiElements.gameOverOverlay.style.display = 'none';
    uiElements.gameOverOverlay.style.opacity = '0';
  }
  if (uiElements.adminMessageOverlay) {
    uiElements.adminMessageOverlay.style.display = 'none';
    uiElements.adminMessageOverlay.classList.remove('visible');
  }
  if (uiElements.adminLink) {
    uiElements.adminLink.style.display = 'none';
  }
  if (uiElements.exitGhostButton) {
    uiElements.exitGhostButton.style.display = 'none';
  }
  if (uiElements.ghostShortcutGuide) {
    uiElements.ghostShortcutGuide.style.display = 'none';
  }
  
  // Initialize SoundManager if available
  if (typeof SoundManager !== 'undefined') SoundManager.init();
  
  if (uiElements.creditsHelpPanel) {
    uiElements.creditsHelpPanel.classList.remove('visible');
  }
  
  // Check authentication state
  checkAuthentication();
  
  // Initialize leaderboard state
  applyInitialLeaderboardState();
  
  // Setup snake size display
  const snakeSizeDisplay = document.getElementById('snakeSizeDisplay');
  if (snakeSizeDisplay) {
    snakeSizeDisplay.textContent = '';
    snakeSizeDisplay.style.opacity = '0';
  }
  
  // Hide minimap initially
  if (uiElements.minimapCanvas) {
    uiElements.minimapCanvas.style.display = 'none';
  }
  
  // Reset body classes
  document.body.classList.remove('real-mode');
  
  // Show main menu
  showForm(null);
  
  // Initial content update after i18n is ready
  updateContent();
  
  // Setup zoom prevention
  setupZoomPrevention();
  
  // Sync global variables with module state
  syncGlobalVariables();
});

// --- Global Variable Synchronization ---
function syncGlobalVariables() {
  // Sync socket reference
  setInterval(() => {
    window.socket = getSocket();
    window.myId = window.socket?.id || null;
    window.gameHasStarted = window.socket ? true : false;
  }, 100);
  
  // Sync auth state
  setInterval(() => {
    window.loggedInUsername = getLoggedInUsername();
    window.isAdmin = isAdminUser();
  }, 100);
  
  // Sync skin data
  setInterval(() => {
    window.currentSkinData = getCurrentSkinData();
  }, 100);
}

// --- Expose functions globally for compatibility ---
window.showNotification = showNotification;
window.updateLeaderboard = updateLeaderboard;
window.showGameOverOverlay = showGameOverOverlay;
window.initSocket = initSocket;
window.checkAuthentication = checkAuthentication;
window.updateLoginStateUI = updateLoginStateUI;
window.loadInitialColors = loadInitialColors;
window.applySkinDataToForm = applySkinDataToForm;
window.applyInitialLeaderboardState = applyInitialLeaderboardState;
window.t = t;

// --- Export for ES modules ---
export {
  // Core functions
  showForm,
  handleMenuKeyDown,
  updateFocusableButtons,
  
  // Auth functions
  checkAuthentication,
  updateLoginStateUI,
  
  // Skin functions
  loadInitialColors,
  applySkinDataToForm,
  
  // Leaderboard functions
  setLeaderboardVisibility,
  applyInitialLeaderboardState,
  updateLeaderboard,
  
  // Socket functions
  initSocket,
  
  // Overlay functions
  showGameOverOverlay,
  
  // Notification function
  showNotification,
  
  // Translation function
  t,
  
  // UI elements
  uiElements
};

console.log('UI Logic system initialized with modular architecture.');