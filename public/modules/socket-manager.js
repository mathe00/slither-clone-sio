/**
 * ==============================================================================
 * FILE: socket-manager.js
 * 
 * DESCRIPTION:
 * Manages Socket.IO connection and game server communication.
 * Handles game initialization, data synchronization, and connection events.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';
import { t } from './i18n-manager.js';
import { showGameOverOverlay, showAdminMessage } from './overlay-manager.js';
import { showNotification } from './notification-system.js';
import { updateLeaderboard } from './leaderboard-manager.js';
import { getLoggedInUsername, isAdminUser, wasLoggedIn, setLoggedInUsername, setIsAdmin, setWasLoggedIn } from './auth-manager.js';

// --- Global Variables ---
let socket;
let myId = null;
let gameHasStarted = false;

// --- Socket.IO Initialization ---
export function initSocket(joinData) {
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
    if (getLoggedInUsername()) setWasLoggedIn(true);
    console.log('Emitting joinGame:', finalJoinData);
    socket.emit('joinGame', finalJoinData);

    const textOverlayCanvas = document.getElementById('textOverlayCanvas');
    if (!textOverlayCanvas) {
      console.error('Fatal Error: Text overlay canvas element not found!');
      alert(t('ui.alerts.canvasError'));
      if (socket) socket.disconnect();
      return;
    }

    if (typeof Game !== 'undefined' && typeof Game.initializeAndStart === 'function') {
      Game.initializeAndStart(socket, myId, textOverlayCanvas);
      gameHasStarted = true;
      if (uiElements.exitGhostButton) uiElements.exitGhostButton.style.display = finalJoinData.mode === 'ghost' ? 'block' : 'none';
      if (uiElements.ghostShortcutGuide) uiElements.ghostShortcutGuide.style.display = finalJoinData.mode === 'ghost' ? 'block' : 'none';
      if (uiElements.minimapCanvas) uiElements.minimapCanvas.style.display = 'block';
      document.body.classList.add('real-mode');
    } else {
      console.error('Game object or initializeAndStart function not found!');
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
    if (uiElements.minimapCanvas) uiElements.minimapCanvas.style.display = 'none';
    document.body.classList.remove('real-mode');
  });

  socket.on('leaderboard', data => {
    updateLeaderboard(data);
  });
  
  socket.on('adminMessage', data => {
    showAdminMessage(data.text); // Admin message text is not translated client-side
  });
  
  // Handle loginFailed with keys
  socket.on('loginFailed', data => {
    alert(t(data.messageKey, data.messageOptions || {}));
    if (uiElements.startMenuOverlay) uiElements.startMenuOverlay.style.display = 'flex';
    if (uiElements.adminLink) uiElements.adminLink.style.display = isAdminUser() ? 'block' : 'none';
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    gameHasStarted = false;
    if (uiElements.exitGhostButton) uiElements.exitGhostButton.style.display = 'none';
    if (uiElements.ghostShortcutGuide) uiElements.ghostShortcutGuide.style.display = 'none';
    setLoggedInUsername(null);
    setIsAdmin(false);
    setWasLoggedIn(false);
    if (typeof updateLoginStateUI === 'function') updateLoginStateUI();
    if (uiElements.minimapCanvas) uiElements.minimapCanvas.style.display = 'none';
    document.body.classList.remove('real-mode');
  });
  
  socket.on('disconnect', reason => {
    console.log(`Disconnected from server: ${reason}`);
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    if (gameHasStarted && reason !== 'io client disconnect')
      showGameOverOverlay('socket.disconnectReason', { reason: reason }, false, 0);
    else {
      if (uiElements.startMenuOverlay) uiElements.startMenuOverlay.style.display = 'flex';
      if (uiElements.adminLink) uiElements.adminLink.style.display = isAdminUser() ? 'block' : 'none';
      if (typeof checkAuthentication === 'function') checkAuthentication();
    }
    myId = null;
    gameHasStarted = false;
    if (uiElements.exitGhostButton) uiElements.exitGhostButton.style.display = 'none';
    if (uiElements.ghostShortcutGuide) uiElements.ghostShortcutGuide.style.display = 'none';
    socket = null;
    if (typeof toggleZeroGravity === 'function') toggleZeroGravity();
    if (uiElements.minimapCanvas) uiElements.minimapCanvas.style.display = 'none';
    document.body.classList.remove('real-mode');
  });
  
  socket.on('connect_error', err => {
    console.error('Connection error:', err.message);
    if (typeof Game !== 'undefined' && typeof Game.stopGame === 'function') Game.stopGame();
    if (window.location.pathname !== '/offline.html') window.location.href = '/offline.html';
    gameHasStarted = false;
    if (uiElements.exitGhostButton) uiElements.exitGhostButton.style.display = 'none';
    if (uiElements.ghostShortcutGuide) uiElements.ghostShortcutGuide.style.display = 'none';
    socket = null;
    if (typeof toggleZeroGravity === 'function') toggleZeroGravity();
    if (uiElements.minimapCanvas) uiElements.minimapCanvas.style.display = 'none';
    document.body.classList.remove('real-mode');
  });
  
  // Handle user connect/disconnect with keys
  socket.on('userConnected', data => {
    if (data.messageOptions.username !== getLoggedInUsername())
      showNotification(t(data.messageKey, data.messageOptions), 'success');
  });
  
  socket.on('userDisconnected', data => {
    if (data.messageOptions.username !== getLoggedInUsername())
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

// --- Data Export ---
export function getSocket() {
  return socket;
}

export function getMyId() {
  return myId;
}

export function setSocket(newSocket) {
  socket = newSocket;
}

export function setMyId(id) {
  myId = id;
}

export function isGameStarted() {
  return gameHasStarted;
}

export function setGameStarted(started) {
  gameHasStarted = started;
}