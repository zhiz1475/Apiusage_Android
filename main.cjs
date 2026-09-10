const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, screen } = require('electron');
const path = require('node:path');
const { KapibalaClient, ClientError } = require('./kapibala-client.cjs');

let mainWindow;
let tray;
let isQuitting = false;
let client;
let windowSettings = {};
const settingsPath = () => path.join(app.getPath('userData'), 'window-settings.json');
async function loadWindowSettings() { try { windowSettings = JSON.parse(await require('node:fs/promises').readFile(settingsPath(), 'utf8')); } catch { windowSettings = {}; } }
async function saveWindowSettings() { try { await require('node:fs/promises').writeFile(settingsPath(), JSON.stringify(windowSettings), 'utf8'); } catch {} }
let boundsAnimationTimer = null;
let boundsAnimationToken = 0;
// The widget is a deliberately small, stable surface.  These values are
// Electron logical pixels (DIP), so Windows 100/125/150/200% scaling keeps
// the same CSS geometry.  fitWindowToMode() clamps them to the active
// monitor's work area when a high-DPI display is too short to fit the full
// card.
// The widget is intentionally a small glanceable surface.  Its renderer
// collapses the information blocks into a short stack, so 360×360 DIP leaves
// only a narrow safety edge below the card while cutting the previous
// 460×780 footprint by more than half. These are Electron logical
// pixels (DIP); fitWindowToMode() clamps them to the active work area for
// short/high-DPI displays and lets the renderer scroll only as a last resort.
const WIDGET_FIXED_SIZE = { width: 360, height: 360 };
const MIN_WINDOW_SIZE = { widget: [WIDGET_FIXED_SIZE.width, WIDGET_FIXED_SIZE.height], full: [720, 580] };
const MODE_BOUNDS = {
  // These are safe fallbacks. The renderer sends measured content dimensions
  // after layout, so a future card/locale change does not require a hardcoded
  // window-size update here.
  widget: { width: WIDGET_FIXED_SIZE.width, height: WIDGET_FIXED_SIZE.height, maxWidth: WIDGET_FIXED_SIZE.width, maxHeight: WIDGET_FIXED_SIZE.height },
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

function animateWindowBounds(target, duration = 220, onComplete) {
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
      if (typeof onComplete === 'function') onComplete();
    }
  };
  apply();
  boundsAnimationTimer = setInterval(apply, 16);
}

// Electron's native resize constraints are global to the BrowserWindow.  A
// mode transition therefore releases them for the short native bounds
// animation, then locks the compact widget to its preferred size again.  The
// renderer remains responsible for its own content scroll when a monitor's
// work area is shorter than the preferred height.
function releaseWindowConstraints() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(1, 1);
  mainWindow.setMaximumSize(10000, 10000);
}

function constrainWindowForMode(mode, bounds = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const normalizedMode = mode === 'full' ? 'full' : 'widget';
  if (normalizedMode === 'widget') {
    const width = Math.max(1, Math.round(bounds?.width || WIDGET_FIXED_SIZE.width));
    const height = Math.max(1, Math.round(bounds?.height || WIDGET_FIXED_SIZE.height));
    mainWindow.setMinimumSize(width, height);
    mainWindow.setMaximumSize(width, height);
    mainWindow.setResizable(false);
    return;
  }
  const [minWidth, minHeight] = MIN_WINDOW_SIZE.full;
  const work = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  mainWindow.setMinimumSize(
    Math.min(minWidth, Math.max(1, work.width - 24)),
    Math.min(minHeight, Math.max(1, work.height - 24))
  );
  // A zero maximum is not consistently interpreted as "unbounded" by older
  // Electron/Windows combinations, so use a generous logical-pixel ceiling.
  mainWindow.setMaximumSize(10000, 10000);
  mainWindow.setResizable(true);
}

