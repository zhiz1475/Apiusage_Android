const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width:800,height:600, frame:false, transparent:false, thickFrame:true, titleBarStyle:'hidden', titleBarOverlay:false, resizable:true, show:true, backgroundColor:'#101828' });
  win.loadURL('data:text/html,<body style="background:#101828;color:white;margin:0"><h1>hidden thickFrame</h1></body>');
});
