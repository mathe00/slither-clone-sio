// --- public/admin-logic.js ---
// --- START JAVASCRIPT ---

// Ensure i18next is available globally (from CDN)
const i18next = window.i18next;
const i18nextHttpBackend = window.i18nextHttpBackend;
const i18nextBrowserLanguageDetector = window.i18nextBrowserLanguageDetector;

// --- DOM Elements ---
let adminForm,
  feedbackMessage,
  userTableBody,
  userFeedback,
  pruneButton,
  currentConfigDisplay,
  currentConfigFeedback;
let tabButtons, tabContents;
let feedbackTimeout, userFeedbackTimeout, currentConfigFeedbackTimeout;

// --- i18next Initialization (Simplified) ---
async function initializeI18n() {
  if (!i18next || !i18nextHttpBackend || !i18nextBrowserLanguageDetector) {
    console.error('i18next libraries not loaded!');
    const errorDiv = document.getElementById('feedbackMessage') || document.body;
    errorDiv.textContent = 'Critical Error: Language library failed to load.';
    errorDiv.style.color = 'red';
    errorDiv.style.display = 'block';
    return Promise.reject('i18next libraries not loaded');
  }
  try {
    await i18next
      .use(i18nextHttpBackend)
      .use(i18nextBrowserLanguageDetector)
      .init({
        debug: false,
        fallbackLng: 'en',
        supportedLngs: [
          'en',
          'fr',
          'es',
          'de',
          'zh',
          'ar',
          'pt',
          'ru',
          'ja',
          'hi',
          'ko',
          'it',
          'tr',
          'id',
          'pl',
          'bn',
          'ur',
          'vi',
          'th',
          'fil',
          'fa',
          'ms',
          'nl',
          'uk',
          'el',
          'sv',
          'fi',
          'hu',
          'ro',
          'cs',
          'sw',
          'ha',
          'yo',
          'ig',
          'zht',
        ],
        load: 'languageOnly',
        nonExplicitSupportedLngs: true,
        ns: ['translation'],
        defaultNS: 'translation',
        backend: { loadPath: '/locales/{{lng}}.json' },
        detection: { order: ['navigator', 'htmlTag'], caches: [] },
      });
    console.log('[i18n] Init promise resolved. Detected/Fallback language:', i18next.language);

    // Attach listeners AFTER successful initialization
    i18next.on('languageChanged', lng => {
      console.log('[i18n listener] Language changed to:', lng, 'Updating content.');
      // Reloading resources may be necessary
      i18next.loadLanguages(lng, err => {
        if (err) console.error(`[i18n] Error loading ${lng} on change:`, err);
        updateContent(); // Update content when language changes
        // Refresh tab data if necessary (e.g., dates)
        const activeTabButton = document.querySelector('.admin-tab-button.active');
        if (activeTabButton) {
          const currentTab = activeTabButton.getAttribute('data-tab');
          if (currentTab === 'users') fetchUsers();
          else if (currentTab === 'current-config') fetchCurrentSettingsForDisplay();
        }
      });
    });

    i18next.on('failedLoading', (lng, ns, msg) => {
      console.error(
        `[i18n listener] CRITICAL: Failed loading language '${lng}' namespace '${ns}': ${msg}`
      );
      const errorDiv = document.getElementById('feedbackMessage') || document.body;
      errorDiv.textContent = `Error loading translations (${lng}). Some text may be missing. Please check console or refresh.`;
      errorDiv.className = 'error';
      errorDiv.style.display = 'block';
      errorDiv.style.opacity = '1';
    });
  } catch (error) {
    console.error('[i18n] Initialization failed:', error);
    const errorDiv = document.getElementById('feedbackMessage') || document.body;
    errorDiv.textContent = 'Failed to initialize translations.';
    errorDiv.style.color = 'red';
    errorDiv.style.display = 'block';
    throw error;
  }
}

