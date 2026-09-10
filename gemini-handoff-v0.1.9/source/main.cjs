const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, screen } = require('electron');
const path = require('node:path');
const { KapibalaClient, ClientError } = require('./kapibala-client.cjs');

let mainWindow;
let tray;
let isQuitting = false;
let client;
let boundsAnimationTimer = null;
let boundsAnimationToken = 0;
// Keep the lower bounds small enough that both shrinking and enlarging feel
// natural, while leaving enough room for the card typography and controls.
const MIN_WINDOW_SIZE = { widget: [400, 600], full: [720, 580] };
const MODE_BOUNDS = {
  // These are safe fallbacks. The renderer sends measured content dimensions
  // after layout, so a future card/locale change does not require a hardcoded
  // window-size update here.
  widget: { width: 460, height: 690, maxWidth: 640, maxHeight: 860 },
  full: { width: 1080, height: 800, maxWidth: 1600, maxHeight: 1100 }
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function createTray() {
  const logoPath = path.join(__dirname, 'assets', 'kapibala-logo.ico');
  let icon = nativeImage.createFromPath(logoPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.setToolTip('ApiUsageBar · Kapibala 用量中心');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 ApiUsageBar', click: () => showWindow() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => showWindow());
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stopBoundsAnimation() {
  if (boundsAnimationTimer) {
    clearInterval(boundsAnimationTimer);
    boundsAnimationTimer = null;
  }
  boundsAnimationToken += 1;
  return boundsAnimationToken;
}

function animateWindowBounds(target, duration = 220) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const token = stopBoundsAnimation();
  const start = mainWindow.getBounds();
  const startedAt = Date.now();
  const ease = progress => 1 - ((1 - progress) ** 3);
  const apply = () => {
    if (!mainWindow || mainWindow.isDestroyed() || token !== boundsAnimationToken) {
      if (boundsAnimationTimer) clearInterval(boundsAnimationTimer);
      boundsAnimationTimer = null;
      return;
    }
    const progress = clamp((Date.now() - startedAt) / duration, 0, 1);
    const eased = ease(progress);
    mainWindow.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased)
    }, false);
    if (progress >= 1) {
      clearInterval(boundsAnimationTimer);
      boundsAnimationTimer = null;
    }
  };
  apply();
  boundsAnimationTimer = setInterval(apply, 16);
}

function fitWindowToMode(mode, measured = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return false;
  const normalizedMode = mode === 'full' ? 'full' : 'widget';
  const limits = MODE_BOUNDS[normalizedMode];
  const [minWidth, minHeight] = MIN_WINDOW_SIZE[normalizedMode];
  // Make the mode change atomic from the renderer's point of view. Without
  // this, a pending full-view minimum can reject the first shrinking frame.
  mainWindow.setMinimumSize(minWidth, minHeight);
  const measuredWidth = Number(measured.width);
  const measuredHeight = Number(measured.height);
  const width = clamp(Number.isFinite(measuredWidth) ? measuredWidth : limits.width, minWidth, limits.maxWidth);
  const height = clamp(Number.isFinite(measuredHeight) ? measuredHeight : limits.height, minHeight, limits.maxHeight);
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  const work = display.workArea;
  const availableWidth = Math.max(1, work.width - 24);
  const availableHeight = Math.max(1, work.height - 24);
  const effectiveMinWidth = Math.min(minWidth, availableWidth);
  const effectiveMinHeight = Math.min(minHeight, availableHeight);
  const safeWidth = clamp(width, effectiveMinWidth, availableWidth);
  const safeHeight = clamp(height, effectiveMinHeight, availableHeight);
  // Keep the current center when switching between the compact and full views,
  // then clamp the result to the active monitor's work area.
  const centerX = current.x + current.width / 2;
  const centerY = current.y + current.height / 2;
  const leftBound = work.width > safeWidth + 24 ? work.x + 12 : work.x;
  const topBound = work.height > safeHeight + 24 ? work.y + 12 : work.y;
  const rightBound = work.width > safeWidth + 24 ? work.x + work.width - safeWidth - 12 : work.x + work.width - safeWidth;
  const bottomBound = work.height > safeHeight + 24 ? work.y + work.height - safeHeight - 12 : work.y + work.height - safeHeight;
  const x = clamp(Math.round(centerX - safeWidth / 2), leftBound, rightBound);
  const y = clamp(Math.round(centerY - safeHeight / 2), topBound, bottomBound);
  animateWindowBounds({ x, y, width: safeWidth, height: safeHeight });
  return { x, y, width: safeWidth, height: safeHeight };
}

