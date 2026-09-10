const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600, frame: false, transparent: true, thickFrame: true, resizable: true, show: true });
  win.loadURL('data:text/html,<body style="background:rgba(80,120,220,.7);margin:0"><h1>toggle</h1></body>');
  setTimeout(() => { win.setResizable(false); win.setResizable(true); }, 1000);
});