// --- Function to update DOM elements with translations ---
function updateContent() {
  const currentLng = i18next.language;
  if (!i18next.isInitialized) {
    console.warn('[updateContent] Aborted: i18next not initialized.');
    return;
  }
  console.log(`[updateContent] Running for language: ${currentLng}`);
  const resourceBundle = i18next.getResourceBundle(currentLng, 'translation');
  if (!resourceBundle) {
    console.warn(
      `[updateContent] Resource bundle for ${currentLng} not found! Translation might use fallbacks.`
    );
    const baseLng = currentLng.split('-')[0];
    if (!i18next.hasResourceBundle(baseLng, 'translation'))
      console.error(
        `[updateContent] CRITICAL: Neither ${currentLng} nor base language ${baseLng} bundle found.`
      );
  }
  const elements = document.querySelectorAll('[data-i18n]');
  console.log(`[updateContent] Found ${elements.length} elements with data-i18n attribute.`);
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    let options = {};
    try {
      if (key.startsWith('[')) {
        const match = key.match(/^\[(.*?)\](.*)$/);
        if (match) {
          const attr = match[1];
          const realKey = match[2];
          const translation = i18next.t(realKey, { ...options, defaultValue: `[[${realKey}]]` });
          console.log(
            `[updateContent] Translating attribute ${attr} of element with key ${realKey}: ${translation}`
          );
          el.setAttribute(attr, translation);
        }
      } else if (key.startsWith('[html]')) {
        const realKey = key.substring(6);
        const translation = i18next.t(realKey, {
          ...options,
          defaultValue: `[[html]${realKey}]`,
          interpolation: { escapeValue: false },
        });
        console.log(
          `[updateContent] Translating HTML content of element with key ${realKey}: ${translation}`
        );
        if (el.innerHTML !== translation) el.innerHTML = translation;
      } else {
        const translation = i18next.t(key, { ...options, defaultValue: `[[${key}]]` });
        console.log(
          `[updateContent] Translating text content of element with key ${key}: ${translation}`
        );
        if (el.textContent !== translation) el.textContent = translation;
      }
    } catch (e) {
      console.error(`[updateContent] Error translating key "${key}":`, e);
      if (!key.startsWith('[')) el.textContent = `[[ERR: ${key}]]`;
    }
  });
  try {
    document.title = i18next.t('pageTitle', { defaultValue: 'Admin - Slither Clone' });
  } catch (e) {
    console.error(`[updateContent] Error translating title key "pageTitle":`, e);
    document.title = 'Admin - Slither Clone';
  }
  console.log(`[updateContent] Finished updating content.`);
}

// --- Function to trigger initial data load ---

// --- Function to generate dynamic form from schema ---
/**
 * Generates a dynamic form based on the configuration schema.
 * This function fetches the schema from the server, creates category tabs,
 * and generates form elements for each parameter in the schema.
 *
 * @returns {Promise<void>} A promise that resolves when the form is generated.
 */
async function generateDynamicForm() {
  console.log('[generateDynamicForm] Starting...');
  const dynamicFormContainer = document.getElementById('dynamic-form-container');
  if (!dynamicFormContainer) {
    console.error('[generateDynamicForm] Container #dynamic-form-container not found!');
    return;
  }

  try {
    // Load the configuration schema
    const schemaResponse = await fetch('/config-schema.json');
    if (!schemaResponse.ok) {
      throw new Error(
        `Failed to load schema: ${schemaResponse.status} ${schemaResponse.statusText}`
      );
    }
    const schema = await schemaResponse.json();
    console.log('[generateDynamicForm] Schema loaded:', schema);

    // Create category tabs
    const categoryTabsContainer = document.createElement('div');
    categoryTabsContainer.className = 'category-tabs';
    dynamicFormContainer.appendChild(categoryTabsContainer);

    // Create form grid container
    const formGridContainer = document.createElement('div');
    formGridContainer.className = 'form-grid';
    dynamicFormContainer.appendChild(formGridContainer);

    let isFirstCategory = true;
    for (const [categoryKey, categoryData] of Object.entries(schema.categories)) {
      // Create category tab button
      const tabButton = document.createElement('button');
      tabButton.className = 'category-tab-button';
      if (isFirstCategory) {
        tabButton.classList.add('active');
      }
      tabButton.textContent = categoryData.title;
      tabButton.setAttribute('data-category', categoryKey);
      categoryTabsContainer.appendChild(tabButton);

      // Create category content div
      const categoryContent = document.createElement('div');
      categoryContent.className = 'category-content';
      if (isFirstCategory) {
        categoryContent.classList.add('active');
      }
      categoryContent.setAttribute('data-category', categoryKey);
      formGridContainer.appendChild(categoryContent);

      // Generate form elements for each parameter in the category
      categoryData.parameters.forEach(parameter => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.setAttribute('for', parameter.key);
        label.setAttribute('data-i18n', parameter.i18nKey);
        console.log(
          `[generateDynamicForm] Created label for ${parameter.key} with i18n key: ${parameter.i18nKey}`
        );
        // Set a default text content which will be replaced by i18next
        label.textContent = parameter.key;
        formGroup.appendChild(label);

        let inputElement;
        if (parameter.type === 'boolean') {
          // For boolean types, use a select dropdown
          inputElement = document.createElement('select');
          inputElement.id = parameter.key;
          inputElement.name = parameter.key;

          const trueOption = document.createElement('option');
          trueOption.value = 'true';
          trueOption.setAttribute('data-i18n', 'currentConfig.boolean.yes');
          console.log(
            `[generateDynamicForm] Created boolean true option with i18n key: currentConfig.boolean.yes`
          );
          trueOption.textContent = 'Yes';
          inputElement.appendChild(trueOption);

          const falseOption = document.createElement('option');
          falseOption.value = 'false';
          falseOption.setAttribute('data-i18n', 'currentConfig.boolean.no');
          console.log(
            `[generateDynamicForm] Created boolean false option with i18n key: currentConfig.boolean.no`
          );
          falseOption.textContent = 'No';
          inputElement.appendChild(falseOption);
        } else if (parameter.type === 'enum' && parameter.enumValues) {
          // For enum types, use a select dropdown with enum values
          inputElement = document.createElement('select');
          inputElement.id = parameter.key;
          inputElement.name = parameter.key;

          parameter.enumValues.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            // Use i18n key if available, otherwise use the value itself
            // Extract the base key name from parameter.i18nKey (e.g., "settingsForm.mapShape.label" -> "mapShape")
            const baseKey = parameter.i18nKey.replace(/\.label$/, '');
            const i18nOptionKey = `${baseKey}.${value}`;
            option.setAttribute('data-i18n', i18nOptionKey);
            console.log(
              `[generateDynamicForm] Created enum option for ${parameter.key} with value ${value} and i18n key: ${i18nOptionKey}`
            );
            option.textContent = value; // Default text, will be replaced by i18next
            inputElement.appendChild(option);
          });
        } else {
          // For other types, use an input field
          inputElement = document.createElement('input');
          inputElement.id = parameter.key;
          inputElement.name = parameter.key;
          inputElement.type = parameter.type === 'number' ? 'number' : 'text';

          // Set min, max, and step attributes for number inputs
          if (parameter.type === 'number') {
            if (parameter.min !== undefined) {
              inputElement.min = parameter.min;
            }
            if (parameter.max !== undefined) {
              inputElement.max = parameter.max;
            }
            if (parameter.step !== undefined) {
              inputElement.step = parameter.step;
            } else if (Number.isInteger(parameter.default)) {
              inputElement.step = '1';
            } else {
              inputElement.step = '0.01'; // Default for decimal numbers
            }
          }

          // Set placeholder using i18n if available
          const placeholderKey = `${parameter.i18nKey}.placeholder`;
          inputElement.setAttribute('data-i18n', `[placeholder]${placeholderKey}`);
        }

        // Set default value
        if (parameter.default !== undefined) {
          if (parameter.type === 'boolean') {
            inputElement.value = parameter.default ? 'true' : 'false';
          } else {
            inputElement.value = parameter.default;
          }
        }

        formGroup.appendChild(inputElement);
        categoryContent.appendChild(formGroup);
      });

      isFirstCategory = false;
    }

    // Add event listeners for category tabs
    const categoryTabButtons = categoryTabsContainer.querySelectorAll('.category-tab-button');
    categoryTabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all buttons and contents
        categoryTabButtons.forEach(btn => btn.classList.remove('active'));
        const categoryContents = formGridContainer.querySelectorAll('.category-content');
        categoryContents.forEach(content => content.classList.remove('active'));

        // Add active class to clicked button
        button.classList.add('active');

        // Show corresponding content
        const categoryKey = button.getAttribute('data-category');
        const contentToShow = formGridContainer.querySelector(
          `.category-content[data-category="${categoryKey}"]`
        );
        if (contentToShow) {
          contentToShow.classList.add('active');
        }
      });
    });

    console.log('[generateDynamicForm] Form generated successfully.');
    // Update content to translate the newly generated form elements
    console.log('[generateDynamicForm] Calling updateContent to translate form elements.');
    updateContent();
    console.log('[generateDynamicForm] updateContent called.');
  } catch (error) {
    console.error('[generateDynamicForm] Error:', error);
    dynamicFormContainer.innerHTML = `<div class="error">Failed to load configuration schema: ${error.message}</div>`;
  }
}

