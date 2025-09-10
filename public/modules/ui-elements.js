/**
 * ==============================================================================
 * FILE: ui-elements.js
 * 
 * DESCRIPTION:
 * Manages DOM element references and initialization for the UI system.
 * Provides centralized access to all UI elements used throughout the application.
 * 
 * ==============================================================================
 */

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
export function initializeUIElements() {
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
  backModeBtn6 = document.getElementById('backModeBtn6');
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
  skinHeadColorInput = document.getElementById('skinHeadColorInput');
  skinBodyColorInput = document.getElementById('skinBodyColorInput');
  skinPatternSection = document.getElementById('skinPatternSection');
  patternColorPickersContainer = document.getElementById('patternColorPickers');
  addPatternColorBtn = document.getElementById('addPatternColorBtn');
  removePatternColorBtn = document.getElementById('removePatternColorBtn');
  trailEffectSelect = document.getElementById('trailEffectSelect');
}

// --- Export UI element references for use in other modules ---
export const uiElements = {
  get gameOverOverlay() { return gameOverOverlay; },
  get replayButton() { return replayButton; },
  get backToMenuButton() { return backToMenuButton; },
  get startMenuOverlay() { return startMenuOverlay; },
  get welcomeMessage() { return welcomeMessage; },
  get modeSelector() { return modeSelector; },
  get tempForm() { return tempForm; },
  get loginForm() { return loginForm; },
  get createForm() { return createForm; },
  get soundForm() { return soundForm; },
  get skinForm() { return skinForm; },
  get tempModeBtn() { return tempModeBtn; },
  get loginModeBtn() { return loginModeBtn; },
  get createModeBtn() { return createModeBtn; },
  get skinModeBtn() { return skinModeBtn; },
  get customSoundsBtn() { return customSoundsBtn; },
  get ghostModeBtn() { return ghostModeBtn; },
  get logoutBtn() { return logoutBtn; },
  get deleteAccountBtn() { return deleteAccountBtn; },
  get backModeBtn1() { return backModeBtn1; },
  get backModeBtn2() { return backModeBtn2; },
  get backModeBtn3() { return backModeBtn3; },
  get backModeBtn4() { return backModeBtn4; },
  get backModeBtn6() { return backModeBtn6; },
  get loginUsernameInput() { return loginUsernameInput; },
  get loginPasswordInput() { return loginPasswordInput; },
  get createUsernameInput() { return createUsernameInput; },
  get createPasswordInput() { return createPasswordInput; },
  get createHeadColorInput() { return createHeadColorInput; },
  get createBodyColorInput() { return createBodyColorInput; },
  get startButton() { return startButton; },
  get loginButton() { return loginButton; },
  get createButton() { return createButton; },
  get saveSkinButton() { return saveSkinButton; },
  get leaderboardPanel() { return leaderboardPanel; },
  get leaderboardToggleBtn() { return leaderboardToggleBtn; },
  get showLeaderboardBtn() { return showLeaderboardBtn; },
  get leaderboardContent() { return leaderboardContent; },
  get adminMessageOverlay() { return adminMessageOverlay; },
  get adminLink() { return adminLink; },
  get notificationContainer() { return notificationContainer; },
  get minimapCanvas() { return minimapCanvas; },
  get exitGhostButton() { return exitGhostButton; },
  get ghostShortcutGuide() { return ghostShortcutGuide; },
  get creditsHelpBtn() { return creditsHelpBtn; },
  get creditsHelpPanel() { return creditsHelpPanel; },
  get closeCreditsHelpBtn() { return closeCreditsHelpBtn; },
  
  // Skin form elements
  get skinBodyTypeRadios() { return skinBodyTypeRadios; },
  get skinSingleColorSection() { return skinSingleColorSection; },
  get skinHeadColorInput() { return skinHeadColorInput; },
  get skinBodyColorInput() { return skinBodyColorInput; },
  get skinPatternSection() { return skinPatternSection; },
  get patternColorPickersContainer() { return patternColorPickersContainer; },
  get addPatternColorBtn() { return addPatternColorBtn; },
  get removePatternColorBtn() { return removePatternColorBtn; },
  get trailEffectSelect() { return trailEffectSelect; },
};