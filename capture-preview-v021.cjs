const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const outputDir = path.join(process.cwd(), 'dist', 'preview-v021');

const captures = [
  ['full-day', 1080, 800, 'full', 'bars', 'day'],
  ['full-night', 1080, 800, 'full', 'bars', 'night'],
  ['history-90-day', 1080, 800, 'full', 'heatmap', 'day'],
  ['history-90-night', 1080, 800, 'full', 'heatmap', 'night'],
  ['widget-day', 360, 360, 'widget', 'bars', 'day'],
  ['widget-night', 360, 360, 'widget', 'bars', 'night'],
  ['widget-tall', 520, 1400, 'widget', 'bars', 'night'],
  ['widget-wide', 1080, 800, 'widget', 'bars', 'day']
];

async function paint(win) {
  await win.webContents.executeJavaScript(`(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  })()`);
  await wait(120);
  win.webContents.invalidate();
  await wait(80);
}

async function captureOne(win, [name, width, height, mode, chart, theme]) {
  win.setBounds({ x: 0, y: 0, width, height });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript(`
    localStorage.removeItem('apiusagebar-theme-v2');
    document.body.classList.add('electron-window');
    document.documentElement.classList.add('electron-window');
    if (typeof renderPreviewDemo === 'function') renderPreviewDemo();
    if (typeof setTheme === 'function') setTheme('${theme}', false);
    if (typeof setMode === 'function') setMode('${mode}');
    if (typeof setChart === 'function') setChart('${chart}');
    void 0;
  `);
  // The page's browser-preview bootstrap also renders its demo data. Let that
  // synchronous bootstrap finish before applying the capture state so the
  // requested chart/mode remains the visible one.
  await wait(120);
  await win.webContents.executeJavaScript(`
    if (typeof setTheme === 'function') setTheme('${theme}', false);
    if (typeof setMode === 'function') setMode('${mode}');
    if (typeof setChart === 'function') setChart('${chart}');
    void 0;
  `);

  if (chart === 'heatmap') {
    await win.webContents.executeJavaScript(`(() => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const daily = Array.from({ length: 90 }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (89 - index));
        const requests = index % 9 === 0 ? 120 + index : index % 4 === 0 ? 36 : 0;
        return { date: date.toISOString().slice(0, 10), spent: requests * .011, tokens: requests * 1800, requests };
      });
      renderHeatmap(daily);
      setChart('heatmap');
      return daily.length;
    })()`);
  }
  await paint(win);
  const image = await win.webContents.capturePage({ stayHidden: true });
  fs.writeFileSync(path.join(outputDir, `${name}.png`), image.toPNG());
  return JSON.parse(await win.webContents.executeJavaScript(`JSON.stringify((() => {
    const q = selector => document.querySelector(selector);
    const card = q('.widget-card');
    const stage = q('.widget-stage');
    const panel = q('.usage-panel');
    const body = q('.heatmap-body');
    const grid = q('#heatmapGrid');
    const selected = q('#heatmapSelected');
    const summary = q('.panel-summary');
    const color = selector => getComputedStyle(q(selector)).color;
    const bg = selector => getComputedStyle(q(selector)).backgroundColor;
    return {
      name: '${name}', mode: document.body.dataset.mode,
      theme: document.body.classList.contains('night-mode') ? 'night' : 'day',
      card: card?.getBoundingClientRect().toJSON(),
      stage: stage?.getBoundingClientRect().toJSON(),
      history: panel ? {
        className: panel.className,
        grid: grid?.getBoundingClientRect().toJSON(),
        selected: selected?.getBoundingClientRect().toJSON(),
        summary: summary?.getBoundingClientRect().toJSON(),
        scrollWidth: body?.scrollWidth, clientWidth: body?.clientWidth,
        fit: body?.dataset.fit, virtualized: grid?.dataset.virtualized
      } : null,
      colors: { accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        active: color('.mode-btn.active'), button: bg('.open-full'), heat4: bg('.heat-cell.level-4') },
      chartButtons: [...document.querySelectorAll('.chart-toggle')].map(button => ({chart:button.dataset.chart, text:button.textContent, active:button.classList.contains('active'), background:getComputedStyle(button).backgroundColor, rect:button.getBoundingClientRect().toJSON()})),
      chartViews: [...document.querySelectorAll('[data-chart-view]')].map(view => ({chart:view.dataset.chartView, active:view.classList.contains('active')}))
    };
  })())`));
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1080, height: 800, show: false, offscreen: true, frame: false,
    backgroundColor: '#202020',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  try {
    const metrics = [];
    for (const capture of captures) metrics.push(await captureOne(win, capture));
    fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(JSON.stringify(metrics, null, 2));
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
