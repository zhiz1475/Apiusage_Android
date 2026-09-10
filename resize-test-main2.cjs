const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800, height: 600,
    frame: false,
    transparent: false,
    thickFrame: true,
    resizable: true,
    show: true,
    backgroundColor:'#ff0000',
    webPreferences: { nodeIntegration: false }
  });
  win.loadURL('data:text/html,<body style="background:#f00;margin:0"><h1>thickFrame test 2</h1></body>');
});
