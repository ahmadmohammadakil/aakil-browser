const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aakil", {
  showTab: (tabId, url) => ipcRenderer.invoke("aakil:show-tab", { tabId, url }),
  hideTabs: () => ipcRenderer.invoke("aakil:hide-tabs"),
  setBounds: (tabId, bounds) => ipcRenderer.invoke("aakil:set-bounds", { tabId, bounds }),
  navigate: (tabId, url) => ipcRenderer.invoke("aakil:navigate", { tabId, url }),
  goBack: (tabId) => ipcRenderer.invoke("aakil:go-back", { tabId }),
  goForward: (tabId) => ipcRenderer.invoke("aakil:go-forward", { tabId }),
  reload: (tabId) => ipcRenderer.invoke("aakil:reload", { tabId }),
  closeTab: (tabId) => ipcRenderer.invoke("aakil:close-tab", { tabId }),
  openExternal: (url) => ipcRenderer.invoke("aakil:open-external", { url }),
  onBrowserEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("aakil:browser-event", listener);
    return () => ipcRenderer.removeListener("aakil:browser-event", listener);
  },
});
