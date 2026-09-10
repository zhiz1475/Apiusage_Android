const { app, BrowserWindow, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const work = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({ x: work.x + 12, y: work.y + 12, width: 1080, height: 800, frame: false, transparent: false, thickFrame: true, show: false, backgroundColor: '#141a2a', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript("document.body.classList.add('electron-window'); if(typeof renderPreviewDemo==='function') renderPreviewDemo(); void 0");
  const outDir = path.join(process.cwd(), 'dist', 'size-previews');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, width, height, mode] of [['widget', 400, 600, 'widget'], ['full', 720, 580, 'full']]) {
    win.setMinimumSize(width, height);
    win.setBounds({ x: work.x + 12, y: work.y + 12, width, height });
    await win.webContents.executeJavaScript(`document.querySelectorAll('.mode-btn').forEach(b=>b.dataset.mode==='${mode}'&&b.click()); void 0`);
    await new Promise(resolve => setTimeout(resolve, 520));
    fs.writeFileSync(path.join(outDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  }
  app.exit(0);
});