function createWindow() {
  const primaryWorkArea = screen.getPrimaryDisplay().workArea;
  const initialWidth = Math.min(MODE_BOUNDS.widget.width, Math.max(1, primaryWorkArea.width - 24));
  const initialHeight = Math.min(MODE_BOUNDS.widget.height, Math.max(1, primaryWorkArea.height - 24));
  const initialX = Math.round(primaryWorkArea.x + (primaryWorkArea.width - initialWidth) / 2);
  const initialY = Math.round(primaryWorkArea.y + (primaryWorkArea.height - initialHeight) / 2);
  mainWindow = new BrowserWindow({
    x: initialX,
    y: initialY,
    width: initialWidth,
    height: initialHeight,
    minWidth: MIN_WINDOW_SIZE.widget[0],
    minHeight: MIN_WINDOW_SIZE.widget[1],
    // Use the Windows native resize frame. Electron explicitly disables
    // WS_THICKFRAME for transparent windows, so the renderer must stay
    // opaque for reliable shrinking from every edge/corner. The CSS layers
    // below provide the liquid-glass appearance independently of the HWND.
    resizable: true,
    maximizable: true,
    minimizable: true,
    show: false,
    frame: false,
    transparent: false,
    thickFrame: true,
    roundedCorners: true,
    hasShadow: true,
    autoHideMenuBar: true,
    // Keep an opaque fallback color for Windows 10 and for DWM states where
    // system backdrop materials are unavailable. The renderer paints the
    // animated light/dark gradients on top of this color.
    backgroundColor: '#141a2a',
    icon: path.join(__dirname, 'assets', 'kapibala-logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    stopBoundsAnimation();
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:set-min-size', (_event, mode = 'widget') => {
    if (!mainWindow) return false;
    const [minWidth, minHeight] = MIN_WINDOW_SIZE[mode] || MIN_WINDOW_SIZE.widget;
    mainWindow.setMinimumSize(minWidth, minHeight);
    const bounds = mainWindow.getBounds();
    if (bounds.width < minWidth || bounds.height < minHeight) {
      mainWindow.setBounds({
        ...bounds,
        width: Math.max(bounds.width, minWidth),
        height: Math.max(bounds.height, minHeight)
      }, false);
    }
    return { minWidth, minHeight };
  });
  ipcMain.handle('window:set-mode-bounds', (_event, payload = {}) => {
    const mode = payload?.mode === 'full' ? 'full' : 'widget';
    return fitWindowToMode(mode, payload);
  });
  ipcMain.handle('kapibala:get-stored-status', () => client.getStoredStatus());
  ipcMain.handle('kapibala:login', async (_event, credentials = {}) => {
    try {
      return await client.login(credentials.username, credentials.password);
    } catch (error) {
      throw new Error(error instanceof ClientError ? error.message : '登录失败，请稍后重试');
    }
  });
  ipcMain.handle('kapibala:refresh', async () => {
    try {
      return await client.refresh();
    } catch (error) {
      throw new Error(error instanceof ClientError ? error.message : '刷新失败，请检查网络连接');
    }
  });
  ipcMain.handle('kapibala:logout', () => client.logout());
  ipcMain.handle('kapibala:open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url);
    return false;
  });
}

app.whenReady().then(() => {
  client = new KapibalaClient({ userDataPath: app.getPath('userData') });
  registerIpc();
  createWindow();
  createTray();
  app.on('activate', showWindow);
});

app.on('window-all-closed', () => {
  // Keep the tray utility available on Windows. The tray menu provides Exit.
});

app.on('before-quit', () => { isQuitting = true; });
