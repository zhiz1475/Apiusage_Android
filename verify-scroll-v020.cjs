const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    offscreen: true,
    frame: false,
    width: 1080,
    height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  try {
    await win.loadFile(path.join(process.cwd(), 'index.html'));
    await win.webContents.executeJavaScript(`
      localStorage.removeItem('apiusagebar-theme');
      renderPreviewDemo();
      document.body.classList.add('electron-window');
      document.documentElement.classList.add('electron-window');
      setTheme('day');
      setMode('full');
      void 0;
    `);
    await wait(1250);
    const fullStart = await win.webContents.executeJavaScript(`JSON.stringify((() => {
      const view = document.querySelector('.view-full');
      const indicator = document.querySelector('.scroll-indicator');
      return {
        mode: document.body.dataset.mode,
        overflow: view.scrollHeight - view.clientHeight,
        visible: indicator.classList.contains('is-visible'),
        nativeScrollbar: getComputedStyle(view, '::-webkit-scrollbar').width,
        thumb: document.querySelector('.scroll-thumb').getBoundingClientRect().height
      };
    })())`);
    await win.webContents.executeJavaScript(`(() => { const view = document.querySelector('.view-full'); view.scrollTop = view.scrollHeight; view.dispatchEvent(new Event('scroll')); })()`);
    await wait(500);
    const fullEnd = await win.webContents.executeJavaScript(`JSON.stringify((() => ({
      scrollTop: document.querySelector('.view-full').scrollTop,
      ariaNow: document.querySelector('.scroll-indicator').getAttribute('aria-valuenow'),
      thumbTransform: document.querySelector('.scroll-thumb').style.transform,
      bound: window.__scrollBound = Boolean(scrollState?.scroller === document.querySelector('.view-full')),
      maxThumbTop: scrollState?.maxThumbTop,
      frame: scrollState?.frame
    }))())`);
    await win.webContents.executeJavaScript(`setMode('widget'); void 0`);
    await wait(1250);
    const widget = await win.webContents.executeJavaScript(`JSON.stringify((() => {
      const stage = document.querySelector('.widget-stage');
      const shell = document.querySelector('.app-shell');
      return {
        mode: document.body.dataset.mode,
        shell: shell.getBoundingClientRect().toJSON(),
        stage: { client: stage.clientHeight, scroll: stage.scrollHeight, overflow: getComputedStyle(stage).overflowY },
        horizontal: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      };
    })())`);
    console.log(JSON.stringify({ fullStart: JSON.parse(fullStart), fullEnd: JSON.parse(fullEnd), widget: JSON.parse(widget) }, null, 2));
    app.exit(0);
  } catch (error) {
    console.error(error.stack || error);
    app.exit(1);
  }
});
