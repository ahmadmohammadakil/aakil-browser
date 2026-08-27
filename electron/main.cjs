const { app, BrowserWindow, WebContentsView, ipcMain, shell, session } = require("electron");
const path = require("node:path");
const isDev = !app.isPackaged && process.env.AAKIL_DEV !== "0";
const devServerUrl = process.env.ELECTRON_START_URL || "http://localhost:1420";
let mainWindow = null;
const browserViews = new Map();

function isWebUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function safeWebUrl(value) {
  if (!isWebUrl(value)) {
    throw new Error("يسمح AAKIL بصفحات HTTP وHTTPS فقط.");
  }
  return value;
}

function sendEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("aakil:browser-event", payload);
  }
}

function getView(tabId) {
  const view = browserViews.get(Number(tabId));
  if (!view || view.webContents.isDestroyed()) {
    throw new Error("التبويب غير متاح حاليًا.");
  }
  return view;
}

function getViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const [width, height] = mainWindow.getContentSize();
  return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) };
}

function hideAllViews() {
  for (const view of browserViews.values()) {
    view.setVisible(false);
  }
}

function destroyView(tabId) {
  const view = browserViews.get(Number(tabId));
  if (!view) return;
  browserViews.delete(Number(tabId));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.removeChildView(view);
  }
  if (!view.webContents.isDestroyed()) {
    view.webContents.close();
  }
}

function attachBrowserEvents(tabId, view) {
  const { webContents } = view;

  webContents.on("did-navigate", (_event, url) => {
    sendEvent({ type: "navigated", tabId, url, canGoBack: webContents.canGoBack(), canGoForward: webContents.canGoForward() });
  });

  webContents.on("did-navigate-in-page", (_event, url) => {
    sendEvent({ type: "navigated", tabId, url, canGoBack: webContents.canGoBack(), canGoForward: webContents.canGoForward() });
  });

  webContents.on("page-title-updated", (_event, title) => {
    sendEvent({ type: "title", tabId, title: title || "صفحة ويب" });
  });

  webContents.on("did-start-loading", () => {
    sendEvent({ type: "loading", tabId, loading: true });
  });

  webContents.on("did-stop-loading", () => {
    sendEvent({ type: "loading", tabId, loading: false });
  });

  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    sendEvent({ type: "error", tabId, url: validatedURL, message: errorDescription || `خطأ تحميل (${errorCode})` });
  });

  webContents.on("will-navigate", (event, url) => {
    if (!isWebUrl(url)) {
      event.preventDefault();
      sendEvent({ type: "error", tabId, url, message: "الرابط غير مدعوم. استخدم HTTP أو HTTPS." });
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) {
      void webContents.loadURL(url);
    } else {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

function createBrowserView(tabId, url) {
  const existing = browserViews.get(Number(tabId));
  if (existing) return existing;

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  });
  browserViews.set(Number(tabId), view);
  mainWindow.contentView.addChildView(view);
  view.setVisible(false);
  attachBrowserEvents(Number(tabId), view);
  void view.webContents.loadURL(safeWebUrl(url));
  return view;
}

function normalizeBounds(raw) {
  if (!raw) return null;
  return {
    x: Math.round(Number(raw.x) || 0),
    y: Math.round(Number(raw.y) || 0),
    width: Math.max(1, Math.round(Number(raw.width) || 1)),
    height: Math.max(1, Math.round(Number(raw.height) || 1)),
  };
}

async function showTab(tabId, url, bounds) {
  const normalizedTabId = Number(tabId);
  let view = browserViews.get(normalizedTabId);
  if (!view) {
    view = createBrowserView(normalizedTabId, url);
  } else if (url && view.webContents.getURL() !== url) {
    await view.webContents.loadURL(safeWebUrl(url));
  }

  hideAllViews();
  const nextBounds = normalizeBounds(bounds) || getViewBounds();
  if (nextBounds) view.setBounds(nextBounds);
  view.setVisible(true);
  view.webContents.focus();
  return { ok: true };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: "#10141d",
    title: "AAKIL",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("resize", () => {
    const bounds = getViewBounds();
    if (!bounds) return;
    for (const view of browserViews.values()) {
      if (view.getVisible()) view.setBounds(bounds);
    }
  });
  mainWindow.on("closed", () => {
    for (const view of browserViews.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    browserViews.clear();
    mainWindow = null;
  });

  if (isDev) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("aakil:show-tab", async (_event, { tabId, url, bounds }) => showTab(tabId, url, bounds));
ipcMain.handle("aakil:hide-tabs", () => {
  hideAllViews();
  return { ok: true };
});
ipcMain.handle("aakil:set-bounds", (_event, { tabId, bounds }) => {
  const view = getView(tabId);
  const nextBounds = normalizeBounds(bounds);
  if (!nextBounds) throw new Error("حدود مساحة التصفح غير صالحة.");
  view.setBounds(nextBounds);
  return { ok: true };
});
ipcMain.handle("aakil:navigate", async (_event, { tabId, url }) => {
  const view = getView(tabId);
  await view.webContents.loadURL(safeWebUrl(url));
  return { ok: true };
});
ipcMain.handle("aakil:go-back", (_event, { tabId }) => {
  const view = getView(tabId);
  if (view.webContents.canGoBack()) view.webContents.goBack();
  return { ok: true };
});
ipcMain.handle("aakil:go-forward", (_event, { tabId }) => {
  const view = getView(tabId);
  if (view.webContents.canGoForward()) view.webContents.goForward();
  return { ok: true };
});
ipcMain.handle("aakil:reload", (_event, { tabId }) => {
  const view = getView(tabId);
  view.webContents.reload();
  return { ok: true };
});
ipcMain.handle("aakil:close-tab", (_event, { tabId }) => {
  destroyView(tabId);
  return { ok: true };
});
ipcMain.handle("aakil:open-external", async (_event, { url }) => {
  if (!isWebUrl(url)) throw new Error("لا يوجد رابط ويب صالح.");
  await shell.openExternal(url);
  return { ok: true };
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
