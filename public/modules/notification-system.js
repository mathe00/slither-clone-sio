/**
 * ==============================================================================
 * FILE: notification-system.js
 * 
 * DESCRIPTION:
 * Manages user notification display and timing. Handles notification
 * cooldown and animated message display.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';

// --- Notification Configuration ---
const clientNotificationCooldown = 5000; // Min time (ms) between notifications for the same user client-side
const lastClientNotificationTimes = {}; // { username: timestamp }

// --- Notification Function ---
export function showNotification(message, type = 'info') {
  const { notificationContainer } = uiElements;
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