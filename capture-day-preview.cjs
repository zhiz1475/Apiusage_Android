const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, frame: false, transparent: false, thickFrame: true, show: false, backgroundColor: '#141a2a', webPreferences: { preload: path.join(process.cwd(), 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript("document.body.classList.remove('night-mode'); localStorage.removeItem('apiusagebar-theme'); void 0");
  await new Promise(resolve => setTimeout(resolve, 400));
  fs.writeFileSync(path.join(process.cwd(), 'dist', 'app-day-preview.png'), (await win.webContents.capturePage()).toPNG());
  app.exit(0);
});
