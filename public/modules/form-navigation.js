/**
 * ==============================================================================
 * FILE: form-navigation.js
 * 
 * DESCRIPTION:
 * Handles menu navigation, form switching, and keyboard controls for the UI.
 * Manages focus management, Konami code, and keyboard shortcuts.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';
import { t } from './i18n-manager.js';

// --- Global Variables ---
let focusedButtonIndex = -1;
let menuButtons = [];

// --- Konami Code Configuration ---
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

// --- Form Navigation Functions ---
export function showForm(formToShow) {
  const { modeSelector, tempForm, loginForm, createForm, soundForm, skinForm } = uiElements;
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

// --- Keyboard Navigation Functions ---
export function updateFocusableButtons() {
  const activeForm = document.querySelector('.modeForm.active');
  let container = activeForm || uiElements.modeSelector;
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

function activateFocusedButton() {
  if (focusedButtonIndex >= 0 && focusedButtonIndex < menuButtons.length) {
    menuButtons[focusedButtonIndex].click();
  }
}

// --- Keyboard Event Handler ---
export function handleMenuKeyDown(event) {
  const { startMenuOverlay } = uiElements;
  if (!startMenuOverlay || startMenuOverlay.style.display === 'none') return;
  
  if (
    document.activeElement &&
    ((document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'text') ||
      document.activeElement.tagName === 'TEXTAREA' ||
      (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'password'))
  ) {
    if (event.key === 'Enter') activateFocusedButton();
    return;
  }
  
  if (uiElements.creditsHelpPanel && uiElements.creditsHelpPanel.classList.contains('visible')) {
    if (event.key === 'Escape' && typeof closeCreditsHelpPanel === 'function') closeCreditsHelpPanel();
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
      else if (uiElements.creditsHelpPanel.classList.contains('visible') && typeof closeCreditsHelpPanel === 'function') closeCreditsHelpPanel();
      break;
    }
  }
  handleKonamiInput(event.code);
}

// --- Konami Code Functions ---
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