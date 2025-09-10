// --- public/sound-manager.js ---
/**
 * ==============================================================================
 * FILE: sound-manager.js
 *
 * DESCRIPTION:
 * Manages custom sound loading, saving (to localStorage), playback (using Web
 * Audio API), and related UI interactions (status indicators, clear button)
 * for different game events (death, kill, boost). Requires user login to save sounds.
 * Uses i18next for user-facing messages.
 *
 * DEVELOPER GUIDELINES:
 * - Keep comments concise, relevant, and in English.
 * - Document complex logic, algorithms, non-obvious decisions, and "why"s.
 * - Maintain and update existing comments when refactoring or modifying code.
 * - Adhere to modern JavaScript (ESNext) conventions and project style guides.
 * - Ensure code is robust and handles potential errors gracefully (file reading, localStorage limits).
 * ==============================================================================
 */

// Relies on the global 'loggedInUsername' variable from ui-logic.js for storage keys.
// Assumes global 'i18next' instance is available and initialized.

const SoundManager = (() => {
  let soundInputs = {};
  let soundStatusSpans = {};
  let clearSoundsButton = null;

  // Helper to safely get translations
  function t(key, options = {}) {
    if (window.i18next && window.i18next.isInitialized) {
      return window.i18next.t(key, options);
    }
    console.warn(`i18next not ready, using fallback for key: ${key}`);
    // Provide basic fallback text
    const fallback = key.split('.').pop(); // Get last part of the key
    return options.defaultValue || fallback || key;
  }

  /**
   * Initializes the SoundManager by finding DOM elements and attaching listeners.
   * Should be called once after the DOM is ready.
   */
  function init() {
    console.log('Initializing SoundManager...');
    soundInputs = {
      death: document.getElementById('deathSoundInput'),
      kill: document.getElementById('killSoundInput'),
      boost: document.getElementById('boostSoundInput'),
      // Add other sound event inputs here if needed in the future
    };
    soundStatusSpans = {
      death: document.getElementById('deathSoundStatus'),
      kill: document.getElementById('killSoundStatus'),
      boost: document.getElementById('boostSoundStatus'),
      // Add other sound event status spans here
    };
    clearSoundsButton = document.getElementById('clearSoundsButton');

    attachListeners();
    updateStatus(); // Initial status update based on current login state
  }

  /**
   * Attaches event listeners to the sound input elements and clear button.
   * @private
   */
  function attachListeners() {
    for (const eventType in soundInputs) {
      if (soundInputs[eventType]) {
        soundInputs[eventType].addEventListener('change', e => {
          // Use `eventType` from the loop's scope
          handleSoundInputChange(eventType, e);
        });
      } else {
        console.warn(`Sound input element not found for event: ${eventType}`);
      }
    }

    if (clearSoundsButton) {
      clearSoundsButton.addEventListener('click', clearAllSounds);
    } else {
      console.warn('Clear sounds button not found.');
    }
  }

  /**
   * Handles the 'change' event for a sound file input.
   * @param {string} eventType - The type of sound event (e.g., 'death', 'kill').
   * @param {Event} e - The event object.
   * @private
   */
  function handleSoundInputChange(eventType, e) {
    const file = e.target.files[0];
    if (file && file.type === 'audio/mpeg') {
      saveSound(eventType, file);
    } else if (file) {
      alert(t('soundManager.alerts.selectMp3'));
      e.target.value = ''; // Clear the input
    }
  }

  /**
   * Gets the localStorage key for a specific sound event and user.
   * Relies on the global `loggedInUsername` from ui-logic.js.
   * @param {string} eventType - The type of sound event.
   * @returns {string|null} The storage key or null if not logged in.
   * @private
   */
  function getSoundStorageKey(eventType) {
    // IMPORTANT: Assumes `loggedInUsername` is a global variable accessible here
    if (typeof loggedInUsername === 'undefined' || !loggedInUsername) {
      // console.warn("getSoundStorageKey: loggedInUsername not available.");
      return null;
    }
    return `sound_${loggedInUsername}_${eventType}`;
  }

  /**
   * Saves the sound file data (as Data URL) to localStorage.
   * @param {string} eventType - The type of sound event.
   * @param {File} file - The sound file to save.
   * @private
   */
  function saveSound(eventType, file) {
    const key = getSoundStorageKey(eventType);
    if (!key) {
      alert(t('soundManager.alerts.loginRequired'));
      // Clear the input if save fails due to not being logged in
      if (soundInputs[eventType]) soundInputs[eventType].value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        localStorage.setItem(key, e.target.result);
        if (soundStatusSpans[eventType]) {
          soundStatusSpans[eventType].textContent = '✅';
          soundStatusSpans[eventType].title = t('soundManager.statusTitles.savedWithName', {
            filename: file.name,
          });
        }
        console.log(`SoundManager: Sound for '${eventType}' saved.`);
      } catch (error) {
        console.error('SoundManager: Error saving sound (localStorage full?)', error);
        alert(t('soundManager.alerts.saveError'));
        if (soundStatusSpans[eventType]) {
          soundStatusSpans[eventType].textContent = '❌';
          soundStatusSpans[eventType].title = t('soundManager.statusTitles.saveError');
        }
      }
    };
    reader.onerror = e => {
      console.error('SoundManager: Error reading sound file:', e);
      alert(t('soundManager.alerts.readError'));
      if (soundStatusSpans[eventType]) {
        soundStatusSpans[eventType].textContent = '❌';
        soundStatusSpans[eventType].title = t('soundManager.statusTitles.readError');
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * Updates the status indicators (✅/❌) for each sound input based on localStorage.
   * Also clears the file input fields.
   */
  function updateStatus() {
    // console.log("SoundManager: Updating status indicators..."); // Debug log
    const userIsLoggedIn = typeof loggedInUsername !== 'undefined' && loggedInUsername;

    for (const eventType in soundInputs) {
      const key = getSoundStorageKey(eventType); // Will be null if not logged in
      let storedSound = null;
      if (key) {
        try {
          storedSound = localStorage.getItem(key);
        } catch (e) {
          console.error(`SoundManager: Error reading localStorage for key ${key}`, e);
        }
      }

      // Update status span
      if (soundStatusSpans[eventType]) {
        if (userIsLoggedIn && storedSound) {
          soundStatusSpans[eventType].textContent = '✅';
          soundStatusSpans[eventType].title = t('soundManager.statusTitles.saved');
        } else {
          soundStatusSpans[eventType].textContent = '';
          soundStatusSpans[eventType].title = '';
        }
      }

      // Clear file input value
      if (soundInputs[eventType]) {
        soundInputs[eventType].value = '';
      }
    }
  }

  /**
   * Clears all saved sounds for the currently logged-in user from localStorage.
   * @private
   */
  function clearAllSounds() {
    const keyPrefix = getSoundStorageKey(''); // Gets 'sound_username_'
    if (!keyPrefix) {
      alert(t('soundManager.alerts.clearLoginRequired'));
      return;
    }

    if (confirm(t('soundManager.confirms.clearAll'))) {
      let clearedCount = 0;
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(keyPrefix)) {
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
      } catch (e) {
        console.error('SoundManager: Error clearing sounds from localStorage', e);
        alert(t('soundManager.alerts.clearError'));
        return; // Stop if error occurs
      }

      if (clearedCount > 0) {
        console.log(`SoundManager: ${clearedCount} custom sound(s) cleared.`);
      } else {
        console.log('SoundManager: No custom sounds to clear.');
      }
      updateStatus(); // Update UI after clearing
    }
  }

  /**
   * Plays the saved sound for a specific event type if available.
   * @param {string} eventType - The type of sound event (e.g., 'death', 'kill').
   */
  function playSound(eventType) {
    const key = getSoundStorageKey(eventType);
    if (!key) return; // Not logged in or event type invalid

    let dataUrl = null;
    try {
      dataUrl = localStorage.getItem(key);
    } catch (e) {
      console.error(`SoundManager: Error reading sound from localStorage for ${eventType}`, e);
      return;
    }

    if (dataUrl) {
      try {
        const audio = new Audio(dataUrl);
        // Optional: Add volume control here if needed later
        // audio.volume = 0.8; // Example
        audio
          .play()
          .catch(e =>
            console.warn(`SoundManager: Unable to play sound for ${eventType}:`, e.message)
          );
      } catch (e) {
        console.error(`SoundManager: Error creating/playing sound for ${eventType}:`, e);
      }
    } else {
      // console.log(`SoundManager: No custom sound found for event: ${eventType}`); // Optional debug log
    }
  }

  // Public interface
  return {
    init: init,
    updateStatus: updateStatus,
    playSound: playSound,
  };
})();

// Make SoundManager globally available
window.SoundManager = SoundManager;
