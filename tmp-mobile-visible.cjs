const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'); const path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const root=process.cwd(); const win=new BrowserWindow({width:360,height:800,show:true,frame:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 await win.loadFile(path.join(root,'index.html'));
 const css=fs.readFileSync(path.join(root,'mobile-ui-proposal.css'),'utf8');
 await win.webContents.executeJavaScript(`(()=>{document.body.classList.add('mobile-app');const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s);document.body.classList.remove('electron-window');document.documentElement.classList.remove('electron-window');return true})()`);
 await sleep(1000);
 await win.webContents.executeJavaScript("(()=>{if(typeof setTheme==='function')setTheme('day',false);if(typeof setMode==='function')setMode('full');return true})()");
 await sleep(1000);
 const info=await win.webContents.executeJavaScript("JSON.stringify({mode:document.body.dataset.mode,views:[...document.querySelectorAll('.view')].map(v=>({id:v.id,a:v.classList.contains('active'),d:getComputedStyle(v).display})),scroll:document.querySelector('.view-full')?.scrollTop})"); console.log(info);
 const img=await win.webContents.capturePage(); fs.mkdirSync(path.join(root,'dist','mobile-preview'),{recursive:true}); fs.writeFileSync(path.join(root,'dist','mobile-preview','full-day-visible.png'),img.toPNG()); win.destroy(); app.quit();
});