// --- DOMContentLoaded Listener (Revised with delay) ---
document.addEventListener('DOMContentLoaded', async () => {
  // --- Initialize DOM Elements ---
  adminForm = document.getElementById('adminForm');
  feedbackMessage = document.getElementById('feedbackMessage');
  userTableBody = document.getElementById('userTableBody');
  userFeedback = document.getElementById('userFeedback');
  pruneButton = document.getElementById('pruneButton');
  currentConfigDisplay = document.getElementById('currentConfigDisplay');
  currentConfigFeedback = document.getElementById('currentConfigFeedback');
  tabButtons = document.querySelectorAll('.admin-tab-button');
  tabContents = document.querySelectorAll('.admin-tab-content');

  try {
    // --- Wait for i18next initialization ---
    console.log('[DOMContentLoaded] Initializing i18next...');
    await initializeI18n(); // Wait for the init() promise to resolve
    console.log('[DOMContentLoaded] i18next initialized successfully.');

    // --- Function to trigger initial data load (Moved Here) ---
    function triggerInitialTabLoad() {
      const activeTabButton = document.querySelector('.admin-tab-button.active');
      let initialFetchPromise;
      if (activeTabButton) {
        const initialTab = activeTabButton.getAttribute('data-tab');
        console.log('[triggerInitialTabLoad] Triggering initial load for tab:', initialTab);
        if (initialTab === 'settings') {
          // For settings tab, first generate the form, then fetch current settings
          initialFetchPromise = generateDynamicForm().then(() => fetchCurrentSettingsForForm());
        } else {
          initialFetchPromise =
            initialTab === 'users'
              ? fetchUsers()
              : initialTab === 'current-config'
                ? fetchCurrentSettingsForDisplay()
                : Promise.resolve();
        }
      } else {
        // If no tab is active by default (which shouldn't happen if the HTML is correct),
        // generate the form and load the settings form data by default.
        console.log(
          '[triggerInitialTabLoad] No active tab found by selector, defaulting to generate form and fetch settings form data.'
        );
        initialFetchPromise = generateDynamicForm().then(() => fetchCurrentSettingsForForm());
      }
      initialFetchPromise.catch(err => {
        console.error('[triggerInitialTabLoad] Error during initial fetch:', err);
        // Ensure feedbackMessage is defined before calling showFeedback
        if (feedbackMessage) {
          showFeedback(feedbackMessage, 'feedback.loadSettingsError', 'error', 5000, {
            error: err.message,
          });
        }
      });
    }

    // --- Introduce a delay BEFORE the first translation/loading ---
    console.log('[DOMContentLoaded] Waiting for a short delay (100ms)...');
    setTimeout(() => {
      console.log('[DOMContentLoaded - Delayed] Performing initial content update...');
      updateContent(); // Translate static UI now that i18next is (hopefully) stable
      console.log('[DOMContentLoaded - Delayed] Initial content update complete.');
      console.log('[DOMContentLoaded - Delayed] Triggering initial tab data load...');
      triggerInitialTabLoad(); // Load data AFTER initial translation
      console.log('[DOMContentLoaded - Delayed] Initial tab data load triggered.');
    }, 100); // 100ms delay (adjustable if necessary)
  } catch (error) {
    console.error('[DOMContentLoaded] Failed to initialize i18next:', error);
    // The error is already displayed in initializeI18n
    return; // Stop execution if i18n fails
  }

  // --- Rest of the DOMContentLoaded logic (form/button listeners attachment, etc.) ---

  // --- Tab Switching Logic ---
  tabButtons.forEach(button => {
    button.addEventListener('click', async () => {
      // Make listener async
      const targetTab = button.getAttribute('data-tab');
      console.log(`[Tab Switch] Clicked tab: ${targetTab}`);
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `tab-${targetTab}`) content.classList.add('active');
      });
      // Await fetch and then update content
      try {
        let fetchPromise =
          targetTab === 'users'
            ? fetchUsers()
            : targetTab === 'settings'
              ? fetchCurrentSettingsForForm()
              : targetTab === 'current-config'
                ? fetchCurrentSettingsForDisplay()
                : Promise.resolve();
        await fetchPromise; // Wait for the data loading/DOM update to finish
        // Update content after fetch to ensure dynamic elements are translated
        console.log(`[Tab Switch] Fetch for ${targetTab} complete, calling updateContent.`);
        updateContent();
      } catch (fetchError) {
        console.error(`[Tab Switch] Error fetching data for tab ${targetTab}:`, fetchError);
      }
    });
  });

  // --- Helper to show feedback messages ---
  function showFeedback(
    element,
    messageKeyOrText,
    type = 'success',
    duration = 5000,
    options = {}
  ) {
    if (!element) {
      console.warn('Attempted to show feedback on a non-existent element.');
      return;
    }
    let timeoutVar;
    if (element === feedbackMessage) timeoutVar = feedbackTimeout;
    else if (element === userFeedback) timeoutVar = userFeedbackTimeout;
    else if (element === currentConfigFeedback) timeoutVar = currentConfigFeedbackTimeout;
    clearTimeout(timeoutVar);
    const messageText = i18next.isInitialized
      ? i18next.t(messageKeyOrText, { ...options, defaultValue: messageKeyOrText })
      : messageKeyOrText;
    element.textContent = messageText;
    element.className = type;
    element.style.display = 'block';
    void element.offsetWidth;
    element.style.opacity = '1';
    const timeoutId = setTimeout(() => {
      element.style.opacity = '0';
      setTimeout(() => {
        element.style.display = 'none';
      }, 500);
    }, duration);
    if (element === feedbackMessage) feedbackTimeout = timeoutId;
    else if (element === userFeedback) userFeedbackTimeout = timeoutId;
    else if (element === currentConfigFeedback) currentConfigFeedbackTimeout = timeoutId;
  }

  // --- Fetch Current Settings for the FORM ---
  async function fetchCurrentSettingsForForm() {
    console.log('[fetchCurrentSettingsForForm] Fetching...');
    if (adminForm) {
      adminForm.style.opacity = '0.5';
      adminForm.style.pointerEvents = 'none';
    }
    try {
      const response = await fetch('/admin/settings');
      if (!response.ok) {
        if (response.status === 403) {
          showFeedback(feedbackMessage, 'feedback.accessDenied', 'error', 5000);
          return; // Keep form disabled
        }
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json'))
        throw new Error(
          i18next.t('feedback.invalidResponse', { defaultValue: 'Invalid server response' })
        );
      const settings = await response.json();
      if (settings.success && settings.config) {
        console.log('[fetchCurrentSettingsForForm] Success, populating form.');
        console.log(
          'Received BOTS_ENABLED from server:',
          settings.config.BOTS_ENABLED,
          typeof settings.config.BOTS_ENABLED
        );
        console.log(
          'Received GODMODE_ON_SPAWN_ENABLED from server:',
          settings.config.GODMODE_ON_SPAWN_ENABLED,
          typeof settings.config.GODMODE_ON_SPAWN_ENABLED
        );
        // Populate form fields dynamically
        const dynamicFormContainer = document.getElementById('dynamic-form-container');
        if (dynamicFormContainer) {
          const inputElements = dynamicFormContainer.querySelectorAll('input, select, textarea');
          inputElements.forEach(element => {
            const key = element.id;
            if (Object.prototype.hasOwnProperty.call(settings.config, key)) {
              // Handle different input types
              if (element.type === 'checkbox') {
                element.checked = settings.config[key];
              } else if (element.type === 'radio') {
                // For radio buttons, check the one that matches the value
                if (element.value === String(settings.config[key])) {
                  element.checked = true;
                }
              } else {
                // For select elements with boolean values, we need to convert the boolean to string
                if (element.tagName === 'SELECT' && typeof settings.config[key] === 'boolean') {
                  element.value = settings.config[key] ? 'true' : 'false';
                } else {
                  // For all other input types (text, number, etc.)
                  element.value = settings.config[key];
                }
              }
            }
          });
        }
        // Do not reset admin message fields here
        if (adminForm) {
          adminForm.style.opacity = '1';
          adminForm.style.pointerEvents = 'auto';
        }
      } else {
        const messageKey = settings.messageKey ? settings.messageKey : 'feedback.loadSettingsError';
        console.error('[fetchCurrentSettingsForForm] Failed:', messageKey);
        showFeedback(feedbackMessage, messageKey, 'error', 5000, settings.messageOptions);
      }
    } catch (error) {
      console.error('[fetchCurrentSettingsForForm] Error:', error);
      showFeedback(feedbackMessage, 'feedback.loadSettingsError', 'error', 5000, {
        error: error.message,
      });
      // Keep form disabled on error
      if (adminForm) {
        adminForm.style.opacity = '0.5';
        adminForm.style.pointerEvents = 'none';
      }
      throw error; // Re-throw error so the tab switch logic knows it failed
    }
  }

  // --- Fetch Current Settings for DISPLAY ---
  async function fetchCurrentSettingsForDisplay() {
    console.log('[fetchCurrentSettingsForDisplay] Fetching...');
    if (!currentConfigDisplay) return;
    currentConfigDisplay.innerHTML = `<div class="config-loading">${i18next.t('currentConfig.loading', { defaultValue: 'Loading...' })}</div>`;
    try {
      const response = await fetch('/admin/settings');
      if (!response.ok) {
        if (response.status === 403) {
          currentConfigDisplay.innerHTML = `<div class="config-loading" style="color: #f04747;">${i18next.t('feedback.accessDenied', { defaultValue: 'Access Denied.' })}</div>`;
          showFeedback(currentConfigFeedback, 'feedback.accessDenied', 'error', 5000);
          return;
        }
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json'))
        throw new Error(
          i18next.t('feedback.invalidResponse', { defaultValue: 'Invalid server response' })
        );
      const settings = await response.json();
      if (settings.success && settings.config) {
        console.log('[fetchCurrentSettingsForDisplay] Success, populating display.');
        populateConfigDisplay(settings.config);
        showFeedback(currentConfigFeedback, 'currentConfig.loadSuccess', 'success', 3000);
      } else {
        currentConfigDisplay.innerHTML = `<div class="config-loading" style="color: #f04747;">${i18next.t('currentConfig.loadError', { defaultValue: 'Error loading config.' })}</div>`;
        const messageKey = settings.messageKey ? settings.messageKey : 'currentConfig.loadError';
        console.error('[fetchCurrentSettingsForDisplay] Failed:', messageKey);
        showFeedback(currentConfigFeedback, messageKey, 'error', 5000, settings.messageOptions);
      }
    } catch (error) {
      console.error('[fetchCurrentSettingsForDisplay] Error:', error);
      currentConfigDisplay.innerHTML = `<div class="config-loading" style="color: #f04747;">${i18next.t('feedback.loadSettingsError', { error: error.message, defaultValue: `Error: ${error.message}` })}</div>`;
      showFeedback(currentConfigFeedback, 'feedback.loadSettingsError', 'error', 5000, {
        error: error.message,
      });
      throw error; // Re-throw error
    }
  }

  // --- Populate Config Display Area ---
  function populateConfigDisplay(configData) {
    if (!currentConfigDisplay) return;
    currentConfigDisplay.innerHTML = '';
    const list = document.createElement('ul');
    list.className = 'config-display-list';
    const displayKeys = i18next.t('currentConfig.keys', { returnObjects: true, defaultValue: {} });
    for (const key in displayKeys) {
      if (Object.prototype.hasOwnProperty.call(configData, key)) {
        const listItem = document.createElement('li');
        listItem.className = 'config-display-item';
        const keySpan = document.createElement('span');
        keySpan.className = 'config-key';
        keySpan.textContent = displayKeys[key] + ':';
        const valueSpan = document.createElement('span');
        valueSpan.className = 'config-value';
        if (typeof configData[key] === 'boolean') {
          valueSpan.textContent = configData[key]
            ? i18next.t('currentConfig.boolean.yes', { defaultValue: 'Yes' })
            : i18next.t('currentConfig.boolean.no', { defaultValue: 'No' });
        } else {
          valueSpan.textContent = configData[key];
        }
        listItem.appendChild(keySpan);
        listItem.appendChild(valueSpan);
        list.appendChild(listItem);
      }
    }
    currentConfigDisplay.appendChild(list);
  }

  // --- Handle Settings Update Form Submission ---
  if (adminForm) {
    adminForm.addEventListener('submit', async event => {
      event.preventDefault();
      console.log('[Admin Form] Submitting...');
      // Collect data from dynamic form
      const dynamicFormContainer = document.getElementById('dynamic-form-container');
      const data = {};
      if (dynamicFormContainer) {
        const inputElements = dynamicFormContainer.querySelectorAll('input, select, textarea');
        inputElements.forEach(element => {
          // Handle different input types
          if (element.type === 'checkbox') {
            data[element.id] = element.checked;
          } else if (element.type === 'radio') {
            // For radio buttons, only include the value of the checked one
            if (element.checked) {
              // Try to convert to appropriate type
              if (element.value === 'true') {
                data[element.id] = true;
              } else if (element.value === 'false') {
                data[element.id] = false;
              } else if (!isNaN(element.value) && element.value.trim() !== '') {
                // Check if it's a number
                const numValue = Number(element.value);
                data[element.id] = Number.isInteger(numValue)
                  ? parseInt(element.value, 10)
                  : parseFloat(element.value);
              } else {
                data[element.id] = element.value;
              }
            }
          } else if (
            element.tagName === 'SELECT' &&
            (element.value === 'true' || element.value === 'false')
          ) {
            // Convert string "true"/"false" back to boolean
            data[element.id] = element.value === 'true';
          } else {
            // For all other input types (text, number, etc.)
            // Try to convert to appropriate type
            if (element.value === 'true') {
              data[element.id] = true;
            } else if (element.value === 'false') {
              data[element.id] = false;
            } else if (!isNaN(element.value) && element.value.trim() !== '') {
              // Check if it's a number
              const numValue = Number(element.value);
              data[element.id] = Number.isInteger(numValue)
                ? parseInt(element.value, 10)
                : parseFloat(element.value);
            } else {
              data[element.id] = element.value;
            }
          }
        });
      }
      try {
        const response = await fetch('/admin/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (response.status === 403) {
          showFeedback(feedbackMessage, 'feedback.accessDenied', 'error', 5000);
          return;
        }
        const result = await response.json();
        if (response.ok && result.success) {
          console.log('[Admin Form] Update successful:', result);
          let feedbackLines = [];
          feedbackLines.push(
            i18next.t(result.messageKey, {
              ...result.messageOptions,
              defaultValue: result.messageKey,
            })
          );
          if (result.changes && Object.keys(result.changes).length > 0) {
            feedbackLines.push(i18next.t('feedback.changes', { defaultValue: 'Changes:' }));
            for (const key in result.changes) {
              const translatedKey = i18next.t(`currentConfig.keys.${key}`, { defaultValue: key });
              feedbackLines.push(
                `- ${translatedKey}: ${result.changes[key].old} -> ${result.changes[key].new}`
              );
            }
          } else if (result.messageKey !== 'feedback.noChanges')
            feedbackLines.push(
              i18next.t('feedback.noChanges', { defaultValue: 'No parameters were changed.' })
            );
          if (result.restartRequired)
            feedbackLines.push(
              i18next.t('feedback.restartRequired', {
                defaultValue: 'Server restart required for some changes.',
              })
            );
          else if (result.changes && result.changes['FPS'])
            feedbackLines.push(
              i18next.t('feedback.fpsRestart', {
                defaultValue: 'Game loop restarted for FPS change.',
              })
            );
          showFeedback(
            feedbackMessage,
            feedbackLines.join('\n'),
            'success',
            result.restartRequired ? 10000 : 7000
          );
          // Refresh relevant tabs after update
          const currentConfigTab = document.getElementById('tab-current-config');
          if (currentConfigTab && currentConfigTab.classList.contains('active')) {
            await fetchCurrentSettingsForDisplay(); // Await fetch
            requestAnimationFrame(() => updateContent()); // Then update content
          }
          // Re-fetch form settings to reflect potential server-side clamping/defaults
          await fetchCurrentSettingsForForm();
          requestAnimationFrame(() => updateContent()); // Then update content
        } else {
          console.error('[Admin Form] Update failed:', result);
          const messageKey = result.messageKey ? result.messageKey : 'feedback.settingsUpdateError';
          showFeedback(feedbackMessage, messageKey, 'error', 5000, result.messageOptions);
        }
      } catch (error) {
        console.error('[Admin Form] Network error during update:', error);
        showFeedback(feedbackMessage, 'feedback.networkError', 'error');
      }
    });
  } else console.warn('Admin form not found, submit listener not added.');

  // --- User Management Functions ---
  async function fetchUsers() {
    console.log('[fetchUsers] Fetching...');
    if (!userTableBody) return;
    userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #8e9297;">${i18next.t('userManagement.loading', { defaultValue: 'Loading...' })}</td></tr>`;
    try {
      const response = await fetch(`/admin/users`);
      if (!response.ok) {
        if (response.status === 403) {
          showFeedback(userFeedback, 'feedback.accessDenied', 'error', 5000);
          userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f04747;">${i18next.t('feedback.accessDenied', { defaultValue: 'Access Denied.' })}</td></tr>`;
          return;
        }
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${errorText}`);
      }
      const result = await response.json();
      if (result.success) {
        console.log('[fetchUsers] Success, populating table.');
        populateUserTable(result.users); // Populates table
        // The tab switch logic will call updateContent after this promise resolves
      } else {
        const messageKey = result.messageKey ? result.messageKey : 'feedback.loadUsersError';
        console.error('[fetchUsers] Failed:', messageKey);
        showFeedback(userFeedback, messageKey, 'error', 5000, result.messageOptions);
        userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f04747;">${i18next.t(messageKey, { ...result.messageOptions, defaultValue: 'Error loading users.' })}</td></tr>`;
      }
    } catch (error) {
      console.error('[fetchUsers] Error:', error);
      showFeedback(userFeedback, 'feedback.networkError', 'error');
      if (userTableBody)
        userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #f04747;">${i18next.t('feedback.networkError', { defaultValue: 'Network error.' })}</td></tr>`;
      throw error; // Re-throw error
    }
  }

  function populateUserTable(users) {
    if (!userTableBody) return;
    userTableBody.innerHTML = '';
    if (!users || users.length === 0) {
      userTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #8e9297;">${i18next.t('userManagement.noUsers', { defaultValue: 'No users found.' })}</td></tr>`;
      return; // Return early if no users
    }
    users
      .sort((a, b) => a.username.localeCompare(b.username))
      .forEach(user => {
        const row = userTableBody.insertRow();
        row.dataset.username = user.username;
        row.insertCell().textContent = user.username;
        const statusCell = row.insertCell();
        let statusHtml = '';
        let statusTitle = '';
        if (user.isAdmin) {
          statusTitle = i18next.t('userManagement.status.admin', { defaultValue: 'Admin' });
          statusHtml += `<span class="status-icon status-admin" title="${statusTitle}"></span>${statusTitle} `;
        }
        if (user.isSuspended) {
          statusTitle = i18next.t('userManagement.status.suspended', { defaultValue: 'Suspended' });
          statusHtml += `<span class="status-icon status-suspended" title="${statusTitle}"></span>${statusTitle}`;
        }
        if (!user.isAdmin && !user.isSuspended) {
          statusTitle = i18next.t('userManagement.status.normal', { defaultValue: 'Normal' });
          statusHtml += `<span class="status-icon status-normal" title="${statusTitle}"></span>${statusTitle}`;
        }
        statusCell.innerHTML = statusHtml.trim();
        row.insertCell().textContent = user.lastLogin
          ? new Date(user.lastLogin).toLocaleString(i18next.language || 'default')
          : i18next.t('userManagement.status.never', { defaultValue: 'Never' });
        row.insertCell().textContent = user.created
          ? new Date(user.created).toLocaleDateString(i18next.language || 'default')
          : i18next.t('userManagement.status.unknown', { defaultValue: 'Unknown' });
        const actionsCell = row.insertCell();
        const adminBtn = document.createElement('button');
        adminBtn.textContent = user.isAdmin
          ? i18next.t('userManagement.actions.removeAdmin', { defaultValue: 'Remove Admin' })
          : i18next.t('userManagement.actions.makeAdmin', { defaultValue: 'Make Admin' });
        adminBtn.className = `action-button btn-admin-toggle ${user.isAdmin ? 'remove-admin' : 'make-admin'}`;
        adminBtn.onclick = () => toggleAdminStatus(user.username, !user.isAdmin);
        actionsCell.appendChild(adminBtn);
        const suspendBtn = document.createElement('button');
        suspendBtn.textContent = user.isSuspended
          ? i18next.t('userManagement.actions.unban', { defaultValue: 'Unsuspend' })
          : i18next.t('userManagement.actions.suspend', { defaultValue: 'Suspend' });
        suspendBtn.className = 'action-button btn-suspend-toggle';
        suspendBtn.onclick = () => toggleSuspendStatus(user.username, !user.isSuspended);
        actionsCell.appendChild(suspendBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = i18next.t('userManagement.actions.delete', {
          defaultValue: 'Delete',
        });
        deleteBtn.className = 'action-button btn-delete';
        deleteBtn.onclick = () => deleteUser(user.username);
        actionsCell.appendChild(deleteBtn);
      });
  }

  async function performUserAction(url, method, body = null) {
    console.log(`[performUserAction] ${method} ${url}`, body || '');
    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        ...(body && { body: JSON.stringify(body) }),
      });
      if (response.status === 403) {
        showFeedback(userFeedback, 'feedback.accessDenied', 'error', 5000);
        return false; // Indicate failure
      }
      const result = await response.json();
      if (response.ok && result.success) {
        console.log(`[performUserAction] Success:`, result.messageKey);
        const messageText = i18next.t(result.messageKey, {
          ...result.messageOptions,
          defaultValue: result.messageKey,
        });
        showFeedback(userFeedback, 'feedback.userActionSuccess', 'success', 5000, {
          message: messageText,
        });
        // Fetch users again, the tab switch logic will handle updateContent after this resolves
        await fetchUsers(); // Await the refresh
        requestAnimationFrame(() => updateContent()); // Ensure translation after refresh
        return true; // Indicate success
      } else {
        console.error(`[performUserAction] Failed:`, result);
        const messageText = i18next.t(result.messageKey, {
          ...result.messageOptions,
          defaultValue: result.messageKey || `Error ${response.status}`,
        });
        showFeedback(userFeedback, 'feedback.userActionError', 'error', 5000, {
          message: messageText,
        });
        return false; // Indicate failure
      }
    } catch (error) {
      console.error(`[performUserAction] Network Error (${method} ${url}):`, error);
      showFeedback(userFeedback, 'feedback.networkError', 'error');
      return false; // Indicate failure
    }
  }

  function toggleAdminStatus(username, makeAdmin) {
    performUserAction(`/admin/users/${username}/setAdmin`, 'POST', { isAdmin: makeAdmin });
  }
  function toggleSuspendStatus(username, suspend) {
    performUserAction(`/admin/users/${username}/setSuspended`, 'POST', { isSuspended: suspend });
  }
  function deleteUser(username) {
    if (
      confirm(
        i18next.t('userManagement.confirmDelete', {
          username: username,
          defaultValue: `Are you sure you want to delete user ${username}?`,
        })
      )
    ) {
      performUserAction(`/admin/users/${username}`, 'DELETE');
    }
  }

  // Prune Inactive Users
  if (pruneButton) {
    pruneButton.addEventListener('click', async () => {
      console.log('[Prune Button] Clicked');
      try {
        const previewResponse = await fetch('/admin/users/prune/preview');
        if (!previewResponse.ok) {
          if (previewResponse.status === 403) {
            showFeedback(userFeedback, 'feedback.accessDenied', 'error', 5000);
            return;
          }
          const errorText = await previewResponse.text();
          throw new Error(`Error ${previewResponse.status}: ${errorText}`);
        }
        const previewResult = await previewResponse.json();
        if (!previewResult.success) {
          const messageKey = previewResult.messageKey
            ? previewResult.messageKey
            : 'feedback.prunePreviewError';
          showFeedback(userFeedback, messageKey, 'error', 5000, previewResult.messageOptions);
          return;
        }
        const count = previewResult.count;
        const confirmationMessage = i18next.t('userManagement.confirmPrune', {
          count: count,
          defaultValue: `Found ${count} inactive user(s) to prune. Proceed?`,
        });
        if (confirm(confirmationMessage)) {
          if (
            count === 0 &&
            !confirm(
              i18next.t('userManagement.confirmPruneZeroConfirm', {
                defaultValue:
                  'No users match the criteria. Still attempt to run the prune process (this should do nothing)?',
              })
            )
          ) {
            showFeedback(userFeedback, 'userManagement.pruneCancelled', 'info', 3000);
            return;
          }
          console.log('[Prune Button] Confirmed, performing prune...');
          try {
            const pruneResponse = await fetch('/admin/users/prune', { method: 'DELETE' });
            if (!pruneResponse.ok) {
              if (pruneResponse.status === 403) {
                showFeedback(userFeedback, 'feedback.accessDenied', 'error', 5000);
                return;
              }
              const errorText = await pruneResponse.text();
              throw new Error(`Error ${pruneResponse.status}: ${errorText}`);
            }
            const pruneResult = await pruneResponse.json();
            if (pruneResult.success) {
              console.log('[Prune Button] Prune successful:', pruneResult.messageKey);
              const messageText = i18next.t(pruneResult.messageKey, {
                ...pruneResult.messageOptions,
                defaultValue: pruneResult.messageKey,
              });
              showFeedback(userFeedback, 'feedback.pruneSuccess', 'success', 5000, {
                message: messageText,
              });
              // Fetch users again, the tab switch logic will handle updateContent after this resolves
              await fetchUsers();
              requestAnimationFrame(() => updateContent()); // Ensure translation after refresh
            } else {
              console.error('[Prune Button] Prune failed:', pruneResult.messageKey);
              const messageKey = pruneResult.messageKey
                ? pruneResult.messageKey
                : 'feedback.pruneError';
              showFeedback(userFeedback, messageKey, 'error', 5000, pruneResult.messageOptions);
            }
          } catch (pruneError) {
            console.error('[Prune Button] Network error during prune:', pruneError);
            showFeedback(userFeedback, 'feedback.networkError', 'error');
          }
        } else {
          console.log('[Prune Button] Cancelled by user.');
          showFeedback(userFeedback, 'userManagement.pruneCancelled', 'info', 3000);
        }
      } catch (previewError) {
        console.error('[Prune Button] Network error during preview:', previewError);
        showFeedback(userFeedback, 'feedback.networkError', 'error');
      }
    });
  } else console.warn('Prune button not found, listener not added.');

  // Initial Load is now handled sequentially after i18n init
});
// --- END JAVASCRIPT ---
