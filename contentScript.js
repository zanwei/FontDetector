function injectCSS() {
  const css = `
    #fontInfoTooltip {
      background-color: #343434;
      font-family: 'Poppins', Arial, sans-serif;
      padding: 16px 16px; /* 调整上下 Padding */
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
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}



injectCSS();

function createTooltip() {
  const tooltip = document.createElement('div');
  tooltip.setAttribute('id', 'fontInfoTooltip');
  tooltip.style.position = 'absolute';
  tooltip.style.display = 'none';
  tooltip.style.zIndex = '99999';
  document.body.appendChild(tooltip);
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
  const fontWeight = style.fontWeight; // 获取 font-weight

  tooltip.style.display = 'block';
  tooltip.style.opacity = '1';
  tooltip.style.left = event.pageX + 10 + 'px';
  tooltip.style.top = event.pageY + 10 + 'px';

  tooltip.innerHTML = `
    <div>Font family <span>${fontFamily}</span></div>
    <div>Font weight <span>${fontWeight}</span></div>
    <div>Font size <span>${fontSize}</span></div>
    <div>Letter Spacing <span>${letterSpacing}</span></div>
    <div>Line height <span>${lineHeight}</span></div>
    <div>Text alignment <span>${textAlign}</span></div>
    </>`;

  tooltip.style.display = 'block';
  tooltip.style.left = event.pageX + 10 + 'px';
  tooltip.style.top = event.pageY + 10 + 'px';

  fontFamilyLink.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.sendMessage({
      action: 'searchFontFamily',
      fontFamily: fontFamily
    });
  });
}


function hideTooltip(tooltip) {
  tooltip.style.opacity = '0';
  tooltip.style.display = 'none';
}



let tooltip;
let isActive = false; 
let currentTarget;

function handleKeyDown(event) {
  if (event.key === 'Escape' && isActive) {
    hideTooltip(tooltip);
    isActive = false;
    // 发送关闭弹窗的消息
    chrome.runtime.sendMessage({ action: 'deactivateExtension' });
  }
}

function addMouseListeners() {
  document.addEventListener('mouseover', (event) => {
    if (!isActive || event.target === currentTarget) {
      return;
    }
    currentTarget = event.target;
    showTooltip(event, tooltip); 
  });

  

  document.addEventListener('mouseout', (event) => {
    if (!isActive) {
      return;
    }
    currentTarget = null;
    hideTooltip(tooltip);
  });

  document.addEventListener('mousemove', (event) => {
    if (!isActive) {
      return; 
    }
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';
  });
}

// 移除鼠标悬停和离开事件监听器
function removeMouseListeners() {
  document.removeEventListener('mouseover', showTooltip);
  document.removeEventListener('mouseout', hideTooltip);
}

// 修改 chrome.runtime.onMessage.addListener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'activateExtension') {
    if (!isActive) {
      isActive = true;  
      tooltip = createTooltip();
      document.addEventListener('keydown', handleKeyDown);
      addMouseListeners(); // 添加鼠标事件监听器
    }
  } else if (request.action === 'deactivateExtension') {
    if (isActive) {
      hideTooltip(tooltip);
      isActive = false;  
      document.removeEventListener('keydown', handleKeyDown);
      removeMouseListeners(); // 移除鼠标事件监听器
    }
  }
});

// ...