function fitWindowToMode(mode, measured = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return false;
  const normalizedMode = mode === 'full' ? 'full' : 'widget';
  const limits = MODE_BOUNDS[normalizedMode];
  const [minWidth, minHeight] = MIN_WINDOW_SIZE[normalizedMode];
  // Widget dimensions are fixed by design.  Ignore renderer measurements so
  // a transient content change cannot grow the widget into a tall dashboard.
  // Full mode keeps its measured/fallback target and remains resizable.
  const measuredWidth = Number(measured.width);
  const measuredHeight = Number(measured.height);
  const width = normalizedMode === 'widget'
    ? limits.width
    : clamp(Number.isFinite(measuredWidth) ? measuredWidth : limits.width, minWidth, limits.maxWidth);
  const height = normalizedMode === 'widget'
    ? limits.height
    : clamp(Number.isFinite(measuredHeight) ? measuredHeight : limits.height, minHeight, limits.maxHeight);
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  const work = display.workArea;
  const availableWidth = Math.max(1, work.width - 24);
  const availableHeight = Math.max(1, work.height - 24);
  const effectiveMinWidth = normalizedMode === 'widget'
    ? Math.min(width, availableWidth)
    : Math.min(minWidth, availableWidth);
  const effectiveMinHeight = normalizedMode === 'widget'
    ? Math.min(height, availableHeight)
    : Math.min(minHeight, availableHeight);
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
  // Constraints can reject intermediate frames (especially when shrinking
  // from full mode), so release them before animating and restore the active
  // mode's constraints when the final frame lands.
  releaseWindowConstraints();
  animateWindowBounds({ x, y, width: safeWidth, height: safeHeight }, 220, () => {
    constrainWindowForMode(normalizedMode, { width: safeWidth, height: safeHeight });
    persistWindowState();
  });
  return { x, y, width: safeWidth, height: safeHeight };
}

