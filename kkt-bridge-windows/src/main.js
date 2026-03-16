const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const AtolClient = require('./atol');
const SocketManager = require('./socket');

const store = new Store();
const isDev = process.argv.includes('--dev');

let tray = null;
let settingsWindow = null;
let atol = null;
let socketManager = null;

const autoLauncher = new AutoLaunch({
  name: 'HookahPOS KKT Bridge',
  path: app.getPath('exe'),
});

// ─── Единственный экземпляр приложения ────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
  }
});

// ─── Создание окна настроек ────────────────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    title: 'HookahPOS KKT Bridge — Настройки',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (isDev) {
    settingsWindow.webContents.openDevTools({ mode: 'detach' });
  }

  settingsWindow.on('close', (e) => {
    e.preventDefault();
    settingsWindow.hide();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ─── Системный трей ────────────────────────────────────────────────────────────
function buildTrayMenu() {
  const config = store.get('config', {});
  const isConnectedToServer = socketManager?.isConnected() ?? false;
  const isKktReady = atol?.isReady() ?? false;

  const statusLabel = isConnectedToServer
    ? isKktReady
      ? '✅ Сервер: подключён | ККТ: готова'
      : '⚠️ Сервер: подключён | ККТ: нет связи'
    : '🔴 Не подключён к серверу';

  return Menu.buildFromTemplate([
    { label: 'HookahPOS KKT Bridge', enabled: false },
    { type: 'separator' },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Настройки...',
      click: () => createSettingsWindow(),
    },
    {
      label: 'Открыть папку с логами',
      click: () => shell.openPath(app.getPath('logs')),
    },
    { type: 'separator' },
    {
      label: 'Завершить работу',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());

  const isConnectedToServer = socketManager?.isConnected() ?? false;
  const isKktReady = atol?.isReady() ?? false;

  let tooltip = 'HookahPOS KKT Bridge';
  if (!isConnectedToServer) tooltip += ' — нет связи с сервером';
  else if (!isKktReady) tooltip += ' — ККТ не готова';
  else tooltip += ' — работает';
  tray.setToolTip(tooltip);
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('HookahPOS KKT Bridge');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => createSettingsWindow());
}

// ─── IPC: сообщения от окна настроек ──────────────────────────────────────────
ipcMain.handle('get-config', () => store.get('config', {}));
ipcMain.handle('get-status', () => ({
  server_connected: socketManager?.isConnected() ?? false,
  kkt_ready: atol?.isReady() ?? false,
  device_id: store.get('config.device_id'),
  platform: 'windows',
}));

ipcMain.handle('save-config', async (_, newConfig) => {
  store.set('config', { ...store.get('config', {}), ...newConfig });
  restartConnections();
  return { ok: true };
});

ipcMain.handle('pair-device', async (_, pairingUrl) => {
  try {
    const result = await pairWithServer(pairingUrl);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('test-atol', async () => {
  try {
    const status = await atol?.getStatus();
    return { ok: true, status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('set-autostart', async (_, enabled) => {
  try {
    if (enabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
    store.set('config.autostart', enabled);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('get-autostart', async () => {
  return autoLauncher.isEnabled();
});

// ─── Привязка устройства по ссылке из веб-панели ─────────────────────────────
const { randomUUID } = require('crypto');

async function pairWithServer(pairingUrl) {
  const axios = require('axios');
  let deviceId = store.get('config.device_id');
  if (!deviceId) {
    deviceId = `win-${randomUUID()}`;
    store.set('config.device_id', deviceId);
  }

  // Извлекаем токен из ссылки (может быть полная ссылка или просто токен)
  let token = pairingUrl.trim();
  if (token.includes('?token=')) {
    token = new URL(token).searchParams.get('token');
  }

  const atopHost = store.get('config.atol_host', 'http://127.0.0.1:16732');
  const serverUrl = store.get('config.server_url', '');


  // Определить base URL из pairing URL или из сохранённых настроек
  let serverBase = serverUrl;
  if (!serverBase && pairingUrl.includes('://')) {
    const u = new URL(pairingUrl);
    serverBase = `${u.protocol}//${u.host}`;
  }
  if (!serverBase) throw new Error('Не указан URL сервера');

  const resp = await axios.post(`${serverBase}/api/fiscal-devices/pair`, {
    token,
    device_id: deviceId,
    platform: 'windows',
    name: `Windows ПК (${require('os').hostname()})`,
  });

  const { device_token } = resp.data;
  store.set('config.device_token', device_token);
  store.set('config.server_url', serverBase);

  restartConnections();
  return { device_id: deviceId };
}

// ─── Запуск/перезапуск соединений ─────────────────────────────────────────────
function restartConnections() {
  const config = store.get('config', {});
  if (!config.server_url || !config.device_token) return;

  // Пересоздать SocketManager
  if (socketManager) socketManager.destroy();
  socketManager = new SocketManager({
    serverUrl: config.server_url,
    deviceToken: config.device_token,
    onPrintJob: handlePrintJob,
    onStatusChange: updateTray,
  });
  socketManager.connect();

  // Пересоздать AtolClient
  if (atol) atol.destroy();
  atol = new AtolClient({
    host: config.atol_host || 'http://127.0.0.1:16732',
    login: config.atol_login || 'Admin',
    password: config.atol_password || 'Admin',
    onStatusChange: updateTray,
  });

  updateTray();
}

// ─── Обработка задания на печать ──────────────────────────────────────────────
async function handlePrintJob(job) {
  try {
    const { queue_id, receipt_type, receipt_data } = job;
    console.log(`[FISCAL] Получено задание #${queue_id}, тип: ${receipt_type}`);

    const result = await atol.printReceipt(receipt_type, receipt_data);

    await socketManager.confirmReceipt(queue_id, {
      fiscal_number: result.fiscal_number,
      fiscal_document_number: result.fiscal_document_number,
      fiscal_sign: result.fiscal_sign,
    });

    // Обновить UI если открыто
    settingsWindow?.webContents.send('print-success', { queue_id });
    console.log(`[FISCAL] Чек #${queue_id} напечатан успешно`);
  } catch (err) {
    console.error(`[FISCAL] Ошибка печати #${job.queue_id}:`, err.message);
    await socketManager.reportError(job.queue_id, err.message);
    settingsWindow?.webContents.send('print-error', { queue_id: job.queue_id, error: err.message });
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setAppUserModelId('ru.hookahpos.kkt-bridge');

  createTray();

  const config = store.get('config', {});
  const isFirstRun = !config.device_token;

  if (isFirstRun) {
    // При первом запуске — показать окно настроек
    createSettingsWindow();
  } else {
    restartConnections();
  }
});

app.on('window-all-closed', (e) => {
  // Не закрываем приложение при закрытии всех окон — остаётся в трее
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
