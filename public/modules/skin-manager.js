/**
 * ==============================================================================
 * FILE: skin-manager.js
 * 
 * DESCRIPTION:
 * Manages character skin/appearance customization including colors, patterns,
 * and trail effects. Handles form interactions and local storage persistence.
 * 
 * ==============================================================================
 */

import { uiElements } from './ui-elements.js';
import { t } from './i18n-manager.js';

// --- Default skin data ---
let currentSkinData = {
  bodyType: 'single',
  headColor: '#ff0000',
  bodyColor: '#ffff00',
  patternColors: [],
  trailEffect: 'none',
};

// --- Helper Functions ---
function checkColorBrightness(hex) {
  if (!hex || hex.length < 7) return 255;
  let r = parseInt(hex.substr(1, 2), 16);
  let g = parseInt(hex.substr(3, 2), 16);
  let b = parseInt(hex.substr(5, 2), 16);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function enforceLightColor(inputElem) {
  if (checkColorBrightness(inputElem.value) < 50) {
    alert(t('ui.alerts.colorTooDark'));
  }
}

// --- Skin Management Functions ---
export function loadInitialColors() {
  const { skinHeadColorInput, skinBodyColorInput } = uiElements;
  if (!skinHeadColorInput || !skinBodyColorInput) return;
  
  skinHeadColorInput.value = localStorage.getItem('headColor') || '#ff0000';
  skinBodyColorInput.value = localStorage.getItem('bodyColor') || '#ffff00';
  currentSkinData.headColor = skinHeadColorInput.value;
  currentSkinData.bodyColor = skinBodyColorInput.value;
}

export function applySkinDataToForm() {
  if (!currentSkinData) {
    console.warn('applySkinDataToForm called with null currentSkinData, resetting to default.');
    currentSkinData = {
      bodyType: 'single',
      headColor: localStorage.getItem('headColor') || '#ff0000',
      bodyColor: localStorage.getItem('bodyColor') || '#ffff00',
      patternColors: [],
      trailEffect: 'none',
    };
  }

  if (uiElements.skinHeadColorInput) {
    uiElements.skinHeadColorInput.value = currentSkinData.headColor || '#ff0000';
  }

  const radioToCheck = document.querySelector(
    `input[name="bodyType"][value="${currentSkinData.bodyType}"]`
  );
  if (radioToCheck) radioToCheck.checked = true;
  else {
    const singleRadio = document.querySelector('input[name="bodyType"][value="single"]');
    if (singleRadio) singleRadio.checked = true;
    currentSkinData.bodyType = 'single';
  }

  if (uiElements.skinBodyColorInput) {
    uiElements.skinBodyColorInput.value = currentSkinData.bodyColor || '#ffff00';
  }

  if (uiElements.trailEffectSelect) {
    const validOption = Array.from(uiElements.trailEffectSelect.options).some(
      opt => opt.value === currentSkinData.trailEffect
    );
    uiElements.trailEffectSelect.value = validOption ? currentSkinData.trailEffect : 'none';
    if (!validOption) currentSkinData.trailEffect = 'none';
  }

  const colors = Array.isArray(currentSkinData.patternColors) ? currentSkinData.patternColors : [];
  if (uiElements.patternColorPickersContainer) populatePatternPickers(colors);

  toggleSkinSections();
}

export function toggleSkinSections() {
  const { skinSingleColorSection, skinPatternSection } = uiElements;
  if (!skinSingleColorSection || !skinPatternSection) return;
  
  const selectedTypeRadio = document.querySelector('input[name="bodyType"]:checked');
  const selectedType = selectedTypeRadio ? selectedTypeRadio.value : 'single';
  skinSingleColorSection.style.display = selectedType === 'single' ? 'block' : 'none';
  skinPatternSection.style.display = selectedType === 'pattern' ? 'block' : 'none';
}

// --- Pattern Color Management ---
function populatePatternPickers(colors) {
  if (!uiElements.patternColorPickersContainer) return;
  uiElements.patternColorPickersContainer.innerHTML = '';
  colors.forEach((color, index) => {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = color;
    input.dataset.index = index;
    input.tabIndex = 0;
    uiElements.patternColorPickersContainer.appendChild(input);
  });
}

export function addPatternColor() {
  const currentColors = getPatternColorsFromPickers();
  if (currentColors.length < 8) {
    const newColor =
      '#' +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
    populatePatternPickers([...currentColors, newColor]);
  } else {
    alert(t('ui.alerts.maxPatternColors', { max: 8 }));
  }
}

export function removePatternColor() {
  const currentColors = getPatternColorsFromPickers();
  if (currentColors.length > 1) {
    populatePatternPickers(currentColors.slice(0, -1));
  }
}

function getPatternColorsFromPickers() {
  if (!uiElements.patternColorPickersContainer) return [];
  return Array.from(uiElements.patternColorPickersContainer.querySelectorAll('input[type="color"]')).map(
    input => input.value
  );
}

// --- Event Handlers ---
export function setupSkinEventHandlers() {
  const { 
    skinHeadColorInput, 
    skinBodyColorInput, 
    createHeadColorInput, 
    createBodyColorInput,
    skinBodyTypeRadios,
    addPatternColorBtn,
    removePatternColorBtn
  } = uiElements;
  
  if (!skinHeadColorInput) return;

  skinHeadColorInput.addEventListener('change', () => {
    enforceLightColor(skinHeadColorInput);
    currentSkinData.headColor = skinHeadColorInput.value;
    localStorage.setItem('headColor', currentSkinData.headColor);
  });
  
  skinBodyColorInput.addEventListener('change', () => {
    enforceLightColor(skinBodyColorInput);
    currentSkinData.bodyColor = skinBodyColorInput.value;
    localStorage.setItem('bodyColor', currentSkinData.bodyColor);
  });
  
  createHeadColorInput.addEventListener('change', () => {
    enforceLightColor(createHeadColorInput);
    localStorage.setItem('headColor', createHeadColorInput.value);
    skinHeadColorInput.value = createHeadColorInput.value;
  });
  
  createBodyColorInput.addEventListener('change', () => {
    enforceLightColor(createBodyColorInput);
    localStorage.setItem('bodyColor', createBodyColorInput.value);
    skinBodyColorInput.value = createBodyColorInput.value;
  });

  skinBodyTypeRadios.forEach(radio => {
    radio.addEventListener('change', toggleSkinSections);
  });
  
  if (addPatternColorBtn) {
    addPatternColorBtn.addEventListener('click', addPatternColor);
  }
  
  if (removePatternColorBtn) {
    removePatternColorBtn.addEventListener('click', removePatternColor);
  }
}

// --- Data Export ---
export function getCurrentSkinData() {
  return { ...currentSkinData };
}

export function getPatternColors() {
  return getPatternColorsFromPickers();
}

export function setCurrentSkinData(skinData) {
  currentSkinData = { ...skinData };
}