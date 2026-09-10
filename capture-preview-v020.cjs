const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const outputDir = path.join(process.cwd(), 'dist', 'preview-v020');

const captures = [
  ['full-day', 1080, 800, 'full', 'bars', 'day', '78%', '22%'],
  ['full-night', 1080, 800, 'full', 'bars', 'night', '24%', '70%'],
  ['widget-day', 460, 690, 'widget', 'bars', 'day', '64%', '28%'],
  ['widget-night', 460, 690, 'widget', 'bars', 'night', '30%', '68%'],
  ['heatmap-day', 1080, 800, 'full', 'heatmap', 'day', '52%', '48%']
];

async function captureOne(win, [name, width, height, mode, chart, theme, pointerX, pointerY]) {
  try {
    win.setBounds({ x: 0, y: 0, width, height });
    await win.loadFile(path.join(process.cwd(), 'index.html'));
    await win.webContents.executeJavaScript(`
      localStorage.removeItem('apiusagebar-theme');
      if (typeof renderPreviewDemo === 'function') renderPreviewDemo();
      document.body.classList.add('electron-window');
      document.documentElement.classList.add('electron-window');
      if (typeof setTheme === 'function') setTheme('${theme}', false);
      if (typeof setMode === 'function') setMode('${mode}');
      if (typeof setChart === 'function') setChart('${chart}');
      document.documentElement.style.setProperty('--glass-pointer-x', '${pointerX}');
      document.documentElement.style.setProperty('--glass-pointer-y', '${pointerY}');
      document.documentElement.style.setProperty('--glass-pointer-opacity', '.92');
      void 0;
    `);
    await win.webContents.executeJavaScript('document.fonts?.ready ? document.fonts.ready.then(() => void 0) : void 0');
    await sleep(900);
    // `requestAnimationFrame(() => requestAnimationFrame(...))` resolves before
    // the inner frame when used as a bare expression. Poll the active view and
    // wait for two real paint frames so the first capture after a mode/chart
    // switch cannot be an empty offscreen surface.
    await win.webContents.executeJavaScript(`(async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const view = document.querySelector('.view.active');
        if (view && getComputedStyle(view).display !== 'none' && view.getBoundingClientRect().height > 0 && view.innerText.trim()) {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return false;
    })()`);
    await sleep(180);
    win.webContents.invalidate();
    await sleep(100);
    const image = await win.webContents.capturePage({ stayHidden: true });
    fs.writeFileSync(path.join(outputDir, `${name}.png`), image.toPNG());
    return JSON.parse(await win.webContents.executeJavaScript(`JSON.stringify((() => {
      const q = selector => document.querySelector(selector);
      const view = q('.view-full');
      const indicator = q('.scroll-indicator');
      return {
        name: '${name}',
        theme: document.body.classList.contains('night-mode') ? 'night' : 'day',
        mode: document.body.dataset.mode,
        inner: [innerWidth, innerHeight],
        shell: q('.app-shell')?.getBoundingClientRect().toJSON(),
        view: view ? { clientHeight: view.clientHeight, scrollHeight: view.scrollHeight } : null,
        indicator: indicator ? { visible: indicator.classList.contains('is-visible'), rect: indicator.getBoundingClientRect().toJSON() } : null,
        cardBg: getComputedStyle(q('.widget-card')).backgroundColor,
        cardFilter: getComputedStyle(q('.widget-card')).backdropFilter
      };
    })())`));
  } finally {}
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const metrics = [];
  try {
    const win = new BrowserWindow({
      width: 1080,
      height: 800,
      show: false,
      offscreen: true,
      frame: false,
      transparent: false,
      backgroundColor: '#9eafc1',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });
    for (const capture of captures) metrics.push(await captureOne(win, capture));
    if (!win.isDestroyed()) win.destroy();
    fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error);
    app.exit(1);
  }
});
