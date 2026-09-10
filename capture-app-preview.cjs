const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: false,
    thickFrame: true,
    resizable: true,
    show: false,
    backgroundColor: '#141a2a',
    webPreferences: { preload: path.join(process.cwd(), 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 800));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(process.cwd(), 'dist', 'app-preview.png'), image.toPNG());
  app.exit(0);
});
