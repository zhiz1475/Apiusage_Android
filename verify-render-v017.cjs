const { app, BrowserWindow, screen } = require('electron');
const path = require('node:path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

app.whenReady().then(async () => {
  const work = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
    x: work.x + 12,
    y: work.y + 12,
    width: 1080,
    height: 800,
    show: false,
    offscreen: true,
    frame: false,
    transparent: false,
    backgroundColor: '#151a25',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  await win.loadFile(path.join(process.cwd(), 'index.html'));
  await win.webContents.executeJavaScript(`
    document.body.classList.add('electron-window');
    document.body.dataset.mode = 'full';
    if (typeof renderPreviewDemo === 'function') renderPreviewDemo();
    document.querySelector('.mode-btn[data-mode="full"]').click();
    void 0;
  `);
  await new Promise(resolve => setTimeout(resolve, 600));
  const result = await win.webContents.executeJavaScript(`(async () => {
    const cell = document.querySelector('.heat-cell.level-4') || document.querySelector('.heat-cell');
    cell.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tip = document.querySelector('#dataTooltip');
    const style = getComputedStyle(tip);
    const ring = document.querySelector('.ring-stats');
    return {
      mode: document.body.dataset.mode,
      fullVisible: getComputedStyle(document.querySelector('.view-full')).display !== 'none',
      widgetHidden: getComputedStyle(document.querySelector('.view-widget')).display === 'none',
      tooltipVisible: tip.classList.contains('visible') && style.position === 'fixed' && style.visibility === 'visible',
      tooltipWithinViewport: (() => { const r = tip.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })(),
      ringTotals: ring?.innerText || '',
      ringTotalsVisible: Boolean(ring && ring.getBoundingClientRect().width > 0),
      pseudoDisabled: getComputedStyle(cell, '::after').content === 'none' || getComputedStyle(cell, '::after').display === 'none',
      font: getComputedStyle(document.body).fontFamily
    };
  })()`);
  assert(result.fullVisible && result.widgetHidden, 'mode visibility failed');
  assert(result.tooltipVisible && result.tooltipWithinViewport, 'tooltip positioning failed');
  assert(result.ringTotalsVisible && result.ringTotals.includes('总额度'), 'ring totals missing');
  console.log(JSON.stringify(result));
  app.exit(0);
}).catch(error => { console.error(error.stack || error); app.exit(1); });
