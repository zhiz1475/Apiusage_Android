const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:360,height:800,show:false,offscreen:true,frame:false,backgroundColor:'#f0f0f0',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadFile(path.join(root,'index.html'));
  const css = fs.readFileSync(path.join(root,'MOBILE-UI-PLAN.md'),'utf8');
  const rules = [...css.matchAll(/```css\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n');
  await win.webContents.executeJavaScript(`(() => { document.body.classList.add('mobile-app'); const s=document.createElement('style'); s.id='mobile-proposal'; s.textContent=${JSON.stringify(rules)}; document.head.appendChild(s); if (typeof renderPreviewDemo==='function') renderPreviewDemo(); document.body.classList.remove('electron-window'); document.documentElement.classList.remove('electron-window'); return true; })()`);
  await new Promise(r=>setTimeout(r,800));
  await win.webContents.executeJavaScript(`(() => { if (typeof setTheme==='function') setTheme('day',false); if (typeof setMode==='function') setMode('full'); return true; })()`);
  await new Promise(r=>setTimeout(r,500)); await win.webContents.executeJavaScript(if (typeof setMode==='function') setMode('full'); if (typeof setTheme==='function') setTheme('day',false);); await new Promise(r=>setTimeout(r,600)); win.webContents.invalidate(); await new Promise(r=>setTimeout(r,200));
  const image=await win.webContents.capturePage({stayHidden:true});
  fs.mkdirSync(path.join(root,'dist','mobile-preview'),{recursive:true}); fs.writeFileSync(path.join(root,'dist','mobile-preview','full-day-360x800.png'),image.toPNG());
  const metrics=await win.webContents.executeJavaScript(`JSON.stringify((()=>{const q=s=>document.querySelector(s); const r=s=>q(s)?.getBoundingClientRect().toJSON(); return {mode:document.body.dataset.mode,viewport:{w:innerWidth,h:innerHeight},shell:r('.app-shell'),topbar:r('.topbar'),kpis:[...document.querySelectorAll('.kpi-card')].map(x=>x.getBoundingClientRect().toJSON()),toolbar:r('.full-toolbar'),content:r('.content-grid'),models:r('.models-panel'),table:r('.models-table'),overflow:{doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,full:q('.view-full')?.scrollWidth}}})())`);
  fs.writeFileSync(path.join(root,'dist','mobile-preview','metrics.json'),metrics); console.log(metrics); win.destroy(); app.quit();
});

