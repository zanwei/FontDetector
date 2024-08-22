(function() {
  const TOGGLE_ACTION = 'toggleExtension';
  let isActive = false;
  let currentTarget;
  let tooltip; // 定义 tooltip 变量

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
    console.log('字体检测器已初始化');
  }

  function deinitializeDetector() {
    document.removeEventListener('keydown', handleKeyDown);
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
    removeMouseListeners();
    console.log('字体检测器已停用');
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

      #fontInfoTooltip {
        backdrop-filter: blur(50px); /* 添加背景模糊 */ 
        border: 1px solid #2F2F2F; /* 添加 1px border */
        background-color: rgba(30, 30, 30, 0.7);  
        font-family: 'Poppins', Arial, sans-serif;
        padding: 16px 16px; /* 调整上 Padding */
        border-radius: 16px;
        width: 250px; /* 设置宽度 */
        word-wrap: break-word; /* 自动折行 */
      }

      #fontInfoTooltip h1 {
        display: none; /* 移除 Font Information */
      }
    
      #fontInfoTooltip div {
        display: flex;
        flex-direction: column; /* 修改:使标题和内容垂直排列 */
        color: #A8A8A8;
        font-size: 14px; /* 保持原有的标题字体大小 */
        margin-bottom: 10px;
      }
    
      #fontInfoTooltip div span {
        color: #FFFFFF;
        font-size: 15px; /* 修改:内容的字体大小 */
        margin-left: 0px; /* 修改:移除标题和内容之间的间距 */
        font-weight: 500; /* 修改:字体内容信息的字体为 medium */
      }

      #fontInfoTooltip a {
        text-decoration: none;
        color: inherit;
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

  function showTooltip(event, tooltip) {
    const element = event.target;
    const style = getComputedStyle(element);
    const fontFamily = style.fontFamily;
    const fontSize = style.fontSize;
    const letterSpacing = style.letterSpacing;
    const lineHeight = style.lineHeight;
    const textAlign = style.textAlign;
    const fontWeight = style.fontWeight;

    tooltip.style.display = 'block';
    tooltip.style.opacity = '1';
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';

    tooltip.innerHTML = `
      <div>Font family <a href="#" id="fontFamilyLink"><span>${fontFamily}</span></a></div>
      <div>Font weight <span>${fontWeight}</span></div>
      <div>Font size <span>${fontSize}</span></div>
      <div>Letter Spacing <span>${letterSpacing}</span></div>
      <div>Line height <span>${lineHeight}</span></div>
      <div>Text alignment <span>${textAlign}</span></div>
    `;

    const fontFamilyLink = tooltip.querySelector('#fontFamilyLink');

    fontFamilyLink.addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.sendMessage({
        action: 'searchFontFamily',
        fontFamily: fontFamily
      });
    });
  }

  function hideTooltip(tooltip) {
    tooltip.style.transition = ''; /* 恢复过渡 */  
    tooltip.style.opacity = '0';
    tooltip.style.display = 'none';
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && isActive) {
      hideTooltip(tooltip);
      isActive = false;
      chrome.runtime.sendMessage({ action: 'deactivateExtension' });
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
      if (!isActive || currentTarget && event.target !== currentTarget) return;
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