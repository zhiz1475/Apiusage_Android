const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 800,
    show: false,
    offscreen: true,
    frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  const result = await win.webContents.executeJavaScript(`(() => {
    renderPreviewDemo();
    setMode('full');
    setChart('heatmap');
    return new Promise(resolve => setTimeout(() => {
      const grid = document.querySelector('#heatmapGrid');
      const months = document.querySelector('#heatmapMonths');
      const wrap = document.querySelector('.heatmap-grid-wrap');
      resolve({
        cells: grid?.querySelectorAll('.heat-cell').length,
        columns: grid?.style.getPropertyValue('--heat-columns'),
        start: grid?.dataset.historyStart,
        end: grid?.dataset.historyEnd,
        monthLabels: months?.innerText,
        monthRects: months ? [...months.children].slice(0, 4).map(span => ({ text: span.textContent, rect: span.getBoundingClientRect().toJSON(), col: span.style.gridColumn })) : [],
        scroll: [wrap?.clientWidth, wrap?.scrollWidth],
        range: document.querySelector('#weekRangeLabel')?.textContent
      });
    }, 500));
  })()`);
  console.log(JSON.stringify(result, null, 2));
  app.exit(0);
});
