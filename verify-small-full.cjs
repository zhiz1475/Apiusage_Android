const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:720,height:580,show:false,offscreen:true,frame:false,transparent:false,backgroundColor:'#151a25',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(process.cwd(),'index.html'));
  await win.webContents.executeJavaScript(`document.body.classList.add('electron-window'); if(typeof renderPreviewDemo==='function') renderPreviewDemo(); document.querySelector('.mode-btn[data-mode="full"]').click(); void 0`);
  await new Promise(r=>setTimeout(r,600));
  const result=await win.webContents.executeJavaScript(`JSON.stringify({active:document.querySelector('.view-full').className,rect:document.querySelector('.view-full').getBoundingClientRect().toJSON(),scroll:document.querySelector('.view-full').scrollHeight,client:document.querySelector('.view-full').clientHeight,kpi:[...document.querySelectorAll('.kpi-card')].map(x=>x.getBoundingClientRect().toJSON()),ring:document.querySelector('.subscription-panel').getBoundingClientRect().toJSON(),models:document.querySelector('.models-panel').getBoundingClientRect().toJSON(),font:getComputedStyle(document.body).fontFamily})`);
  require('node:fs').writeFileSync(path.join(process.cwd(),'dist','small-full.png'),(await win.webContents.capturePage()).toPNG());
  console.log(result); app.exit(0);
});
