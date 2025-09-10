/**
 * ==============================================================================
 * FILE: leaderboard-manager.js
 * 
 * DESCRIPTION:
 * Manages leaderboard display, visibility toggling, and data formatting.
 * Handles score ranking and user status display.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';
import { t } from './i18n-manager.js';
import { updateFocusableButtons } from './form-navigation.js';

// --- Leaderboard Toggle Functions ---
export function setLeaderboardVisibility(show) {
  const { leaderboardPanel, startMenuOverlay, showLeaderboardBtn } = uiElements;
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

export function applyInitialLeaderboardState() {
  const initiallyHidden = localStorage.getItem('leaderboardHidden') === 'true';
  setLeaderboardVisibility(!initiallyHidden);
  const { leaderboardPanel } = uiElements;
  if (leaderboardPanel) {
    leaderboardPanel.classList.toggle('hidden', initiallyHidden);
    leaderboardPanel.classList.toggle('visible', !initiallyHidden);
  }
}

// --- Helper Function ---
function formatDateTime(timestamp) {
  if (!timestamp) return t('leaderboard.status.never');
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
  return date.toLocaleDateString(window.i18next?.language || 'default');
}

// --- Leaderboard Update Function ---
export function updateLeaderboard(data) {
  const { leaderboardContent } = uiElements;
  if (!leaderboardContent) return;
  
  leaderboardContent.innerHTML = '';
  if (!data || data.length === 0) {
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