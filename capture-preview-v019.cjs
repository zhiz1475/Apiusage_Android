const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 800,
    show: false,
    offscreen: true,
    frame: false,
    transparent: false,
    backgroundColor: '#c7d2e1',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript(`
    localStorage.removeItem('apiusagebar-theme');
    if (typeof renderPreviewDemo === 'function') renderPreviewDemo();
    document.body.classList.add('electron-window');
    document.documentElement.classList.add('electron-window');
    void 0;
  `);
  await sleep(420);
  const out = path.join(process.cwd(), 'dist', 'preview-v019');
  fs.mkdirSync(out, { recursive: true });
  const captures = [
    ['full-day', 1080, 800, 'full', false, '78%', '22%'],
    ['full-night', 1080, 800, 'full', true, '24%', '70%'],
    ['widget-day', 460, 690, 'widget', false, '64%', '28%'],
    ['widget-night', 460, 690, 'widget', true, '30%', '68%'],
    ['heatmap-day', 1080, 800, 'full', false, '52%', '48%']
  ];
  for (const [name, width, height, mode, night, px, py] of captures) {
    win.setBounds({ x: 0, y: 0, width, height });
    await win.webContents.executeJavaScript(`
      document.body.classList.toggle('night-mode', ${night});
      document.body.dataset.mode = '${mode}';
      document.querySelector('.mode-btn[data-mode="${mode}"]')?.click();
      document.documentElement.style.setProperty('--glass-pointer-x', '${px}');
      document.documentElement.style.setProperty('--glass-pointer-y', '${py}');
      document.documentElement.style.setProperty('--glass-pointer-opacity', '.92');
      if ('${name}' === 'heatmap-day') document.querySelector('.chart-toggle[data-chart="heatmap"]')?.click();
      void 0;
    `);
    await sleep(620);
    fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  }
  const metrics = await win.webContents.executeJavaScript(`JSON.stringify({
    inner:[innerWidth,innerHeight],
    html:{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},
    body:{scrollWidth:document.body.scrollWidth,scrollHeight:document.body.scrollHeight},
    view:{scrollWidth:document.querySelector('.view-full')?.scrollWidth,scrollHeight:document.querySelector('.view-full')?.scrollHeight},
    cardBg:getComputedStyle(document.querySelector('.widget-card')).backgroundColor,
    cardFilter:getComputedStyle(document.querySelector('.widget-card')).backdropFilter,
    scrollbar:getComputedStyle(document.querySelector('.view-full')).scrollbarColor,
    mode:document.body.dataset.mode
  })`);
  fs.writeFileSync(path.join(out, 'metrics.json'), metrics);
  console.log(metrics);
  app.exit(0);
}).catch(error => { console.error(error.stack || error); app.exit(1); });
