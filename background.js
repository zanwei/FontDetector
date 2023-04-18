chrome.action.onClicked.addListener((tab) => {
  toggleExtension(tab);
});

function toggleExtension(tab) {
  chrome.tabs.sendMessage(tab.id, { action: 'activateExtension' });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle_font_detector') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      toggleExtension(tabs[0]);
    });
  }
});