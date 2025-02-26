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
      // 只有在未处于重新初始化状态时清理资源，或者被强制清理
      if (!isReinitializing || force) {
        isReinitializing = true;
        console.log('Cleaning up FontDetector resources...');
        
        isActive = false;
        
        // 安全移除tooltip容器
        const tooltipContainer = document.getElementById('fontInfoTooltipContainer');
        if (tooltipContainer) {
          try { 
            tooltipContainer.remove();
          } catch(e) {
            console.warn('Error removing tooltip container:', e);
            // 尝试使用parentNode.removeChild
            if (tooltipContainer.parentNode) {
              tooltipContainer.parentNode.removeChild(tooltipContainer);
            }
          }
          tooltip = null;
        }
        
        // 清理所有固定tooltips
        try { removeAllFixedTooltips(); } catch(e) {
          console.warn('Error removing fixed tooltips:', e);
          
          // 备用清理方法
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
            
            // 尝试移除所有带font-detector类的元素
            const detectorElements = document.querySelectorAll('.font-detector');
            for (let i = 0; i < detectorElements.length; i++) {
              try {
                const el = detectorElements[i];
                if (el && el.parentNode) {
                  el.parentNode.removeChild(el);
                }
              } catch(e) {}
            }
            
            // 清理Shadow DOM容器
            const tooltipContainers = document.querySelectorAll('.fixed-tooltip-container');
            for (let i = 0; i < tooltipContainers.length; i++) {
              try {
                const container = tooltipContainers[i];
                if (container && container.parentNode) {
                  container.parentNode.removeChild(container);
                }
              } catch(e) {}
            }
          } catch(e) {}
        }
        
        // 安全移除所有事件监听器
        try { removeMouseListeners(); } catch(e) {
          console.warn('Error removing mouse listeners:', e);
        }
        
        try { removeSelectionListener(); } catch(e) {
          console.warn('Error removing selection listener:', e);
        }
        
        try { document.removeEventListener('keydown', handleKeyDown); } catch(e) {
          console.warn('Error removing keydown listener:', e);
        }
        
        // 取消所有动画帧请求
        if (animationFrameId) {
          try { cancelAnimationFrame(animationFrameId); } catch(e) {
            console.warn('Error canceling animation frame:', e);
          }
          animationFrameId = null;
        }
        
        // 清除选择超时
        if (selectionTimeout) {
          try { clearTimeout(selectionTimeout); } catch(e) {
            console.warn('Error clearing selection timeout:', e);
          }
          selectionTimeout = null;
        }
        
        // 清除位置集合
        try { fixedTooltipPositions.clear(); } catch(e) {
          console.warn('Error clearing position set:', e);
        }
        
        console.log('FontDetector resource cleanup completed');
        
        // 延迟后允许重新初始化
        setTimeout(() => {
          isReinitializing = false;
        }, 2000);
      }
    } catch (e) {
      console.error('Error occurred while cleaning up resources:', e);
      // 错误发生时重置重新初始化标志
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
      // 检查element是否为null或undefined
      if (!element) {
        return null;
      }
      
      // 安全获取计算样式
      let style;
      try {
        style = getComputedStyle(element);
      } catch (err) {
        console.warn('Error getting computed style:', err);
        return null;
      }
      
      const color = style.color;
      
      // 安全创建和添加临时元素
      try {
        // 创建一个临时元素来解析颜色格式
        const tempEl = document.createElement('div');
        tempEl.style.color = color;
        tempEl.style.display = 'none';
        
        // 检查document.body是否存在
        if (!document.body) {
          // 如果没有body，尝试使用documentElement
          if (document.documentElement) {
            document.documentElement.appendChild(tempEl);
          } else {
            // 如果documentElement也不存在，无法继续解析颜色
            console.warn('Cannot append temporary element: no body or documentElement');
            return null;
          }
        } else {
          document.body.appendChild(tempEl);
        }
        
        // 获取计算的颜色值（浏览器会将各种格式转换为rgb或rgba）
        const computedColor = getComputedStyle(tempEl).color;
        
        // 安全移除临时元素
        if (tempEl.parentNode) {
          tempEl.parentNode.removeChild(tempEl);
        }
        
        // 解析RGB或RGBA颜色
        const rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1]);
          const g = parseInt(rgbMatch[2]);
          const b = parseInt(rgbMatch[3]);
          
          // 转换为不同格式
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
        console.error('Error creating temporary element for color parsing:', e);
        
        // 备用方法：尝试直接解析颜色而不使用临时元素
        try {
          // 如果颜色已经是RGB格式，尝试直接解析
          const directRgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (directRgbMatch) {
            const r = parseInt(directRgbMatch[1]);
            const g = parseInt(directRgbMatch[2]);
            const b = parseInt(directRgbMatch[3]);
            
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
          
          // 如果是十六进制颜色，尝试直接解析
          if (color.startsWith('#')) {
            // 简单的十六进制颜色解析
            const hex = color.trim();
            // 将十六进制转换为RGB
            let r, g, b;
            
            if (hex.length === 4) { // #RGB格式
              r = parseInt(hex[1] + hex[1], 16);
              g = parseInt(hex[2] + hex[2], 16);
              b = parseInt(hex[3] + hex[3], 16);
            } else if (hex.length === 7) { // #RRGGBB格式
              r = parseInt(hex.substring(1, 3), 16);
              g = parseInt(hex.substring(3, 5), 16);
              b = parseInt(hex.substring(5, 7), 16);
            }
            
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
              const lch = rgbToLCH(r, g, b);
              const hcl = rgbToHCL(r, g, b);
              
              return {
                hex,
                lch: `L: ${lch.l}, C: ${lch.c}, H: ${lch.h}`,
                hcl: `H: ${hcl.h}, C: ${hcl.c}, L: ${hcl.l}`,
                rgbValue: [r, g, b]
              };
            }
          }
        } catch (backupErr) {
          console.error('Error in backup color parsing:', backupErr);
        }
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
    // 创建一个需要移除的数组副本，避免在遍历过程中修改原数组
    const tooltipsToRemove = [...fixedTooltips];
    
    // 逐个清理固定tooltip
    tooltipsToRemove.forEach(container => {
      try {
        // 从DOM中移除
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        } else if (container) {
          container.remove();
        }
        
        // 从保存的数组中移除
        const index = fixedTooltips.indexOf(container);
        if (index !== -1) {
          fixedTooltips.splice(index, 1);
        }
        
        // 如果有positionKey，从set中移除
        if (container.dataset && container.dataset.positionKey) {
          fixedTooltipPositions.delete(container.dataset.positionKey);
        }
      } catch (err) {
        console.warn('Error removing fixed tooltip:', err);
      }
    });
    
    // 清空数组
    fixedTooltips = [];
    
    // 清空位置集合
    fixedTooltipPositions.clear();
    
    console.log('All fixed tooltips removed');
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
        gap: 4px;
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
    try {
      // If existing tooltip, remove first
      const existingTooltip = document.getElementById('fontInfoTooltip');
      if (existingTooltip) {
        try {
          existingTooltip.remove();
        } catch (err) {
          console.warn('Error removing existing tooltip:', err);
          // 尝试使用parentNode.removeChild方式移除
          if (existingTooltip.parentNode) {
            existingTooltip.parentNode.removeChild(existingTooltip);
          }
        }
      }
      
      // 创建一个容器元素
      const container = document.createElement('div');
      container.setAttribute('id', 'fontInfoTooltipContainer');
      container.classList.add('font-detector');
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '0';
      container.style.height = '0';
      container.style.overflow = 'visible';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '2147483647'; // Highest z-index
      
      // 附加容器到DOM
      try {
        document.body.appendChild(container);
      } catch (err) {
        console.warn('Error appending container to body:', err);
        try {
          document.documentElement.appendChild(container);
        } catch (err2) {
          console.error('Failed to add container to DOM:', err2);
          throw new Error('Cannot create tooltip container: DOM access issues');
        }
      }
      
      // 创建Shadow DOM
      const shadowRoot = container.attachShadow({ mode: 'closed' });
      
      // 创建tooltip元素
      const tooltip = document.createElement('div');
      tooltip.setAttribute('id', 'fontInfoTooltip');
      tooltip.style.display = 'none';
      tooltip.style.position = 'absolute';
      tooltip.style.pointerEvents = 'none';
      
      // 创建样式元素
      const style = document.createElement('style');
      style.textContent = `
        /* 重置所有可能继承的样式 */
        #fontInfoTooltip {
          all: initial !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          font-size: 14px !important;
          font-weight: normal !important;
          line-height: 1.5 !important;
          color: #ffffff !important;
          background-color: rgba(30, 30, 30, 0.9) !important;
          border-radius: 12px !important;
          padding: 16px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
          width: 250px !important;
          max-width: 90vw !important;
          max-height: 80vh !important;
          overflow: auto !important;
          box-sizing: border-box !important;
          text-align: left !important;
          position: absolute !important;
          pointer-events: none !important;
          transform-origin: top left !important;
          z-index: 2147483647 !important;
          -webkit-font-smoothing: antialiased !important;
          text-rendering: optimizeLegibility !important;
        }
        
        /* 确保所有子元素样式也被重置 */
        #fontInfoTooltip * {
          all: revert !important;
          box-sizing: border-box !important;
          font-family: inherit !important;
          color: inherit !important;
        }
        
        #fontInfoTooltip div {
          margin: 8px 0 !important;
          padding: 0 !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
        }
        
        #fontInfoTooltip a {
          color: #2596FF !important;
          text-decoration: none !important;
          cursor: pointer !important;
        }
        
        #fontInfoTooltip a:hover {
          text-decoration: underline !important;
        }
        
        #fontInfoTooltip span {
          color: #a7a7a7 !important;
          font-weight: normal !important;
        }
        
        #fontInfoTooltip .color-preview {
          display: inline-block !important;
          width: 12px !important;
          height: 12px !important;
          border-radius: 2px !important;
          margin-right: 5px !important;
          border: 1px solid rgba(255, 255, 255, 0.3) !important;
          vertical-align: middle !important;
        }
        
        #fontInfoTooltip .value-with-copy {
          display: flex !important;
          align-items: center !important;
        }
        
        #fontInfoTooltip .copy-icon {
          margin-left: 8px !important;
          cursor: pointer !important;
          opacity: 0.6 !important;
          transition: opacity 0.2s !important;
          pointer-events: auto !important;
        }
        
        #fontInfoTooltip .copy-icon:hover {
          opacity: 1 !important;
        }
        
        #fontInfoTooltip .copy-icon.copied {
          opacity: 1 !important;
        }
        
        #fontInfoTooltip .close-button {
          position: absolute !important;
          top: 10px !important;
          right: 10px !important;
          cursor: pointer !important;
          opacity: 0.6 !important;
          transition: opacity 0.2s !important;
          pointer-events: auto !important;
        }
        
        #fontInfoTooltip .close-button:hover {
          opacity: 1 !important;
        }
      `;
      
      // 添加样式和tooltip到Shadow DOM
      shadowRoot.appendChild(style);
      shadowRoot.appendChild(tooltip);
      
      // 将tooltip引用保存到container上，以便后续访问
      container.tooltip = tooltip;
      
      console.log('Tooltip created in Shadow DOM and added to DOM');
      return tooltip;
    } catch (err) {
      console.error('Critical error creating tooltip:', err);
      // 返回一个基本的tooltip对象，避免null引用错误
      const dummyTooltip = {
        style: {},
        classList: { add: () => {}, remove: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        innerHTML: '',
        lastContentUpdate: 0,
        remove: () => {}
      };
      return dummyTooltip;
    }
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
      
      // 生成位置标识符
      const positionKey = `${Math.round(rect.left)},${Math.round(rect.bottom)}`;
      
      // 检查该位置是否已有固定Tooltip
      if (fixedTooltipPositions.has(positionKey)) {
        console.log('Position already has fixed tooltip, skipping creation');
        return null;
      }
      
      // 记录新位置
      fixedTooltipPositions.add(positionKey);
      
      // 创建固定Tooltip的容器
      const container = document.createElement('div');
      container.classList.add('font-detector', 'fixed-tooltip-container');
      container.dataset.positionKey = positionKey;
      container.style.position = 'absolute';
      container.style.left = (window.pageXOffset + rect.left) + 'px';
      container.style.top = (window.pageYOffset + rect.bottom + 10) + 'px';
      container.style.zIndex = '2147483647';
      
      // 创建Shadow DOM
      const shadowRoot = container.attachShadow({ mode: 'closed' });
      
      // 创建固定Tooltip
      const fixedTooltip = document.createElement('div');
      fixedTooltip.classList.add('fixed-tooltip');
      
      // 创建样式
      const style = document.createElement('style');
      style.textContent = `
        .fixed-tooltip {
          all: initial !important;
          position: relative !important;
          background-color: rgba(30, 30, 30, 0.9) !important;
          color: #ffffff !important;
          padding: 16px !important;
          padding-right: 30px !important; /* 为关闭按钮留出空间 */
          border-radius: 12px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          max-width: 300px !important;
          box-sizing: border-box !important;
          animation: fadeIn 0.2s ease-in-out !important;
          -webkit-font-smoothing: antialiased !important;
          z-index: 2147483647 !important;
        }

        /* 确保所有子元素样式也被重置 */
        .fixed-tooltip * {
          all: revert !important;
          box-sizing: border-box !important;
          font-family: inherit !important;
          color: inherit !important;
        }
        
        .fixed-tooltip div {
          margin: 8px 0 !important;
          padding: 0 !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
        }
        
        .fixed-tooltip a {
          color: #2596FF !important;
          text-decoration: none !important;
          cursor: pointer !important;
        }
        
        .fixed-tooltip a:hover {
          text-decoration: underline !important;
        }
        
        .fixed-tooltip span {
          color: #a7a7a7 !important;
          font-weight: normal !important;
        }
        
        .fixed-tooltip .color-preview {
          display: inline-block !important;
          width: 12px !important;
          height: 12px !important;
          border-radius: 2px !important;
          margin-right: 5px !important;
          border: 1px solid rgba(255, 255, 255, 0.3) !important;
          vertical-align: middle !important;
        }
        
        .fixed-tooltip .value-with-copy {
          display: flex !important;
          align-items: center !important;
        }
        
        .fixed-tooltip .copy-icon {
          margin-left: 8px !important;
          cursor: pointer !important;
          opacity: 0.6 !important;
          transition: opacity 0.2s !important;
          pointer-events: auto !important;
        }
        
        .fixed-tooltip .copy-icon:hover {
          opacity: 1 !important;
        }
        
        .fixed-tooltip .copy-icon.copied {
          opacity: 1 !important;
        }
        
        .close-button {
          position: absolute !important;
          top: 10px !important;
          right: 10px !important;
          cursor: pointer !important;
          opacity: 0.6 !important;
          transition: opacity 0.2s !important;
          pointer-events: auto !important;
        }
        
        .close-button:hover {
          opacity: 1 !important;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      
      // 添加样式到Shadow DOM
      shadowRoot.appendChild(style);
      shadowRoot.appendChild(fixedTooltip);
      
      // 填充内容
      populateTooltipContent(fixedTooltip, element);
      
      // 添加关闭按钮
      const closeButton = document.createElement('div');
      closeButton.classList.add('close-button');
      closeButton.innerHTML = `<?xml version="1.0" encoding="UTF-8"?><svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 8L40 40" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 40L40 8" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      closeButton.addEventListener('click', () => {
        // 移除位置记录
        fixedTooltipPositions.delete(positionKey);
        // 移除整个容器
        container.remove();
        // 从数组中移除
        fixedTooltips = fixedTooltips.filter(t => t !== container);
      });
      fixedTooltip.appendChild(closeButton);
      
      // 将容器添加到DOM
      document.documentElement.appendChild(container);
      // 保存容器引用到数组
      fixedTooltips.push(container);
      
      // 返回固定Tooltip的引用
      return fixedTooltip;
    } catch (err) {
      console.error('Error creating fixed tooltip:', err);
      // 如果发生错误，移除位置记录
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
    try {
      // 直接设置位置，使用绝对坐标提高浏览器兼容性
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    } catch (err) {
      console.warn('Error updating tooltip position:', err);
    }
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
    
    try {
      // If tooltip is not visible, make it visible
      if (tooltip.style.display === 'none') {
        // Initial content
        populateTooltipContent(tooltip, element);
        lastTooltipContent = tooltip.innerHTML;
        
        // Make visible
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
      }
      
      // 为所有网站使用统一的偏移量
      const offsetX = 15; // 水平偏移
      const offsetY = 15; // 垂直偏移
      
      // 计算鼠标位置相对于视口的坐标
      const x = event.clientX + offsetX;
      const y = event.clientY + offsetY;
      
      // 获取tooltip尺寸
      const tooltipRect = tooltip.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // 智能边界检测，防止Tooltip溢出屏幕
      let adjustedX = x;
      if (x + tooltipRect.width > windowWidth) {
        adjustedX = windowWidth - tooltipRect.width - 5;
      }
      
      let adjustedY = y;
      if (y + tooltipRect.height > windowHeight) {
        adjustedY = windowHeight - tooltipRect.height - 5;
      }
      
      // 如果会溢出左侧边缘，则修正为靠左侧显示
      if (adjustedX < 0) {
        adjustedX = 5;
      }
      
      // 如果会溢出顶部边缘，则修正为靠顶部显示
      if (adjustedY < 0) {
        adjustedY = 5;
      }
      
      // 确保Tooltip在任何情况下都是可见的
      adjustedX = Math.max(5, Math.min(windowWidth - Math.min(tooltipRect.width, windowWidth/2), adjustedX));
      adjustedY = Math.max(5, Math.min(windowHeight - Math.min(tooltipRect.height, windowHeight/2), adjustedY));
      
      // 更新位置
      updateTooltipPosition(tooltip, adjustedX, adjustedY);
      
      // 限制内容更新频率，每200ms更新一次
      const now = Date.now();
      if (!tooltip.lastContentUpdate || now - tooltip.lastContentUpdate > 200) {
        const newContent = generateTooltipContent(element);
        if (newContent !== lastTooltipContent) {
          tooltip.innerHTML = newContent;
          lastTooltipContent = newContent;
          
          // 添加字体链接和复制按钮的点击事件
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
          
          // 添加复制图标的点击事件
          const copyIcons = tooltip.querySelectorAll('.copy-icon');
          copyIcons.forEach(icon => {
            icon.addEventListener('click', handleCopyClick);
          });
        }
        tooltip.lastContentUpdate = now;
      }
    } catch (err) {
      console.error('Error showing tooltip:', err);
      try {
        // 失败时尝试隐藏tooltip以防止显示错误状态
        hideTooltip(tooltip);
      } catch (e) {}
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
    try {
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
      
      // 安全地获取计算样式，防止null对象
      let style;
      try {
        style = getComputedStyle(element);
      } catch (err) {
        console.warn('Error getting computed style:', err);
        return false;
      }
      
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
      
      // 安全获取元素位置和尺寸
      let rect;
      try {
        rect = element.getBoundingClientRect();
      } catch (err) {
        console.warn('Error getting element rect:', err);
        return false;
      }
      
      // 通用性放宽：减小尺寸要求 - 对所有网站都更宽松
      if (rect.width < 5 || rect.height < 5) {
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
      
      // 安全检查childNodes
      if (element.childNodes) {
        for (let i = 0; i < element.childNodes.length; i++) {
          const node = element.childNodes[i];
          if (node && node.nodeType === Node.TEXT_NODE) {
            const nodeText = node.textContent ? node.textContent.trim() : '';
            if (nodeText.length > 0) {
              hasDirectTextNode = true;
              directTextLength += nodeText.length;
            }
          }
        }
      }
      
      // 通用性放宽：减少文本长度要求
      if (text.length < 2) {
        debug('Text too short', `${element.tagName}: ${text}`);
        return false;
      }
      
      // Check if it only contains special characters or punctuation
      const punctuationOnlyPattern = /^[\s\.,;:!?()[\]{}'"\/\\-_+=<>|&$#@%^*]+$/;
      if (punctuationOnlyPattern.test(text)) {
        debug('Contains only special characters', `${element.tagName}: ${text}`);
        return false;
      }
      
      // 通用性放宽：降低有意义文本的要求
      const meaningfulTextPattern = /[a-zA-Z0-9\u4e00-\u9fa5]{2,}/;
      if (!meaningfulTextPattern.test(text)) {
        debug('Does not contain meaningful text', `${element.tagName}: ${text}`);
        return false;
      }
      
      // 通用性增强：检查元素是否有样式，不再限于特定网站
      if (element.classList && element.classList.length > 0 || 
          style.fontFamily !== 'inherit' || 
          style.fontSize !== 'inherit' ||
          style.color !== 'inherit' ||
          style.textAlign !== 'inherit') {
        // 如果元素有自定义样式，更可能是有意义的文本内容
        // 但仍需确保至少有一些文本内容
        if (directTextLength > 0 || text.length >= 2) {
          debug('Element with styling', `${element.tagName}`);
          return true;
        }
      }
      
      // Check if it is a clear text element
      const textElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE'];
      if (textElements.includes(element.tagName) && directTextLength >= 2) {
        debug('Clear text element', `${element.tagName}: ${directTextLength} characters`);
        return true;
      }
      
      // Check inline text elements
      const inlineTextElements = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'SUP', 'SUB', 'MARK', 'SMALL', 'DEL', 'INS', 'Q', 'ABBR', 'CITE', 'DFN', 'LABEL'];
      if (inlineTextElements.includes(element.tagName) && directTextLength >= 2) {
        debug('Inline text element', `${element.tagName}: ${directTextLength} characters`);
        return true;
      }
      
      // Check table cell elements
      if (['TD', 'TH'].includes(element.tagName) && directTextLength >= 2) {
        debug('Table cell text', `${element.tagName}: ${directTextLength} characters`);
        return true;
      }
      
      // Check list elements
      if (['LI', 'DT', 'DD'].includes(element.tagName) && directTextLength >= 2) {
        debug('List element text', `${element.tagName}: ${directTextLength} characters`);
        return true;
      }
      
      // Check form elements
      if (['BUTTON', 'TEXTAREA'].includes(element.tagName) && directTextLength >= 2) {
        debug('Form element text', `${element.tagName}: ${directTextLength} characters`);
        return true;
      }
      
      // 通用性优化：降低对DIV元素的要求
      if (element.tagName === 'DIV') {
        // 降低DIV文本长度要求
        if (directTextLength >= 5) {
          debug('Text-rich DIV', `Direct text length: ${directTextLength} characters`);
          return true;
        }
        
        // Check DIV's style to see if it looks like a text container
        if ((style.fontFamily !== 'inherit' || style.fontSize !== 'inherit' || style.color !== 'inherit') && directTextLength >= 2) {
          debug('Style similar to text container DIV', `${element.tagName}: ${directTextLength} characters`);
          return true;
        }
        
        debug('Regular DIV does not meet text requirements', `Direct text length: ${directTextLength} characters`);
        return false;
      }
      
      // 通用性增强：对于其他元素，如果有直接的文本内容且有一定长度，也视为文本元素
      if (directTextLength >= 3) {
        debug('Other element with direct text', `${element.tagName}: ${directTextLength} characters`);
        return true;
      }
      
      // By default, if it doesn't meet any of the above conditions, it's not considered a text element
      debug('Does not meet any text element conditions', element.tagName);
      return false;
    } catch (err) {
      console.warn('Error in hasTextContent:', err);
      return false;
    }
  }

  /**
   * Handle mouseover event 
   * @param {Event} event - The mouse event
   */
  function handleMouseOver(event) {
    if (!isActive) return;
    
    try {
      let targetElement = event.target;
      
      // If it's a text node, use its parent element
      if (targetElement.nodeType === Node.TEXT_NODE) {
        targetElement = targetElement.parentElement;
      }
      
      // 如果目标元素为null或undefined，直接返回
      if (!targetElement) {
        return;
      }
      
      // If the cursor is at the edge of the window or in a blank area, don't display the tooltip
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // 边缘检测：减少阈值，使其在更接近边缘时仍能工作
      const edgeThreshold = 10; // 从15改为10，更接近边缘也能工作
      if (mouseX < edgeThreshold || mouseX > windowWidth - edgeThreshold || 
          mouseY < edgeThreshold || mouseY > windowHeight - edgeThreshold) {
        if (currentTarget) {
          debug('Mouse at window edge', `${mouseX},${mouseY}`);
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // 改进：只在明确无文本时隐藏，更宽容的检测
      if (targetElement === document.documentElement || targetElement === document.body) {
        // 检查鼠标位置下是否有其他元素
        const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
        if (elementUnderPoint && elementUnderPoint !== document.documentElement && 
            elementUnderPoint !== document.body && elementUnderPoint !== targetElement) {
          // 如果有其他元素，使用它而不是document/body
          targetElement = elementUnderPoint;
        } else {
          if (currentTarget) {
            debug('Mouse over root/body element', targetElement.tagName);
            currentTarget = null;
            hideTooltip(tooltip);
          }
          return;
        }
      }
      
      // 改进：更可靠的elementFromPoint检查
      try {
        const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
        // 对于空白区域的更可靠检测
        if (elementUnderPoint !== targetElement) {
          // 如果实际元素和事件目标不同，但都有效且不是body/html
          if (elementUnderPoint && elementUnderPoint !== document.documentElement && 
              elementUnderPoint !== document.body) {
            // 使用实际元素
            targetElement = elementUnderPoint;
          } 
          // 如果元素是body/html（可能是空白区域）
          else if (elementUnderPoint === document.documentElement || 
                  elementUnderPoint === document.body) {
            if (currentTarget) {
              debug('Mouse in blank area', `${elementUnderPoint?.tagName} vs ${targetElement.tagName}`);
              currentTarget = null;
              hideTooltip(tooltip);
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Error checking elementFromPoint:', err);
        // 如果elementFromPoint失败，继续使用原始targetElement
      }
      
      // 改进：使用try-catch包裹hasTextContent调用，防止意外错误
      let hasText = false;
      try {
        hasText = targetElement && targetElement.nodeType === Node.ELEMENT_NODE && 
                  hasTextContent(targetElement);
      } catch (err) {
        console.warn('Error in hasTextContent:', err);
        hasText = false;
      }
      
      // 仅处理包含文本的元素节点
      if (hasText) {
        debug('Mouse hovering over text element', targetElement.tagName);
        currentTarget = targetElement;
        
        // 使用requestAnimationFrame确保平滑显示
        try {
          requestUpdate(() => {
            showTooltip(event, tooltip);
          });
        } catch (err) {
          console.warn('Error in requestUpdate/showTooltip:', err);
          // 直接尝试显示tooltip
          showTooltip(event, tooltip);
        }
      } else {
        // 非文本元素，隐藏tooltip
        debug('Mouse hovering over non-text element', targetElement?.tagName);
        currentTarget = null;
        hideTooltip(tooltip);
      }
    } catch (err) {
      console.error('Error in handleMouseOver:', err);
      // 发生错误时重置状态
      currentTarget = null;
      try {
        hideTooltip(tooltip);
      } catch (err2) {
        console.warn('Error hiding tooltip after error:', err2);
      }
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
    
    try {
      let targetElement = event.target;
      
      // If it's a text node, use its parent element
      if (targetElement.nodeType === Node.TEXT_NODE) {
        targetElement = targetElement.parentElement;
      }
      
      // 如果目标元素为null或undefined，直接返回
      if (!targetElement) {
        return;
      }
      
      // If the cursor is at the edge of the window or in a blank area, hide the tooltip
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // 边缘检测：减少阈值，使其在更接近边缘时仍能工作
      const edgeThreshold = 10; // 从15改为10，更接近边缘也能工作
      if (mouseX < edgeThreshold || mouseX > windowWidth - edgeThreshold || 
          mouseY < edgeThreshold || mouseY > windowHeight - edgeThreshold) {
        if (currentTarget) {
          debug('Mouse at window edge', `${mouseX},${mouseY}`);
          currentTarget = null;
          hideTooltip(tooltip);
        }
        return;
      }
      
      // 改进：只在明确无文本时隐藏，更宽容的检测
      if (targetElement === document.documentElement || targetElement === document.body) {
        // 检查鼠标位置下是否有其他元素
        const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
        if (elementUnderPoint && elementUnderPoint !== document.documentElement && 
            elementUnderPoint !== document.body && elementUnderPoint !== targetElement) {
          // 如果有其他元素，使用它而不是document/body
          targetElement = elementUnderPoint;
        } else {
          if (currentTarget) {
            debug('Mouse over root/body element', targetElement.tagName);
            currentTarget = null;
            hideTooltip(tooltip);
          }
          return;
        }
      }
      
      // 改进：更可靠的elementFromPoint检查
      try {
        const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
        // 对于空白区域的更可靠检测
        if (elementUnderPoint !== targetElement) {
          // 如果实际元素和事件目标不同，但都有效且不是body/html
          if (elementUnderPoint && elementUnderPoint !== document.documentElement && 
              elementUnderPoint !== document.body) {
            // 使用实际元素
            targetElement = elementUnderPoint;
          } 
          // 如果元素是body/html（可能是空白区域）
          else if (elementUnderPoint === document.documentElement || 
                  elementUnderPoint === document.body) {
            if (currentTarget) {
              debug('Mouse in blank area', `${elementUnderPoint?.tagName} vs ${targetElement.tagName}`);
              currentTarget = null;
              hideTooltip(tooltip);
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Error checking elementFromPoint:', err);
        // 如果elementFromPoint失败，继续使用原始targetElement
      }
      
      // 改进：使用try-catch包裹hasTextContent调用，防止意外错误
      let hasText = false;
      try {
        hasText = targetElement && targetElement.nodeType === Node.ELEMENT_NODE && 
                 hasTextContent(targetElement);
      } catch (err) {
        console.warn('Error in hasTextContent:', err);
        hasText = false;
      }
      
      // 仅处理包含文本的元素节点
      if (hasText) {
        // Update current target
        if (currentTarget !== targetElement) {
          debug('Set new target element', targetElement.tagName);
          currentTarget = targetElement;
        }
        
        // 使用requestAnimationFrame确保平滑显示
        try {
          requestUpdate(() => {
            showTooltip(event, tooltip);
          });
        } catch (err) {
          console.warn('Error in requestUpdate/showTooltip:', err);
          // 直接尝试显示tooltip
          showTooltip(event, tooltip);
        }
      } else if (currentTarget) {
        // 非文本元素，隐藏tooltip
        debug('Mouse not on text', targetElement?.tagName);
        currentTarget = null;
        hideTooltip(tooltip);
      }
    } catch (err) {
      console.error('Error in handleMouseMove:', err);
      // 发生错误时重置状态
      currentTarget = null;
      try {
        hideTooltip(tooltip);
      } catch (err2) {
        console.warn('Error hiding tooltip after error:', err2);
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