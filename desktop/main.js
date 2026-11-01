// The desktop app: starts the bundled backend on this PC (accounts, documents and chats live in the user's AppData
// folder), then shows the app it serves in a locked-down window. With no gatewayUrl in app.config.json it runs
// standalone: AI uses each user's own API key. With a gatewayUrl, sign-in and AI go through that online gateway.
//
// Set APP_URL to open a running web version instead (development and tests); then no backend is started.
const { app, BrowserWindow, safeStorage, session, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.config.json'), 'utf8'));
const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
const STARTUP_TIMEOUT_MS = 60_000;

// AIDOC_DATA_DIR keeps documents somewhere other than AppData (tests, or running from a USB stick).
if (process.env.AIDOC_DATA_DIR) app.setPath('userData', process.env.AIDOC_DATA_DIR);

let appOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
let backend = null;
let quitting = false;

const isAppPage = (url) => {
  try {
    return appOrigin !== null && new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
};

const openOutside = (url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
};

// Packaged: the backend and the web app ship in resources/. From source (npm start): the local build folders.
const bundled = (packagedPath, sourcePath) =>
  (app.isPackaged ? path.join(process.resourcesPath, packagedPath) : path.join(__dirname, '..', sourcePath));

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.unref();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const portFree = (port) => new Promise((resolve) => {
  const probe = net.createServer();
  probe.unref();
  probe.on('error', () => resolve(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});

// The same port every time: the browser keeps sign-in and settings per address, so a new port each start would
// sign the user out. A new one is chosen (and remembered) only when another program has taken it.
async function appPort(data) {
  const file = path.join(data, 'port.json');
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8')).port;
  } catch {
    saved = null;
  }
  if (Number.isInteger(saved) && saved > 1024 && await portFree(saved)) return saved;
  const port = await freePort();
  fs.writeFileSync(file, JSON.stringify({ port }));
  return port;
}

// The key that signs sign-ins and encrypts saved API keys, made once per Windows user and kept encrypted by Windows
// (DPAPI via safeStorage). A new key every start would sign everyone out and lose their saved API keys.
function appSecret(data) {
  const file = path.join(data, 'secret.bin');
  const protect = safeStorage.isEncryptionAvailable();
  if (fs.existsSync(file)) {
    try {
      const stored = fs.readFileSync(file);
      return protect ? safeStorage.decryptString(stored) : stored.toString('utf8');
    } catch (error) {
      // Unreadable (e.g. a copied profile): start over; documents stay, users sign in again and re-add API keys.
      console.error('Could not read the app key; making a new one', error);
    }
  }
  const secret = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(file, protect ? safeStorage.encryptString(secret) : Buffer.from(secret, 'utf8'));
  return secret;
}

const healthy = (port) => new Promise((resolve) => {
  const request = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (response) => {
    response.resume();
    resolve(response.statusCode === 200);
  });
  request.on('error', () => resolve(false));
  request.on('timeout', () => { request.destroy(); resolve(false); });
});

async function startBackend() {
  const executable = bundled(path.join('backend', 'desktop-server.exe'), path.join('backend', 'dist', 'desktop-server', 'desktop-server.exe'));
  const webApp = bundled('web', path.join('frontend', 'dist-desktop'));
  const data = app.getPath('userData');
  fs.mkdirSync(path.join(data, 'logs'), { recursive: true });
  const port = await appPort(data);
  const log = fs.openSync(path.join(data, 'logs', 'backend.log'), 'a');
  // Only what the backend needs: no inherited secrets, proxies or Python settings from the user's environment.
  const env = {
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PORT: String(port),
    DATABASE_URL: `sqlite:///${path.join(data, 'documents.db')}`,
    ...(config.gatewayUrl
      ? { APP_MODE: 'local', GATEWAY_URL: config.gatewayUrl }
      : { APP_MODE: 'standalone', SECRET_KEY: appSecret(data) }),
    FRONTEND_DIR: webApp,
    MAX_UPLOAD_MB: '20',
  };
  backend = spawn(executable, [], { env, cwd: data, windowsHide: true, stdio: ['ignore', log, log] });
  backend.on('exit', () => { backend = null; });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!backend) throw new Error('The document service stopped while starting.');
    if (await healthy(port)) return `http://127.0.0.1:${port}`;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('The document service took too long to start.');
}

function stopBackend() {
  if (backend && !backend.killed) backend.kill();
  backend = null;
}

function showStatus(window, title, message, retry) {
  window.loadFile(path.join(__dirname, 'status.html'), { query: { title, message, ...(retry ? { retry: '1' } : {}) } });
}

async function openApp(window) {
  if (process.env.APP_URL) {
    window.loadURL(process.env.APP_URL);
    return;
  }
  showStatus(window, 'Starting AI Document Editor…', 'Opening your documents.');
  try {
    stopBackend();
    const url = await startBackend();
    appOrigin = new URL(url).origin;
    window.loadURL(url);
  } catch (error) {
    stopBackend();
    showStatus(window, "AI Document Editor couldn't start", `${error.message} Your documents are safe. Try again, or restart your PC if it keeps happening.`, true);
  }
}

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

  // The status page's Try again button sets #retry; nothing else on that page can reach the app.
  window.webContents.on('did-navigate-in-page', (_event, url) => {
    if (url.startsWith('file:') && url.endsWith('#retry')) openApp(window);
  });
  window.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return;
    if (process.env.APP_URL) {
      showStatus(window, "Can't reach AI Document Editor", "Check that you're online, then try again.", true);
    } else {
      showStatus(window, 'The document service stopped', 'Your documents are safe. Try again to restart it.', true);
    }
  });
  openApp(window);
}

// Every page the app opens: other sites go to the browser, never into the app window.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    // The status page is opened directly (loadFile), so no navigation ever needs to reach a file: address.
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

  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', stopBackend);
  app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin' || quitting) app.quit();
  });
}
