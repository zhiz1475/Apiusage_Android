const { app, BrowserWindow } = require('electron');
const path = require('node:path');

async function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function json(value) { console.log(JSON.stringify(value)); }

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1080, height: 800, show: false, offscreen: true, frame: false, transparent: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript(`document.body.classList.add('electron-window'); document.documentElement.classList.add('electron-window'); if (typeof renderPreviewDemo==='function') renderPreviewDemo(); document.querySelector('.mode-btn[data-mode="full"]')?.click(); void 0`);
  await pause(900);
  const initial = await win.webContents.executeJavaScript(`(() => { const s=document.querySelector('.view-full'), i=document.querySelector('#scrollIndicator'), t=document.querySelector('#scrollThumb'); return {inner:[innerWidth,innerHeight], mode:document.body.dataset.mode, overflow:s.scrollHeight-s.clientHeight, scrollTop:s.scrollTop, indicator:{class:i.className,hidden:i.getAttribute('aria-hidden'),rect:i.getBoundingClientRect().toJSON(),thumb:t.getBoundingClientRect().toJSON(),transform:getComputedStyle(t).transform,now:i.getAttribute('aria-valuenow'),max:i.getAttribute('aria-valuemax')}}; })()`);
  json({phase:'initial', ...initial});
  const mid = await win.webContents.executeJavaScript(`(async () => { const s=document.querySelector('.view-full'), i=document.querySelector('#scrollIndicator'), t=document.querySelector('#scrollThumb'); s.scrollTop=(s.scrollHeight-s.clientHeight)/2; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return {scrollTop:s.scrollTop,transform:getComputedStyle(t).transform,now:i.getAttribute('aria-valuenow')}; })()`);
  json({phase:'mid-scroll', ...mid});
  const drag = await win.webContents.executeJavaScript(`(async () => { const s=document.querySelector('.view-full'), i=document.querySelector('#scrollIndicator'), t=document.querySelector('#scrollThumb'); const tr=i.getBoundingClientRect(), th=t.getBoundingClientRect(); const down=new PointerEvent('pointerdown',{bubbles:true,clientX:th.left+th.width/2,clientY:th.top+th.height/2,pointerId:71,isPrimary:true}); t.dispatchEvent(down); const move=new PointerEvent('pointermove',{bubbles:true,clientX:th.left+th.width/2,clientY:tr.bottom-th.height/2, pointerId:71,isPrimary:true}); t.dispatchEvent(move); t.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:th.left+th.width/2,clientY:tr.bottom-th.height/2,pointerId:71,isPrimary:true})); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return {scrollTop:s.scrollTop,overflow:s.scrollHeight-s.clientHeight,dragging:i.classList.contains('is-dragging'),now:i.getAttribute('aria-valuenow'),transform:getComputedStyle(t).transform}; })()`);
  json({phase:'drag-to-bottom', ...drag});
  const widget = await win.webContents.executeJavaScript(`(async () => { document.querySelector('.mode-btn[data-mode="widget"]')?.click(); await new Promise(r=>setTimeout(r,600)); const s=document.querySelector('.widget-stage'), i=document.querySelector('#scrollIndicator'), t=document.querySelector('#scrollThumb'); return {mode:document.body.dataset.mode, stage:{client:s.clientHeight,scroll:s.scrollHeight,overflow:s.scrollHeight-s.clientHeight},indicator:{class:i.className,hidden:i.getAttribute('aria-hidden'),rect:i.getBoundingClientRect().toJSON(),thumb:t.getBoundingClientRect().toJSON()}}; })()`);
  json({phase:'widget', ...widget});
  await win.setSize(400, 500);
  await pause(700);
  const short = await win.webContents.executeJavaScript(`(() => { const s=document.querySelector('.widget-stage'), i=document.querySelector('#scrollIndicator'), t=document.querySelector('#scrollThumb'); return {inner:[innerWidth,innerHeight],stage:{client:s.clientHeight,scroll:s.scrollHeight,overflow:s.scrollHeight-s.clientHeight},indicator:{class:i.className,hidden:i.getAttribute('aria-hidden'),rect:i.getBoundingClientRect().toJSON(),thumb:t.getBoundingClientRect().toJSON()}}; })()`);
  json({phase:'short-widget', ...short});
  await win.webContents.executeJavaScript(`(async () => { const s=document.querySelector('.widget-stage'), i=document.querySelector('#scrollIndicator'), t=document.querySelector('#scrollThumb'); s.scrollTop=s.scrollHeight; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); return {scrollTop:s.scrollTop,now:i.getAttribute('aria-valuenow'),max:i.getAttribute('aria-valuemax'),transform:getComputedStyle(t).transform}; })()`);
  const after = await win.webContents.executeJavaScript(`(() => { const s=document.querySelector('.widget-stage'), i=document.querySelector('#scrollIndicator'), t=document.querySelector('#scrollThumb'); return {scrollTop:s.scrollTop,now:i.getAttribute('aria-valuenow'),max:i.getAttribute('aria-valuemax'),transform:getComputedStyle(t).transform}; })()`);
  json({phase:'short-widget-bottom', ...after});
  app.exit(0);
});
