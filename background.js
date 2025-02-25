const TOGGLE_ACTION = 'toggleExtension';
const TOGGLE_COMMAND = 'toggle_font_detector';

/**
 * Listens for clicks on the extension icon
 * Toggles the extension on compatible pages
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
    toggleExtension(tab);
  } else {
    console.error('Extension cannot run on this page (non-HTTP/HTTPS URL)');
  }
});

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
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentScript.js']
    });

    // Add delay to ensure script is properly loaded
    await new Promise(resolve => setTimeout(resolve, 100));

    // Send message to content script
    chrome.tabs.sendMessage(tab.id, { action: TOGGLE_ACTION }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError.message);
      } else {
        console.log('Message sent successfully', response);
      }
    });
  } catch (error) {
    console.error('Exception while executing script or sending message:', error.message);
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
  if (changeInfo.status === 'complete' && tab.url.indexOf('http') === 0) {
    checkContentScriptLoaded(tabId).then(isLoaded => {
      if (!isLoaded) {
        console.log('Content script not loaded after tab update, injecting now...');
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['contentScript.js']
        });
      }
    });
  }
});

/**
 * Listens for messages from content script
 * Handles search requests and deactivation notifications
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'searchFontFamily') {
    const fontFamily = request.fontFamily;
    const formattedFontFamily = fontFamily.replace(/['"]/g, '').split(',')[0].trim();
    
    const url = `https://www.google.com/search?q=${encodeURIComponent(formattedFontFamily + ' font')}`;
    chrome.tabs.create({ url });
  } else if (request.action === 'deactivateExtension') {
    // Handle extension deactivation request from content script
    console.log('Received extension deactivation request');
  }
});