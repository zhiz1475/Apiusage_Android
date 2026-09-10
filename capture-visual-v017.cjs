const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 800,
    show: false,
    frame: false,
    transparent: false,
    thickFrame: true,
    backgroundColor: '#151a25',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript(`
    localStorage.removeItem('apiusagebar-theme');
    document.body.classList.add('electron-window');
    document.documentElement.classList.add('electron-window');
    document.body.classList.remove('night-mode');
    document.body.dataset.mode = 'widget';
    if (typeof renderPreviewDemo === 'function') renderPreviewDemo();
    void 0;
  `);
  await new Promise(resolve => setTimeout(resolve, 700));
  const out = path.join(process.cwd(), 'dist', 'visual-v017');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, width, height, mode, night] of [
    ['widget-day', 460, 690, 'widget', false],
    ['widget-night', 460, 690, 'widget', true],
    ['full-day', 1080, 800, 'full', false],
    ['full-night', 1080, 800, 'full', true]
  ]) {
    win.setBounds({ x: 0, y: 0, width, height });
    await win.webContents.executeJavaScript(`
      document.body.dataset.mode = '${mode}';
      document.body.classList.toggle('night-mode', ${night});
      document.querySelectorAll('.mode-btn').forEach(b => { if (b.dataset.mode === '${mode}') b.click(); });
      void 0;
    `);
    await new Promise(resolve => setTimeout(resolve, 520));
    const state = await win.webContents.executeJavaScript(`JSON.stringify({classes:document.body.className,body:getComputedStyle(document.body).backgroundColor,shell:getComputedStyle(document.querySelector('.app-shell')).backgroundColor,card:getComputedStyle(document.querySelector('.widget-card')).backgroundColor,opacity:getComputedStyle(document.querySelector('.view.active')).opacity})`);
    console.log(name, state);
    fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  }
  app.exit(0);
});
