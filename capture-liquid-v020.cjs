const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const outputDir = path.join(process.cwd(), 'dist', 'preview-liquid-v020');
const cases = [
  ['full-day', 1080, 800, 'full', 'bars', 'day', '78%', '22%'],
  ['full-night', 1080, 800, 'full', 'bars', 'night', '24%', '70%'],
  ['widget-day', 460, 690, 'widget', 'bars', 'day', '64%', '28%'],
  ['widget-night', 460, 690, 'widget', 'bars', 'night', '30%', '68%'],
  ['heatmap-day', 1080, 800, 'full', 'heatmap', 'day', '52%', '48%']
];

async function capture(win, [name, width, height, mode, chart, theme, x, y]) {
  win.setBounds({ x: 0, y: 0, width, height });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript(`
    (() => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'liquid-glass-v020.css';
      document.head.appendChild(link);
      document.body.classList.add('electron-window');
      document.documentElement.classList.add('electron-window');
      if (typeof renderPreviewDemo === 'function') renderPreviewDemo();
      if (typeof setTheme === 'function') setTheme('${theme}', false);
      if (typeof setMode === 'function') setMode('${mode}');
      if (typeof setChart === 'function') setChart('${chart}');
      document.documentElement.style.setProperty('--glass-pointer-x', '${x}');
      document.documentElement.style.setProperty('--glass-pointer-y', '${y}');
      document.documentElement.style.setProperty('--glass-pointer-opacity', '.92');
    })();
  `);
  await wait(500);
  await win.webContents.executeJavaScript('document.fonts?.ready ? document.fonts.ready.then(() => void 0) : void 0');
  await wait(300);
  const image = await win.webContents.capturePage({ stayHidden: true });
  fs.writeFileSync(path.join(outputDir, `${name}.png`), image.toPNG());
  return JSON.parse(await win.webContents.executeJavaScript(`JSON.stringify((() => {
    const q = s => document.querySelector(s);
    const c = q('.widget-card');
    const rail = q('.scroll-indicator');
    return {name:'${name}', body:document.body.className, card:getComputedStyle(c).backgroundColor, filter:getComputedStyle(c).backdropFilter, overflow:getComputedStyle(c).overflow, rail:rail ? rail.getBoundingClientRect().toJSON() : null};
  })())`));
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const win = new BrowserWindow({ width: 1080, height: 800, show: false, offscreen: true, frame: false, transparent: false, backgroundColor: '#9eafc1', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  try {
    const metrics = [];
    for (const item of cases) metrics.push(await capture(win, item));
    fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
  } catch (error) {
    console.error(error.stack || error);
    app.exitCode = 1;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.exit();
  }
});
