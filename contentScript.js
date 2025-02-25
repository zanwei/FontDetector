(function() {
  const TOGGLE_ACTION = 'toggleExtension';
  let isActive = false;
  let currentTarget;
  let tooltip; // tooltip element
  let fixedTooltips = []; // array of fixed tooltips
  let animationFrameId; // for requestAnimationFrame
  let lastTooltipContent = ''; // cache tooltip content

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
      
      // 创建临时元素来解析任何格式的颜色
      const tempEl = document.createElement('div');
      tempEl.style.color = color;
      tempEl.style.display = 'none';
      document.body.appendChild(tempEl);
      
      // 获取计算后的颜色值（浏览器会将各种格式转换为rgb或rgba）
      const computedColor = getComputedStyle(tempEl).color;
      document.body.removeChild(tempEl);
      
      // 解析 RGB 或 RGBA 颜色
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
    } else {
      deinitializeDetector();
    }
  }

  /**
   * Debug function to log information about the current state
   * @param {string} message - Debug message
   * @param {any} data - Debug data
   */
  function debug(message, data) {
    // 用户可以通过设置 localStorage.fontDetectorDebug = 'true' 来开启调试
    // 或者直接运行 window.fontDetectorDebug = true;
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
   */
  function deinitializeDetector() {
    document.removeEventListener('keydown', handleKeyDown);
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    removeAllFixedTooltips();
    removeMouseListeners();
    removeSelectionListener();
    
    // Cancel any pending animation frame
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    console.log('Font detector deactivated');
  }

  /**
   * Remove all fixed tooltips
   */
  function removeAllFixedTooltips() {
    fixedTooltips.forEach(t => {
      if (t && t.parentNode) {
        t.remove();
      }
    });
    fixedTooltips = [];
  }

  /**
   * Inject CSS styles for the font detector
   */
  function injectCSS() {
    const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');";

    const css = `
      .font-detector {
        color: #A8A8A8;
        z-index: 2147483647 !important; /* 最高的z-index */
      }

      .font-detector span {
        color: #fff;
      }

      #fontInfoTooltip, .fixed-tooltip {
        backdrop-filter: blur(50px); /* Background blur */ 
        border: 1px solid #2F2F2F; /* 1px border */
        background-color: rgba(30, 30, 30, 0.85);  
        font-family: 'Poppins', Arial, sans-serif;
        padding: 16px 16px; /* Adjust padding */
        border-radius: 16px;
        width: 250px; /* Set width */
        word-wrap: break-word; /* Automatic line break */
        position: relative; /* For close button positioning */
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
        top: 10px;
        right: 10px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background-color: rgba(60, 60, 60, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .close-button:hover {
        background-color: rgba(80, 80, 80, 0.9);
      }

      .close-button:before, .close-button:after {
        content: '';
        position: absolute;
        width: 12px;
        height: 2px;
        background-color: #FFFFFF;
      }

      .close-button:before {
        transform: rotate(45deg);
      }

      .close-button:after {
        transform: rotate(-45deg);
      }

      .fixed-tooltip {
        position: absolute;
        z-index: 2147483647 !important;
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
    // 如果已有tooltip，先移除
    const existingTooltip = document.getElementById('fontInfoTooltip');
    if (existingTooltip) {
      existingTooltip.remove();
    }
    
    const tooltip = document.createElement('div'); 
    tooltip.classList.add('font-detector');
    tooltip.setAttribute('id', 'fontInfoTooltip');
    tooltip.style.position = 'fixed'; // 使用fixed定位
    tooltip.style.display = 'none';
    tooltip.style.zIndex = '2147483647'; // 最高的z-index
    tooltip.style.pointerEvents = 'none'; // 不阻挡鼠标事件
    
    // 确保添加到body而不是documentElement，更可靠
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
    const fixedTooltip = document.createElement('div');
    fixedTooltip.classList.add('font-detector', 'fixed-tooltip');
    
    // Calculate position - place below the selected text
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    fixedTooltip.style.left = (window.pageXOffset + rect.left) + 'px';
    fixedTooltip.style.top = (window.pageYOffset + rect.bottom + 10) + 'px';
    
    // Fill content
    populateTooltipContent(fixedTooltip, element);
    
    // Add close button
    const closeButton = document.createElement('div');
    closeButton.classList.add('close-button');
    closeButton.addEventListener('click', () => {
      fixedTooltip.remove();
      fixedTooltips = fixedTooltips.filter(t => t !== fixedTooltip);
    });
    fixedTooltip.appendChild(closeButton);
    
    document.documentElement.appendChild(fixedTooltip);
    fixedTooltips.push(fixedTooltip);
    
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
        <div>Color <span class="color-value-container">
          <span class="color-preview" style="background-color: ${colorInfo.hex}"></span>${colorInfo.hex}
        </span></div>
        <div>LCH <span>${colorInfo.lch}</span></div>
        <div>HCL <span>${colorInfo.hcl}</span></div>
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
        
        // Add font link click event after content update
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
      hideTooltip(tooltip);
      removeAllFixedTooltips();
      isActive = false;
      chrome.runtime.sendMessage({ action: TOGGLE_ACTION });
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
    
    const selection = window.getSelection();
    if (selection.toString().trim().length > 0) {
      // Get the element to extract font info from
      let element = event.target;
      if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement;
      }
      
      // Only proceed if we have a valid element
      if (element && element.nodeType === Node.ELEMENT_NODE) {
        // Remove any existing fixed tooltips first
        removeAllFixedTooltips();
        
        // Text is selected, create fixed tooltip
        createFixedTooltip(event, element);
      }
    }
  }

  /**
   * Check if an element contains text or is a text-containing element
   * @param {Element} element - The element to check
   * @returns {boolean} - True if the element contains text
   */
  function hasTextContent(element) {
    // 检查元素是否为空
    if (!element) {
      debug('元素为空', null);
      return false;
    }
    
    // 扩展非文本标签列表 - 增加了更多不应显示工具提示的标签
    const nonTextTags = [
      'HTML', 'BODY', 'SCRIPT', 'STYLE', 'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 
      'OBJECT', 'EMBED', 'NAV', 'UL', 'OL', 'HR', 'BR', 'WBR', 'NOSCRIPT', 'INPUT', 'SELECT', 'OPTION', 
      'OPTGROUP', 'DATALIST', 'OUTPUT', 'MENU', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'MAP', 'AREA', 
      'SOURCE', 'TRACK', 'META', 'LINK', 'BASE', 'PARAM', 'PROGRESS', 'METER', 'TIME', 'HEADER', 
      'FOOTER', 'MAIN', 'SECTION', 'ARTICLE', 'DIALOG', 'DETAILS', 'SUMMARY', 'PICTURE', 'TEMPLATE'
    ];
    
    if (nonTextTags.includes(element.tagName)) {
      debug('非文本标签', element.tagName);
      return false;
    }
    
    // 获取元素的文本内容（删除空格）
    const rawText = element.textContent || '';
    const text = rawText.trim();
    
    // 检查元素的计算样式
    const style = getComputedStyle(element);
    
    // 检查是否是隐藏元素
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      debug('隐藏元素', element.tagName);
      return false;
    }
    
    // 检查是否是空白元素（如只包含空格、换行等）
    if (!/\S/.test(rawText)) {
      debug('空白元素', element.tagName);
      return false;
    }
    
    // 检查元素的尺寸 - 增加最小尺寸要求
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) {
      debug('元素太小', `${element.tagName} ${rect.width}x${rect.height}`);
      return false;
    }
    
    // 检查是否在页面可见区域内
    if (rect.top > window.innerHeight || rect.bottom < 0 || 
        rect.left > window.innerWidth || rect.right < 0) {
      debug('元素在可视区域外', element.tagName);
      return false;
    }
    
    // 检查直接文本子节点（不包括子元素中的文本）
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
    
    // 更严格的文本长度要求
    if (text.length < 3) {
      debug('文本太短', `${element.tagName}: ${text}`);
      return false;
    }
    
    // 检查是否只包含特殊字符或标点符号
    const punctuationOnlyPattern = /^[\s\.,;:!?()[\]{}'"\/\\-_+=<>|&$#@%^*]+$/;
    if (punctuationOnlyPattern.test(text)) {
      debug('只包含特殊字符', `${element.tagName}: ${text}`);
      return false;
    }
    
    // 检查是否是有意义的文本内容
    // 必须包含字母、数字或中文，并且长度至少为3个字符
    const meaningfulTextPattern = /[a-zA-Z0-9\u4e00-\u9fa5]{3,}/;
    if (!meaningfulTextPattern.test(text)) {
      debug('没有包含有意义的文本', `${element.tagName}: ${text}`);
      return false;
    }
    
    // 检查是否是明确的文本元素
    const textElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE'];
    if (textElements.includes(element.tagName) && directTextLength >= 3) {
      debug('明确的文本元素', `${element.tagName}: ${directTextLength} 字符`);
      return true;
    }
    
    // 检查内联文本元素
    const inlineTextElements = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'SUP', 'SUB', 'MARK', 'SMALL', 'DEL', 'INS', 'Q', 'ABBR', 'CITE', 'DFN', 'LABEL'];
    if (inlineTextElements.includes(element.tagName) && directTextLength >= 3) {
      debug('内联文本元素', `${element.tagName}: ${directTextLength} 字符`);
      return true;
    }
    
    // 检查表格单元格元素
    if (['TD', 'TH'].includes(element.tagName) && directTextLength >= 3) {
      debug('表格单元格文本', `${element.tagName}: ${directTextLength} 字符`);
      return true;
    }
    
    // 检查列表元素
    if (['LI', 'DT', 'DD'].includes(element.tagName) && directTextLength >= 3) {
      debug('列表元素文本', `${element.tagName}: ${directTextLength} 字符`);
      return true;
    }
    
    // 检查表单元素
    if (['BUTTON', 'TEXTAREA'].includes(element.tagName) && directTextLength >= 3) {
      debug('表单元素文本', `${element.tagName}: ${directTextLength} 字符`);
      return true;
    }
    
    // 针对DIV元素的额外检查 - 更严格的要求
    if (element.tagName === 'DIV') {
      // 只有包含大量文本（至少20个字符）的DIV才能被接受
      if (directTextLength >= 20) {
        debug('文本丰富的DIV', `直接文本长度: ${directTextLength} 字符`);
        return true;
      }
      
      // 检查DIV的样式，看它是否像一个文本容器
      if (style.fontFamily !== 'inherit' && style.textAlign !== 'start' && directTextLength >= 5) {
        debug('样式类似文本容器的DIV', `${element.tagName}: ${directTextLength} 字符`);
        return true;
      }
      
      debug('普通DIV不满足文本要求', `直接文本长度: ${directTextLength} 字符`);
      return false;
    }
    
    // 默认情况下，如果不满足以上任何条件，则认为不是文本元素
    debug('不满足任何文本元素条件', element.tagName);
    return false;
  }

  /**
   * Handle mouseover event 
   * @param {Event} event - The mouse event
   */
  function handleMouseOver(event) {
    if (!isActive) return;
    
    let targetElement = event.target;
    
    // 如果是文本节点，使用其父元素
    if (targetElement.nodeType === Node.TEXT_NODE) {
      targetElement = targetElement.parentElement;
    }
    
    // 如果当前在窗口边缘或是空白区域，不显示工具提示
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 检查鼠标是否在窗口边缘
    const edgeThreshold = 15; // 边缘阈值（像素）
    if (mouseX < edgeThreshold || mouseX > windowWidth - edgeThreshold || 
        mouseY < edgeThreshold || mouseY > windowHeight - edgeThreshold) {
      if (currentTarget) {
        debug('鼠标在窗口边缘', `${mouseX},${mouseY}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // 检查目标元素是否是文档的根元素或正文元素（可能是空白区域）
    if (targetElement === document.documentElement || targetElement === document.body) {
      if (currentTarget) {
        debug('鼠标在根元素上', targetElement.tagName);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // 检查是否是空白区域（例如大的容器元素的空白部分）
    const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
    if (elementUnderPoint !== targetElement && 
        (elementUnderPoint === document.documentElement || elementUnderPoint === document.body)) {
      if (currentTarget) {
        debug('鼠标在空白区域', `${elementUnderPoint?.tagName} vs ${targetElement.tagName}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // 只处理包含文本的元素节点
    if (targetElement && targetElement.nodeType === Node.ELEMENT_NODE && hasTextContent(targetElement)) {
      debug('鼠标悬停在文本元素上', targetElement.tagName);
      currentTarget = targetElement;
      
      // 使用 requestAnimationFrame 确保平滑显示
      requestUpdate(() => {
        showTooltip(event, tooltip);
      });
    } else {
      // 不是文本元素，隐藏 tooltip
      debug('鼠标悬停在非文本元素上', targetElement?.tagName);
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
    
    // 检查是否真的离开了元素（不是移入子元素）
    let relatedTarget = event.relatedTarget;
    while (relatedTarget) {
      if (relatedTarget === event.target) {
        // 如果相关目标是当前目标的子元素，不做任何操作
        return;
      }
      relatedTarget = relatedTarget.parentElement;
    }
    
    // 真正离开了元素
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
    
    // 如果是文本节点，使用其父元素
    if (targetElement.nodeType === Node.TEXT_NODE) {
      targetElement = targetElement.parentElement;
    }
    
    // 如果当前在窗口边缘或是空白区域，隐藏工具提示
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 检查鼠标是否在窗口边缘
    const edgeThreshold = 15; // 边缘阈值（像素）
    if (mouseX < edgeThreshold || mouseX > windowWidth - edgeThreshold || 
        mouseY < edgeThreshold || mouseY > windowHeight - edgeThreshold) {
      if (currentTarget) {
        debug('鼠标在窗口边缘', `${mouseX},${mouseY}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // 检查目标元素是否是文档的根元素或正文元素（可能是空白区域）
    if (targetElement === document.documentElement || targetElement === document.body) {
      if (currentTarget) {
        debug('鼠标在根元素上', targetElement.tagName);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // 检查是否是空白区域（例如大的容器元素的空白部分）
    const elementUnderPoint = document.elementFromPoint(mouseX, mouseY);
    if (elementUnderPoint !== targetElement && 
        (elementUnderPoint === document.documentElement || elementUnderPoint === document.body)) {
      if (currentTarget) {
        debug('鼠标在空白区域', `${elementUnderPoint?.tagName} vs ${targetElement.tagName}`);
        currentTarget = null;
        hideTooltip(tooltip);
      }
      return;
    }
    
    // 确保有有效元素且包含文本
    if (targetElement && targetElement.nodeType === Node.ELEMENT_NODE && hasTextContent(targetElement)) {
      // 更新当前目标
      if (currentTarget !== targetElement) {
        debug('设置新目标元素', targetElement.tagName);
        currentTarget = targetElement;
      }
      
      // 使用 requestAnimationFrame 确保平滑动画
      requestUpdate(() => {
      showTooltip(event, tooltip);
      });
    } else if (currentTarget) {
      // 如果不在文本上且之前有目标，则隐藏 tooltip
      debug('鼠标不在文本上', targetElement.tagName);
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
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === TOGGLE_ACTION) {
      toggleExtension();
      sendResponse({ success: true });
    } else if (request.action === 'checkContentScriptLoaded') {
      sendResponse({ loaded: true });
    }
    return true; // Keep message channel open
  });

  // 添加调试助手到全局，方便在控制台开启
  window.fontDetectorDebug = false;
  window.toggleFontDetectorDebug = function() {
    window.fontDetectorDebug = !window.fontDetectorDebug;
    console.log(`FontDetector debug mode ${window.fontDetectorDebug ? 'enabled' : 'disabled'}`);
    return window.fontDetectorDebug;
  };
})();