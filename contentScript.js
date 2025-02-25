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
      document.body.appendChild(tempEl);
      
      // Get the computed color value (browser will convert various formats to rgb or rgba)
      const computedColor = getComputedStyle(tempEl).color;
      document.body.removeChild(tempEl);
      
      // Parse RGB or RGBA color
      const rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        // Convert to different formats
        const hex = rgbToHex(r, g, b);
        const lch = rgbToLCH(r, g, b);
        const hcl = rgbToHCL(r, g, b);
        
        return {
          hex,
          lch: `L: ${lch.l}, C: ${lch.c}, H: ${lch.h}`,
          hcl: `H: ${hcl.h}, C: ${hcl.c}, L: ${hcl.l}`,
          rgbValue: [r, g, b]
        };
      }
    } catch (e) {
      console.error('Error parsing color:', e);
    }
    
    return null;
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
      // Clear tracked positions
      try {
        fixedTooltipPositions.clear();
      } catch (err) {
        console.warn('Error clearing fixedTooltipPositions:', err);
      }
      
      // Save current tooltips array and reset
      let tooltipsToRemove = [];
      try {
        tooltipsToRemove = [...fixedTooltips];
        fixedTooltips = [];
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
      
      // Ensure all elements with .fixed-tooltip class are removed, in case of any missed
      try {
        const remainingTooltips = document.querySelectorAll('.fixed-tooltip');
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
      } catch (err) {
        console.warn('Error getting remaining tooltips:', err);
      }
      
      // Also remove any elements with font-detector class as a last resort
      try {
        const detectorElements = document.querySelectorAll('.font-detector:not(#fontInfoTooltip)');
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
      } catch (err) {
        console.warn('Error getting detector elements:', err);
      }
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
    document.head.appendChild(style);
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
    document.body.appendChild(tooltip); 
    
    console.log('Tooltip created and added to DOM');
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
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Generate position identifier
      const positionKey = `${Math.round(rect.left)},${Math.round(rect.bottom)}`;
      
      // Check if position already has tooltip
      if (fixedTooltipPositions.has(positionKey)) {
        console.log('Position already has fixed tooltip, skipping creation');
        return null;
      }
      
      // Record new position
      fixedTooltipPositions.add(positionKey);
      
      const fixedTooltip = document.createElement('div');
      fixedTooltip.classList.add('font-detector', 'fixed-tooltip');
      fixedTooltip.dataset.positionKey = positionKey;
      
      // Calculate position - place below the selected text
      fixedTooltip.style.left = (window.pageXOffset + rect.left) + 'px';
      fixedTooltip.style.top = (window.pageYOffset + rect.bottom + 10) + 'px';
      
      // Fill content
      populateTooltipContent(fixedTooltip, element);
      
      // Add close button
      const closeButton = document.createElement('div');
      closeButton.classList.add('close-button');
      closeButton.innerHTML = `<?xml version="1.0" encoding="UTF-8"?><svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8L40 40" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40L40 8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      closeButton.addEventListener('click', () => {
        // Remove from position set when closed
        fixedTooltipPositions.delete(positionKey);
        fixedTooltip.remove();
        fixedTooltips = fixedTooltips.filter(t => t !== fixedTooltip);
      });
      fixedTooltip.appendChild(closeButton);
      
      document.documentElement.appendChild(fixedTooltip);
      fixedTooltips.push(fixedTooltip);
      
      return fixedTooltip;
    } catch (err) {
      console.error('Error creating fixed tooltip:', err);
      // Remove from position set if error occurs
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const positionKey = `${Math.round(rect.left)},${Math.round(rect.bottom)}`;
        fixedTooltipPositions.delete(positionKey);
      }
      return null;
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
          ${colorInfo.lch}
          <span class="copy-icon" data-value="${colorInfo.lch}" title="Copy LCH value">
            ${copySvg}
          </span>
        </span></div>
        <div>HCL <span class="value-with-copy">
          ${colorInfo.hcl}
          <span class="copy-icon" data-value="${colorInfo.hcl}" title="Copy HCL value">
            ${copySvg}
          </span>
        </span></div>
      `;
    }

    return content;
  }

  /**
   * Fill the tooltip content with font information
   * @param {Element} tooltipElement - The tooltip element to populate
   * @param {Element} element - The element to get font info from
   */
  function populateTooltipContent(tooltipElement, element) {
    // Generate content
    const content = generateTooltipContent(element);
    
    // Update the tooltip HTML
    tooltipElement.innerHTML = content;

    // Add font link click event
    const fontFamilyLinks = tooltipElement.querySelectorAll('.fontFamilyLink');
    fontFamilyLinks.forEach(link => {
      link.addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.sendMessage({
        action: 'searchFontFamily',
          fontFamily: link.getAttribute('data-font')
        });
      });
    });

    // Add copy icon click event
    const copyIcons = tooltipElement.querySelectorAll('.copy-icon');
    copyIcons.forEach(icon => {
      icon.addEventListener('click', handleCopyClick);
    });
  }

  /**
   * Handle copy icon click
   * @param {Event} event - Click event
   */
  function handleCopyClick(event) {
    event.stopPropagation();
    const icon = event.currentTarget;
    const valueToCopy = icon.getAttribute('data-value');
    
    // Define SVG icon - adjust size to 16px
    const checkSvg = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43 11L16.875 37L5 25.1818" stroke="#2596FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(valueToCopy).then(() => {
      // Change icon to checkmark
      icon.innerHTML = checkSvg;
      icon.classList.add('copied');
      
      // Set up clipboard monitoring to restore icon after clipboard content changes
      monitorClipboard(icon, valueToCopy);
      
      debug('Copied to clipboard:', valueToCopy);
    }).catch(err => {
      console.error('Could not copy text:', err);
    });
  }

  /**
   * Monitor clipboard for changes
   * @param {Element} icon - The copy icon element
   * @param {string} originalText - The text that was copied
   */
  function monitorClipboard(icon, originalText) {
    // Define SVG icon - adjust size to 16px
    const copySvg = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#a7a7a7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" fill="none" stroke="#a7a7a7" stroke-width="4" stroke-linejoin="round"/></svg>`;
    
    // Create a polling interval to check if clipboard content changed
    const checkInterval = setInterval(() => {
      // Try to read clipboard (this may fail due to permissions)
      navigator.clipboard.readText().then(clipText => {
        if (clipText !== originalText) {
          // Clipboard content changed, restore copy icon
          icon.innerHTML = copySvg;
          icon.classList.remove('copied');
          clearInterval(checkInterval);
        }
      }).catch(() => {
        // If we can't read clipboard, clear after a timeout
        clearInterval(checkInterval);
        setTimeout(() => {
          icon.innerHTML = copySvg;
          icon.classList.remove('copied');
        }, 3000); // 3 seconds
      });
    }, 1000); // Check every second

    // Fallback: clear copied state after a timeout (in case we can't read clipboard)
    setTimeout(() => {
      clearInterval(checkInterval);
      if (icon.classList.contains('copied')) {
        icon.innerHTML = copySvg;
        icon.classList.remove('copied');
      }
    }, 5000); // 5 seconds
  }

  /**
   * Update tooltip position only
   * @param {Element} tooltip - The tooltip element
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  function updateTooltipPosition(tooltip, x, y) {
    // Set absolute position directly for better browser compatibility
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  /**
   * Show the tooltip at the specified position
   * @param {Event} event - The event object
   * @param {Element} tooltip - The tooltip element
   */
  function showTooltip(event, tooltip) {
    // Get the target element, handling text nodes
    let element = event.target;
    if (element.nodeType === Node.TEXT_NODE) {
      element = element.parentElement;
    }
    
    // Ensure we have a valid element
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    
    // If tooltip is not visible, make it visible
    if (tooltip.style.display === 'none') {
      // Initial content
      populateTooltipContent(tooltip, element);
      lastTooltipContent = tooltip.innerHTML;
      
      // Make visible
      tooltip.style.display = 'block';
      tooltip.style.opacity = '1';
      tooltip.style.position = 'fixed'; // Use fixed position for better performance
    }
    
    // Calculate position (10px offset from cursor)
    const x = event.clientX + 10;
    const y = event.clientY + 10;
    
    // Only update position, not content, for better performance during movement
    updateTooltipPosition(tooltip, x, y);
    
    // Update content only every 200ms
    const now = Date.now();
    if (!tooltip.lastContentUpdate || now - tooltip.lastContentUpdate > 200) {
      const newContent = generateTooltipContent(element);
      if (newContent !== lastTooltipContent) {
        tooltip.innerHTML = newContent;
        lastTooltipContent = newContent;
        
        // Add font link and copy button click events after content update
        const fontFamilyLinks = tooltip.querySelectorAll('.fontFamilyLink');
        fontFamilyLinks.forEach(link => {
          link.addEventListener('click', (event) => {
            event.preventDefault();
            chrome.runtime.sendMessage({
              action: 'searchFontFamily',
              fontFamily: link.getAttribute('data-font')
            });
          });
        });
        
        // Add copy icon click event
        const copyIcons = tooltip.querySelectorAll('.copy-icon');
        copyIcons.forEach(icon => {
          icon.addEventListener('click', handleCopyClick);
        });
      }
      tooltip.lastContentUpdate = now;
    }
  }

  /**
   * Hide the tooltip
   * @param {Element} tooltip - The tooltip element
   */
  function hideTooltip(tooltip) {
    tooltip.style.transition = ''; // Reset transition  
    tooltip.style.opacity = '0';
    tooltip.style.display = 'none';
    
    // Reset animation frame
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  /**
   * Handle keyboard events
   * @param {Event} event - The keyboard event
   */
  function handleKeyDown(event) {
    if (event.key === 'Escape' && isActive) {
      // Hide floating tooltip
      hideTooltip(tooltip);
      
      // Disable extension functionality but preserve fixed tooltips
      isActive = false;
      
      // Use new parameter call deinitializeDetector, preserve fixed tooltips
      deinitializeDetector(true);
      
      // Notify background extension state changed
      chrome.runtime.sendMessage({ action: TOGGLE_ACTION });
      
      // Send message to background script to restore icon to default state
      chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'inactive' });
    }
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
   * Handle text selection event
   * @param {Event} event - The mouse event
   */
  function handleTextSelection(event) {
    if (!isActive) return;
    
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
              // Remove all existing fixed tooltips
              removeAllFixedTooltips();
              
              // Create new fixed tooltip
              createFixedTooltip(event, element);
            }
          }
        } catch (err) {
          console.error('Error handling text selection:', err);
          // Check if it's "Extension context invalidated" error
          if (err.message && err.message.includes("Extension context invalidated")) {
            cleanupResources();
          }
        }
      }, 100); // 100ms delay, reduce multiple triggers
    } catch (err) {
      console.error('Error handling text selection:', err);
      // Check if it's "Extension context invalidated" error
      if (err.message && err.message.includes("Extension context invalidated")) {
        cleanupResources();
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
    
    // Extended non-text tag list - added more tags that should not display tooltips
    const nonTextTags = [
      'HTML', 'BODY', 'SCRIPT', 'STYLE', 'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 
      'OBJECT', 'EMBED', 'NAV', 'UL', 'OL', 'HR', 'BR', 'WBR', 'NOSCRIPT', 'INPUT', 'SELECT', 'OPTION', 
      'OPTGROUP', 'DATALIST', 'OUTPUT', 'MENU', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'MAP', 'AREA', 
      'SOURCE', 'TRACK', 'META', 'LINK', 'BASE', 'PARAM', 'PROGRESS', 'METER', 'TIME', 'HEADER', 
      'FOOTER', 'MAIN', 'SECTION', 'ARTICLE', 'DIALOG', 'DETAILS', 'SUMMARY', 'PICTURE', 'TEMPLATE'
    ];
    
    if (nonTextTags.includes(element.tagName)) {
      debug('Non-text tag', element.tagName);
      return false;
    }
    
    // Get element text content (remove spaces)
    const rawText = element.textContent || '';
    const text = rawText.trim();
    
    // Check element computed style
    const style = getComputedStyle(element);
    
    // Check if element is hidden
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      debug('Hidden element', element.tagName);
      return false;
    }
    
    // Check if element is blank (e.g., only spaces, newlines, etc.)
    if (!/\S/.test(rawText)) {
      debug('Blank element', element.tagName);
      return false;
    }
    
    // Check element dimensions - increased minimum size requirement
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      debug('Element too small', `${element.tagName} ${rect.width}x${rect.height}`);
      return false;
    }
    
    // Check if element is in visible area of page
    if (rect.top > window.innerHeight || rect.bottom < 0 || 
        rect.left > window.innerWidth || rect.right < 0) {
      debug('Element outside visible area', element.tagName);
      return false;
    }
    
    // Check directly text child nodes (not including text in child elements)
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
    
    // More strict text length requirement
    if (text.length < 3) {
      debug('Text too short', `${element.tagName}: ${text}`);
      return false;
    }
    
    // Check if it only contains special characters or punctuation
    const punctuationOnlyPattern = /^[\s\.,;:!?()[\]{}'"\/\\-_+=<>|&$#@%^*]+$/;
    if (punctuationOnlyPattern.test(text)) {
      debug('Contains only special characters', `${element.tagName}: ${text}`);
      return false;
    }
    
    // Check if it is meaningful text content
    // Must contain letters, numbers, or Chinese, and at least 3 characters
    const meaningfulTextPattern = /[a-zA-Z0-9\u4e00-\u9fa5]{3,}/;
    if (!meaningfulTextPattern.test(text)) {
      debug('Does not contain meaningful text', `${element.tagName}: ${text}`);
      return false;
    }
    
    // Check if it is a clear text element
    const textElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE'];
    if (textElements.includes(element.tagName) && directTextLength >= 3) {
      debug('Clear text element', `${element.tagName}: ${directTextLength} characters`);
      return true;
    }
    
    // Check inline text elements
    const inlineTextElements = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'SUP', 'SUB', 'MARK', 'SMALL', 'DEL', 'INS', 'Q', 'ABBR', 'CITE', 'DFN', 'LABEL'];
    if (inlineTextElements.includes(element.tagName) && directTextLength >= 3) {
      debug('Inline text element', `${element.tagName}: ${directTextLength} characters`);
      return true;
    }
    
    // Check table cell elements
    if (['TD', 'TH'].includes(element.tagName) && directTextLength >= 3) {
      debug('Table cell text', `${element.tagName}: ${directTextLength} characters`);
      return true;
    }
    
    // Check list elements
    if (['LI', 'DT', 'DD'].includes(element.tagName) && directTextLength >= 3) {
      debug('List element text', `${element.tagName}: ${directTextLength} characters`);
      return true;
    }
    
    // Check form elements
    if (['BUTTON', 'TEXTAREA'].includes(element.tagName) && directTextLength >= 3) {
      debug('Form element text', `${element.tagName}: ${directTextLength} characters`);
      return true;
    }
    
    // Additional check for DIV elements - stricter requirements
    if (element.tagName === 'DIV') {
      // Only accept DIVs with a lot of text (at least 20 characters)
      if (directTextLength >= 20) {
        debug('Text-rich DIV', `Direct text length: ${directTextLength} characters`);
        return true;
      }
      
      // Check DIV's style to see if it looks like a text container
      if (style.fontFamily !== 'inherit' && style.textAlign !== 'start' && directTextLength >= 5) {
        debug('Style similar to text container DIV', `${element.tagName}: ${directTextLength} characters`);
        return true;
      }
      
      debug('Regular DIV does not meet text requirements', `Direct text length: ${directTextLength} characters`);
      return false;
    }
    
    // By default, if it doesn't meet any of the above conditions, it's not considered a text element
    debug('Does not meet any text element conditions', element.tagName);
    return false;
  }

  /**
   * Handle mouseover event 
   * @param {Event} event - The mouse event
   */
  function handleMouseOver(event) {
    if (!isActive) return;
    
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
        debug('Mouse at window edge', `${mouseX},${mouseY}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // Check if the target element is the root or body element of the document (possibly a blank area)
    if (targetElement === document.documentElement || targetElement === document.body) {
      if (currentTarget) {
        debug('Mouse over root element', targetElement.tagName);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // Check if it's a blank area (e.g., blank part of a large container element)
    const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
    if (elementUnderPoint !== targetElement && 
        (elementUnderPoint === document.documentElement || elementUnderPoint === document.body)) {
      if (currentTarget) {
        debug('Mouse in blank area', `${elementUnderPoint?.tagName} vs ${targetElement.tagName}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // Only process element nodes containing text
    if (targetElement && targetElement.nodeType === Node.ELEMENT_NODE && hasTextContent(targetElement)) {
      debug('Mouse hovering over text element', targetElement.tagName);
      currentTarget = targetElement;
      
      // Use requestAnimationFrame to ensure smooth display
      requestUpdate(() => {
        showTooltip(event, tooltip);
      });
    } else {
      // Not a text element, hide tooltip
      debug('Mouse hovering over non-text element', targetElement?.tagName);
      currentTarget = null;
      hideTooltip(tooltip);
    }
  }

  /**
   * Handle mouseout event
   * @param {Event} event - The mouse event
   */
  function handleMouseOut(event) {
    if (!isActive) return;
    
    // Check if really leaving the element (not entering a child element)
    let relatedTarget = event.relatedTarget;
    while (relatedTarget) {
      if (relatedTarget === event.target) {
        // If the related target is a child of the current target, do nothing
        return;
      }
      relatedTarget = relatedTarget.parentElement;
    }
    
    // Really left the element
    currentTarget = null;
    hideTooltip(tooltip);
  }

  /**
   * Handle mousemove event using requestAnimationFrame
   * @param {Event} event - The mouse event
   */
  function handleMouseMove(event) {
    if (!isActive) return;
    
    let targetElement = event.target;
    
    // If it's a text node, use its parent element
    if (targetElement.nodeType === Node.TEXT_NODE) {
      targetElement = targetElement.parentElement;
    }
    
    // If the cursor is at the edge of the window or in a blank area, hide the tooltip
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Check if the mouse is at the edge of the window
    const edgeThreshold = 15; // Edge threshold (pixels)
    if (mouseX < edgeThreshold || mouseX > windowWidth - edgeThreshold || 
        mouseY < edgeThreshold || mouseY > windowHeight - edgeThreshold) {
      if (currentTarget) {
        debug('Mouse at window edge', `${mouseX},${mouseY}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // Check if the target element is the root or body element of the document (possibly a blank area)
    if (targetElement === document.documentElement || targetElement === document.body) {
      if (currentTarget) {
        debug('Mouse over root element', targetElement.tagName);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // Check if it's a blank area (e.g., blank part of a large container element)
    const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
    if (elementUnderPoint !== targetElement && 
        (elementUnderPoint === document.documentElement || elementUnderPoint === document.body)) {
      if (currentTarget) {
        debug('Mouse in blank area', `${elementUnderPoint?.tagName} vs ${targetElement.tagName}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // Ensure there is a valid element and it contains text
    if (targetElement && targetElement.nodeType === Node.ELEMENT_NODE && hasTextContent(targetElement)) {
      // Update current target
      if (currentTarget !== targetElement) {
        debug('Set new target element', targetElement.tagName);
        currentTarget = targetElement;
      }
      
      // Use requestAnimationFrame to ensure smooth animation
      requestUpdate(() => {
      showTooltip(event, tooltip);
      });
    } else if (currentTarget) {
      // If not on text and there was a target, hide tooltip
      debug('Mouse not on text', targetElement.tagName);
      currentTarget = null;
      hideTooltip(tooltip);
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

  // Set up message listener for extension communication
  try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
    if (request.action === TOGGLE_ACTION) {
      toggleExtension();
      sendResponse({ success: true });
    } else if (request.action === 'checkContentScriptLoaded') {
      sendResponse({ loaded: true });
        } else if (request.action === 'checkExtensionStatus') {
          // Return the current activation state of the extension
          sendResponse({ isActive: isActive });
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
})();