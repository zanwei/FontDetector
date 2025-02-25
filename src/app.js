/**
 * FontDetector main application
 * 
 * This is the entry point for the FontDetector extension content script.
 * It ties together all the modules and handles the extension lifecycle.
 */

import { initTooltips, removeAllFixedTooltips } from './modules/tooltips.js';
import { initListeners, removeListeners } from './modules/listeners.js';

// Extension state
window.fontDetectorState = {
  isActive: false,
  isReinitializing: false
};

/**
 * Initialize the font detector
 */
function initializeDetector() {
  try {
    if (window.fontDetectorState.isReinitializing) {
      return;
    }
    
    console.log('Initializing FontDetector...');
    
    // Initialize tooltips
    initTooltips();
    
    // Initialize listeners
    initListeners(window.fontDetectorState);
    
    // Add error handler
    setupErrorHandling();
    
    console.log('FontDetector initialized successfully');
  } catch (err) {
    console.error('Error initializing FontDetector:', err);
    cleanupResources();
  }
}

/**
 * Deinitialize the font detector
 * @param {boolean} preserveFixedTooltips - Whether to preserve fixed tooltips
 */
function deinitializeDetector(preserveFixedTooltips = false) {
  try {
    console.log('Deinitializing FontDetector...');
    
    // Clean up listeners
    removeListeners();
    
    // Remove tooltips if needed
    if (!preserveFixedTooltips) {
      removeAllFixedTooltips();
    }
    
    window.fontDetectorState.isActive = false;
    console.log('FontDetector deinitialized successfully');
  } catch (err) {
    console.error('Error deinitializing FontDetector:', err);
  }
}

/**
 * Clean up all resources
 */
function cleanupResources() {
  try {
    if (!window.fontDetectorState.isReinitializing) {
      window.fontDetectorState.isReinitializing = true;
      console.log('Cleaning up FontDetector resources...');
      
      // Deactivate
      window.fontDetectorState.isActive = false;
      
      // Clean up
      deinitializeDetector(false);
      
      window.fontDetectorState.isReinitializing = false;
    }
  } catch (err) {
    console.error('Error cleaning up resources:', err);
    window.fontDetectorState.isReinitializing = false;
  }
}

/**
 * Set up error handling
 */
function setupErrorHandling() {
  window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
      console.warn('Captured Extension context invalidated error, preparing to clean up resources...');
      cleanupResources();
    }
  });
  
  // Chrome connection listener
  chrome.runtime.onConnect.addListener(function(port) {
    port.onDisconnect.addListener(function() {
      if (chrome.runtime.lastError) {
        console.warn('Port disconnected due to error:', chrome.runtime.lastError);
        cleanupResources();
      }
    });
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleExtension') {
    console.log('Toggle extension message received');
    
    window.fontDetectorState.isActive = !window.fontDetectorState.isActive;
    
    if (window.fontDetectorState.isActive) {
      console.log('Activating font detector');
    } else {
      console.log('Deactivating font detector');
      deinitializeDetector(false);
    }
    
    // Send response
    if (sendResponse) {
      sendResponse({ success: true });
    }
  }
});

// Initialize detector
initializeDetector();

// Export functions for use in modules
export {
  initializeDetector,
  deinitializeDetector,
  cleanupResources
}; 