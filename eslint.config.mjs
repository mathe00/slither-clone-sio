import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  // Configuration for browser files (frontend)
  {
    files: ['public/**/*.js'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.browser,
        Game: 'readonly',
        GameRenderer: 'readonly',
        WebGLUtils: 'readonly',
        SoundManager: 'readonly',
        io: 'readonly',
        showGameOverOverlay: 'readonly',
        playSoundForEvent: 'readonly',
        showNotification: 'readonly',
        loggedInUsername: 'readonly',
        fetchUsers: 'readonly',
        fetchCurrentSettingsForDisplay: 'readonly',
        fetchCurrentSettingsForForm: 'readonly',
        showFeedback: 'readonly',
        saveSessions: 'readonly',
        clients: 'readonly',
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  // Configuration for Node.js files (backend)
  {
    files: ['backend/**/*.js', 'i18n-validator.js'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.node,
        __dirname: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    rules: {
      'no-prototype-builtins': 'off',
    },
  },
  // Configuration for service worker
  {
    files: ['public/service-worker.js'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        clients: 'readonly',
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
]);
