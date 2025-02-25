/**
 * Event listeners module for the FontDetector extension
 */

import { showTooltip, hideTooltip, createFixedTooltip, removeAllFixedTooltips } from './tooltips.js';
import { hasTextContent } from './fontDetection.js';

// Track current target element
let currentTarget = null;
let animationFrameId = null;
let selectionTimeout = null;

/**
 * Initialize all event listeners
 * @param {Object} state - The application state
 */
export function initListeners(state) {
  addMouseListeners();
  addSelectionListener();
  document.addEventListener('keydown', (event) => handleKeyDown(event, state));
  
  // Listen for extension toggle message from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'toggleExtension') {
      state.isActive = !state.isActive;
      
      if (state.isActive) {
        // If activated, initialize
        console.log('Extension activated');
      } else {
        // If deactivated, clean up
        console.log('Extension deactivated');
        hideTooltip();
        
        // Cancel any pending animation frame
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    }
  });
}

/**
 * Remove all event listeners
 */
export function removeListeners() {
  removeMouseListeners();
  removeSelectionListener();
  document.removeEventListener('keydown', handleKeyDown);
  
  // Cancel any pending animation frame
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/**
 * Add mouse event listeners
 */
function addMouseListeners() {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
}

/**
 * Remove mouse event listeners
 */
function removeMouseListeners() {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
}

/**
 * Add text selection listener
 */
function addSelectionListener() {
  document.addEventListener('mouseup', handleTextSelection);
}

/**
 * Remove text selection listener
 */
function removeSelectionListener() {
  document.removeEventListener('mouseup', handleTextSelection);
}

/**
 * Handle mouse move event
 * @param {Event} event - The mouse event
 */
function handleMouseMove(event) {
  // Use request animation frame to throttle tooltip updates
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  animationFrameId = requestAnimationFrame(() => {
    if (!currentTarget) return;
    
    const x = event.clientX;
    const y = event.clientY;
    
    showTooltip(x, y, currentTarget);
  });
}

/**
 * Handle mouseover event 
 * @param {Event} event - The mouse event
 */
function handleMouseOver(event) {
  if (!window.fontDetectorState || !window.fontDetectorState.isActive) return;
  
  let targetElement = event.target;
  
  // If it's a text node, use its parent element
  if (targetElement.nodeType === Node.TEXT_NODE) {
    targetElement = targetElement.parentElement;
  }
  
  // If the cursor is at the edge of the window or in a blank area, don't display the tooltip
  const mouseX = event.clientX;
  const mouseY = event.clientY;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Check if the mouse is at the edge of the window
  const edgeThreshold = 15; // Edge threshold (pixels)
  if (mouseX < edgeThreshold || mouseX > windowWidth - edgeThreshold || 
      mouseY < edgeThreshold || mouseY > windowHeight - edgeThreshold) {
    if (currentTarget) {
      console.debug('Mouse at window edge', `${mouseX},${mouseY}`);
      currentTarget = null;
      hideTooltip();
    }
    return;
  }
  
  // Check if the target element is the root or body element of the document (possibly a blank area)
  if (targetElement === document.documentElement || targetElement === document.body) {
    if (currentTarget) {
      console.debug('Mouse over root element', targetElement.tagName);
      currentTarget = null;
      hideTooltip();
    }
    return;
  }
  
  // Ignore tooltips and other extension elements
  if (targetElement.classList.contains('font-detector')) {
    return;
  }
  
  // Check if it's a valid text element
  if (targetElement && hasTextContent(targetElement)) {
    currentTarget = targetElement;
    
    // Show tooltip at current mouse position
    showTooltip(mouseX, mouseY, targetElement);
  } else if (currentTarget) {
    // Hide tooltip when moving over non-text element
    currentTarget = null;
    hideTooltip();
  }
}

/**
 * Handle mouseout event
 * @param {Event} event - The mouse event
 */
function handleMouseOut(event) {
  // Check if mouseout is from the current target or its ancestors
  let relatedTarget = event.relatedTarget;
  let isChildOfCurrentTarget = false;
  
  // Check if the related target is child of current target
  if (currentTarget && relatedTarget) {
    isChildOfCurrentTarget = currentTarget.contains(relatedTarget);
  }
  
  // If moving from current target to non-child element, hide tooltip
  if (currentTarget && !isChildOfCurrentTarget) {
    currentTarget = null;
    hideTooltip();
  }
}

/**
 * Handle text selection event
 * @param {Event} event - The mouse event
 */
function handleTextSelection(event) {
  if (!window.fontDetectorState || !window.fontDetectorState.isActive) return;
  
  try {
    // Debounce: cancel previous timeout
    if (selectionTimeout) {
      clearTimeout(selectionTimeout);
    }
    
    // Set new timeout, ensure tooltip created after selection completes
    selectionTimeout = setTimeout(() => {
      try {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          // Get the element to extract font info from
          let element = event.target;
          if (element.nodeType === Node.TEXT_NODE) {
            element = element.parentElement;
          }
          
          // Only proceed if we have a valid element
          if (element && element.nodeType === Node.ELEMENT_NODE) {
            createFixedTooltip(event, element);
          }
        }
      } catch (err) {
        console.error('Error handling text selection:', err);
      }
    }, 100); // 100ms delay, reduce multiple triggers
  } catch (err) {
    console.error('Error handling text selection:', err);
  }
}

/**
 * Handle keyboard events
 * @param {Event} event - The keyboard event
 * @param {Object} state - The application state
 */
function handleKeyDown(event, state) {
  if (event.key === 'Escape' && state.isActive) {
    // Hide floating tooltip
    hideTooltip();
    
    // Disable extension functionality but preserve fixed tooltips
    state.isActive = false;
    
    // Notify background extension state changed
    chrome.runtime.sendMessage({ action: 'toggleExtension' });
    
    // Send message to background script to restore icon to default state
    chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'inactive' });
  }
} 