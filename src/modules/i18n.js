/**
 * Internationalization module for the FontDetector extension
 */

// Default messages in English (fallback)
const messages = {
  fontFamily: 'Font Family',
  fontWeight: 'Font Weight',
  fontSize: 'Font Size',
  lineHeight: 'Line Height',
  letterSpacing: 'Letter Spacing',
  textAlign: 'Text Align',
  color: {
    title: 'Color',
    hex: 'HEX',
    lch: 'LCH',
    hcl: 'HCL'
  },
  copied: 'Copied',
  noFontFound: 'No font information available',
  clickToCopy: 'Click to copy',
  weightMap: {
    '100': 'Thin',
    '200': 'Extra Light',
    '300': 'Light',
    '400': 'Regular',
    '500': 'Medium',
    '600': 'Semi Bold',
    '700': 'Bold',
    '800': 'Extra Bold',
    '900': 'Black'
  }
};

// Map of dot notation keys to Chrome i18n message keys
const messageKeyMap = {
  'fontFamily': 'fontFamily',
  'fontWeight': 'fontWeight',
  'fontSize': 'fontSize',
  'lineHeight': 'lineHeight',
  'letterSpacing': 'letterSpacing',
  'textAlign': 'textAlign',
  'color.title': 'color',
  'color.hex': 'colorHex',
  'color.lch': 'colorLCH',
  'color.hcl': 'colorHCL',
  'copied': 'copied',
  'noFontFound': 'noFontFound',
  'clickToCopy': 'clickToCopy'
};

/**
 * Get localized message
 * @param {string} key - Message key (dot notation supported for nested properties)
 * @returns {string} - Localized message
 */
export function getMessage(key) {
  try {
    // First try to get message from Chrome i18n API if available
    if (chrome && chrome.i18n && chrome.i18n.getMessage) {
      // Convert dot notation key to Chrome i18n message key if needed
      const chromeKey = messageKeyMap[key] || key;
      const chromeMessage = chrome.i18n.getMessage(chromeKey);
      if (chromeMessage) {
        return chromeMessage;
      }
    }
  } catch (e) {
    console.warn('Chrome i18n API not available, falling back to default messages', e);
    // Chrome i18n API not available, fallback to default messages
  }
  
  // Fallback to default messages
  return getNestedProperty(messages, key) || key;
}

/**
 * Get nested property from object using dot notation
 * @param {Object} obj - Object to get property from
 * @param {string} path - Property path using dot notation (e.g. 'color.hex')
 * @returns {*} - Property value or undefined
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((prev, curr) => {
    return prev ? prev[curr] : undefined;
  }, obj);
}

/**
 * Format font weight with human-readable label
 * @param {string|number} weight - Font weight value
 * @returns {string} - Formatted font weight
 */
export function formatFontWeight(weight) {
  // Normalize weight to string for lookup
  const weightStr = String(weight);
  
  // Weight map for different weights
  const weightLabels = {
    '100': 'Thin',
    '200': 'Extra Light',
    '300': 'Light',
    '400': 'Regular',
    '500': 'Medium',
    '600': 'Semi Bold',
    '700': 'Bold',
    '800': 'Extra Bold',
    '900': 'Black'
  };
  
  // Get the label from Chrome i18n if available, otherwise use default
  const label = weightLabels[weightStr] || weightStr;
  
  // Return formatted weight
  return `${weightStr} (${label})`;
} 