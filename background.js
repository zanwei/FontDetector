const TOGGLE_ACTION = 'toggleExtension';
const TOGGLE_COMMAND = 'toggle_font_detector';
let extensionContextValid = true;

/**
 * Error handling for extension context invalidation
 */
function setupErrorHandling() {
  try {
    // Listen for runtime errors
    chrome.runtime.onError.addListener((error) => {
      console.error('Runtime error:', error);
      if (error && error.message && error.message.includes('Extension context invalidated')) {
        extensionContextValid = false;
        console.warn('Extension context invalidated, preparing for recovery...');
      }
    });
    
    // Periodic check for extension context validity
    function checkExtensionContext() {
      try {
        // This will throw if extension context is invalidated
        const extensionId = chrome.runtime.id;
        setTimeout(checkExtensionContext, 10000); // Check every 10 seconds
      } catch (e) {
        console.warn('Extension context check failed:', e);
        extensionContextValid = false;
      }
    }
    
    // Start periodic checking
    setTimeout(checkExtensionContext, 10000);
  } catch (e) {
    console.warn('Error setting up extension context monitoring:', e);
  }
}

// Initialize error handling
setupErrorHandling();

/**
 * Listens for clicks on the extension icon
 * Toggles the extension on compatible pages
 */
chrome.action.onClicked.addListener((tab) => {
  if (!extensionContextValid) {
    console.warn('Extension context is invalid, cannot process click');
    return;
  }
  
  if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
    toggleExtension(tab);
  } else {
    console.error('Extension cannot run on this page (non-HTTP/HTTPS URL)');
  }
});

/**
 * Safely execute a function with error handling
 * @param {Function} fn - The function to execute
 * @param {Array} args - Arguments to pass to the function
 * @returns {Promise<any>} - The result of the function
 */
async function safeExecute(fn, ...args) {
  try {
    return await fn(...args);
  } catch (error) {
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionContextValid = false;
      console.warn('Extension context invalidated during execution');
    }
    console.error(`Error executing ${fn.name}:`, error);
    throw error;
  }
}

/**
 * Toggles the extension state on the specified tab
 * @param {Object} tab - The tab where the extension should be toggled
 */
async function toggleExtension(tab) {
  if (!tab || !tab.id) {
    console.error('Invalid tab: Cannot toggle extension on undefined tab');
    return;
  }

  try {
    // Inject content script
    await safeExecute(async () => {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['contentScript.js']
      });
    });

    // Add delay to ensure script is properly loaded
    await new Promise(resolve => setTimeout(resolve, 100));

    // Store the current activation state of the extension (assuming it will toggle)
    let isActivating = true;

    // Send message to content script
    await safeExecute(async () => {
      chrome.tabs.sendMessage(tab.id, { action: TOGGLE_ACTION }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError.message);
          
          // Check if this is a context invalidated error
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            extensionContextValid = false;
          }
        } else {
          console.log('Message sent successfully', response);
          
          // Update icon based on the currently predicted state
          chrome.action.setIcon({ 
            path: {
              "128": isActivating ? "icon-open.png" : "icon.png"
            }
          });
        }
      });
    });

    // Check content script status on icon click to determine icon state
    await safeExecute(async () => {
      chrome.tabs.sendMessage(tab.id, { action: 'checkExtensionStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('Error checking extension status:', chrome.runtime.lastError.message);
        } else if (response && response.isActive !== undefined) {
          // If accurate status is available, set icon based on status
          isActivating = response.isActive;
          chrome.action.setIcon({ 
            path: {
              "128": isActivating ? "icon-open.png" : "icon.png"
            }
          });
        }
      });
    });
  } catch (error) {
    console.error('Exception while executing script or sending message:', error?.message || error);
  }
}

/**
 * Checks if the content script is loaded in the specified tab
 * @param {number} tabId - The ID of the tab to check
 * @returns {Promise<boolean>} - Whether the content script is loaded
 */
async function checkContentScriptLoaded(tabId) {
  try {
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'checkContentScriptLoaded' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ loaded: false });
        } else {
          resolve(response || { loaded: false });
        }
      });
    });
    return response.loaded === true;
  } catch (error) {
    console.error('Error checking content script loading status:', error);
    return false;
  }
}

/**
 * Listens for keyboard shortcuts
 * Activates the extension when the toggle command is triggered
 */
chrome.commands.onCommand.addListener((command) => {
  if (!extensionContextValid) {
    console.warn('Extension context is invalid, cannot process command');
    return;
  }
  
  if (command === TOGGLE_COMMAND) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) toggleExtension(tab);
    });
  }
});

/**
 * Listens for tab updates
 * Ensures the content script is loaded when a tab is updated
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!extensionContextValid) {
    console.warn('Extension context is invalid, cannot process tab update');
    return;
  }
  
  if (changeInfo.status === 'complete' && tab.url && tab.url.indexOf('http') === 0) {
    safeExecute(async () => {
      const isLoaded = await checkContentScriptLoaded(tabId);
      if (!isLoaded) {
        console.log('Content script not loaded after tab update, injecting now...');
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['contentScript.js']
        });
      }
    }).catch(error => {
      console.error('Error handling tab update:', error);
    });
  }
});

/**
 * Listens for messages from content script
 * Handles search requests and deactivation notifications
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!extensionContextValid) {
    console.warn('Extension context is invalid, cannot process message');
    sendResponse({ error: 'Extension context invalid' });
    return true;
  }
  
  try {
    if (request.action === 'searchFontFamily') {
      const fontFamily = request.fontFamily;
      const formattedFontFamily = fontFamily.replace(/['"]/g, '').split(',')[0].trim();
      
      const url = `https://www.google.com/search?q=${encodeURIComponent(formattedFontFamily + ' font')}`;
      chrome.tabs.create({ url });
    } else if (request.action === 'deactivateExtension') {
      // Handle extension deactivation request from content script
      console.log('Received extension deactivation request');
    } else if (request.action === 'updateIcon') {
      // Update icon based on extension state
      if (request.iconState === 'active') {
        // Use active state icon when extension is active
        chrome.action.setIcon({ 
          path: {
            "128": "icon-open.png"
          }
        });
      } else {
        // Use default icon when extension is inactive
        chrome.action.setIcon({ 
          path: {
            "128": "icon.png"
          }
        });
      }
      // Send response
      sendResponse({ success: true });
    } else if (request.action === 'checkExtensionContext') {
      // Allow content script to check if background context is valid
      sendResponse({ valid: extensionContextValid });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    sendResponse({ error: error.message });
  }
  
  return true; // Keep message channel open
});