(function() {
  const TOGGLE_ACTION = 'toggleExtension';
  let isActive = false;
  let currentTarget;
  let tooltip; // 定义 tooltip 变量
  let fixedTooltips = []; // 存储固定的tooltips

  // 颜色转换工具函数
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // RGB转LCH
  function rgbToLCH(r, g, b) {
    // 首先转为sRGB
    r /= 255;
    g /= 255;
    b /= 255;
    
    // 转为XYZ
    let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    
    // XYZ到Lab
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
    
    // Lab到LCh
    const c = Math.sqrt(a * a + b2 * b2);
    let h = Math.atan2(b2, a) * (180 / Math.PI);
    if (h < 0) h += 360;
    
    return {
      l: Math.round(l),
      c: Math.round(c),
      h: Math.round(h)
    };
  }
  
  // RGB转HCL (HCL是LCH的另一种表示方式)
  function rgbToHCL(r, g, b) {
    const lch = rgbToLCH(r, g, b);
    return {
      h: lch.h,
      c: lch.c,
      l: lch.l
    };
  }

  function getColorFromElement(element) {
    const style = getComputedStyle(element);
    const color = style.color;
    
    // 解析RGB颜色
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      
      // 转换为各种格式
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
    
    return null;
  }

  function toggleExtension() {
    isActive = !isActive;
    if (isActive) {
      initializeDetector();
    } else {
      deinitializeDetector();
    }
  }

  function initializeDetector() {
    injectCSS();
    tooltip = createTooltip(); // 调用 createTooltip 函数并赋值给 tooltip
    document.addEventListener('keydown', handleKeyDown);
    addMouseListeners();
    addSelectionListener(); // 添加文本选择监听器
    console.log('字体检测器已初始化');
  }

  function deinitializeDetector() {
    document.removeEventListener('keydown', handleKeyDown);
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    // 移除所有固定的tooltips
    removeAllFixedTooltips();
    removeMouseListeners();
    removeSelectionListener(); // 移除文本选择监听器
    console.log('字体检测器已停用');
  }

  // 移除所有固定的tooltips
  function removeAllFixedTooltips() {
    fixedTooltips.forEach(t => {
      if (t && t.parentNode) {
        t.remove();
      }
    });
    fixedTooltips = [];
  }

  function injectCSS() {
    const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');";

    const css = `
      .font-detector {
        color: #A8A8A8;
      }

      .font-detector span {
        color: #fff;
      }

      #fontInfoTooltip, .fixed-tooltip {
        backdrop-filter: blur(50px); /* 添加背景模糊 */ 
        border: 1px solid #2F2F2F; /* 添加 1px border */
        background-color: rgba(30, 30, 30, 0.7);  
        font-family: 'Poppins', Arial, sans-serif;
        padding: 16px 16px; /* 调整上 Padding */
        border-radius: 16px;
        width: 250px; /* 设置宽度 */
        word-wrap: break-word; /* 自动折行 */
        position: relative; /* 为关闭按钮定位 */
      }

      #fontInfoTooltip h1, .fixed-tooltip h1 {
        display: none; /* 移除 Font Information */
      }
    
      #fontInfoTooltip div, .fixed-tooltip div {
        display: flex;
        flex-direction: column; /* 修改:使标题和内容垂直排列 */
        color: #A8A8A8;
        font-size: 12px; /* 保持原有的标题字体大小 */
        margin-bottom: 10px;
      }
    
      #fontInfoTooltip div span, .fixed-tooltip div span {
        color: #FFFFFF;
        font-size: 14px; /* 修改:内容的字体大小 */
        margin-left: 0px; /* 修改:移除标题和内容之间的间距 */
        font-weight: 500; /* 修改:字体内容信息的字体为 medium */
      }

      #fontInfoTooltip a, .fixed-tooltip a {
        text-decoration: none;
        color: inherit;
      }

      .color-preview {
        width: 10px;
        height: 10px;
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
        z-index: 1000000;
      }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function createTooltip() {
    const tooltip = document.createElement('div'); 
    tooltip.classList.add('font-detector');
    tooltip.setAttribute('id', 'fontInfoTooltip');
    tooltip.style.position = 'absolute'; 
    tooltip.style.display = 'none';
    tooltip.style.zIndex = '1000000';
    document.documentElement.appendChild(tooltip); 
    return tooltip;
  }

  // 创建固定的tooltip
  function createFixedTooltip(event, element) {
    const fixedTooltip = document.createElement('div');
    fixedTooltip.classList.add('font-detector', 'fixed-tooltip');
    
    // 计算位置 - 放在选中文本的下方
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    fixedTooltip.style.left = (window.pageXOffset + rect.left) + 'px';
    fixedTooltip.style.top = (window.pageYOffset + rect.bottom + 10) + 'px';
    
    // 填充内容
    populateTooltipContent(fixedTooltip, element);
    
    // 添加关闭按钮
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

  // 填充tooltip内容
  function populateTooltipContent(tooltipElement, element) {
    const style = getComputedStyle(element);
    const fontFamily = style.fontFamily;
    const fontSize = style.fontSize;
    const letterSpacing = style.letterSpacing;
    const lineHeight = style.lineHeight;
    const textAlign = style.textAlign;
    const fontWeight = style.fontWeight;
    
    // 获取颜色信息
    const colorInfo = getColorFromElement(element);

    tooltipElement.innerHTML = `
      <div>Font family <a href="#" class="fontFamilyLink" data-font="${fontFamily}"><span>${fontFamily}</span></a></div>
      <div>Font weight <span>${fontWeight}</span></div>
      <div>Font size <span>${fontSize}</span></div>
      <div>Letter Spacing <span>${letterSpacing}</span></div>
      <div>Line height <span>${lineHeight}</span></div>
      <div>Text alignment <span>${textAlign}</span></div>
    `;
    
    // 添加颜色信息
    if (colorInfo) {
      tooltipElement.innerHTML += `
        <div>Color <span class="color-value-container">
          <span class="color-preview" style="background-color: ${colorInfo.hex}"></span>${colorInfo.hex}
        </span></div>
        <div>LCH <span>${colorInfo.lch}</span></div>
        <div>HCL <span>${colorInfo.hcl}</span></div>
      `;
    }

    // 添加字体链接点击事件
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

  function showTooltip(event, tooltip) {
    const element = event.target;
    
    tooltip.style.display = 'block';
    tooltip.style.opacity = '1';
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';
    
    populateTooltipContent(tooltip, element);
  }

  function hideTooltip(tooltip) {
    tooltip.style.transition = ''; /* 恢复过渡 */  
    tooltip.style.opacity = '0';
    tooltip.style.display = 'none';
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && isActive) {
      hideTooltip(tooltip);
      removeAllFixedTooltips();
      isActive = false;
      chrome.runtime.sendMessage({ action: 'deactivateExtension' });
    }
  }

  // 添加文本选择监听器
  function addSelectionListener() {
    document.addEventListener('mouseup', handleTextSelection);
  }

  // 移除文本选择监听器
  function removeSelectionListener() {
    document.removeEventListener('mouseup', handleTextSelection);
  }

  // 处理文本选择事件
  function handleTextSelection(event) {
    if (!isActive) return;
    
    const selection = window.getSelection();
    if (selection.toString().trim().length > 0) {
      // 有文本被选中，创建固定tooltip
      createFixedTooltip(event, event.target);
    }
  }

  function addMouseListeners() {
    document.addEventListener('mouseover', (event) => {
      if (isActive && event.target.nodeType === Node.ELEMENT_NODE) {
        currentTarget = event.target;
        showTooltip(event, tooltip);
      }
    });

    document.addEventListener('mouseout', (event) => {
      if (isActive) {
        currentTarget = null;
        hideTooltip(tooltip);
      }
    });

    document.addEventListener('mousemove', (event) => {
      if (!isActive || (currentTarget && event.target !== currentTarget)) return;
      showTooltip(event, tooltip);
      tooltip.style.left = event.pageX + 10 + 'px';
      tooltip.style.top = event.pageY + 10 + 'px';
    });
  }

  function removeMouseListeners() {
    document.removeEventListener('mouseover', showTooltip);
    document.removeEventListener('mouseout', hideTooltip);
  }

  // 替换 $(document).on('DOMNodeInserted', handler) 的用法
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          // 处理新插入的节点
        });
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === TOGGLE_ACTION) {
      toggleExtension();
      sendResponse({ success: true });
    } else if (request.action === 'checkContentScriptLoaded') {
      sendResponse({ loaded: true });
    }
    return true; // 保持消息通道开放
  });

  async function someAsyncOperation() {
    try {
      // 您的异步操作
    } catch (error) {
      console.error('异步操作失败:', error);
    }
  }
})();