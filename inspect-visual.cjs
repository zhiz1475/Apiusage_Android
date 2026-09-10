const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:460,height:690,show:false,frame:false,transparent:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.on('console-message', (_e,_l,m)=>console.log('renderer:',m));
  await win.loadFile(path.join(process.cwd(),'index.html'));
  await win.webContents.executeJavaScript(`document.body.classList.add('electron-window'); document.body.classList.add('night-mode'); document.body.dataset.mode='widget'; if(typeof renderPreviewDemo==='function') renderPreviewDemo(); void 0`);
  await new Promise(r=>setTimeout(r,900));
  const x=await win.webContents.executeJavaScript(`JSON.stringify({body:document.body.className,mode:document.body.dataset.mode,bodyBg:getComputedStyle(document.body).backgroundColor, shellBg:getComputedStyle(document.querySelector('.app-shell')).backgroundColor, cardBg:getComputedStyle(document.querySelector('.widget-card')).backgroundColor, measured:typeof measureMode==='function'?measureMode('widget'):null, widget:document.querySelector('.view-widget')?.getBoundingClientRect().toJSON(),stage:document.querySelector('.widget-stage')?.getBoundingClientRect().toJSON(),card:document.querySelector('.widget-card')?.getBoundingClientRect().toJSON(),active:[...document.querySelectorAll('.view')].map(x=>[x.className,getComputedStyle(x).display,getComputedStyle(x).opacity,getComputedStyle(x).animationName,getComputedStyle(x).animationDuration]),shell:document.querySelector('.app-shell')?.getBoundingClientRect().toJSON(),scroll:{body:document.body.scrollHeight,shell:document.querySelector('.app-shell')?.scrollHeight,shellW:document.querySelector('.app-shell')?.scrollWidth},text:document.querySelector('.widget-card')?.innerText});`);
  console.log(x);
  app.exit(0);
});
