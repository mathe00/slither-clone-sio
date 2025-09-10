/**
 * ==============================================================================
 * FILE: overlay-manager.js
 * 
 * DESCRIPTION:
 * Manages game overlay displays including game over screens, admin messages,
 * and credits/help panels. Handles overlay visibility and animations.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';
import { t } from './i18n-manager.js';

// --- Credits/Help Panel Functions ---
export function openCreditsHelpPanel() {
  if (uiElements.creditsHelpPanel) uiElements.creditsHelpPanel.classList.add('visible');
}

export function closeCreditsHelpPanel() {
  if (uiElements.creditsHelpPanel) uiElements.creditsHelpPanel.classList.remove('visible');
}

// --- Game Over Overlay Function ---
export function showGameOverOverlay(reasonKey, reasonOptions, kill, finalSize) {
  // Vérifier si les éléments UI sont initialisés, sinon les chercher directement
  let gameOverOverlay = uiElements.gameOverOverlay || document.getElementById('gameOverOverlay');
  let gameOverText = uiElements.gameOverText || document.getElementById('gameOverText');

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

// --- Admin Message Functions ---
export function showAdminMessage(text) {
  let adminMessageOverlay = uiElements.adminMessageOverlay || document.getElementById('adminMessageOverlay');
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

// --- Event Handlers ---
export function setupOverlayEventHandlers() {
  const { creditsHelpBtn, closeCreditsHelpBtn } = uiElements;
  
  if (creditsHelpBtn) {
    creditsHelpBtn.addEventListener('click', openCreditsHelpPanel);
  }
  
  if (closeCreditsHelpBtn) {
    closeCreditsHelpBtn.addEventListener('click', closeCreditsHelpPanel);
  }
}