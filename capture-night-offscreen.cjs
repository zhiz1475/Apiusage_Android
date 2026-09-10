const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:460,height:690,show:false,offscreen:true,frame:false,transparent:false,backgroundColor:'#151a25',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(process.cwd(),'index.html'));
  await win.webContents.executeJavaScript(`document.body.classList.add('electron-window','night-mode'); document.body.dataset.mode='widget'; if(typeof renderPreviewDemo==='function') renderPreviewDemo(); void 0`);
  await new Promise(r=>setTimeout(r,500));
  const image=await win.webContents.capturePage(); fs.writeFileSync(path.join(process.cwd(),'dist','night-test.png'),image.toPNG());
  console.log(await win.webContents.executeJavaScript(`JSON.stringify({c:document.body.className,b:getComputedStyle(document.body).backgroundColor,rect:document.querySelector('.widget-card').getBoundingClientRect().toJSON()})`));
  app.exit(0);
});