function createWindow() {
  const primaryWorkArea = screen.getPrimaryDisplay().workArea;
  const initialMode = windowSettings.mode === 'full' ? 'full' : 'widget';
  const initialLimits = MODE_BOUNDS[initialMode];
  const initialWidth = Math.min(initialLimits.width, Math.max(1, primaryWorkArea.width - 24));
  const initialHeight = Math.min(initialLimits.height, Math.max(1, primaryWorkArea.height - 24));
  const initialX = Math.round(primaryWorkArea.x + (primaryWorkArea.width - initialWidth) / 2);
  const initialY = Math.round(primaryWorkArea.y + (primaryWorkArea.height - initialHeight) / 2);
  const saved = windowSettings.bounds || {};
  // Keep the last position, but never restore an arbitrary old widget size.
  // Earlier builds allowed free resizing and could persist a 1000px-tall
  // widget; the compact mode now always starts at the preferred dimensions.
  const savedWidth = initialMode === 'widget' ? initialWidth : (Number.isFinite(saved.width) ? saved.width : initialWidth);
  const savedHeight = initialMode === 'widget' ? initialHeight : (Number.isFinite(saved.height) ? saved.height : initialHeight);
  mainWindow = new BrowserWindow({
    x: Number.isFinite(saved.x) ? saved.x : initialX,
    y: Number.isFinite(saved.y) ? saved.y : initialY,
    width: savedWidth,
    height: savedHeight,
    minWidth: initialMode === 'widget' ? initialWidth : MIN_WINDOW_SIZE.full[0],
    minHeight: initialMode === 'widget' ? initialHeight : MIN_WINDOW_SIZE.full[1],
    // Use the Windows native resize frame. Electron explicitly disables
    // WS_THICKFRAME for transparent windows, so the renderer must stay
    // opaque for reliable shrinking from every edge/corner. The CSS layers
    // below provide the liquid-glass appearance independently of the HWND.
    resizable: initialMode === 'full',
    maximizable: true,
    minimizable: true,
    show: false,
    frame: false,
    transparent: false,
    thickFrame: true,
    // The rebuilt renderer uses a strict editorial grid; keep the native
    // window corners square as well so the HWND does not reintroduce rounding.
    roundedCorners: false,
    hasShadow: true,
    alwaysOnTop: Boolean(windowSettings.alwaysOnTop),
    autoHideMenuBar: true,
    // Keep an opaque fallback color for Windows 10 and for DWM states where
    // system backdrop materials are unavailable. The renderer paints the
    // animated light/dark gradients on top of this color.
    backgroundColor: '#202023',
    icon: path.join(__dirname, 'assets', 'kapibala-logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // A fixed widget also gets a native max bound, preventing edge/corner drag
  // attempts from changing its size.  The mode switch temporarily releases
  // this bound while animating to the full dashboard.
  if (initialMode === 'widget') {
    mainWindow.setMaximumSize(initialWidth, initialHeight);
  } else {
    mainWindow.setMaximumSize(10000, 10000);
  }
  if (windowSettings.alwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating');

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
  mainWindow.on('moved', persistWindowState);
  mainWindow.on('resized', persistWindowState);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
  windowSettings.bounds = mainWindow.getBounds();
  saveWindowSettings();
}

function ensurePrimaryDisplay() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return false;
  const primary = screen.getPrimaryDisplay();
  const current = mainWindow.getBounds();
  const active = screen.getDisplayMatching(current);
  if (active.id === primary.id) {
    mainWindow.focus();
    return true;
  }
  const work = primary.workArea;
  const widgetMode = windowSettings.mode !== 'full';
  const width = widgetMode
    ? Math.min(WIDGET_FIXED_SIZE.width, Math.max(1, work.width - 24))
    : Math.min(current.width, Math.max(1, work.width - 24));
  const height = widgetMode
    ? Math.min(WIDGET_FIXED_SIZE.height, Math.max(1, work.height - 24))
    : Math.min(current.height, Math.max(1, work.height - 24));
  const x = Math.round(work.x + (work.width - width) / 2);
  const y = Math.round(work.y + (work.height - height) / 2);
  if (widgetMode) {
    releaseWindowConstraints();
    constrainWindowForMode('widget', { width, height });
  }
  mainWindow.setBounds({ x, y, width, height }, false);
  mainWindow.focus();
  persistWindowState();
  return true;
}

function registerIpc() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    // The compact surface has a fixed footprint; maximizing it would bypass
    // the native min/max size lock and turn the widget into a dashboard.
    if (windowSettings.mode !== 'full') return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:set-min-size', (_event, mode = 'widget') => {
    if (!mainWindow) return false;
    const normalizedMode = mode === 'full' ? 'full' : 'widget';
    if (normalizedMode === 'widget') {
      const display = screen.getDisplayMatching(mainWindow.getBounds());
      const width = Math.min(WIDGET_FIXED_SIZE.width, Math.max(1, display.workArea.width - 24));
      const height = Math.min(WIDGET_FIXED_SIZE.height, Math.max(1, display.workArea.height - 24));
      // Do not resize synchronously here.  setMode() calls this helper before
      // setModeBounds(), and an eager setBounds would visibly jump to the
      // compact size before the elastic native transition starts.  The
      // subsequent fitWindowToMode() releases constraints, animates, then
      // locks min=max at the final frame.
      releaseWindowConstraints();
      return { minWidth: width, minHeight: height, maxWidth: width, maxHeight: height, fixed: true };
    }
    // As with widget mode, leave the active constraints to fitWindowToMode()
    // so a mode switch has one continuous native animation.
    releaseWindowConstraints();
    const [minWidth, minHeight] = MIN_WINDOW_SIZE.full;
    return { minWidth, minHeight, fixed: false };
  });
  ipcMain.handle('window:set-mode-bounds', (_event, payload = {}) => {
    const mode = payload?.mode === 'full' ? 'full' : 'widget';
    return fitWindowToMode(mode, payload);
  });
  ipcMain.handle('window:ensure-primary-display', () => ensurePrimaryDisplay());
  ipcMain.handle('window:get-settings', () => windowSettings);
  ipcMain.handle('window:set-settings', (_event, patch = {}) => {
    windowSettings = { ...windowSettings, ...patch };
    if (typeof patch.alwaysOnTop === 'boolean') mainWindow?.setAlwaysOnTop(patch.alwaysOnTop, patch.alwaysOnTop ? 'floating' : 'normal');
    saveWindowSettings();
    return windowSettings;
  });
  ipcMain.handle('window:set-always-on-top', (_event, value) => {
    const enabled = Boolean(value);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
    }
    windowSettings = { ...windowSettings, alwaysOnTop: enabled };
    saveWindowSettings();
    return enabled;
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

app.whenReady().then(async () => {
  await loadWindowSettings();
  client = new KapibalaClient({ userDataPath: app.getPath('userData') });
  registerIpc();
  createWindow();
  // Recalculate the fixed widget bounds when Windows changes DPI or a
  // monitor is hot-plugged.  screen/workArea values are logical pixels, so
  // this keeps the compact surface usable at 100–200% scaling without
  // multiplying by scaleFactor a second time.
  screen.on('display-metrics-changed', () => {
    if (!mainWindow || mainWindow.isDestroyed() || windowSettings.mode === 'full') return;
    fitWindowToMode('widget');
  });
  createTray();
  app.on('activate', showWindow);
});

app.on('window-all-closed', () => {
  // Keep the tray utility available on Windows. The tray menu provides Exit.
});

app.on('before-quit', () => { isQuitting = true; });
