const TOGGLE_ACTION = 'toggleExtension';
const TOGGLE_COMMAND = 'toggle_font_detector';

chrome.action.onClicked.addListener((tab) => {
  if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
    toggleExtension(tab);
  } else {
    console.error('扩展不能在此页面上运行');
  }
});

async function toggleExtension(tab) {
  if (!tab || !tab.id) {
    console.error('无效的标签页');
    return;
  }

  try {
    // 注入内容脚本
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentScript.js']
    });

    // 添加延迟
    await new Promise(resolve => setTimeout(resolve, 100));

    // 发送消息
    chrome.tabs.sendMessage(tab.id, { action: TOGGLE_ACTION }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('发送消息时出错:', chrome.runtime.lastError.message);
      } else {
        console.log('消息发送成功', response);
      }
    });
  } catch (error) {
    console.error('执行脚本或发送消息时发生异常:', error.message);
  }
}

// 检查内容脚本是否已加载
async function checkContentScriptLoaded(tabId) {
  try {
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'checkContentScriptLoaded' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ loaded: false });
        } else {
          resolve(response || { loaded: false });
        }
      });
    });
    return response.loaded === true;
  } catch (error) {
    console.error('检查内容脚本加载状态时出错:', error);
    return false;
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === TOGGLE_COMMAND) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) toggleExtension(tab);
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url.indexOf('http') === 0) {
    checkContentScriptLoaded(tabId).then(isLoaded => {
      if (!isLoaded) {
        console.log('标签页更新后内容脚本未加载，正在注入...');
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['contentScript.js']
        });
      }
    });
  }
});

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'searchFontFamily') {
    const fontFamily = request.fontFamily;
    const formattedFontFamily = fontFamily.replace(/['"]/g, '').split(',')[0].trim();
    
    const url = `https://www.google.com/search?q=${encodeURIComponent(formattedFontFamily + ' font')}`;
    chrome.tabs.create({ url });
  } else if (request.action === 'deactivateExtension') {
    // 如果需要在后台响应停用扩展的请求
    console.log('收到扩展停用请求');
    // 可以在这里执行其他相关操作
  }
});