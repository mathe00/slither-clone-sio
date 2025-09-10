#!/usr/bin/env node

/**
 * Script to validate i18n localization files
 *
 * This script checks:
 * 1. That all localization files have the same keys as the reference file (en.json)
 * 2. That all keys used in config-schema.json are present in the localization files
 * 3. Generates a report of missing or extra keys
 */

const fs = require('fs');
const path = require('path');

// Paths to directories and files
const LOCALES_DIR = path.join(__dirname, 'public', 'locales');
const CONFIG_SCHEMA_PATH = path.join(__dirname, 'public', 'config-schema.json');
const REFERENCE_LOCALE = 'en.json';

/**
 * Reads and parses a JSON file
 * @param {string} filePath - Path of the file to read
 * @returns {Object} - Parsed JSON content
 */
function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Flattens a JSON object into a single-level object
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Prefix for nested keys
 * @returns {Object} - Flattened object
 */
function flattenObject(obj, prefix = '') {
  const flattened = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }

  return flattened;
}

/**
 * Extracts i18n keys used in config-schema.json
 * @param {Object} configSchema - Content of config-schema.json
 * @returns {Set} - Set of i18n keys used
 */
function extractI18nKeysFromConfig(configSchema) {
  const i18nKeys = new Set();

  // Traverse categories and parameters
  for (const category in configSchema.categories) {
    const categoryData = configSchema.categories[category];
    if (categoryData.parameters) {
      categoryData.parameters.forEach(param => {
        if (param.i18nKey) {
          i18nKeys.add(param.i18nKey);
        }
      });
    }
  }

  return i18nKeys;
}

/**
 * Compares keys between two objects and returns differences
 * @param {Object} reference - Reference object
 * @param {Object} target - Target object
 * @returns {Object} - Differences (missing, extra)
 */
function compareKeys(reference, target) {
  const referenceKeys = new Set(Object.keys(reference));
  const targetKeys = new Set(Object.keys(target));

  const missing = [...referenceKeys].filter(key => !targetKeys.has(key));
  const extra = [...targetKeys].filter(key => !referenceKeys.has(key));

  return { missing, extra };
}

/**
 * Validates localization files
 */
function validateLocales() {
  console.log('🔍 Validating localization files...\n');

  // Read the reference file
  const referencePath = path.join(LOCALES_DIR, REFERENCE_LOCALE);
  const referenceData = readJsonFile(referencePath);
  const flattenedReference = flattenObject(referenceData);

  // Read config-schema.json
  const configSchema = readJsonFile(CONFIG_SCHEMA_PATH);
  const i18nKeysInConfig = extractI18nKeysFromConfig(configSchema);

  // Read all localization files
  const localeFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter(file => file.endsWith('.json') && file !== REFERENCE_LOCALE);

  console.log(`📄 Reference file: ${REFERENCE_LOCALE}`);
  console.log(`📂 Localization files found: ${localeFiles.length}\n`);

  let hasErrors = false;

  // Check each localization file
  for (const localeFile of localeFiles) {
    const localePath = path.join(LOCALES_DIR, localeFile);
    const localeData = readJsonFile(localePath);
    const flattenedLocale = flattenObject(localeData);

    // Compare keys with the reference file
    const { missing, extra } = compareKeys(flattenedReference, flattenedLocale);

    // Check if keys used in config-schema.json are present
    const missingConfigKeys = [...i18nKeysInConfig].filter(
      key => !Object.prototype.hasOwnProperty.call(flattenedLocale, key)
    );

    if (missing.length > 0 || extra.length > 0 || missingConfigKeys.length > 0) {
      hasErrors = true;
      console.log(`❌ ${localeFile}:`);

      if (missing.length > 0) {
        console.log(`   Missing keys: ${missing.length}`);
        missing.forEach(key => console.log(`     - ${key}`));
      }

      if (extra.length > 0) {
        console.log(`   Extra keys: ${extra.length}`);
        extra.forEach(key => console.log(`     - ${key}`));
      }

      if (missingConfigKeys.length > 0) {
        console.log(`   Missing config-schema.json keys: ${missingConfigKeys.length}`);
        missingConfigKeys.forEach(key => console.log(`     - ${key}`));
      }

      console.log();
    } else {
      console.log(`✅ ${localeFile}: OK\n`);
    }
  }

  // Check if any config-schema.json keys are missing in the reference file
  const missingConfigKeysInReference = [...i18nKeysInConfig].filter(
    key => !Object.prototype.hasOwnProperty.call(flattenedReference, key)
  );

  if (missingConfigKeysInReference.length > 0) {
    hasErrors = true;
    console.log(`❌ Missing config-schema.json keys in ${REFERENCE_LOCALE}:`);
    missingConfigKeysInReference.forEach(key => console.log(`   - ${key}`));
    console.log();
  }

  if (!hasErrors) {
    console.log('🎉 All localization files are valid!');
  } else {
    process.exit(1);
  }
}

// Run validation
validateLocales();
