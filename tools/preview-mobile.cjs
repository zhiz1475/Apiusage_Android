const {app,BrowserWindow} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const userData = path.resolve(__dirname,'../dist/mobile-preview/runtime');
fs.mkdirSync(userData,{recursive:true});
app.setPath('userData',userData);
app.whenReady().then(()=>{
  const win=new BrowserWindow({width:430,height:920,minWidth:320,minHeight:480,title:'ApiUsageBar · 安卓界面预览',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.loadFile(path.resolve(__dirname,'../mobile/index.html'));
});
app.on('window-all-closed',()=>app.quit());
