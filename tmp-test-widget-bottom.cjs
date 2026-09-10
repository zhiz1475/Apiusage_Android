const { app, BrowserWindow } = require('electron');
const path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:360,height:360,show:false,offscreen:true,frame:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 await w.loadFile(path.join(process.cwd(),'index.html')); await wait(150);
 const r=await w.webContents.executeJavaScript(`(async()=>{
 document.body.classList.add('electron-window'); document.documentElement.classList.add('electron-window'); renderPreviewDemo(); setTheme('day',false); setMode('widget');
 const s=document.createElement('style'); s.textContent=\`@media (max-width:400px){body.electron-window[data-mode="widget"] .app-shell{padding-bottom:0;} body.electron-window[data-mode="widget"] .topbar{margin-bottom:10px;} body.electron-window[data-mode="widget"] .view-widget{max-height:calc(100vh - 58px);}}\`; document.head.appendChild(s);
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); await new Promise(r=>setTimeout(r,120));
 const q=s=>document.querySelector(s); const rr=s=>q(s)?.getBoundingClientRect().toJSON(); const v=q('.view-widget'), c=q('.widget-card');
 return {innerHeight,docScrollHeight:document.documentElement.scrollHeight,bodyScrollHeight:document.body.scrollHeight,view:rr('.view-widget'),card:rr('.widget-card'),stage:rr('.widget-stage'),topbar:rr('.topbar'),scroll:{client:v.clientHeight,content:v.scrollHeight,overflow:getComputedStyle(v).overflowY},gap:innerHeight-c.getBoundingClientRect().bottom};
 })()`);
 console.log(JSON.stringify(r,null,2)); w.destroy(); app.exit(0);
});
