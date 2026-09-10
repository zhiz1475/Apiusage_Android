const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1080, height: 800, show: false, offscreen: true, frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  try {
    await win.loadFile(path.join(process.cwd(), 'index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      document.body.classList.add('electron-window');
      document.documentElement.classList.add('electron-window');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const daily = Array.from({ length: 1000 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (999 - i));
        const requests = i % 13 === 0 ? 200 + i : i % 5 === 0 ? 40 : 0;
        return { date: d.toISOString().slice(0, 10), requests, tokens: requests * 1000, spent: requests * 0.01 };
      });
      renderHeatmap(daily);
      setMode('full');
      setChart('heatmap');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const body = document.querySelector('.heatmap-body');
      const grid = document.querySelector('#heatmapGrid');
      const wrap = document.querySelector('.heatmap-grid-wrap');
      const initial = {
        virtualized: grid.dataset.virtualized,
        columns: grid.style.getPropertyValue('--heat-columns'),
        cells: grid.querySelectorAll('.heat-cell').length,
        virtualStart: grid.dataset.virtualStart,
        virtualEnd: grid.dataset.virtualEnd,
        wrapWidth: wrap.getBoundingClientRect().width,
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth,
        months: [...document.querySelectorAll('#heatmapMonths span')].length,
        firstMonth: document.querySelector('#heatmapMonths span')?.textContent,
        lastMonth: [...document.querySelectorAll('#heatmapMonths span')].at(-1)?.textContent
      };
      body.scrollLeft = body.scrollWidth;
      body.dispatchEvent(new Event('scroll'));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const endCell = grid.querySelector('.heat-cell');
      const atEnd = {
        scrollLeft: body.scrollLeft,
        virtualStart: grid.dataset.virtualStart,
        virtualEnd: grid.dataset.virtualEnd,
        cells: grid.querySelectorAll('.heat-cell').length,
        firstDate: endCell?.dataset.date,
        lastDate: [...grid.querySelectorAll('.heat-cell')].at(-1)?.dataset.date,
        scrollWidth: body.scrollWidth
      };
      const tooltipCell = grid.querySelector('.heat-cell:not(:disabled)');
      tooltipCell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, clientX: tooltipCell.getBoundingClientRect().left, clientY: tooltipCell.getBoundingClientRect().top }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const tip = document.querySelector('#dataTooltip');
      const tr = tip.getBoundingClientRect();
      const tooltip = { visible: tip.classList.contains('visible'), position: getComputedStyle(tip).position, visibility: getComputedStyle(tip).visibility, within: tr.left >= 0 && tr.top >= 0 && tr.right <= innerWidth && tr.bottom <= innerHeight };
      return { initial, atEnd, tooltip };
    })()`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.stack || error); app.exitCode = 1; }
  if (!win.isDestroyed()) win.destroy();
  app.exit();
});
