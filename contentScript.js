function injectCSS() {

  const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');";

  const css = `
    #fontInfoTooltip {
      background-color: rgba(30, 30, 30, 0.8); /* 修改背景色和透明度 */
      backdrop-filter: blur(50px); /* 添加背景模糊 */ 
      border: 1px solid #2F2F2F; /* 添加 1px border */
      background-color: rgba(30, 30, 30, 0.8);  
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

    #fontInfoTooltip a {
      text-decoration: none;
      color: inherit;
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
  tooltip.style.position = 'fixed'; // 改为 fixed 定位
  tooltip.style.display = 'none';
  tooltip.style.zIndex = '1000000';
  // 添加到 <html> 元素下
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
    </>`;

  tooltip.style.display = 'block';
  tooltip.style.left = event.pageX + 10 + 'px';
  tooltip.style.top = event.pageY + 10 + 'px';

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


// 增强插件的反应速度
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleExtension') {
    isActive = !isActive;
    if (isActive) {
      initialize();
    } else {
      deinitialize();
    }
  }
});

function initialize() {
  injectCSS();
  tooltip = createTooltip();
  document.addEventListener('keydown', handleKeyDown);
  addMouseListeners(); // 添加鼠标事件监听器
}

function deinitialize() {
  document.removeEventListener('keydown', handleKeyDown);
  removeMouseListeners(); // 移除鼠标事件监听器
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}

// 将这两个函数移到文件底部
function addMouseListeners() {
  document.addEventListener('mouseover', (event) => {
    if (isActive) {
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

// 鼠标移动事件监听在 document 上
document.addEventListener('mousemove', (event) => {
  if (!isActive || currentTarget && event.target !== currentTarget) return;
  showTooltip(event, tooltip);
  tooltip.style.left = event.pageX + 10 + 'px';
  tooltip.style.top = event.pageY + 10 + 'px';
});
}

// 移除鼠标悬停和离开事件监听器
function removeMouseListeners() {
  document.removeEventListener('mouseover', showTooltip);
  document.removeEventListener('mouseout', hideTooltip);
}