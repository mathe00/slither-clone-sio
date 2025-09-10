/**
 * ==============================================================================
 * FILE: auth-manager.js
 * 
 * DESCRIPTION:
 * Manages user authentication state, login/logout functionality,
 * and related UI updates. Handles account creation and deletion.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';
import { t } from './i18n-manager.js';
import { showForm, updateFocusableButtons } from './form-navigation.js';
import { applySkinDataToForm, getCurrentSkinData, setCurrentSkinData, getPatternColors } from './skin-manager.js';
import { showNotification } from './notification-system.js';

// --- Global Authentication Variables ---
let loggedInUsername = null;
let isAdmin = false;
let accountData = null;
let wasLoggedInBeforeDisconnect = false;

// --- Authentication Functions ---
export function checkAuthentication() {
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
        setCurrentSkinData(accountData.skinData || {
          bodyType: 'single',
          headColor: accountData.headColor,
          bodyColor: accountData.bodyColor,
          patternColors: [],
          trailEffect: 'none',
        });
        localStorage.setItem('headColor', getCurrentSkinData().headColor);
        localStorage.setItem('bodyColor', getCurrentSkinData().bodyColor);
      } else {
        wasLoggedInBeforeDisconnect = false;
        isAdmin = false;
        accountData = null;
        setCurrentSkinData({
          bodyType: 'single',
          headColor: localStorage.getItem('headColor') || '#ff0000',
          bodyColor: localStorage.getItem('bodyColor') || '#ffff00',
          patternColors: [],
          trailEffect: 'none',
        });
      }
      updateLoginStateUI();
    })
    .catch(error => {
      console.error('Error checking authentication:', error);
      updateLoginStateUI();
      setCurrentSkinData({
        bodyType: 'single',
        headColor: localStorage.getItem('headColor') || '#ff0000',
        bodyColor: localStorage.getItem('bodyColor') || '#ffff00',
        patternColors: [],
        trailEffect: 'none',
      });
      applySkinDataToForm();
      if (typeof SoundManager !== 'undefined') SoundManager.updateStatus();
    });
}

export function updateLoginStateUI() {
  const {
    leaderboardPanel,
    welcomeMessage,
    logoutBtn,
    loginModeBtn,
    createModeBtn,
    tempModeBtn,
    showLeaderboardBtn,
    customSoundsBtn,
    ghostModeBtn,
    adminLink,
    skinModeBtn,
    deleteAccountBtn
  } = uiElements;

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
    tempModeBtn.textContent = t('ui.buttons.playAsUser', { username: displayUsername });
    applySkinDataToForm();
  } else {
    welcomeMessage.textContent = '';
    welcomeMessage.style.display = 'none';
    logoutBtn.style.display = 'none';
    deleteAccountBtn.style.display = 'none';
    customSoundsBtn.style.display = 'block';
    skinModeBtn.style.display = 'block';
    ghostModeBtn.style.display = 'none';
    adminLink.style.display = 'none';
    loginModeBtn.style.display = 'block';
    createModeBtn.style.display = 'block';
    tempModeBtn.textContent = t('ui.buttons.playGuest');
    applySkinDataToForm();
  }
  
  if (typeof SoundManager !== 'undefined') SoundManager.updateStatus();
  showLeaderboardBtn.style.display = isLeaderboardHidden ? 'block' : 'none';
  updateFocusableButtons();
}

// --- Event Handlers ---
export function setupAuthEventHandlers() {
  const { loginButton, createButton, logoutBtn, deleteAccountBtn } = uiElements;
  
  // Login button handler
  loginButton.addEventListener('click', () => {
    const { loginUsernameInput, loginPasswordInput } = uiElements;
    const username = loginUsernameInput.value;
    const password = loginPasswordInput.value;
    if (!username || !password)
      return alert(t('ui.alerts.missingCredentials'));
    
    fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    })
      .then(response =>
        response.ok
          ? response.json()
          : response.json().then(errData => {
              throw new Error(t(errData.messageKey, errData.messageOptions || {}));
            })
      )
      .then(data => {
        if (data.success) {
          showNotification(t(data.messageKey));
          checkAuthentication();
          showForm(null);
        } else {
          alert(t(data.messageKey, data.messageOptions || {}));
        }
      })
      .catch(error => alert(t('ui.alerts.loginError', { error: error.message })));
  });

  // Create account button handler
  createButton.addEventListener('click', () => {
    const { createUsernameInput, createPasswordInput, createHeadColorInput, createBodyColorInput } = uiElements;
    const username = createUsernameInput.value;
    const password = createPasswordInput.value;
    const headColor = createHeadColorInput.value;
    const bodyColor = createBodyColorInput.value;
    
    if (!username || !password)
      return alert(t('ui.alerts.missingCredentials'));
    if (username.length < 3 || username.length > 15)
      return alert(t('ui.alerts.usernameLength', { min: 3, max: 15 }));
    if (password.length < 4)
      return alert(t('ui.alerts.passwordLength', { min: 4 }));
    
    fetch('/createAccount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&headColor=${encodeURIComponent(headColor)}&bodyColor=${encodeURIComponent(bodyColor)}`,
    })
      .then(response =>
        response.ok
          ? response.json()
          : response.json().then(errData => {
              throw new Error(t(errData.messageKey, errData.messageOptions || {}));
            })
      )
      .then(data => {
        if (data.success) {
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
          setCurrentSkinData(accountData.skinData);
          checkAuthentication();
          uiElements.startMenuOverlay.style.display = 'flex';
          adminLink.style.display = isAdmin ? 'block' : 'none';
          showForm(null);
        } else {
          alert(t(data.messageKey, data.messageOptions || {}));
        }
      })
      .catch(error => alert(t('ui.alerts.creationError', { error: error.message })));
  });

  // Logout button handler
  logoutBtn.addEventListener('click', () => {
    fetch('/logout', { method: 'POST' })
      .then(response => response.json())
      .then(data => {
        if (!data.success) console.error('Error during server logout');
        loggedInUsername = null;
        accountData = null;
        isAdmin = false;
        wasLoggedInBeforeDisconnect = false;
        updateLoginStateUI();
        showForm(null);
        console.log('Local logout completed.');
        if (window.socket && window.socket.connected) window.socket.disconnect();
      })
      .catch(error => {
        console.error('Error during logout fetch:', error);
        loggedInUsername = null;
        accountData = null;
        isAdmin = false;
        wasLoggedInBeforeDisconnect = false;
        updateLoginStateUI();
        showForm(null);
        if (window.socket && window.socket.connected) window.socket.disconnect();
      });
  });

  // Delete account button handler
  deleteAccountBtn.addEventListener('click', () => {
    if (!loggedInUsername) return;
    if (confirm(t('ui.confirms.deleteAccount', { username: loggedInUsername }))) {
      fetch('/deleteAccount', { method: 'DELETE' })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            alert(t(result.messageKey));
            loggedInUsername = null;
            accountData = null;
            isAdmin = false;
            wasLoggedInBeforeDisconnect = false;
            updateLoginStateUI();
            showForm(null);
            if (window.socket && window.socket.connected) window.socket.disconnect();
          } else {
            alert(t(result.messageKey, result.messageOptions || {}));
          }
        })
        .catch(error => {
          console.error('Error deleting account:', error);
          alert(t('ui.alerts.deleteAccountError'));
        });
    }
  });
}

// --- Data Export ---
export function getLoggedInUsername() {
  return loggedInUsername;
}

export function isAdminUser() {
  return isAdmin;
}

export function getAccountData() {
  return accountData;
}

export function wasLoggedIn() {
  return wasLoggedInBeforeDisconnect;
}

export function setLoggedInUsername(username) {
  loggedInUsername = username;
}

export function setIsAdmin(admin) {
  isAdmin = admin;
}

export function setAccountData(data) {
  accountData = data;
}

export function setWasLoggedIn(wasLoggedIn) {
  wasLoggedInBeforeDisconnect = wasLoggedIn;
}