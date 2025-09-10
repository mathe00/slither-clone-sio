/**
 * ==============================================================================
 * FILE: event-handlers.js
 * 
 * DESCRIPTION:
 * Centralizes all UI event handlers for the application.
 * Manages button clicks, form submissions, and user interactions.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';
import { t } from './i18n-manager.js';
import { showForm } from './form-navigation.js';
import { 
  getCurrentSkinData, 
  getPatternColors, 
  setCurrentSkinData, 
  loadInitialColors, 
  applySkinDataToForm 
} from './skin-manager.js';
import { getLoggedInUsername, isAdminUser, getAccountData } from './auth-manager.js';
import { initSocket, setGameStarted, setSocket, setMyId } from './socket-manager.js';
import { setLeaderboardVisibility } from './leaderboard-manager.js';
import { closeCreditsHelpPanel } from './overlay-manager.js';

// --- Game Mode Functions ---
function handleTempMode() {
  const { startMenuOverlay, adminLink } = uiElements;
  startMenuOverlay.style.display = 'none';
  adminLink.style.display = 'none';
  setGameStarted(false);
  
  const tempSkinData = {
    bodyType: document.querySelector('input[name="bodyType"]:checked').value,
    headColor: uiElements.skinHeadColorInput.value,
    bodyColor: uiElements.skinBodyColorInput.value,
    patternColors: getPatternColors(),
    trailEffect: uiElements.trailEffectSelect.value,
  };
  initSocket({
    mode: 'temp',
    headColor: tempSkinData.headColor,
    bodyColor: tempSkinData.bodyColor,
    skinData: tempSkinData,
  });
}

function handleGhostMode() {
  const { startMenuOverlay, adminLink } = uiElements;
  if (isAdminUser() && confirm(t('ui.confirms.enterGhostMode'))) {
    startMenuOverlay.style.display = 'none';
    adminLink.style.display = 'none';
    setGameStarted(false);
    initSocket({ mode: 'ghost', username: getLoggedInUsername() });
  }
}

function handleSkinSave() {
  const skinDataToSave = {
    headColor: uiElements.skinHeadColorInput.value,
    bodyType: document.querySelector('input[name="bodyType"]:checked').value,
    bodyColor: uiElements.skinBodyColorInput.value,
    patternColors: getPatternColors(),
    trailEffect: uiElements.trailEffectSelect.value,
  };

  if (getLoggedInUsername()) {
    console.log('Sending skin update for logged in user:', getLoggedInUsername());
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
            throw new Error(t(errData.messageKey, errData.messageOptions || {}));
          });
        }
        return response.json();
      })
      .then(result => {
        if (result.success) {
          alert(t(result.messageKey));
          if (getAccountData()) {
            const accountData = getAccountData();
            accountData.headColor = skinDataToSave.headColor;
            accountData.bodyColor = skinDataToSave.bodyColor;
            accountData.skinData = {
              bodyType: skinDataToSave.bodyType,
              bodyColor: skinDataToSave.bodyColor,
              patternColors: skinDataToSave.patternColors,
              trailEffect: skinDataToSave.trailEffect,
            };
          }
          setCurrentSkinData({
            bodyType: skinDataToSave.bodyType,
            headColor: skinDataToSave.headColor,
            bodyColor: skinDataToSave.bodyColor,
            patternColors: skinDataToSave.patternColors,
            trailEffect: skinDataToSave.trailEffect,
          });
          localStorage.setItem('headColor', skinDataToSave.headColor);
          localStorage.setItem('bodyColor', skinDataToSave.bodyColor);
          showForm(null);
        } else {
          alert(t(result.messageKey, result.messageOptions || {}));
        }
      })
      .catch(error => {
        console.error('Error updating skin:', error);
        alert(t('ui.alerts.skinUpdateError', { error: error.message }));
      });
  } else {
    console.log('Updating skin for temporary user.');
    setCurrentSkinData(skinDataToSave);
    localStorage.setItem('headColor', getCurrentSkinData().headColor);
    localStorage.setItem('bodyColor', getCurrentSkinData().bodyColor);
    alert(t('ui.alerts.skinUpdatedTemp'));
    showForm(null);
  }
}

function handleReplay() {
  const { gameOverOverlay, startMenuOverlay, adminLink } = uiElements;
  gameOverOverlay.style.display = 'none';
  gameOverOverlay.style.opacity = '0';
  if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
  setGameStarted(false);
  if (window.socket && window.socket.connected) window.socket.disconnect();
  setSocket(null);
  setMyId(null);
  startMenuOverlay.style.display = 'flex';
  adminLink.style.display = isAdminUser() ? 'block' : 'none';
  showForm(null);
  if (typeof wasLoggedIn === 'function' && wasLoggedIn() && getLoggedInUsername()) {
    if (typeof updateLoginStateUI === 'function') updateLoginStateUI();
  } else if (typeof checkAuthentication === 'function') {
    checkAuthentication();
  }
  loadInitialColors();
  applySkinDataToForm();
  if (typeof applyInitialLeaderboardState === 'function') applyInitialLeaderboardState();

  let joinData;
  if (getLoggedInUsername() && getAccountData()) {
    joinData = { mode: 'account', username: getLoggedInUsername() };
  } else {
    const tempSkinData = {
      bodyType: document.querySelector('input[name="bodyType"]:checked').value,
      headColor: uiElements.skinHeadColorInput.value,
      bodyColor: uiElements.skinBodyColorInput.value,
      patternColors: getPatternColors(),
      trailEffect: uiElements.trailEffectSelect.value,
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
}

function handleBackToMenu() {
  const { gameOverOverlay, startMenuOverlay, adminLink } = uiElements;
  gameOverOverlay.style.display = 'none';
  gameOverOverlay.style.opacity = '0';
  if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
  setGameStarted(false);
  if (window.socket && window.socket.connected) window.socket.disconnect();
  setSocket(null);
  setMyId(null);
  startMenuOverlay.style.display = 'flex';
  adminLink.style.display = isAdminUser() ? 'block' : 'none';
  showForm(null);
  if (typeof checkAuthentication === 'function') checkAuthentication();
  loadInitialColors();
  applySkinDataToForm();
  if (typeof applyInitialLeaderboardState === 'function') applyInitialLeaderboardState();
}

function handleExitGhost() {
  if (window.socket && window.socket.connected) window.socket.disconnect();
  if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
  setGameStarted(false);
  setSocket(null);
  setMyId(null);
  const { startMenuOverlay, adminLink, exitGhostButton, ghostShortcutGuide } = uiElements;
  startMenuOverlay.style.display = 'flex';
  adminLink.style.display = isAdminUser() ? 'block' : 'none';
  showForm(null);
  if (typeof checkAuthentication === 'function') checkAuthentication();
  loadInitialColors();
  applySkinDataToForm();
  if (typeof applyInitialLeaderboardState === 'function') applyInitialLeaderboardState();
  exitGhostButton.style.display = 'none';
  ghostShortcutGuide.style.display = 'none';
}

// --- Main Event Handler Setup ---
export function setupEventHandlers() {
  const {
    tempModeBtn,
    loginModeBtn,
    createModeBtn,
    skinModeBtn,
    customSoundsBtn,
    ghostModeBtn,
    backModeBtn1,
    backModeBtn2,
    backModeBtn3,
    backModeBtn4,
    backModeBtn6,
    startButton,
    saveSkinButton,
    leaderboardToggleBtn,
    showLeaderboardBtn,
    replayButton,
    backToMenuButton,
    exitGhostButton,
    creditsHelpBtn,
    closeCreditsHelpBtn
  } = uiElements;

  // Mode navigation buttons
  if (tempModeBtn) tempModeBtn.addEventListener('click', handleTempMode);
  if (loginModeBtn) loginModeBtn.addEventListener('click', () => showForm(uiElements.loginForm));
  if (createModeBtn) createModeBtn.addEventListener('click', () => showForm(uiElements.createForm));
  if (skinModeBtn) skinModeBtn.addEventListener('click', () => {
    applySkinDataToForm();
    showForm(uiElements.skinForm);
  });
  if (customSoundsBtn) customSoundsBtn.addEventListener('click', () => {
    if (typeof SoundManager !== 'undefined') SoundManager.updateStatus();
    showForm(uiElements.soundForm);
  });
  if (ghostModeBtn) ghostModeBtn.addEventListener('click', handleGhostMode);
  
  // Back buttons
  if (backModeBtn1) backModeBtn1.addEventListener('click', () => showForm(null));
  if (backModeBtn2) backModeBtn2.addEventListener('click', () => showForm(null));
  if (backModeBtn3) backModeBtn3.addEventListener('click', () => showForm(null));
  if (backModeBtn4) backModeBtn4.addEventListener('click', () => showForm(null));
  if (backModeBtn6) backModeBtn6.addEventListener('click', () => showForm(null));
  
  // Action buttons
  if (startButton) startButton.addEventListener('click', () => tempModeBtn.click());
  if (saveSkinButton) saveSkinButton.addEventListener('click', handleSkinSave);
  
  // Leaderboard buttons
  if (leaderboardToggleBtn) leaderboardToggleBtn.addEventListener('click', () => setLeaderboardVisibility(false));
  if (showLeaderboardBtn) showLeaderboardBtn.addEventListener('click', () => setLeaderboardVisibility(true));
  
  // Game over buttons
  if (replayButton) replayButton.addEventListener('click', handleReplay);
  if (backToMenuButton) backToMenuButton.addEventListener('click', handleBackToMenu);
  if (exitGhostButton) exitGhostButton.addEventListener('click', handleExitGhost);
  
  // Credits/help buttons
  if (creditsHelpBtn) creditsHelpBtn.addEventListener('click', () => {
    if (typeof openCreditsHelpPanel === 'function') openCreditsHelpPanel();
  });
  if (closeCreditsHelpBtn) closeCreditsHelpBtn.addEventListener('click', closeCreditsHelpPanel);
  
  // Keyboard navigation
  document.addEventListener('keydown', (typeof handleMenuKeyDown === 'function') ? handleMenuKeyDown : () => {});
}