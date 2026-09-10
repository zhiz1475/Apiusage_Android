const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const variant = process.argv.find(value => value.startsWith('--variant='))?.slice(10) || 'transparent';
const variants = {
  transparent: { frame: false, transparent: true, thickFrame: true },
  opaqueAlpha: { frame: false, transparent: false, thickFrame: true, backgroundColor: '#00000000' },
  hiddenTitle: { frame: false, transparent: false, thickFrame: true, titleBarStyle: 'hidden', backgroundColor: '#00000000' },
  acrylic: { frame: false, transparent: false, thickFrame: true, titleBarStyle: 'hidden', backgroundMaterial: 'acrylic', backgroundColor: '#00000000' },
  nativeFrame: { frame: true, transparent: false, thickFrame: true, backgroundColor: '#00000000' }
};
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600, show: true, resizable: true, ...variants[variant] });
  win.setTitle(`ApiUsageBar-${variant}`);
  win.loadURL(`data:text/html,<body style="margin:0;background:rgba(54,102,188,.30);color:white"><h1>${variant}</h1></body>`);
  fs.writeFileSync(`C:/Temp/apiusagebar-style-${variant}.txt`, `${process.pid}`);
  setTimeout(() => app.exit(0), 30000);
});
