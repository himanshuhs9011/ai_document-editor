// The desktop app: a locked-down window onto the AI Document Editor website, so the installer never needs updating
// for app changes. The page gets no Node.js access, cannot navigate to other sites, and only the app's own site
// may use the microphone or clipboard.
const { app, BrowserWindow, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// The site to open: APP_URL when set (for testing), otherwise app.config.json, set before building the installer.
const configured = process.env.APP_URL
  || JSON.parse(fs.readFileSync(path.join(__dirname, 'app.config.json'), 'utf8')).appUrl;
const APP_URL = new URL(configured);
const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);

const isAppPage = (url) => {
  try {
    return new URL(url).origin === APP_URL.origin;
  } catch {
    return false;
  }
};

const openOutside = (url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
};

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'AI Document Editor',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f4f2ee',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: true },
  });
  window.once('ready-to-show', () => window.show());

  // No connection or the site is down: a local page explains and offers to retry. -3 is a cancelled load, not a failure.
  window.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) window.loadFile(path.join(__dirname, 'offline.html'), { query: { url: APP_URL.href } });
  });
  window.loadURL(APP_URL.href);
}

// Every page the app opens: other sites go to the browser, never into the app window.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAppPage(url)) {
      event.preventDefault();
      openOutside(url);
    }
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(isAppPage(details.requestingUrl || contents.getURL()) && ALLOWED_PERMISSIONS.has(permission));
    });
    session.defaultSession.setPermissionCheckHandler((_contents, permission, origin) => isAppPage(origin) && ALLOWED_PERMISSIONS.has(permission));
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
