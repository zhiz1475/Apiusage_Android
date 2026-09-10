const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:1080,height:800,show:false,offscreen:true,frame:false,transparent:false,backgroundColor:'#151a25',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(process.cwd(),'index.html'));
  await win.webContents.executeJavaScript(`document.body.classList.add('electron-window','night-mode'); if(typeof renderPreviewDemo==='function') renderPreviewDemo(); document.querySelector('.mode-btn[data-mode="full"]').click(); void 0`);
  await new Promise(r=>setTimeout(r,700));
  fs.writeFileSync(path.join(process.cwd(),'dist','full-night-test.png'),(await win.webContents.capturePage()).toPNG());
  console.log(await win.webContents.executeJavaScript(`JSON.stringify({c:document.body.className,buttons:[...document.querySelectorAll('.mode-btn')].map(x=>[x.textContent,x.className,getComputedStyle(x).backgroundColor]),ring:document.querySelector('.ring-stats')?.innerText,heat:document.querySelector('.heat-cell')?.dataset.tip,views:[...document.querySelectorAll('.view')].map(x=>[x.className,getComputedStyle(x).display,getComputedStyle(x).opacity])})`));
  app.exit(0);
});
