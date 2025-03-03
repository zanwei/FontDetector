(function() {
  const TOGGLE_ACTION = 'toggleExtension';
  let isActive = false;
  let currentTarget;
  let tooltip; // tooltip element
  let fixedTooltips = []; // array of fixed tooltips
  let animationFrameId; // for requestAnimationFrame
  let lastTooltipContent = ''; // cache tooltip content
  let selectionTimeout = null; // for preventing multiple selection events
  let isReinitializing = false; // prevent repeated initialization
  let fixedTooltipPositions = new Set(); // track positions of created fixed tooltips
  let isExtensionContextValid = true; // track extension context validity
  let lastMouseX = 0, lastMouseY = 0; // for storing mouse position
  let isCreatingFixedTooltip = false; // flag to prevent mouse events from interfering with newly created tooltip
  let lastTargetHash = ''; // Add global variable for caching
  let miniTooltip; // Add mini tooltip variable
  let isLongPress = false; // Add long press state tracking

  // Try to capture all unhandled errors
  window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
      console.warn('Captured Extension context invalidated error, preparing to clean up resources...');
      isExtensionContextValid = false;
      cleanupResources(true); // Force cleanup
    }
  });

  // Add a more robust error handling for Chrome extension context
  try {
    // Check if chrome runtime is available
    if (chrome && chrome.runtime) {
      // Add a listener for runtime connection to detect disconnection
      chrome.runtime.onConnect.addListener(function(port) {
        port.onDisconnect.addListener(function() {
          if (chrome.runtime.lastError) {
            console.warn('Port disconnected due to error:', chrome.runtime.lastError);
            isExtensionContextValid = false;
            cleanupResources(true); // Force cleanup
          }
        });
      });
      
      // Add a listener for runtime.id to detect when extension is reloaded
      function checkExtensionContext() {
        try {
          // This will throw if extension context is invalidated
          const extensionId = chrome.runtime.id;
          setTimeout(checkExtensionContext, 5000); // Check every 5 seconds
        } catch (e) {
          console.warn('Extension context check failed:', e);
          isExtensionContextValid = false;
          cleanupResources(true); // Force cleanup
        }
      }
      
      // Start periodic checking
      setTimeout(checkExtensionContext, 5000);
    }
  } catch (e) {
    console.warn('Error setting up extension context monitoring:', e);
  }

  /**
   * Clean up all resources
   * @param {boolean} force - Force cleanup even if already reinitializing
   */
  function cleanupResources(force = false) {
    try {
      // Only clean up resources if not already reinitializing or if forced
      if (!isReinitializing || force) {
        isReinitializing = true;
        console.log('Cleaning up FontDetector resources...');
        
        isActive = false;
        
        // Safe removal of tooltip
        if (tooltip) {
          try { 
            if (tooltip.parentNode) {
              tooltip.parentNode.removeChild(tooltip);
            } else {
              tooltip.remove(); 
            }
          } catch(e) {
            console.warn('Error removing tooltip:', e);
          }
          tooltip = null;
        }
        
        // Clean up all fixed tooltips
        try {
          removeAllFixedTooltips();
        } catch(e) {
          console.warn('Error removing fixed tooltips:', e);
          
          // Fallback cleanup for fixed tooltips
          try {
            for (let i = 0; i < fixedTooltips.length; i++) {
              try {
                const t = fixedTooltips[i];
                if (t && t.parentNode) {
                  t.parentNode.removeChild(t);
                }
              } catch(e) {}
            }
            fixedTooltips = [];
            
            // Also try to remove any elements with font-detector class
            const detectorElements = document.querySelectorAll('.font-detector');
            for (let i = 0; i < detectorElements.length; i++) {
              try {
                const el = detectorElements[i];
                if (el && el.parentNode) {
                  el.parentNode.removeChild(el);
                }
              } catch(e) {}
            }
          } catch(e) {}
        }
        
        // Remove all event listeners safely
        try { removeMouseListeners(); } catch(e) {
          console.warn('Error removing mouse listeners:', e);
        }
        
        try { removeSelectionListener(); } catch(e) {
          console.warn('Error removing selection listener:', e);
        }
        
        try { document.removeEventListener('keydown', handleKeyDown); } catch(e) {
          console.warn('Error removing keydown listener:', e);
        }
        
        // Cancel all animation frame requests
        if (animationFrameId) {
          try { cancelAnimationFrame(animationFrameId); } catch(e) {
            console.warn('Error canceling animation frame:', e);
          }
          animationFrameId = null;
        }
        
        // Clear selection timeout
        if (selectionTimeout) {
          try { clearTimeout(selectionTimeout); } catch(e) {
            console.warn('Error clearing selection timeout:', e);
          }
          selectionTimeout = null;
        }
        
        // Clear position set
        try { fixedTooltipPositions.clear(); } catch(e) {
          console.warn('Error clearing position set:', e);
        }
        
        console.log('FontDetector resource cleanup completed');
        
        // Allow reinitialization after delay
        setTimeout(() => {
          isReinitializing = false;
        }, 2000);
      }
    } catch (e) {
      console.error('Error occurred while cleaning up resources:', e);
      // Reset reinitialization flag in case of error
      setTimeout(() => {
        isReinitializing = false;
      }, 2000);
    }
  }

  /**
   * Use requestAnimationFrame for smooth animations
   * @param {Function} callback - The function to call
   */
  function requestUpdate(callback) {
    // Cancel any pending animation frame
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    
    // Schedule new animation frame
    animationFrameId = requestAnimationFrame(callback);
  }

  /**
   * Convert hex color to RGB
   * @param {string} hex - Hex color string
   * @returns {Array} - RGB values as array [r, g, b]
   */
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
  }

  /**
   * Convert RGB to hex color
   * @param {number} r - Red value (0-255)
   * @param {number} g - Green value (0-255)
   * @param {number} b - Blue value (0-255)
   * @returns {string} - Hex color string
   */
  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Convert RGB to LCH color space
   * @param {number} r - Red value (0-255)
   * @param {number} g - Green value (0-255)
   * @param {number} b - Blue value (0-255)
   * @returns {Object} - LCH values {l, c, h}
   */
  function rgbToLCH(r, g, b) {
    // Convert to sRGB
    r /= 255;
    g /= 255;
    b /= 255;
    
    // Convert to XYZ
    let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    
    // XYZ to Lab
    const xRef = 0.95047;
    const yRef = 1.0;
    const zRef = 1.08883;
    
    x = x / xRef;
    y = y / yRef;
    z = z / zRef;
    
    x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
    
    const l = (116 * y) - 16;
    const a = 500 * (x - y);
    const b2 = 200 * (y - z);
    
    // Lab to LCh
    const c = Math.sqrt(a * a + b2 * b2);
    let h = Math.atan2(b2, a) * (180 / Math.PI);
    if (h < 0) h += 360;
    
    return {
      l: Math.round(l),
      c: Math.round(c),
      h: Math.round(h)
    };
  }
  
  /**
   * Convert RGB to HCL color space (HCL is LCH with reordered components)
   * @param {number} r - Red value (0-255)
   * @param {number} g - Green value (0-255)
   * @param {number} b - Blue value (0-255)
   * @returns {Object} - HCL values {h, c, l}
   */
  function rgbToHCL(r, g, b) {
    const lch = rgbToLCH(r, g, b);
    return {
      h: lch.h,
      c: lch.c,
      l: lch.l
    };
  }

  /**
   * Get color information from an element
   * @param {Element} element - DOM element
   * @returns {Object|null} - Color information or null if not available
   */
  function getColorFromElement(element) {
    try {
      const style = getComputedStyle(element);
      const color = style.color;
      
      // Create a temporary element to parse any color format
      const tempEl = document.createElement('div');
      tempEl.style.color = color;
      tempEl.style.display = 'none';
      
      // Add null check before appendChild
      if (document.body) {
        document.body.appendChild(tempEl);
        
        // Get the computed color value
        const computedColor = getComputedStyle(tempEl).color;
        document.body.removeChild(tempEl);
        
        // Parse RGB or RGBA color
        const rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          
          // Return color info in multiple formats
          return {
            rgb: { r, g, b },
            hex: rgbToHex(r, g, b),
            hcl: rgbToHCL(r, g, b),
            lch: rgbToLCH(r, g, b)
          };
        }
      } else {
        // Fallback for when document.body is null
        console.error('Cannot append temp element: document.body is null');
        
        // Try to extract color info without using DOM
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          
          return {
            rgb: { r, g, b },
            hex: rgbToHex(r, g, b),
            hcl: rgbToHCL(r, g, b),
            lch: rgbToLCH(r, g, b)
          };
        }
      }
      
      return null;
    } catch (err) {
      console.error('Error getting color from element:', err);
      return null;
    }
  }

  /**
   * Toggle extension state
   */
  function toggleExtension() {
    isActive = !isActive;
    if (isActive) {
      // Initialize detector and reset state
      currentTarget = null;
      lastTooltipContent = '';
      
      // Fully initialize detector
      initializeDetector();
      
      // Ensure mini tooltip is visible
      if (miniTooltip) {
        miniTooltip.style.display = 'block';
        requestAnimationFrame(() => {
          miniTooltip.classList.add('visible');
          miniTooltip.style.opacity = '1';
        });
      }
      
      // Send message to background script to update icon to active state
      chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'active' });
      console.log('Extension activated');
    } else {
      // Deactivate detector but preserve fixed tooltips
      deinitializeDetector(true); // true means preserve fixed tooltips
      
      // Hide mini tooltip
      if (miniTooltip) {
        miniTooltip.classList.remove('visible');
        miniTooltip.style.opacity = '0';
        setTimeout(() => {
          miniTooltip.style.display = 'none';
        }, 200);
      }
      
      // Send message to background script to restore icon to default state
      chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'inactive' });
      console.log('Extension deactivated');
    }
  }

  /**
   * Debug function to log information about the current state
   * @param {string} message - Debug message
   * @param {any} data - Debug data
   */
  function debug(message, data) {
    // Users can enable debugging by setting localStorage.fontDetectorDebug = 'true'
    // or by directly running window.fontDetectorDebug = true;
    const debugMode = window.fontDetectorDebug === true || localStorage.getItem('fontDetectorDebug') === 'true';
    if (debugMode) {
      console.log(`[FontDetector] ${message}`, data || '');
    }
  }

  /**
   * Initialize the font detector
   */
  function initializeDetector() {
    // Ensure cleanup of existing resources
    if (tooltip) {
      try {
        tooltip.remove();
        tooltip = null;
      } catch (e) {
        console.warn('Error cleaning up existing tooltip:', e);
      }
    }
    
    if (miniTooltip) {
      try {
        miniTooltip.remove();
        miniTooltip = null;
      } catch (e) {
        console.warn('Error cleaning up existing mini tooltip:', e);
      }
    }
    
    injectCSS();
    tooltip = createTooltip();
    miniTooltip = createMiniTooltip();
    
    // Ensure tooltip is initialized correctly
    if (tooltip) {
      tooltip.style.display = 'none';
      tooltip.style.opacity = '0';
      console.log('Tooltip element created and initialized');
    }
    
    // Ensure mini tooltip is initialized correctly and visible
    if (miniTooltip) {
      miniTooltip.style.display = 'block';
      requestAnimationFrame(() => {
        miniTooltip.classList.add('visible');
        miniTooltip.style.opacity = '1';
      });
      console.log('Mini tooltip created and initialized');
    }
    
    document.addEventListener('keydown', handleKeyDown);
    addMouseListeners();
    addSelectionListener();
    console.log('Font detector initialized - all event listeners added');
  }

  /**
   * Deinitialize the font detector
   * @param {boolean} preserveFixedTooltips - whether to preserve fixed tooltips
   */
  function deinitializeDetector(preserveFixedTooltips = false) {
    console.log(`Deactivating font detector (preserve fixed tooltips: ${preserveFixedTooltips})`);
    document.removeEventListener('keydown', handleKeyDown);
    
    // Safely remove following tooltip
    if (tooltip) {
      try {
        // Hide first
        console.log('Hiding mouse-following tooltip');
        hideTooltip(tooltip);
        
        // Then remove
        tooltip.remove();
        tooltip = null;
        console.log('Successfully removed mouse-following tooltip');
      } catch (e) {
        console.warn('Error cleaning up tooltip:', e);
        // Fallback handling
        if (tooltip && tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
        tooltip = null;
      }
    }
    
    // Only remove fixed tooltips if not preserving
    if (!preserveFixedTooltips) {
      console.log('Not preserving fixed tooltips, removing all fixed tooltips');
      removeAllFixedTooltips();
    } else {
      console.log('Preserving all fixed tooltips');
    }
    
    // Remove all event listeners
    removeMouseListeners();
    removeSelectionListener();
    
    // Cancel any pending animation frames
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    // Clear all timeouts
    if (selectionTimeout) {
      clearTimeout(selectionTimeout);
      selectionTimeout = null;
    }
    
    // Clear state variables
    currentTarget = null;
    
    console.log('Font detector has been deactivated' + (preserveFixedTooltips ? ' (fixed tooltips preserved)' : ''));
  }

  /**
   * Remove all fixed tooltips
   */
  function removeAllFixedTooltips() {
    try {
      console.log('Removing all fixed tooltips...');
      
      // If creating a tooltip, avoid deleting protected tooltips
      if (isCreatingFixedTooltip) {
        console.log('Creating tooltip, only removing unprotected tooltips');
        // Clean up unprotected tooltips
        const tooltipsToRemove = document.querySelectorAll('.fixed-tooltip:not([data-protected="true"])');
        for (let i = 0; i < tooltipsToRemove.length; i++) {
          try {
            const t = tooltipsToRemove[i];
            if (t && t.parentNode) {
              fixedTooltipPositions.delete(t.dataset.positionKey);
              t.parentNode.removeChild(t);
              fixedTooltips = fixedTooltips.filter(tooltip => tooltip !== t);
            }
          } catch (err) {
            console.warn('Error removing unprotected tooltip:', err);
          }
        }
        console.log('Finished removing unprotected tooltips');
        return;
      }
      
      // Standard deletion logic when no creation is in progress
      // Clean up position records collection
      try {
        fixedTooltipPositions.clear();
      } catch (err) {
        console.warn('Error clearing fixedTooltipPositions:', err);
      }
      
      // Save current tooltip array and reset
      let tooltipsToRemove = [];
      try {
        tooltipsToRemove = [...fixedTooltips];
        fixedTooltips = []; // Reset array first
      } catch (err) {
        console.warn('Error copying fixedTooltips array:', err);
        // Fallback: try to get tooltips from DOM
        try {
          tooltipsToRemove = Array.from(document.querySelectorAll('.fixed-tooltip'));
        } catch (err2) {
          console.warn('Error getting tooltips from DOM:', err2);
          tooltipsToRemove = [];
        }
      }
      
      // Remove each tooltip
      for (let i = 0; i < tooltipsToRemove.length; i++) {
        try {
          const t = tooltipsToRemove[i];
          if (t) {
            if (t.parentNode) {
              t.parentNode.removeChild(t);
            } else {
              t.remove();
            }
          }
        } catch (err) {
          console.warn('Error removing fixed tooltip:', err);
        }
      }
      
      // Double check to ensure all .fixed-tooltip elements are removed
      setTimeout(() => {
        try {
          const remainingTooltips = document.querySelectorAll('.fixed-tooltip');
          if (remainingTooltips.length > 0) {
            console.log(`Found ${remainingTooltips.length} remaining tooltips, cleaning up...`);
            
            for (let i = 0; i < remainingTooltips.length; i++) {
              try {
                const t = remainingTooltips[i];
                if (t) {
                  if (t.parentNode) {
                    t.parentNode.removeChild(t);
                  } else {
                    t.remove();
                  }
                }
              } catch (err) {
                console.warn('Error removing remaining tooltip:', err);
              }
            }
          }
        } catch (err) {
          console.warn('Error getting remaining tooltips:', err);
        }
      }, 10);
      
      // As a last resort, remove any elements with font-detector class
      setTimeout(() => {
        try {
          const detectorElements = document.querySelectorAll('.font-detector:not(#fontInfoTooltip)');
          if (detectorElements.length > 0) {
            console.log(`Found ${detectorElements.length} remaining detector elements, cleaning up...`);
            
            for (let i = 0; i < detectorElements.length; i++) {
              try {
                const el = detectorElements[i];
                if (el && el.parentNode) {
                  el.parentNode.removeChild(el);
                }
              } catch (err) {
                console.warn('Error removing detector element:', err);
              }
            }
          }
        } catch (err) {
          console.warn('Error getting detector elements:', err);
        }
      }, 20);
      
      console.log('All fixed tooltips removed');
    } catch (err) {
      console.error('Error removing all fixed tooltips:', err);
    }
  }

  /**
   * Inject CSS styles for the font detector
   */
  function injectCSS() {
    const css = `
      @font-face {
        font-family: 'Satoshi';
        src: url('chrome-extension://${chrome.runtime.id}/Satoshi-Medium.otf') format('opentype');
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }

      .font-detector {
        color: #A8A8A8;
        z-index: 2147483647 !important;
      }

      .font-detector span {
        color: #fff;
      }

      #miniTooltip {
        position: fixed;
        padding: 4px 8px;
        background-color: rgba(30, 30, 30, 0.95);
        border: 1px solid #2F2F2F;
        border-radius: 4px;
        font-size: 13px;
        color: #fff;
        pointer-events: none;
        font-family: 'Satoshi', Arial, sans-serif;
        white-space: nowrap;
        opacity: 0;
        display: none;
        transition: opacity 0.15s ease-out;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 2147483647;
      }

      #miniTooltip.visible {
        opacity: 1;
        display: block;
      }

      #fontInfoTooltip, .fixed-tooltip {
        border: 1px solid #2F2F2F;
        background-color: rgba(30, 30, 30, 0.85);  
        font-family: 'Satoshi', Arial, sans-serif;
        padding: 16px 16px;
        border-radius: 16px;
        word-wrap: break-word;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.2s ease-in-out;
        opacity: 0;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        width: 250px;
        transform: translateY(-5px);
        pointer-events: none;
      }
    
      #fontInfoTooltip {
        position: fixed;
        pointer-events: none;
        transform: translate3d(0, 0, 0);
        will-change: transform;
        backface-visibility: hidden;
        transition: opacity 0.2s ease-in-out;
        opacity: 0;
        display: none;
      }
      
      #fontInfoTooltip.visible {
        opacity: 1;
        display: block;
      }
      
      .fixed-tooltip {
        position: absolute;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
      }

      .fixed-tooltip[data-is-selection-tooltip="true"] {
        /* width setting removed */
      }

      #fontInfoTooltip h1, .fixed-tooltip h1 {
        display: none;
      }
    
      #fontInfoTooltip div, .fixed-tooltip div {
        display: flex;
        flex-direction: column;
        color: #A8A8A8;
        font-size: 13px;
        margin-bottom: 6px;
        gap: 2px;
        font-family: 'Satoshi', Arial, sans-serif;
      }
    
      #fontInfoTooltip div span, .fixed-tooltip div span {
        color: #FFFFFF;
        font-size: 14px;
        margin-left: 0px;
        font-weight: 500;
        font-family: 'Satoshi', Arial, sans-serif;
      }

      #fontInfoTooltip a, .fixed-tooltip a {
        text-decoration: none;
        color: inherit;
        font-family: 'Satoshi', Arial, sans-serif;
      }

      .color-preview {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        display: inline-block;
        margin-right: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        vertical-align: middle;
      }
      
      .color-value-container {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
      }

      .close-button {
        position: absolute;
        top: 14px;
        right: 16px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s;
        pointer-events: auto !important;
      }

      .close-button:hover {
        background-color: rgba(80, 80, 80, 0.9);
      }

      .close-button svg {
        width: 16px;
        height: 16px;
        display: block;
      }

      .copy-icon {
        width: 24px;
        height: 24px;
        margin-left: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        position: relative;
        background-color: transparent;
        border-radius: 4px;
        transition: background-color 0.2s;
        font-family: 'Satoshi', Arial, sans-serif;
      }

      .copy-icon:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }

      .copy-icon svg {
        width: 14px;
        height: 14px;
        display: block;
      }

      .value-with-copy {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      #fontInfoTooltip {
        pointer-events: none;
      }

      #fontInfoTooltip .copy-icon {
        pointer-events: auto;
      }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    
    if (document.head) {
      document.head.appendChild(style);
    } else if (document.documentElement) {
      document.documentElement.appendChild(style);
    } else {
      console.error('Cannot inject CSS: document.head and document.documentElement are null');
    }
  }

  /**
   * Create the tooltip element
   * @returns {Element} - Tooltip DOM element
   */
  function createTooltip() {
    // Remove existing tooltip
    const existingTooltip = document.getElementById('fontInfoTooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }
    
    const tooltip = document.createElement('div'); 
    tooltip.classList.add('font-detector');
    tooltip.setAttribute('id', 'fontInfoTooltip');
    
    // Set basic styles
    tooltip.style.position = 'fixed';
    tooltip.style.display = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.zIndex = '2147483647';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.backgroundColor = 'rgba(30, 30, 30, 0.95)';
    tooltip.style.backdropFilter = 'blur(10px)';
    tooltip.style.webkitBackdropFilter = 'blur(10px)';
    tooltip.style.transform = 'translate3d(0, 0, 0)';
    tooltip.style.willChange = 'transform';
    tooltip.style.backfaceVisibility = 'hidden';
    tooltip.style.transition = 'opacity 0.2s ease-in-out';
    
    // Add to document
    if (document.body) {
      document.body.appendChild(tooltip);
      
      // Ensure initial state is correct
      requestAnimationFrame(() => {
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
        tooltip.classList.remove('visible');
      });
    }
    
    return tooltip;
  }

  /**
   * Create a fixed tooltip at the selected text
   * @param {Event} event - The event object
   * @param {Element} element - The element to get font info from
   * @returns {Element} - The created fixed tooltip
   */
  function createFixedTooltip(event, element) {
    try {
      console.log('===== Creating fixed tooltip [START] =====');
      
      // Get current selection
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        console.warn('No valid text selection');
        return null;
      }
      
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();
      
      // Output debug info
      console.log(`Selected text: "${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}"`);
      
      // Check if tooltip with same or similar text content already exists (new code)
      const existingTooltips = document.querySelectorAll('.fixed-tooltip');
      for (let i = 0; i < existingTooltips.length; i++) {
        const existingTooltip = existingTooltips[i];
        // Check if tooltip with same text content exists
        if (existingTooltip.dataset.selectedText === selectedText) {
          console.log('Tooltip with same text content already exists, using existing tooltip');
          return existingTooltip;
        }
      }
      
      // Declare position variables
      let tooltipLeft = null;
      let tooltipTop = null;
      let positionKey = null;
      let positionMethod = null;
      
      // Generate unique ID, but include text content information (modified code)
      // Use text content hash as part of ID, instead of pure random
      const textHash = hashCode(selectedText).toString(); 
      const uniqueId = Date.now() + '_' + textHash;
      
      // Method 1: Using getClientRects() - most precise method
      console.log('Trying method 1: getClientRects()');
      try {
        const rects = range.getClientRects();
        if (rects && rects.length > 0) {
          const lastRect = rects[rects.length - 1];
          if (lastRect && lastRect.width > 0 && lastRect.height > 0) {
            console.log('Success: Using getClientRects() to get position', lastRect);
            
            // Precisely set 4px below selected text
            tooltipLeft = window.pageXOffset + lastRect.left;
            tooltipTop = window.pageYOffset + lastRect.bottom + 4; // ensure 4px
            positionKey = `rects-${textHash}-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
            positionMethod = 'getClientRects';
          } else {
            console.log('Method 1 failed: Invalid rectangle dimensions');
          }
        } else {
          console.log('Method 1 failed: No rectangles obtained');
        }
      } catch (err) {
        console.warn('Method 1 error:', err);
      }
      
      // Method 2: Using getBoundingClientRect()
      if (!tooltipLeft || !tooltipTop) {
        console.log('Trying method 2: getBoundingClientRect()');
        try {
          const rect = range.getBoundingClientRect();
          if (rect && rect.width > 0 && rect.height > 0) {
            console.log('Success: Using getBoundingClientRect() to get position', rect);
            
            tooltipLeft = window.pageXOffset + rect.left;
            tooltipTop = window.pageYOffset + rect.bottom + 4; // ensure 4px
            positionKey = `rect-${uniqueId}-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
            positionMethod = 'getBoundingClientRect';
          } else {
            console.log('Method 2 failed: Invalid rectangle dimensions');
          }
        } catch (err) {
          console.warn('Method 2 error:', err);
        }
      }
      
      // Method 3: Using mouse position (most reliable fallback)
      if (!tooltipLeft || !tooltipTop) {
        console.log('Trying method 3: Using mouse position');
        if (event && ('clientX' in event || 'pageX' in event)) {
          console.log('Success: Using mouse event position');
          
          tooltipLeft = event.pageX !== undefined ? event.pageX : 
                        (event.clientX !== undefined ? event.clientX + window.pageXOffset : 0);
          tooltipTop = (event.pageY !== undefined ? event.pageY : 
                       (event.clientY !== undefined ? event.clientY + window.pageYOffset : 0)) + 4; // ensure 4px
          positionKey = `mouse-${uniqueId}-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
          positionMethod = 'mouseEvent';
        } else if (lastMouseX !== undefined && lastMouseY !== undefined) {
          console.log('Success: Using last recorded mouse position');
          
          tooltipLeft = lastMouseX + window.pageXOffset;
          tooltipTop = lastMouseY + window.pageYOffset + 4; // ensure 4px
          positionKey = `lastmouse-${uniqueId}-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
          positionMethod = 'lastMousePosition';
        } else {
          console.log('Method 3 failed: Cannot get mouse position');
        }
      }
      
      // Method 4: Final fallback - Using viewport center
      if (!tooltipLeft || !tooltipTop) {
        console.log('Trying method 4: Using viewport center position');
        
        tooltipLeft = window.innerWidth / 2 + window.pageXOffset;
        tooltipTop = window.innerHeight / 2 + window.pageYOffset;
        positionKey = `center-${uniqueId}-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
        positionMethod = 'viewportCenter';
      }
      
      // Basic position validation
      if (tooltipLeft < 0 || tooltipTop < 0 || tooltipLeft > 50000 || tooltipTop > 50000) {
        console.warn('Calculated tooltip position exceeds reasonable range:', tooltipLeft, tooltipTop);
        
        // Use safer position as fallback
        tooltipLeft = window.innerWidth / 2 + window.pageXOffset;
        tooltipTop = window.innerHeight / 2 + window.pageYOffset;
        positionKey = `safe-${uniqueId}-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
        positionMethod = 'safePosition';
      }
      
      // Ensure positions are valid numbers
      tooltipLeft = Math.round(tooltipLeft);
      tooltipTop = Math.round(tooltipTop);
      
      // Check if tooltip already exists at nearby position (new code, check similar positions)
      if (tooltipLeft !== null && tooltipTop !== null) {
        const proximityThreshold = 20; // Consider positions within 20px as same
        for (let i = 0; i < existingTooltips.length; i++) {
          const existingTooltip = existingTooltips[i];
          const existingLeft = parseFloat(existingTooltip.style.left);
          const existingTop = parseFloat(existingTooltip.style.top);
          
          // If positions are very close, consider it a duplicate tooltip
          if (!isNaN(existingLeft) && !isNaN(existingTop)) {
            const distanceX = Math.abs(tooltipLeft - existingLeft);
            const distanceY = Math.abs(tooltipTop - existingTop);
            
            if (distanceX < proximityThreshold && distanceY < proximityThreshold) {
              console.log('Tooltip already exists at nearby position, using existing tooltip');
              return existingTooltip;
            }
          }
        }
      }
      
      console.log(`Final tooltip position: left=${tooltipLeft}, top=${tooltipTop}, method=${positionMethod}`);
      console.log('===== Creating fixed tooltip [END] =====');
      
      // Create positioned tooltip, pass selected text info
      return createPositionedTooltip(positionKey, tooltipLeft, tooltipTop, element, selectedText);
    } catch (err) {
      console.error('Error creating fixed tooltip:', err);
      return null;
    }
  }

  /**
   * Calculate string hash value (new function)
   * @param {string} str - String to hash
   * @returns {number} - Hash value
   */
  function hashCode(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Create a positioned tooltip with the given position and content
   * @param {string} positionKey - Unique position identifier
   * @param {number} left - Left position
   * @param {number} top - Top position  
   * @param {Element} element - Element to get font info from
   * @param {string} selectedText - Selected text content (new parameter)
   * @returns {Element} - Created tooltip or null
   */
  function createPositionedTooltip(positionKey, left, top, element, selectedText = '') {
    console.log(`Creating positioned tooltip: key=${positionKey}, left=${left}, top=${top}`);
    
    // Check if tooltip with exactly same position key already exists
    const existingTooltips = document.querySelectorAll('.fixed-tooltip');
    for (let i = 0; i < existingTooltips.length; i++) {
      const existingTooltip = existingTooltips[i];
      if (existingTooltip.dataset.positionKey === positionKey) {
        console.log('Tooltip with same position already exists, skipping creation');
        return existingTooltip;
      }
      
      // Check if tooltip with same text content exists (new check)
      if (selectedText && existingTooltip.dataset.selectedText === selectedText) {
        console.log('Tooltip with same text content already exists, skipping creation');
        return existingTooltip;
      }
    }
    
    // Record new position
    fixedTooltipPositions.add(positionKey);
    
    // Create new fixed tooltip
    const fixedTooltip = document.createElement('div');
    fixedTooltip.classList.add('font-detector', 'fixed-tooltip');
    fixedTooltip.dataset.positionKey = positionKey;
    fixedTooltip.dataset.creationTime = Date.now().toString();
    fixedTooltip.dataset.isSelectionTooltip = 'true'; // Mark as selection-created tooltip
    
    // Save selected text content for duplicate detection (new code)
    if (selectedText) {
      fixedTooltip.dataset.selectedText = selectedText;
    }
    
    // Get viewport dimensions for boundary checks
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Estimate tooltip dimensions (will adjust as needed after DOM insertion)
    const estimatedWidth = 250; // Width set in CSS
    
    // Adjust position to ensure tooltip stays within viewport, but respect original position
    let adjustedLeft = left;
    let adjustedTop = top;
    
    // Only check and adjust right boundary - if it would overflow, adjust left
    if (adjustedLeft + estimatedWidth > viewportWidth - 10) {
      adjustedLeft = Math.max(10, viewportWidth - estimatedWidth - 10);
      console.log(`Right boundary adjustment: ${left} -> ${adjustedLeft}`);
    }
    
    // For vertical direction, no adjustments, always maintain position 4px below text
    console.log(`Keeping tooltip 4px below text: top=${adjustedTop}`);
    
    // Set precise position
    fixedTooltip.style.left = `${adjustedLeft}px`;
    fixedTooltip.style.top = `${adjustedTop}px`;
    
    // Set fixed width for consistency
    fixedTooltip.style.width = '250px';
    
    // Fill content
    populateTooltipContent(fixedTooltip, element);
    
    // Add close button
    const closeButton = document.createElement('div');
    closeButton.classList.add('close-button');
    closeButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8L40 40" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40L40 8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    closeButton.style.pointerEvents = 'auto';
    closeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Remove position from Set when closing
      fixedTooltipPositions.delete(positionKey);
      fixedTooltip.remove();
      fixedTooltips = fixedTooltips.filter(t => t !== fixedTooltip);
    });
    
    fixedTooltip.appendChild(closeButton);
    
    // Ensure only added to one parent element
    let parentElement = null;
    if (document.body) {
      parentElement = document.body; // Prefer body as parent
    } else if (document.documentElement) {
      parentElement = document.documentElement;
    } else {
      console.error('Cannot add fixed tooltip: document.body and document.documentElement are both null');
      return null;
    }
    
    // Add to DOM and record
    parentElement.appendChild(fixedTooltip);
    fixedTooltips.push(fixedTooltip);
    
    // Ensure created tooltip is visible
    fixedTooltip.style.display = 'block';
    fixedTooltip.style.opacity = '1';
    // Add flicker protection mechanism, but use shorter duration
    fixedTooltip.dataset.protected = 'true';
    
    // After DOM addition, fine-tune position (if needed) - only adjust horizontal, not vertical
    setTimeout(() => {
      try {
        // Prevent errors for removed elements
        if (!fixedTooltip.isConnected) return;
        
        // Get actual tooltip dimensions
        const tooltipRect = fixedTooltip.getBoundingClientRect();
        if (!tooltipRect) return;
        
        let needsAdjustment = false;
        let newLeft = parseFloat(fixedTooltip.style.left);
        
        // Only check and adjust horizontal direction, ensure not exceeding right edge
        if (tooltipRect.right > viewportWidth - 5) {
          newLeft = Math.max(5, viewportWidth - tooltipRect.width - 5);
          needsAdjustment = true;
          console.log(`Fine-tuning right boundary: ${parseFloat(fixedTooltip.style.left)} -> ${newLeft}`);
          
          // Only update left position, don't adjust vertical
          fixedTooltip.style.left = `${newLeft}px`;
          console.log(`Horizontal position adjustment complete: left=${newLeft}`);
        }
        
      } catch (err) {
        console.warn('Error fine-tuning tooltip position:', err);
      }
    }, 0);
    
    // Cancel protection status after a while, using shorter time
    setTimeout(() => {
      if (fixedTooltip.isConnected) {
        fixedTooltip.dataset.protected = 'false';
      }
    }, 800); // Reduce protection time to avoid blocking other functions for too long
    
    console.log(`Fixed tooltip created: position=${positionKey} (${adjustedLeft}, ${adjustedTop})`);
    return fixedTooltip;
  }

  /**
   * Fill tooltip with content
   * @param {Element} tooltip - Tooltip element
   * @param {Element} element - Element to get font info from
   */
  function populateTooltipContent(tooltip, element) {
    if (!tooltip || !element) return;
    
    try {
      // Use cache to check if content needs updating
      const targetHash = element.outerHTML;
      if (targetHash === tooltip.dataset.lastTargetHash) {
        return; // If content hasn't changed, return directly
      }
      
      // Generate new content
      const content = generateTooltipContent(element);
      if (content && tooltip.innerHTML !== content) {
        tooltip.innerHTML = content;
        tooltip.dataset.lastTargetHash = targetHash;
        
        // Set up copy functionality
        const copyIcons = tooltip.querySelectorAll('.copy-icon');
        copyIcons.forEach(icon => {
          icon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const valueToCopy = this.dataset.value;
            if (!valueToCopy) return;
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(valueToCopy)
                .then(() => {
                  const originalSvg = this.innerHTML;
                  this.innerHTML = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43 11L16.875 37L5 25.1818" stroke="#2596FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                  
                  setTimeout(() => {
                    this.innerHTML = originalSvg;
                  }, 1500);
                });
            }
          });
        });
        
        // Set up font family links
        const fontFamilyLinks = tooltip.querySelectorAll('.fontFamilyLink');
        fontFamilyLinks.forEach(link => {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const fontName = this.dataset.font;
            if (!fontName) return;
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(fontName)
                .then(() => {
                  const span = this.querySelector('span');
                  if (span) {
                    const originalText = span.textContent;
                    span.textContent = 'Copied!';
                    
                    setTimeout(() => {
                      span.textContent = originalText;
                    }, 1500);
                  }
                });
            }
          });
        });
      }
    } catch (err) {
      console.error('Error updating tooltip content:', err);
      tooltip.innerHTML = '<div>Font information <span>Unable to display details</span></div>';
    }
  }

  /**
   * Generate tooltip HTML content
   * @param {Element} element - The element to get font info from
   * @returns {string} - HTML content for tooltip
   */
  function generateTooltipContent(element) {
    const style = getComputedStyle(element);
    const fontFamily = style.fontFamily;
    const fontSize = style.fontSize;
    const letterSpacing = style.letterSpacing;
    const lineHeight = style.lineHeight;
    const textAlign = style.textAlign;
    const fontWeight = style.fontWeight;

    // Get color information
    const colorInfo = getColorFromElement(element);

    // Fix SVG icon definitions
    const copySvg = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#a7a7a7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" stroke="#a7a7a7" stroke-width="4" stroke-linejoin="round"/></svg>`;
    const checkSvg = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43 11L16.875 37L5 25.1818" stroke="#2596FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    let content = `
      <div>Font family <a href="#" class="fontFamilyLink" data-font="${fontFamily}"><span>${fontFamily}</span></a></div>
      <div>Font weight <span>${fontWeight}</span></div>
      <div>Font size <span>${fontSize}</span></div>
      <div>Letter Spacing <span>${letterSpacing}</span></div>
      <div>Line height <span>${lineHeight}</span></div>
      <div>Text alignment <span>${textAlign}</span></div>
    `;

    // Add color information
    if (colorInfo) {
      // Format LCH and HCL values as readable strings
      const lchFormatted = `L: ${colorInfo.lch.l}, C: ${colorInfo.lch.c}, H: ${colorInfo.lch.h}`;
      const hclFormatted = `H: ${colorInfo.hcl.h}, C: ${colorInfo.hcl.c}, L: ${colorInfo.hcl.l}`;
      
      content += `
        <div>Color <span class="value-with-copy">
          <span class="color-value-container">
            <span class="color-preview" style="background-color: ${colorInfo.hex}"></span>${colorInfo.hex}
          </span>
          <span class="copy-icon" data-value="${colorInfo.hex}" title="Copy color value">
            ${copySvg}
          </span>
        </span></div>
        <div>LCH <span class="value-with-copy">
          ${lchFormatted}
          <span class="copy-icon" data-value="${lchFormatted}" title="Copy LCH value">
            ${copySvg}
          </span>
        </span></div>
        <div>HCL <span class="value-with-copy">
          ${hclFormatted}
          <span class="copy-icon" data-value="${hclFormatted}" title="Copy HCL value">
            ${copySvg}
          </span>
        </span></div>
      `;
    }

    return content;
  }

  /**
   * Update tooltip position only
   * @param {Element} tooltip - The tooltip element
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  function updateTooltipPosition(tooltip, x, y) {
    if (!tooltip) return;
    
    try {
      // Directly set left and top instead of using transform
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    } catch (err) {
      console.error('Error updating tooltip position:', err);
    }
  }

  /**
   * Handle text selection event
   * @param {Event} event - The mouse event
   */
  function handleTextSelection(event) {
    if (!isActive) {
        console.log('Extension not active, ignoring text selection');
        return;
    }
    
    try {
        // Hide mini tooltip at the start of selection
        if (miniTooltip && event.type === 'mousedown') {
            miniTooltip.classList.remove('visible');
            miniTooltip.style.opacity = '0';
            isLongPress = false; // Reset long press state
            
            // Add mouse long press detection
            const longPressTimeout = setTimeout(() => {
                // If still pressed after 300ms, consider it a long press
                isLongPress = true;
                // Let the selection end logic handle showing the mini tooltip
            }, 300);
            
            // If released before 300ms, clear long press detection
            document.addEventListener('mouseup', function clearLongPress() {
                if (!isLongPress) {
                    clearTimeout(longPressTimeout);
                }
                // Show mini tooltip when mouse is released
                if (miniTooltip && !isCreatingFixedTooltip) {
                    setTimeout(() => {
                        miniTooltip.classList.add('visible');
                        miniTooltip.style.opacity = '1';
                    }, 100);
                }
                document.removeEventListener('mouseup', clearLongPress);
            }, { once: true });
            
            return;
        }
        
        // If not a mouseup event, don't continue processing
        if (event.type !== 'mouseup') {
            return;
        }
        
        // Hide mini tooltip
        if (miniTooltip) {
            miniTooltip.classList.remove('visible');
            miniTooltip.style.opacity = '0';
        }
        
        // Record that text selection event was triggered
        console.log('Text selection event triggered ✨');
        
        // Immediately record mouse position for more accurate positioning
        if (event && 'clientX' in event && 'clientY' in event) {
            lastMouseX = event.clientX;
            lastMouseY = event.clientY;
            console.log(`Recorded mouse position: x=${lastMouseX}, y=${lastMouseY}`);
        }

        // Get selection object
        const selection = window.getSelection();
        if (!selection) {
            console.log('Unable to get selection object');
            // If no selection exists, show mini tooltip
            if (miniTooltip) {
                miniTooltip.classList.add('visible');
                miniTooltip.style.opacity = '1';
            }
            return;
        }
        
        // Don't process if selection is empty
        const text = selection.toString().trim();
        if (!text) {
            console.log('Selected text is empty');
            // If no text is selected, show mini tooltip
            if (miniTooltip) {
                miniTooltip.classList.add('visible');
                miniTooltip.style.opacity = '1';
            }
            return;
        }
        
        console.log(`Selected text: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
        
        // Temporarily block following tooltip while processing current selection
        isCreatingFixedTooltip = true;
        
        // Avoid multiple processing for the same selection
        if (selectionTimeout) {
            clearTimeout(selectionTimeout);
        }
        
        selectionTimeout = setTimeout(() => {
            try {
                // Check again if selection still exists
                if (!selection || selection.rangeCount === 0) {
                    console.warn('Selection has disappeared');
                    isCreatingFixedTooltip = false; // Reset flag
                    return;
                }
                
                const range = selection.getRangeAt(0);
                if (!range) {
                    console.warn('Unable to get selection range');
                    isCreatingFixedTooltip = false; // Reset flag
                    return;
                }
                
                // Get target element
                let element = null;
                
                // Prioritize the common ancestor of the selection
                if (range.commonAncestorContainer) {
                    element = range.commonAncestorContainer;
                    // If it's a text node, get its parent element
                    if (element.nodeType === Node.TEXT_NODE) {
                        element = element.parentElement;
                    }
                } 
                // If no common ancestor, try using event target
                else if (event && event.target) {
                    element = event.target;
                    // If it's a text node, get its parent element
                    if (element.nodeType === Node.TEXT_NODE) {
                        element = element.parentElement;
                    }
                }
                
                // If still no element, don't create tooltip
                if (!element || element.nodeType !== Node.ELEMENT_NODE) {
                    console.warn('Unable to get valid element for tooltip creation');
                    isCreatingFixedTooltip = false; // Reset flag
                    return;
                }
                
                console.log(`Preparing to create tooltip, element: ${element.tagName}`);
                
                // Use delay to ensure DOM is updated
                setTimeout(() => {
                    try {
                        // Use original event or build event object
                        const tooltipEvent = event || {
                            target: element,
                            clientX: lastMouseX,
                            clientY: lastMouseY,
                            pageX: lastMouseX + window.pageXOffset,
                            pageY: lastMouseY + window.pageYOffset
                        };
                        
                        // Directly call creation function
                        console.log('Creating new fixed tooltip');
                        const tooltip = createFixedTooltip(tooltipEvent, element);
                        
                        // Validate result
                        if (tooltip) {
                            console.log('✅ Tooltip creation succeeded');
                            
                            // Ensure tooltip remains visible
                            tooltip.style.display = 'block';
                            tooltip.style.opacity = '1';
                            tooltip.style.visibility = 'visible';
                            
                            // Force update tooltip size and position to ensure content displays correctly
                            setTimeout(() => {
                                if (tooltip.isConnected) {
                                    // Ensure fixed width is maintained
                                    tooltip.style.width = '250px';
                                }
                                
                                // Show mini tooltip immediately after tooltip creation
                                if (miniTooltip) {
                                    miniTooltip.style.display = 'block';
                                    miniTooltip.classList.add('visible');
                                    miniTooltip.style.opacity = '1';
                                }
                            }, 50);
                        } else {
                            console.warn('❌ Tooltip creation failed');
                            // If creation fails, show mini tooltip
                            if (miniTooltip) {
                                miniTooltip.style.display = 'block';
                                miniTooltip.classList.add('visible');
                                miniTooltip.style.opacity = '1';
                            }
                        }
                        
                        // Immediately reset creation flag
                        isCreatingFixedTooltip = false;
                        console.log('Creation process complete, resetting flag');
                        
                    } catch (err) {
                        console.error('Error creating tooltip:', err);
                        isCreatingFixedTooltip = false; // Ensure flag is reset on error
                        // Show mini tooltip on error
                        if (miniTooltip) {
                            miniTooltip.style.display = 'block';
                            miniTooltip.classList.add('visible');
                            miniTooltip.style.opacity = '1';
                        }
                    }
                }, 10);
            } catch (err) {
                console.error('Error in selection delay callback:', err);
                isCreatingFixedTooltip = false; // Ensure flag is reset on error
                // Show mini tooltip on error
                if (miniTooltip) {
                    miniTooltip.style.display = 'block';
                    miniTooltip.classList.add('visible');
                    miniTooltip.style.opacity = '1';
                }
            }
        }, 100);
        
    } catch (err) {
        console.error('Error handling text selection:', err);
        // Ensure mini tooltip is shown again
        if (miniTooltip) {
            miniTooltip.classList.add('visible');
            miniTooltip.style.opacity = '1';
        }
    }
  }

  /**
   * Check if an element contains text or is a text-containing element
   * @param {Element} element - The element to check
   * @returns {boolean} - True if the element contains text
   */
  function hasTextContent(element) {
    // Check if element is empty
    if (!element) {
      debug('Element is empty', null);
      return false;
    }
    
    // Update non-text tag list - remove some tags that might contain text
    const nonTextTags = [
      'SCRIPT', 'STYLE', 'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 
      'OBJECT', 'EMBED', 'HR', 'BR', 'WBR', 'NOSCRIPT', 'INPUT', 'SELECT',
      'SOURCE', 'TRACK', 'META', 'LINK', 'BASE', 'PARAM'
    ];
    
    if (nonTextTags.includes(element.tagName)) {
      debug('Non-text tag', element.tagName);
      return false;
    }
    
    // Get element text content
    const rawText = element.textContent || '';
    const text = rawText.trim();
    
    // Check element computed style
    const style = getComputedStyle(element);
    
    // Check if element is hidden
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      debug('Hidden element', element.tagName);
      return false;
    }
    
    // Check if element is empty
    if (!/\S/.test(rawText)) {
      debug('Blank element', element.tagName);
      return false;
    }
    
    // Reduce element size requirement
    const rect = element.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) {
      debug('Element too small', `${element.tagName} ${rect.width}x${rect.height}`);
      return false;
    }
    
    // Check direct text child nodes
    let hasDirectTextNode = false;
    let directTextLength = 0;
    
    for (let i = 0; i < element.childNodes.length; i++) {
      const node = element.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent.trim();
        if (nodeText.length > 0) {
          hasDirectTextNode = true;
          directTextLength += nodeText.length;
        }
      }
    }
    
    // Reduce text length requirement
    if (text.length < 1) {
      debug('Text too short', `${element.tagName}: ${text}`);
      return false;
    }
    
    // Relax special character check
    const punctuationOnlyPattern = /^[\s\.,;:!?()[\]{}'"\/\\-_+=<>|&$#@%^*]+$/;
    if (punctuationOnlyPattern.test(text)) {
      debug('Contains only special characters', `${element.tagName}: ${text}`);
      return false;
    }
    
    // Relax meaningful text content check
    const meaningfulTextPattern = /[a-zA-Z0-9\u4e00-\u9fa5]/;
    if (!meaningfulTextPattern.test(text)) {
      debug('Does not contain meaningful text', `${element.tagName}: ${text}`);
      return false;
    }
    
    // Expand text element list
    const textElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TD', 'TH', 'LI', 'DT', 'DD', 'SPAN', 'A', 'DIV'];
    if (textElements.includes(element.tagName) && text.length > 0) {
      debug('Text element', `${element.tagName}: ${text.length} characters`);
      return true;
    }
    
    // Check inline text elements
    const inlineTextElements = ['STRONG', 'EM', 'B', 'I', 'U', 'SUP', 'SUB', 'MARK', 'SMALL', 'DEL', 'INS', 'Q', 'ABBR', 'CITE', 'DFN', 'LABEL'];
    if (inlineTextElements.includes(element.tagName) && text.length > 0) {
      debug('Inline text element', `${element.tagName}: ${text.length} characters`);
      return true;
    }
    
    // Special handling for DIV elements
    if (element.tagName === 'DIV') {
      // Reduce DIV text length requirement
      if (directTextLength > 0) {
        debug('Text-rich DIV', `Direct text length: ${directTextLength} characters`);
        return true;
      }
      
      // Check DIV style
      if (style.fontFamily !== 'inherit' && text.length > 0) {
        debug('Style similar to text container DIV', `${element.tagName}: ${text.length} characters`);
        return true;
      }
    }
    
    return hasDirectTextNode && directTextLength > 0;
  }

  /**
   * Handle mousemove event using requestAnimationFrame
   * @param {Event} event - The mouse event
   */
  function handleMouseMove(event) {
    if (!isActive || !miniTooltip) return;
    
    // If creating fixed tooltip or in long press, don't show mini tooltip
    if (isCreatingFixedTooltip || isLongPress) {
        miniTooltip.classList.remove('visible');
        miniTooltip.style.opacity = '0';
        return;
    }
    
    // Update mouse position
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    
    // Use requestAnimationFrame for throttling
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    animationFrameId = requestAnimationFrame(() => {
        try {
            // Check window edges
            const edgeThreshold = 15;
            if (lastMouseX < edgeThreshold || lastMouseX > window.innerWidth - edgeThreshold || 
                lastMouseY < edgeThreshold || lastMouseY > window.innerHeight - edgeThreshold) {
                miniTooltip.classList.remove('visible');
                miniTooltip.style.opacity = '0';
                return;
            }
            
            // Update mini tooltip position
            updateTooltipPosition(miniTooltip, lastMouseX + 15, lastMouseY + 15);
            
            // Ensure mini tooltip is visible (only when not in long press)
            if (!isLongPress) {
                miniTooltip.style.display = 'block';
                miniTooltip.classList.add('visible');
                miniTooltip.style.opacity = '1';
            }
            
        } catch (err) {
            console.error('Error handling mouse movement:', err);
        } finally {
            animationFrameId = null;
        }
    });
  }

  /**
   * Add mouse event listeners
   */
  function addMouseListeners() {
    document.addEventListener('mousemove', handleMouseMove);
  }

  /**
   * Remove mouse event listeners
   */
  function removeMouseListeners() {
    document.removeEventListener('mousemove', handleMouseMove);
  }

  /**
   * Handle keyboard events
   * @param {Event} event - The keyboard event
   */
  function handleKeyDown(event) {
    if (!isActive) return;
    
    if (event.key === 'Escape') {
      console.log('ESC key pressed, preparing to deactivate extension...');
      
      // Hide floating tooltip
      if (tooltip) {
        hideTooltip(tooltip);
      }
      
      // Hide mini tooltip
      if (miniTooltip) {
        miniTooltip.classList.remove('visible');
        miniTooltip.style.opacity = '0';
        setTimeout(() => {
          miniTooltip.style.display = 'none';
        }, 200);
      }
      
      // Deactivate extension functionality but preserve fixed tooltips
      isActive = false;
      
      // Deactivate detector but preserve fixed tooltips
      deinitializeDetector(true); // Pass true to preserve fixed tooltips
      
      // Clear current target element
      currentTarget = null;
      
      // Notify background script to update icon state to inactive
      chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'inactive' });
      
      console.log('Extension deactivated via ESC key (fixed tooltips preserved)');
    }
  }

  /**
   * Add selection event listeners
   */
  function addSelectionListener() {
    console.log('Adding text selection listeners');
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('mousedown', handleTextSelection);
    document.addEventListener('selectionchange', function() {
        // Record selection change event for more accurate tooltip positioning
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            // Selection content exists, prepare for possible mouseup event
            console.log('Selection content detected, preparing for mouseup event');
        }
    });
  }

  /**
   * Remove selection event listeners
   */
  function removeSelectionListener() {
    console.log('Removing text selection listeners');
    document.removeEventListener('mouseup', handleTextSelection);
    document.removeEventListener('mousedown', handleTextSelection);
    document.removeEventListener('selectionchange', function() {});
  }

  // Set up message listener for extension communication
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        // Ensure request object exists
        if (!request) {
          console.warn('Received invalid message request');
          sendResponse({ success: false, error: 'Invalid request' });
          return true;
        }
        
        // Check if extension running in a valid DOM context
        if (!document || !document.documentElement) {
          console.warn('Extension running in invalid DOM context, cannot process messages');
          sendResponse({ success: false, error: 'Invalid DOM context' });
          return true;
        }
        
        // Check request action property
        if (!request.action) {
          console.warn('Message request missing action property');
          sendResponse({ success: false, error: 'Missing action property' });
          return true;
        }
        
        if (request.action === TOGGLE_ACTION) {
          toggleExtension();
          sendResponse({ success: true });
        } else if (request.action === 'checkContentScriptLoaded') {
          sendResponse({ loaded: true });
        } else if (request.action === 'checkExtensionStatus') {
          // Return the current activation state of the extension
          sendResponse({ isActive: isActive });
        } else {
          // Unknown action
          console.warn(`Received unknown action: ${request.action}`);
          sendResponse({ success: false, error: `Unknown action: ${request.action}` });
        }
      } catch (err) {
        console.error('Error in message handler:', err);
        // Check if extension context is invalidated
        if (err.message && err.message.includes("Extension context invalidated")) {
          console.warn('Extension context was invalidated in message handler');
          cleanupResources();
        }
        try {
          sendResponse({ success: false, error: err.message });
        } catch (responseErr) {
          console.error('Error sending response:', responseErr);
        }
      }
      return true; // Keep message channel open
    });
  } catch (err) {
    console.error('Setting message listener failed:', err);
    if (err.message && err.message.includes("Extension context invalidated")) {
      cleanupResources();
    }
  }

  // Add debug helper to global, convenient for turning on in console
  window.fontDetectorDebug = false;
  window.toggleFontDetectorDebug = function() {
    window.fontDetectorDebug = !window.fontDetectorDebug;
    console.log(`FontDetector debug mode ${window.fontDetectorDebug ? 'enabled' : 'disabled'}`);
    return window.fontDetectorDebug;
  };

  /**
   * Show tooltip at mouse position
   * @param {Event} event - The mouse event
   * @param {Element} tooltip - The tooltip element
   */
  function showTooltip(event, tooltip) {
    if (!event || !tooltip || !currentTarget) return;
    
    try {
      // Update position
      updateTooltipPosition(tooltip, event.clientX + 15, event.clientY + 15);
      
      // Use cache to check if content needs updating
      const targetHash = currentTarget.outerHTML;
      if (targetHash !== tooltip.dataset.lastTargetHash) {
        const content = generateTooltipContent(currentTarget);
        if (content && tooltip.innerHTML !== content) {
          tooltip.innerHTML = content;
          tooltip.dataset.lastTargetHash = targetHash;
        }
      }
      
      // Show tooltip
      if (tooltip.style.display !== 'block') {
        tooltip.style.display = 'block';
        requestAnimationFrame(() => {
          tooltip.classList.add('visible');
        });
      }
    } catch (err) {
      console.error('Error showing tooltip:', err);
      hideTooltip(tooltip);
    }
  }

  /**
   * Hide tooltip
   * @param {Element} tooltip - The tooltip element
   */
  function hideTooltip(tooltip) {
    if (!tooltip) return;
    
    try {
      tooltip.classList.remove('visible');
      
      // Wait for transition animation to complete before hiding
      setTimeout(() => {
        if (!tooltip.classList.contains('visible')) {
          tooltip.style.display = 'none';
          // Don't clear content, keep cache
          // tooltip.innerHTML = '';
        }
      }, 200);
    } catch (err) {
      tooltip.style.display = 'none';
    }
  }

  function createMiniTooltip() {
    // Remove existing mini tooltip
    const existingMiniTooltip = document.getElementById('miniTooltip');
    if (existingMiniTooltip) {
      existingMiniTooltip.remove();
    }
    
    const miniTooltip = document.createElement('div');
    miniTooltip.setAttribute('id', 'miniTooltip');
    miniTooltip.textContent = 'Select to view font info';
    
    // Set basic styles
    miniTooltip.style.position = 'fixed';
    miniTooltip.style.display = 'block';
    miniTooltip.style.opacity = '0';
    miniTooltip.style.zIndex = '2147483647';
    miniTooltip.style.left = '0';
    miniTooltip.style.top = '0';
    miniTooltip.style.pointerEvents = 'none';
    
    // Add to document
    if (document.body) {
      document.body.appendChild(miniTooltip);
      // Use requestAnimationFrame to ensure styles are applied correctly
      requestAnimationFrame(() => {
        miniTooltip.style.opacity = '1';
        miniTooltip.classList.add('visible');
        
        // Immediately update position to mouse position
        if (lastMouseX && lastMouseY) {
          updateTooltipPosition(miniTooltip, lastMouseX + 15, lastMouseY + 15);
        }
      });
    }
    
    return miniTooltip;
  }
})();