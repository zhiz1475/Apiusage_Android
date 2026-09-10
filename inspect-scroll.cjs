const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1080, height: 800, show: false, frame: false, transparent: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript(`document.body.classList.add('electron-window'); document.documentElement.classList.add('electron-window'); document.body.dataset.mode='full'; if (typeof renderPreviewDemo === 'function') renderPreviewDemo(); document.querySelector('.mode-btn[data-mode="full"]')?.click(); void 0`);
  await new Promise(resolve => setTimeout(resolve, 500));
  const result = await win.webContents.executeJavaScript(`(() => {
    const q = s => document.querySelector(s);
    const v = q('.view-full');
    const body = document.body;
    const html = document.documentElement;
    const css = s => { const x = getComputedStyle(q(s)); return { overflowY:x.overflowY, scrollbarWidth:x.scrollbarWidth, scrollbarColor:x.scrollbarColor }; };
    const pseudo = p => { const x = getComputedStyle(v, p); return {display:x.display, width:x.width, height:x.height, background:x.backgroundColor}; };
    return JSON.stringify({ inner:[innerWidth,innerHeight], html:{client:html.clientHeight,scroll:html.scrollHeight,overflow:getComputedStyle(html).overflowY}, body:{client:body.clientHeight,scroll:body.scrollHeight,overflow:getComputedStyle(body).overflowY}, view:{client:v.clientHeight,scroll:v.scrollHeight,overflow:getComputedStyle(v).overflowY,rect:v.getBoundingClientRect().toJSON()}, css:{view:css('.view-full'),body:css('body')}, pseudo:{dec:pseudo('::-webkit-scrollbar-button:decrement'),inc:pseudo('::-webkit-scrollbar-button:increment'),track:pseudo('::-webkit-scrollbar-track'),thumb:pseudo('::-webkit-scrollbar-thumb')}});
  })()`);
  console.log(result);
  app.exit(0);
});
