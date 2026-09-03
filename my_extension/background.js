// Service worker: toolbar icon toggles the sticky widget, and we expose
// chrome.storage.session to content scripts (for "hide for this session").

function grantSessionAccess() {
  try {
    chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
  } catch (e) {
    /* older Chrome without setAccessLevel — content script falls back */
  }
}

chrome.runtime.onInstalled.addListener(grantSessionAccess);
chrome.runtime.onStartup.addListener(grantSessionAccess);

// Clicking the toolbar icon toggles (and un-hides) the widget on the page.
chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;

  chrome.tabs.sendMessage(tab.id, { action: "toggleWidget" }, () => {
    if (chrome.runtime.lastError) {
      // Content script not present yet (e.g. page loaded before install) —
      // inject it, then toggle.
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["network.js", "content.js"] },
        () => {
          if (chrome.runtime.lastError) return; // restricted page
          chrome.tabs.sendMessage(tab.id, { action: "toggleWidget" }, () => {
            void chrome.runtime.lastError;
          });
        },
      );
    }
  });
});
