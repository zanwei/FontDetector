chrome.action.onClicked.addListener((tab) => {
  toggleExtension(tab);
});

function toggleExtension(tab) {
  chrome.tabs.sendMessage(tab.id, { action: 'toggleExtension' }); 
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle_font_detector') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      toggleExtension(tabs[0]);
    });
  }
});


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