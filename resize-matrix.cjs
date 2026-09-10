const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const variant = process.argv.find(value => value.startsWith('--variant='))?.slice(10) || 'transparent';
const variants = {
  transparent: { frame: false, transparent: true, thickFrame: true },
  opaqueAlpha: { frame: false, transparent: false, thickFrame: true, backgroundColor: '#00000000' },
  hiddenTitle: { frame: false, transparent: false, thickFrame: true, titleBarStyle: 'hidden', backgroundColor: '#00000000' },
  acrylic: { frame: false, transparent: false, thickFrame: true, titleBarStyle: 'hidden', backgroundMaterial: 'acrylic', backgroundColor: '#00000000' },
  nativeFrame: { frame: true, transparent: false, thickFrame: true, backgroundColor: '#00000000' }
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    resizable: true,
    webPreferences: { sandbox: true },
    ...(variants[variant] || variants.transparent)
  });
  await win.loadURL(`data:text/html,<style>html,body{margin:0;width:100%;height:100%;background:rgba(54,102,188,.30);color:white;font:28px sans-serif}</style><h1>${variant}</h1>`);
  const image = await win.webContents.capturePage();
  const outDir = path.join(process.cwd(), 'dist', 'resize-matrix');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${variant}.png`), image.toPNG());
  win.hide();
  setTimeout(() => app.exit(0), 200);
});
