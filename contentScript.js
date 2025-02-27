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
      // 初始化检测器并重置状态
      currentTarget = null;
      lastTooltipContent = '';
      
      // 完全初始化检测器
      initializeDetector();
      
      // 发送消息到后台脚本更新图标为激活状态
      chrome.runtime.sendMessage({ action: 'updateIcon', iconState: 'active' });
      console.log('Extension activated');
    } else {
      // 停用检测器，保留固定工具提示
      deinitializeDetector(true); // 设为true表示保留固定tooltip
      
      // 发送消息到后台脚本恢复图标为默认状态
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
    // 确保先清理任何现有的资源，防止重复初始化
    if (tooltip) {
      try {
        tooltip.remove();
        tooltip = null;
      } catch (e) {
        console.warn('清理现有tooltip时出错:', e);
      }
    }
    
    injectCSS();
    tooltip = createTooltip();
    
    // 确保tooltip正确初始化
    if (tooltip) {
      tooltip.style.display = 'none';
      tooltip.style.opacity = '0';
      console.log('Tooltip element created and initialized');
    } else {
      console.error('Failed to create tooltip element');
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
    // Remove external font import that violates CSP
    // const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');";

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

      #fontInfoTooltip, .fixed-tooltip {
        border: 1px solid #2F2F2F;
        background-color: rgba(30, 30, 30, 0.85);  
        font-family: 'Satoshi', Arial, sans-serif; /* Use local Satoshi font with fallbacks */
        padding: 16px 16px;
        border-radius: 16px;
        word-wrap: break-word;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: opacity 0.15s ease;
        opacity: 1;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
    
      #fontInfoTooltip {
        width: 250px; /* fixed width */
      }
      
      .fixed-tooltip {
        min-width: 250px; /* minimum width */
        max-width: 400px; /* maximum width */
        width: auto; /* auto-adjusting width */
      }
      
      /* Special style for selection-created tooltips */
      .fixed-tooltip[data-is-selection-tooltip="true"] {
        width: auto; /* auto width */
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
        font-family: 'Satoshi', Arial, sans-serif; /* Ensure child elements use Satoshi font */
      }
    
      #fontInfoTooltip div span, .fixed-tooltip div span {
        color: #FFFFFF;
        font-size: 14px; /* Content font size */
        margin-left: 0px; /* Remove spacing between title and content */
        font-weight: 500; /* Medium font weight for content */
        font-family: 'Satoshi', Arial, sans-serif; /* Ensure span elements use Satoshi font */
      }

      #fontInfoTooltip a, .fixed-tooltip a {
        text-decoration: none;
        color: inherit;
        font-family: 'Satoshi', Arial, sans-serif; /* Ensure links use Satoshi font */
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
        font-family: 'Satoshi', Arial, sans-serif; /* Ensure copy icon uses Satoshi font */
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
    style.textContent = css;
    
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
    // Remove existing tooltip if present
    const existingTooltip = document.getElementById('fontInfoTooltip');
    if (existingTooltip) {
      console.log('Removing existing tooltip element');
      existingTooltip.remove();
    }
    
    const tooltip = document.createElement('div'); 
    tooltip.classList.add('font-detector');
    tooltip.setAttribute('id', 'fontInfoTooltip');
    tooltip.style.position = 'fixed'; // Use fixed positioning
    tooltip.style.display = 'none'; // Initially hidden
    tooltip.style.visibility = 'hidden'; // Ensure completely hidden initially
    tooltip.style.opacity = '0'; // Initially transparent
    tooltip.style.zIndex = '2147483647'; // Highest z-index
    tooltip.style.pointerEvents = 'none'; // Don't block mouse events
    
    // Ensure added to body rather than documentElement, more reliable
    // Add null check to prevent "Cannot read properties of null" error
    if (document.body) {
      document.body.appendChild(tooltip);
      console.log('Tooltip created and added to DOM');
    } else {
      console.error('Cannot add tooltip: document.body is null');
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
    
    // Don't preset width, let it adapt to content
    fixedTooltip.style.width = 'auto';
    fixedTooltip.style.minWidth = '250px';
    fixedTooltip.style.maxWidth = '400px';
    
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
      
      // No need to reset flag when closing, as each tooltip manages independently
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
    try {
      // Safety check
      if (!tooltip || !element) {
        console.warn('Missing tooltip or element in populateTooltipContent');
        return;
      }
      
      // Generate content HTML
      const content = generateTooltipContent(element);
      tooltip.innerHTML = content;
      
      // Safely get all copy icons
      try {
        const copyIcons = tooltip.querySelectorAll('.copy-icon');
        
        // Add click events to copy icon
        for (let i = 0; i < copyIcons.length; i++) {
          const copyIcon = copyIcons[i];
          copyIcon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const valueToCopy = this.dataset.value;
            if (!valueToCopy) return;
            
            try {
              // Modern clipboard API with fallback
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(valueToCopy)
                  .then(() => {
                    // Show copy feedback
                    const originalSvg = this.innerHTML;
                    this.innerHTML = `<svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43 11L16.875 37L5 25.1818" stroke="#2596FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                    
                    setTimeout(() => {
                      this.innerHTML = originalSvg;
                    }, 1500);
                  })
                  .catch(err => {
                    console.warn('Clipboard API failed:', err);
                  });
              } 
            } catch (err) {
              console.warn('Error copying to clipboard:', err);
            }
          });
        }
      } catch (err) {
        console.warn('Error setting up copy buttons:', err);
      }
      
      // Font family link click handling
      try {
        const fontFamilyLinks = tooltip.querySelectorAll('.fontFamilyLink');
        for (let i = 0; i < fontFamilyLinks.length; i++) {
          const link = fontFamilyLinks[i];
          link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const fontName = this.dataset.font;
            if (!fontName) return;
            
            try {
              // Copy font family to clipboard
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(fontName)
                  .then(() => {
                    // Show feedback near the link
                    const span = this.querySelector('span');
                    if (span) {
                      const originalText = span.textContent;
                      span.textContent = 'Copied!';
                      
                      setTimeout(() => {
                        span.textContent = originalText;
                      }, 1500);
                    }
                  })
                  .catch(err => {
                    console.warn('Clipboard API failed for font name:', err);
                  });
              }
            } catch (err) {
              console.warn('Error copying font name:', err);
            }
          });
        }
      } catch (err) {
        console.warn('Error setting up font family links:', err);
      }
    } catch (err) {
      console.error('Error in populateTooltipContent:', err);
      // Provide basic fallback content
      try {
        tooltip.innerHTML = '<div>Font information <span>Unable to display complete details</span></div>';
      } catch (innerErr) {
        console.error('Even fallback content failed:', innerErr);
      }
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
    // Add null check to prevent setting position property when tooltip is undefined/null
    if (!tooltip) {
      console.warn('Attempting to update position of non-existent tooltip');
      return;
    }
    
    try {
      // Set absolute position directly for better browser compatibility
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
        return;
      }
      
      // Don't process if selection is empty
      const text = selection.toString().trim();
      if (!text) {
        console.log('Selected text is empty');
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
                    // Let width adapt to content
                    tooltip.style.width = 'auto';
                  }
                }, 50);
              } else {
                console.warn('❌ Tooltip creation failed');
              }
              
              // Immediately reset creation flag
              isCreatingFixedTooltip = false;
              console.log('Creation process complete, resetting flag');
              
            } catch (err) {
              console.error('Error creating tooltip:', err);
              isCreatingFixedTooltip = false; // Ensure flag is reset on error
            }
          }, 10);
        } catch (err) {
          console.error('Error in selection delay callback:', err);
          isCreatingFixedTooltip = false; // Ensure flag is reset on error
        }
      }, 100); // Use shorter delay time to reduce perceived lag
    } catch (err) {
      console.error('Error handling text selection:', err);
      isCreatingFixedTooltip = false; // Ensure flag is reset on error
      if (err.message && err.message.includes('Extension context invalidated')) {
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
    if (!isActive || !tooltip) return;
    
    // If creating a tooltip, ignore mouse hover event
    if (isCreatingFixedTooltip) return;
    
    try {
      let targetElement = event.target;
      
      // If it's a text node, use its parent element
      if (targetElement.nodeType === Node.TEXT_NODE) {
        targetElement = targetElement.parentElement;
      }
      
      // Check if tooltip with same text content exists
      if (targetElement && targetElement.classList && 
          targetElement.classList.contains('fixed-tooltip') && 
          targetElement.dataset.isSelectionTooltip === 'true') {
        // When mouse hovers over selection-created tooltip, don't interfere with following tooltip
        return;
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
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // Check if the target element is the root or body element of the document (possibly a blank area)
      if (targetElement === document.documentElement || targetElement === document.body) {
        if (currentTarget) {
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // Check if it's a blank area (e.g., blank part of a large container element)
      let elementUnderPoint = null;
      try {
        elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
      } catch (err) {
        console.warn('Unable to get element under mouse position:', err);
      }
      
      if (elementUnderPoint !== targetElement && 
          (elementUnderPoint === document.documentElement || elementUnderPoint === document.body)) {
        if (currentTarget) {
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // Only process element nodes containing text
      if (targetElement && targetElement.nodeType === Node.ELEMENT_NODE && hasTextContent(targetElement)) {
        currentTarget = targetElement;
        
        // Use requestAnimationFrame to ensure smooth display
        requestUpdate(() => {
          if (tooltip && !isCreatingFixedTooltip) { // Check flag again to avoid updating during creation
            showTooltip(event, tooltip);
          }
        });
      } else {
        // Not a text element, hide tooltip
        currentTarget = null;
        if (tooltip) {
          hideTooltip(tooltip);
        }
      }
    } catch (err) {
      console.error('Error handling mouse hover event:', err);
    }
  }

  /**
   * Handle mouseout event
   * @param {Event} event - The mouse event
   */
  function handleMouseOut(event) {
    if (!isActive) return;
    
    // If creating a tooltip, ignore mouse exit event
    if (isCreatingFixedTooltip) return;
    
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
    if (!isActive || !tooltip) return;
    
    // If creating a tooltip, ignore mouse movement - but still record mouse position, addressing issue 2
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    
    if (isCreatingFixedTooltip) return;
    
    try {
      let targetElement = event.target;
      
      // If it's a text node, use its parent element
      if (targetElement.nodeType === Node.TEXT_NODE) {
        targetElement = targetElement.parentElement;
      }
      
      // Check if tooltip with same text content exists
      if (targetElement && targetElement.classList && 
          targetElement.classList.contains('fixed-tooltip') && 
          targetElement.dataset.isSelectionTooltip === 'true') {
        // When mouse hovers over selection-created tooltip, don't interfere with following tooltip
        return;
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
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // Check if the target element is the root or body element of the document (possibly a blank area)
      if (targetElement === document.documentElement || targetElement === document.body) {
        if (currentTarget) {
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // Check if it's a blank area (e.g., blank part of a large container element)
      let elementUnderPoint = null;
      try {
        elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
      } catch (err) {
        console.warn('Unable to get element under mouse position:', err);
      }
      
      if (elementUnderPoint !== targetElement && 
          (elementUnderPoint === document.documentElement || elementUnderPoint === document.body)) {
        if (currentTarget) {
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // Only process element nodes containing text
      if (targetElement && targetElement.nodeType === Node.ELEMENT_NODE && hasTextContent(targetElement)) {
        // Not in the process of creating a fixed tooltip, normal display of following tooltip
        if (currentTarget !== targetElement) {
          currentTarget = targetElement;
        }
        
        // Use debouncing technique to reduce excessive updates, addressing issue 2: reduce update frequency
        requestUpdate(() => {
          if (tooltip && !isCreatingFixedTooltip) { // Check flag again to avoid updating during creation
            showTooltip(event, tooltip);
          }
        });
      } else {
        // Not a text element, hide tooltip
        if (currentTarget) {
          currentTarget = null;
          if (tooltip) {
            hideTooltip(tooltip);
          }
        }
      }
    } catch (err) {
      console.error('Error handling mouse movement:', err);
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
    try {
      // Safety check
      if (!event || !tooltip) {
        console.warn('Missing parameters for showTooltip:', event ? 'tooltip missing' : 'event missing');
        return;
      }
      
      // If there's a current target element, generate content
      if (currentTarget) {
        try {
          // Generate content first
          const content = generateTooltipContent(currentTarget);
          tooltip.innerHTML = content;
          console.log('Content generated for tooltip');
        } catch (err) {
          console.warn('Error generating tooltip content:', err);
        }
      } else {
        console.warn('No current target element when showing tooltip');
        return; // Don't show without target element
      }
      
      // Update position - ensure to the right and below mouse
      const posX = event.clientX + 15;
      const posY = event.clientY + 15;
      updateTooltipPosition(tooltip, posX, posY);
      console.log(`Updated tooltip position: (${posX}, ${posY})`);
      
      // Show tooltip
      tooltip.style.display = 'block';
      tooltip.style.opacity = '1';
      tooltip.style.visibility = 'visible'; // Ensure visibility setting is correct
      console.log('Tooltip is now visible');
    } catch (err) {
      console.error('Error showing tooltip:', err);
      
      // Try simpler method to recover
      try {
        if (tooltip) {
          tooltip.style.cssText = 'display:block; opacity:1; visibility:visible; position:fixed; z-index:2147483647;';
          tooltip.style.left = (event.clientX + 15) + 'px';
          tooltip.style.top = (event.clientY + 15) + 'px';
          console.log('Using fallback method to show tooltip');
        }
      } catch (innerErr) {
        console.error('Basic tooltip display attempt failed:', innerErr);
      }
    }
  }

  /**
   * Hide tooltip
   * @param {Element} tooltip - The tooltip element
   */
  function hideTooltip(tooltip) {
    try {
      // Safety check
      if (!tooltip) {
        console.warn('Missing tooltip in hideTooltip');
        return;
      }
      
      // Save current content for possible future recovery
      if (tooltip.innerHTML) {
        lastTooltipContent = tooltip.innerHTML;
      }
      
      // Ensure tooltip is thoroughly hidden
      tooltip.style.display = 'none';
      tooltip.style.opacity = '0';
      tooltip.style.visibility = 'hidden';
      
      // Clear content to prevent DOM bloat
      tooltip.innerHTML = '';
      
      console.log('Tooltip successfully hidden');
    } catch (err) {
      console.error('Error hiding tooltip:', err);
      
      // Simplified method for error recovery
      try {
        if (tooltip) {
          tooltip.style.cssText = 'display:none; opacity:0; visibility:hidden; position:fixed;';
          tooltip.innerHTML = '';
          console.log('Using fallback method to hide tooltip');
        }
      } catch (innerErr) {
        console.error('Basic tooltip hiding attempt failed:', innerErr);
      }
    }
  }
})();