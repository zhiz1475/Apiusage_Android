const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800, height: 600, frame: false, transparent: false,
    thickFrame: true, resizable: true, show: true,
    backgroundColor: '#00000000', backgroundMaterial: 'acrylic'
  });
  win.loadURL('data:text/html,<body style="background:rgba(80,120,220,.28);margin:0;color:white"><h1>combo</h1></body>');
});
