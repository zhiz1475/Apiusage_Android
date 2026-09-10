const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const makeDailySource = `days => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - (days - 1 - index));
    const requests = index % 9 === 0 ? 120 + index : index % 4 === 0 ? 36 : 0;
    return { date: date.toISOString().slice(0, 10), spent: requests * .011, tokens: requests * 1800, requests };
  });
}`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 800,
    show: false,
    offscreen: true,
    frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  try {
    await win.loadFile(path.join(process.cwd(), 'index.html'));
    await wait(160);
    await win.webContents.executeJavaScript(`document.body.classList.add('electron-window'); document.documentElement.classList.add('electron-window'); renderPreviewDemo(); void 0;`);
    await wait(120);

    const history = await win.webContents.executeJavaScript(`(async () => {
      const waitFrame = ${frame.toString()};
      const makeDaily = ${makeDailySource};
      const q = selector => document.querySelector(selector);
      const rect = selector => q(selector)?.getBoundingClientRect();
      setTheme('day'); setMode('full'); renderHeatmap(makeDaily(90)); setChart('heatmap');
      await waitFrame();
      const body = q('.heatmap-body');
      const grid = q('#heatmapGrid');
      const gridRect = rect('#heatmapGrid');
      const selected = rect('#heatmapSelected');
      const summary = rect('.panel-summary');
      return {
        active: [...document.querySelectorAll('.chart-toggle')].find(button => button.classList.contains('active'))?.dataset.chart,
        panelWidth: rect('.usage-panel')?.width,
        gridWidth: gridRect?.width,
        selectedGap: selected && gridRect ? selected.top - gridRect.bottom : null,
        summaryGap: selected && summary ? summary.top - selected.bottom : null,
        fit: body?.dataset.fit,
        scrollWidth: body?.scrollWidth,
        clientWidth: body?.clientWidth
      };
    })()`);

    // The compact widget target is 360×360 DIP. Verify the reduced footprint
    // first so the title-bar controls and the complete card remain visible at
    // the normal size before exercising a manually tall window.
    await win.setBounds({ x: 0, y: 0, width: 360, height: 360 });
    await wait(100);
    await win.webContents.executeJavaScript(`(() => { setTheme('night'); setMode('widget'); void 0; })()`);
    await wait(560);
    const compactWidget = await win.webContents.executeJavaScript(`(() => {
      const q = selector => document.querySelector(selector);
      const rect = selector => q(selector)?.getBoundingClientRect();
      const card = rect('.widget-card');
      const view = rect('.view-widget');
      const pin = rect('#widgetPin');
      const refresh = rect('#refreshWidget');
      const modeSwitch = rect('.mode-switch');
      const shell = rect('.widget-card');
      const scroller = q('.view-widget');
      return {
        viewport: [innerWidth, innerHeight],
        card: card?.toJSON(),
        view: view?.toJSON(),
        controls: { pin: pin?.toJSON(), refresh: refresh?.toJSON(), modeSwitch: modeSwitch?.toJSON() },
        cardHeight: shell?.height,
        scroll: { client: scroller?.clientHeight, content: scroller?.scrollHeight }
      };
    })()`);

    await win.setBounds({ x: 0, y: 0, width: 520, height: 1400 });
    await wait(100);
    await win.webContents.executeJavaScript(`(() => { setTheme('night'); setMode('widget'); void 0; })()`);

    // Let the spring settle before checking the fixed widget geometry; the
    // transition intentionally overshoots its final bounds for a few frames.
    await wait(560);
    const widget = await win.webContents.executeJavaScript(`(() => {
      const card = document.querySelector('.widget-card')?.getBoundingClientRect();
      return { card: card?.toJSON(), viewport: [innerWidth, innerHeight] };
    })()`);
    const accent = await win.webContents.executeJavaScript(`(() => {
      const q = selector => document.querySelector(selector);
      return {
        variable: getComputedStyle(q('.open-full')).getPropertyValue('--accent').trim(),
        active: getComputedStyle(q('.mode-btn.active')).color,
        button: getComputedStyle(q('.open-full')).backgroundColor,
        hero: getComputedStyle(q('.hero-value')).color,
        logoBorder: getComputedStyle(q('.brand-mark')).borderWidth,
        logoFilter: getComputedStyle(q('.brand-mark img')).filter,
        widgetPin: Boolean(q('#widgetPin'))
      };
    })()`);

    await win.setBounds({ x: 0, y: 0, width: 1080, height: 800 });
    await wait(100);
    const virtual = await win.webContents.executeJavaScript(`(async () => {
      const waitFrame = ${frame.toString()};
      const makeDaily = ${makeDailySource};
      setMode('full'); renderHeatmap(makeDaily(1000)); setChart('heatmap');
      await waitFrame();
      const grid = document.querySelector('#heatmapGrid');
      const body = document.querySelector('.heatmap-body');
      return {
        enabled: grid.dataset.virtualized === 'true',
        cells: grid.querySelectorAll('.heat-cell').length,
        columns: Number(grid.style.getPropertyValue('--heat-columns') || 0),
        scrollWidth: body.scrollWidth,
        clientWidth: body.clientWidth
      };
    })()`);

    const result = { history, compactWidget, widget, accent, virtual };
    console.log(JSON.stringify(result, null, 2));
    assert(history.active === 'heatmap', 'history toggle is not active');
    assert(history.selectedGap >= 0 && history.selectedGap <= 24, `history selected gap ${history.selectedGap}`);
    assert(history.summaryGap >= 0 && history.summaryGap <= 24, `history summary gap ${history.summaryGap}`);
    assert(history.fit === 'wide' && history.scrollWidth <= history.clientWidth + 1, 'short history did not fit the panel');
    assert(history.gridWidth >= history.panelWidth * .8, 'short history grid remains stranded at the left');
    assert(compactWidget.viewport[0] === 360 && compactWidget.viewport[1] === 360, 'compact widget target is not 360×360 DIP');
    assert(compactWidget.card && compactWidget.card.bottom <= compactWidget.view.bottom + 1, 'compact widget card is clipped');
    assert(compactWidget.controls.pin && compactWidget.controls.refresh, 'compact widget controls are missing');
    assert(compactWidget.controls.modeSwitch && compactWidget.controls.modeSwitch.right <= compactWidget.viewport[0] + 1, 'compact mode switch overflows');
    assert(compactWidget.cardHeight <= 360, `compact widget card remains too tall (${compactWidget.cardHeight})`);
    assert(compactWidget.scroll.content <= compactWidget.scroll.client + 1, 'compact widget unexpectedly scrolls at target size');
    assert(widget.card && widget.card.top < 140, `widget top gap is ${widget.card?.top}`);
    assert(widget.card && widget.card.right <= widget.viewport[0] + 1, 'widget card overflows horizontally');
    assert(accent.variable === '#873943', `unexpected night accent ${accent.variable}`);
    assert(/135, 57, 67/.test(`${accent.active} ${accent.button}`), 'dark-red accent is not visible');
    assert(accent.logoBorder === '0px' && accent.logoFilter === 'none', 'logo still has a frame or grayscale filter');
    assert(accent.widgetPin, 'widget pin control is missing');
    assert(virtual.enabled && virtual.columns > 60 && virtual.cells < 700, 'long history is not virtualized');
    console.log('ui v0.2.1 layout/theme contract passed');
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
