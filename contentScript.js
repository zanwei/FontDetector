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
  let isCreatingFixedTooltip = false; // flag to prevent mouse events from interfering with new tooltip

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
      initializeDetector();
      // Send message to background script to change icon to active state
      chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'active' });
    } else {
      // Don't preserve fixed tooltips when deactivating extension
      deinitializeDetector(false);
      // Send message to background script to restore icon to default state
      chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'inactive' });
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
    injectCSS();
    tooltip = createTooltip();
    document.addEventListener('keydown', handleKeyDown);
    addMouseListeners();
    addSelectionListener();
    console.log('Font detector initialized');
  }

  /**
   * Deinitialize the font detector
   * @param {boolean} preserveFixedTooltips - whether to preserve fixed tooltips
   */
  function deinitializeDetector(preserveFixedTooltips = false) {
    document.removeEventListener('keydown', handleKeyDown);
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    
    // Only remove fixed tooltips if not preserving them
    if (!preserveFixedTooltips) {
      removeAllFixedTooltips();
    }
    
    removeMouseListeners();
    removeSelectionListener();
    
    // Cancel any pending animation frame
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    console.log('Font detector deactivated' + (preserveFixedTooltips ? ' (fixed tooltips preserved)' : ''));
  }

  /**
   * Remove all fixed tooltips
   */
  function removeAllFixedTooltips() {
    try {
      console.log('Removing all fixed tooltips...');
      
      // If creating tooltip, avoid deleting protected tooltips
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
    const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');";

    const css = `
      .font-detector {
        color: #A8A8A8;
        z-index: 2147483647 !important;
      }

      .font-detector span {
        color: #fff;
      }

      #fontInfoTooltip, .fixed-tooltip {
        backdrop-filter: blur(50px);
        border: 1px solid #2F2F2F;
        background-color: rgba(30, 30, 30, 0.85);  
        font-family: 'Poppins', Arial, sans-serif;
        padding: 16px 16px;
        border-radius: 16px;
        width: 250px;
        word-wrap: break-word;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: opacity 0.15s ease;
        opacity: 1;
      }

      #fontInfoTooltip h1, .fixed-tooltip h1 {
        display: none; /* Remove Font Information */
      }
    
      #fontInfoTooltip div, .fixed-tooltip div {
        display: flex;
        flex-direction: column; /* Vertical arrangement of title and content */
        color: #A8A8A8;
        font-size: 12px; /* Title font size */
        margin-bottom: 6px;
        gap: 2px;
      }
    
      #fontInfoTooltip div span, .fixed-tooltip div span {
        color: #FFFFFF;
        font-size: 14px; /* Content font size */
        margin-left: 0px; /* Remove spacing between title and content */
        font-weight: 500; /* Medium font weight for content */
      }

      #fontInfoTooltip a, .fixed-tooltip a {
        text-decoration: none;
        color: inherit;
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
      }

      .close-button:hover {
        background-color: rgba(80, 80, 80, 0.9);
      }

      .close-button svg {
        width: 16px;
        height: 16px;
      }

      .fixed-tooltip {
        position: absolute;
        z-index: 2147483647 !important;
      }

      /* CSS for copy button and checkmark */
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
      }

      .copy-icon:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }

      .copy-icon svg {
        width: 14px;
        height: 14px;
        display: block; /* Ensure SVG has no extra space */
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
    style.textContent = fontImport + css;
    
    // Add null check before appending to document.head
    if (document.head) {
      document.head.appendChild(style);
    } else if (document.documentElement) {
      // Fallback to documentElement if head is not available
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
    // If existing tooltip, remove first
    const existingTooltip = document.getElementById('fontInfoTooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }
    
    const tooltip = document.createElement('div'); 
    tooltip.classList.add('font-detector');
    tooltip.setAttribute('id', 'fontInfoTooltip');
    tooltip.style.position = 'fixed'; // Use fixed positioning
    tooltip.style.display = 'none';
    tooltip.style.zIndex = '2147483647'; // Highest z-index
    tooltip.style.pointerEvents = 'none'; // Don't block mouse events
    
    // Ensure added to body rather than documentElement, more reliable
    // Add null check to prevent "Cannot read properties of null" error
    if (document.body) {
      document.body.appendChild(tooltip);
      console.log('Tooltip created and added to DOM');
    } else {
      console.error('Cannot append tooltip: document.body is null');
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
      
      // Declare position variables
      let tooltipLeft = null;
      let tooltipTop = null;
      let positionKey = null;
      let positionMethod = null;
      
      // Method 1: Using getClientRects() - most accurate method
      console.log('Trying method 1: getClientRects()');
      try {
        const rects = range.getClientRects();
        if (rects && rects.length > 0) {
          const lastRect = rects[rects.length - 1];
          if (lastRect && lastRect.width > 0 && lastRect.height > 0) {
            console.log('Success: Using getClientRects() to get position', lastRect);
            
            // Precisely set to 4px below selected text
            tooltipLeft = window.pageXOffset + lastRect.left;
            tooltipTop = window.pageYOffset + lastRect.bottom + 4;
            positionKey = `rects-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
            positionMethod = 'getClientRects';
          } else {
            console.log('Method 1 failed: Invalid rectangle size');
          }
        } else {
          console.log('Method 1 failed: No rectangle obtained');
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
            tooltipTop = window.pageYOffset + rect.bottom + 4;
            positionKey = `rect-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
            positionMethod = 'getBoundingClientRect';
          } else {
            console.log('Method 2 failed: Invalid rectangle size');
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
          tooltipTop = event.pageY !== undefined ? event.pageY : 
                      (event.clientY !== undefined ? event.clientY + window.pageYOffset : 0) + 4;
          positionKey = `mouse-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
          positionMethod = 'mouseEvent';
        } else if (lastMouseX !== undefined && lastMouseY !== undefined) {
          console.log('Success: Using last recorded mouse position');
          
          tooltipLeft = lastMouseX + window.pageXOffset;
          tooltipTop = lastMouseY + window.pageYOffset + 4;
          positionKey = `lastmouse-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
          positionMethod = 'lastMousePosition';
        } else {
          console.log('Method 3 failed: Unable to get mouse position');
        }
      }
      
      // Method 4: Final fallback - using viewport center
      if (!tooltipLeft || !tooltipTop) {
        console.log('Trying method 4: Using viewport center position');
        
        tooltipLeft = window.innerWidth / 2 + window.pageXOffset;
        tooltipTop = window.innerHeight / 2 + window.pageYOffset;
        positionKey = `center-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
        positionMethod = 'viewportCenter';
      }
      
      // Basic position validation
      if (tooltipLeft < 0 || tooltipTop < 0 || tooltipLeft > 50000 || tooltipTop > 50000) {
        console.warn('Calculated tooltip position out of reasonable range:', tooltipLeft, tooltipTop);
        
        // Use a safer position as fallback
        tooltipLeft = window.innerWidth / 2 + window.pageXOffset;
        tooltipTop = window.innerHeight / 2 + window.pageYOffset;
        positionKey = `safe-${Math.round(tooltipLeft)},${Math.round(tooltipTop)}`;
        positionMethod = 'safePosition';
      }
      
      // Ensure position is a valid number
      tooltipLeft = Math.round(tooltipLeft);
      tooltipTop = Math.round(tooltipTop);
      
      console.log(`Final tooltip position: left=${tooltipLeft}, top=${tooltipTop}, method=${positionMethod}`);
      console.log('===== Creating fixed tooltip [END] =====');
      
      // Create positioned tooltip
      return createPositionedTooltip(positionKey, tooltipLeft, tooltipTop, element);
    } catch (err) {
      console.error('Error creating fixed tooltip:', err);
      return null;
    }
  }

  /**
   * Create a positioned tooltip with the given position and content
   * @param {string} positionKey - Unique position identifier
   * @param {number} left - Left position
   * @param {number} top - Top position  
   * @param {Element} element - Element to get font info from
   * @returns {Element} - Created tooltip or null
   */
  function createPositionedTooltip(positionKey, left, top, element) {
    console.log(`Creating positioned tooltip: key=${positionKey}, left=${left}, top=${top}`);
    
    // Record original position for debugging
    const originalLeft = left;
    const originalTop = top;
    
    // Check if there's already a tooltip at the same position
    const existingTooltips = document.querySelectorAll('.fixed-tooltip');
    for (let i = 0; i < existingTooltips.length; i++) {
      const existingTooltip = existingTooltips[i];
      if (existingTooltip.dataset.positionKey === positionKey) {
        console.log('Position already has a tooltip, skipping creation');
        return existingTooltip; // Return existing tooltip instead of null to prevent creation failure
      }
      
      // If two tooltips are too close (< 20px), consider them duplicates
      const existingLeft = parseFloat(existingTooltip.style.left);
      const existingTop = parseFloat(existingTooltip.style.top);
      
      if (Math.abs(existingLeft - left) < 20 && Math.abs(existingTop - top) < 20) {
        console.log('Position too close to existing tooltip, skipping creation');
        return existingTooltip; // Return existing tooltip instead of null to prevent creation failure
      }
    }
    
    // Check if position is already recorded in Set
    if (fixedTooltipPositions.has(positionKey)) {
      console.log('Position already recorded in Set, looking for matching tooltip');
      // Try to find tooltip matching this position
      for (let i = 0; i < existingTooltips.length; i++) {
        if (existingTooltips[i].dataset.positionKey === positionKey) {
          return existingTooltips[i];
        }
      }
    }
    
    // Record new position
    fixedTooltipPositions.add(positionKey);
    
    // Create new fixed tooltip
    const fixedTooltip = document.createElement('div');
    fixedTooltip.classList.add('font-detector', 'fixed-tooltip');
    fixedTooltip.dataset.positionKey = positionKey;
    fixedTooltip.dataset.creationTime = Date.now().toString(); // Add creation timestamp for debugging
    fixedTooltip.dataset.originalPosition = `${originalLeft},${originalTop}`; // Record original position
    
    // Get viewport dimensions for boundary checking
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Estimate tooltip dimensions (will be adjusted after DOM insertion if needed)
    const estimatedWidth = 250; // Width from CSS
    const estimatedHeight = 200; // Approximate height
    
    // Adjust position to ensure tooltip stays in viewport while respecting original position
    let adjustedLeft = left;
    let adjustedTop = top;
    
    // Check right boundary - if it would exceed, adjust to the left
    if (adjustedLeft + estimatedWidth > viewportWidth - 10) {
      adjustedLeft = Math.max(10, viewportWidth - estimatedWidth - 10);
      console.log(`Right boundary adjustment: ${left} -> ${adjustedLeft}`);
    }
    
    // Check bottom boundary - if it would exceed, adjust upward
    if (adjustedTop + estimatedHeight > viewportHeight - 10) {
      // For bottom boundary overflow, we have two options:
      // 1. Move tooltip inside viewport bottom
      const bottomAdjusted = Math.max(10, viewportHeight - estimatedHeight - 10);
      
      // 2. Consider placing tooltip above selection area instead of below
      const shouldPlaceAbove = positionKey.includes('rects-') || positionKey.includes('rect-');
      
      if (shouldPlaceAbove) {
        const selectedElementHeight = 20; // Assume selected text element height is about 20px
        const topPosition = top - selectedElementHeight - estimatedHeight - 4; // Place 4px above selection area
        
        if (topPosition >= 10) {
          adjustedTop = topPosition;
          console.log(`Adjusted placement: from 4px below selection to above, new position = ${adjustedTop}`);
        } else {
          adjustedTop = bottomAdjusted;
          console.log(`Standard bottom boundary adjustment: ${top} -> ${adjustedTop}`);
        }
      } else {
        adjustedTop = bottomAdjusted;
        console.log(`Standard bottom boundary adjustment: ${top} -> ${adjustedTop}`);
      }
    }
    
    // Set precise position
    fixedTooltip.style.left = `${adjustedLeft}px`;
    fixedTooltip.style.top = `${adjustedTop}px`;
    
    // Record adjusted position
    fixedTooltip.dataset.adjustedPosition = `${adjustedLeft},${adjustedTop}`;
    
    // Fill content
    populateTooltipContent(fixedTooltip, element);
    
    // Add close button
    const closeButton = document.createElement('div');
    closeButton.classList.add('close-button');
    closeButton.innerHTML = `<?xml version="1.0" encoding="UTF-8"?><svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8L40 40" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40L40 8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    closeButton.addEventListener('click', () => {
      // Remove position from Set when closing
      fixedTooltipPositions.delete(positionKey);
      fixedTooltip.remove();
      fixedTooltips = fixedTooltips.filter(t => t !== fixedTooltip);
    });
    
    fixedTooltip.appendChild(closeButton);
    
    // Ensure adding to only one parent element
    let parentElement = null;
    if (document.body) {
      parentElement = document.body; // Prefer body as parent element
    } else if (document.documentElement) {
      parentElement = document.documentElement;
    } else {
      console.error('Cannot add fixed tooltip: document.body and document.documentElement are null');
      return null;
    }
    
    // Add to DOM and record
    parentElement.appendChild(fixedTooltip);
    fixedTooltips.push(fixedTooltip);
    
    // Ensure created tooltip is visible
    fixedTooltip.style.display = 'block';
    fixedTooltip.style.opacity = '1';
    // Add protection mechanism against flickering
    fixedTooltip.dataset.protected = 'true';
    
    // Fine-tune position after DOM addition (if needed)
    setTimeout(() => {
      try {
        // Prevent errors from accessing removed elements
        if (!fixedTooltip.isConnected) return;
        
        // Get actual tooltip dimensions
        const tooltipRect = fixedTooltip.getBoundingClientRect();
        if (!tooltipRect) return;
        
        let needsAdjustment = false;
        let newLeft = parseFloat(fixedTooltip.style.left);
        let newTop = parseFloat(fixedTooltip.style.top);
        
        // Check if tooltip extends beyond viewport and needs adjustment
        if (tooltipRect.right > viewportWidth - 5) {
          newLeft = Math.max(5, viewportWidth - tooltipRect.width - 5);
          needsAdjustment = true;
          console.log(`Fine-tune right boundary: ${parseFloat(fixedTooltip.style.left)} -> ${newLeft}`);
        }
        
        if (tooltipRect.bottom > viewportHeight - 5) {
          newTop = Math.max(5, viewportHeight - tooltipRect.height - 5);
          needsAdjustment = true;
          console.log(`Fine-tune bottom boundary: ${parseFloat(fixedTooltip.style.top)} -> ${newTop}`);
        }
        
        if (needsAdjustment) {
          fixedTooltip.style.left = `${newLeft}px`;
          fixedTooltip.style.top = `${newTop}px`;
          fixedTooltip.dataset.finalPosition = `${newLeft},${newTop}`;
          console.log(`Position needs fine-tuning: left=${newLeft}, top=${newTop}`);
        }
      } catch (err) {
        console.warn('Error fine-tuning tooltip position:', err);
      }
    }, 0);
    
    // Remove protection status after a while
    setTimeout(() => {
      if (fixedTooltip.isConnected) {
        fixedTooltip.dataset.protected = 'false';
      }
    }, 2000); // Protect for 2 seconds
    
    console.log(`Created fixed tooltip: position=${positionKey} (${adjustedLeft}, ${adjustedTop})`);
    return fixedTooltip;
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

    // Define SVG icon - adjust size to 16px
    const copySvg = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#a7a7a7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" fill="none" stroke="#a7a7a7" stroke-width="4" stroke-linejoin="round"/></svg>`;
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
            <span class="check-icon">${checkSvg}</span>
          </span>
        </span></div>
        <div>LCH <span class="value-with-copy">
          <span>${lchFormatted}</span>
          <span class="copy-icon" data-value="${lchFormatted}" title="Copy LCH value">
            ${copySvg}
            <span class="check-icon">${checkSvg}</span>
          </span>
        </span></div>
        <div>HCL <span class="value-with-copy">
          <span>${hclFormatted}</span>
          <span class="copy-icon" data-value="${hclFormatted}" title="Copy HCL value">
            ${copySvg}
            <span class="check-icon">${checkSvg}</span>
          </span>
        </span></div>
      `;
    }

    return content;
  }

  /**
   * Populate tooltip content
   * @param {Element} tooltipElement - The tooltip element to populate
   * @param {Element} element - The element to get font info from
   */
  function populateTooltipContent(tooltipElement, element) {
    tooltipElement.innerHTML = generateTooltipContent(element);
    
    // Add click handlers for copy icons
    const copyIcons = tooltipElement.querySelectorAll('.copy-icon');
    copyIcons.forEach(icon => {
      icon.addEventListener('click', handleCopyClick);
    });
    
    // Add click handler for font family link
    const fontFamilyLink = tooltipElement.querySelector('.fontFamilyLink');
    if (fontFamilyLink) {
      fontFamilyLink.addEventListener('click', (e) => {
        e.preventDefault();
        const fontFamily = e.currentTarget.dataset.font;
        chrome.runtime.sendMessage({ 
          action: 'searchFontFamily',
          fontFamily: fontFamily
        });
      });
    }
  }

  /**
   * Handle click on copy icon
   * @param {Event} event - Click event
   */
  function handleCopyClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const icon = event.currentTarget;
    const originalText = icon.dataset.value;
    
    if (!originalText) {
      console.warn('Cannot show tooltip: no value to copy');
      return;
    }
    
    // Copy text to clipboard
    navigator.clipboard.writeText(originalText).then(() => {
      monitorClipboard(icon, originalText);
    }).catch(err => {
      console.error('Error copying to clipboard:', err);
    });
  }

  /**
   * Monitor clipboard for successful copy
   * @param {Element} icon - The copy icon element
   * @param {string} originalText - The text that was copied
   */
  function monitorClipboard(icon, originalText) {
    // Show success state
    icon.classList.add('copied');
    
    // Reset after animation
    setTimeout(() => {
      icon.classList.remove('copied');
    }, 2000);
  }

  /**
   * Update tooltip position
   * @param {Element} tooltip - The tooltip element
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  function updateTooltipPosition(tooltip, x, y) {
    if (!tooltip) {
      console.warn('Attempting to update non-existent tooltip position');
      return;
    }
    
    try {
      // Get tooltip dimensions
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      
      // Calculate position
      let tooltipLeft = x + 10;
      let tooltipTop = y + 10;
      
      // Adjust if tooltip would extend beyond viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (tooltipLeft + tooltipWidth > viewportWidth) {
        tooltipLeft = Math.max(0, viewportWidth - tooltipWidth - 10);
      }
      
      if (tooltipTop + tooltipHeight > viewportHeight) {
        tooltipTop = Math.max(0, viewportHeight - tooltipHeight - 10);
      }
      
      // Set position
      tooltip.style.left = tooltipLeft + 'px';
      tooltip.style.top = tooltipTop + 'px';
    } catch (err) {
      console.error('Error updating tooltip position:', err);
    }
  }

  /**
   * Show tooltip
   * @param {Event} event - Mouse event
   * @param {Element} tooltip - The tooltip element
   */
  function showTooltip(event, tooltip) {
    if (!tooltip || !event) {
      console.warn('Cannot show tooltip: tooltip or event is null');
      return;
    }
    
    const target = event.target;
    if (!target) {
      console.warn('Cannot show tooltip: event.target is null');
      return;
    }
    
    try {
      // Get computed style
      const style = window.getComputedStyle(target);
      
      // Update content
      populateTooltipContent(tooltip, target);
      
      // Update position
      updateTooltipPosition(tooltip, event.pageX, event.pageY);
      
      // Show tooltip
      tooltip.style.display = 'block';
      tooltip.style.opacity = '1';
    } catch (err) {
      console.error('Error showing tooltip:', err);
    }
  }

  /**
   * Hide tooltip
   * @param {Element} tooltip - The tooltip element
   */
  function hideTooltip(tooltip) {
    if (tooltip) {
      tooltip.style.display = 'none';
      tooltip.style.opacity = '0';
    }
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} event - Keyboard event
   */
  function handleKeyDown(event) {
    if (!isActive) return;
    
    // Hide tooltip on Escape key
    if (event.key === 'Escape') {
      if (tooltip) {
        hideTooltip(tooltip);
      }
      removeAllFixedTooltips();
    }
  }

  /**
   * Add selection listener
   */
  function addSelectionListener() {
    document.addEventListener('mouseup', handleTextSelection);
  }

  /**
   * Remove selection listener
   */
  function removeSelectionListener() {
    document.removeEventListener('mouseup', handleTextSelection);
  }

  /**
   * Handle text selection events
   * @param {Event} event - Mouse event
   */
  function handleTextSelection(event) {
    if (!isActive) return;
    
    try {
      // Debug info - show selection trigger
      console.log('Text selection event triggered ⭐');
      
      // Immediately record mouse position for more accurate positioning
      if (event && 'clientX' in event && 'clientY' in event) {
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        console.log(`Recorded mouse position: x=${lastMouseX}, y=${lastMouseY}`);
      }

      // Get selection object
      const selection = window.getSelection();
      if (!selection) return;
      
      // If selection is empty, don't process
      const text = selection.toString().trim();
      if (!text) return;
      
      console.log(`Selected text: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
      
      // Set creation flag to prevent mouse event interference
      isCreatingFixedTooltip = true;
      
      // Avoid processing the same selection multiple times
      if (selectionTimeout) {
        clearTimeout(selectionTimeout);
      }
      
      selectionTimeout = setTimeout(() => {
        try {
          // Check if selection still exists
          if (!selection || selection.rangeCount === 0) {
            console.warn('Selection has disappeared');
            isCreatingFixedTooltip = false;
            return;
          }
          
          const range = selection.getRangeAt(0);
          if (!range) {
            console.warn('Unable to get selection range');
            isCreatingFixedTooltip = false;
            return;
          }
          
          // Prioritize using range to create fixed tooltip
          // Try multiple times to ensure correct rectangle data
          let rects = [];
          try {
            rects = range.getClientRects();
            console.log('Selection range rectangle data:', rects.length > 0 ? `Got ${rects.length} rectangles` : 'No rectangles found');
          } catch (err) {
            console.warn('Error getting selection range rectangles:', err);
          }
          
          // Get target element
          let element = null;
          
          // Prioritize using common ancestor of selection
          if (range.commonAncestorContainer) {
            element = range.commonAncestorContainer;
            // If text node, get parent element
            if (element.nodeType === Node.TEXT_NODE) {
              element = element.parentElement;
            }
          } 
          // If no common ancestor, try using event target
          else if (event && event.target) {
            element = event.target;
            // If text node, get parent element
            if (element.nodeType === Node.TEXT_NODE) {
              element = element.parentElement;
            }
          }
          
          // If still no element, don't create tooltip
          if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            console.warn('Unable to get valid element for tooltip creation');
            isCreatingFixedTooltip = false;
            return;
          }
          
          console.log(`Ready to create tooltip, element: ${element.tagName}`);
          
          // Safely remove existing tooltips, but ignore protected ones
          const existingTooltips = document.querySelectorAll('.fixed-tooltip:not([data-protected="true"])');
          for (let i = 0; i < existingTooltips.length; i++) {
            try {
              const t = existingTooltips[i];
              if (t && t.parentNode) {
                fixedTooltipPositions.delete(t.dataset.positionKey);
                t.parentNode.removeChild(t);
                fixedTooltips = fixedTooltips.filter(tooltip => tooltip !== t);
              }
            } catch (err) {
              console.warn('Error removing existing tooltip:', err);
            }
          }
          
          // Use delay to ensure DOM update
          setTimeout(() => {
            try {
              console.log('Creating new fixed tooltip');
              // Use original event or build an event object
              const tooltipEvent = event || {
                target: element,
                clientX: lastMouseX,
                clientY: lastMouseY,
                pageX: lastMouseX + window.pageXOffset,
                pageY: lastMouseY + window.pageYOffset
              };
              
              // Directly call creation function
              const tooltip = createFixedTooltip(tooltipEvent, element);
              
              // Verify result
              if (tooltip) {
                console.log('✅ Tooltip created successfully');
                
                // Ensure tooltip stays visible
                tooltip.style.display = 'block';
                tooltip.style.opacity = '1';
                
                // Force update tooltip size and position to ensure content displays correctly
                setTimeout(() => {
                  if (tooltip.isConnected) {
                    // Force browser to recalculate layout
                    tooltip.style.width = tooltip.offsetWidth + 'px';
                  }
                }, 50);
              } else {
                console.warn('❌ Tooltip creation failed');
              }
              
              // Delay resetting creation flag to give enough time for tooltip to stabilize
              setTimeout(() => {
                isCreatingFixedTooltip = false;
                console.log('Tooltip creation flag reset');
              }, 2000); // Extended to 2 seconds
            } catch (err) {
              console.error('Error creating tooltip:', err);
              isCreatingFixedTooltip = false;
            }
          }, 10);
        } catch (err) {
          console.error('Error handling selection delay callback:', err);
          isCreatingFixedTooltip = false;
        }
      }, 100); // Use shorter delay time
    } catch (err) {
      console.error('Error handling text selection:', err);
      isCreatingFixedTooltip = false;
      if (err.message && err.message.includes('Extension context invalidated')) {
        cleanupResources();
      }
    }
  }

  /**
   * Check if element has text content
   * @param {Element} element - Element to check
   * @returns {boolean} - True if element has text content
   */
  function hasTextContent(element) {
    if (!element) return false;
    
    // Get computed style
    const style = window.getComputedStyle(element);
    
    // Check if element is visible
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    // Get text content
    const text = element.textContent || '';
    return text.trim().length > 0;
  }

  /**
   * Handle mouse over events
   * @param {MouseEvent} event - Mouse event
   */
  function handleMouseOver(event) {
    if (!isActive || !tooltip) return;
    
    // If creating fixed tooltip, ignore mouse hover events
    if (isCreatingFixedTooltip) return;
    
    try {
      let targetElement = event.target;
      
      // If text node, get parent element
      if (targetElement.nodeType === Node.TEXT_NODE) {
        targetElement = targetElement.parentElement;
      }
      
      // Only proceed if we have a valid element
      if (targetElement && targetElement.nodeType === Node.ELEMENT_NODE) {
        // Update tooltip content
        populateTooltipContent(tooltip, targetElement);
        
        // Show tooltip
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
      }
    } catch (err) {
      console.error('Error handling mouse over:', err);
      if (err.message && err.message.includes('Extension context invalidated')) {
        cleanupResources();
      }
    }
  }

  /**
   * Handle mouse out events
   * @param {MouseEvent} event - Mouse event
   */
  function handleMouseOut(event) {
    if (!isActive) return;
    
    // If creating fixed tooltip, ignore mouse out events
    if (isCreatingFixedTooltip) return;
    
    // Check if really leaving the element (not entering a child element)
    let relatedTarget = event.relatedTarget;
    while (relatedTarget) {
      if (relatedTarget === event.target) {
        return;
      }
      relatedTarget = relatedTarget.parentElement;
    }
    
    try {
      if (tooltip) {
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
      }
    } catch (err) {
      console.error('Error handling mouse out:', err);
      if (err.message && err.message.includes('Extension context invalidated')) {
        cleanupResources();
      }
    }
  }

  /**
   * Handle mouse move events
   * @param {MouseEvent} event - Mouse event
   */
  function handleMouseMove(event) {
    if (!isActive || !tooltip) return;
    
    // If creating fixed tooltip, ignore mouse move events
    if (isCreatingFixedTooltip) return;
    
    try {
      // Update last known mouse position
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      
      // Update tooltip position
      updateTooltipPosition(tooltip, event.pageX, event.pageY);
    } catch (err) {
      console.error('Error handling mouse move:', err);
      if (err.message && err.message.includes('Extension context invalidated')) {
        cleanupResources();
      }
    }
  }

  /**
   * Add mouse event listeners
   */
  function addMouseListeners() {
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousemove', handleMouseMove);
  }

  /**
   * Remove mouse event listeners
   */
  function removeMouseListeners() {
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('mousemove', handleMouseMove);
  }

  // Initialize extension
  initializeDetector();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === TOGGLE_ACTION) {
      toggleExtension();
      sendResponse({ success: true });
    } else if (request.action === 'checkContentScriptLoaded') {
      sendResponse({ loaded: true });
    } else if (request.action === 'checkExtensionStatus') {
      sendResponse({ isActive });
    }
    return true;
  });
})();