const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1080, height: 800, show: false, offscreen: true, frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  await w.loadFile(path.join(process.cwd(), 'index.html'));
  await sleep(160);
  await w.webContents.executeJavaScript("document.body.classList.add('electron-window'); document.documentElement.classList.add('electron-window'); renderPreviewDemo(); void 0;");
  await sleep(120);
  await w.webContents.executeJavaScript("setTheme('day'); setMode('full'); void 0;");
  await sleep(100);
  await w.setBounds({ x: 0, y: 0, width: 520, height: 1400 });
  await w.webContents.executeJavaScript("setTheme('night'); setMode('widget'); void 0;");
  for (const delay of [100, 300, 560, 900, 1300]) {
    await sleep(delay === 100 ? 100 : delay - (delay === 300 ? 100 : delay === 560 ? 300 : delay === 900 ? 560 : 900));
    const out = await w.webContents.executeJavaScript(`(() => {
      const app=document.querySelector('.app-shell'), view=document.querySelector('.view-widget'), card=document.querySelector('.widget-card');
      const ca=getComputedStyle(app), cv=getComputedStyle(view);
      return {delay:${delay}, appClass:app.className, viewClass:view.className, appAnim:ca.animationName, appTransform:ca.transform, appOpacity:ca.opacity, viewAnim:cv.animationName, viewTransform:cv.transform, viewOpacity:cv.opacity, rect:card.getBoundingClientRect().toJSON()};
    })()`);
    console.log(JSON.stringify(out));
  }
  w.destroy(); app.exit(0);
});
