const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

app.whenReady().then(async () => {
  // Keep the window visible to Chromium while placing it outside the desktop;
  // hidden/offscreen windows do not advance pseudo-element opacity transitions.
  const win = new BrowserWindow({
    x: -1200,
    y: -800,
    width: 1080,
    height: 800,
    show: true,
    frame: false,
    backgroundColor: '#f0f1f2',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  try {
    await win.loadFile(path.join(process.cwd(), 'index.html'));
    await win.webContents.executeJavaScript(`document.body.classList.add('electron-window'); document.documentElement.classList.add('electron-window'); renderPreviewDemo(); setTheme('day', false); setMode('full'); void 0`);
    await wait(700);

    const result = await win.webContents.executeJavaScript(`(() => {
      const shell = document.querySelector('.app-shell');
      const card = document.querySelector('.kpi-card')?.getBoundingClientRect();
      const x = Math.round((card?.left || 32) + (card?.width || 240) * .75);
      const y = Math.round((card?.top || 220) + (card?.height || 200) * .5);
      const target = document.elementFromPoint(x, y);
      target?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' }));
      target?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' }));
      return { x, y };
    })()`);
    await wait(240);

    const active = await win.webContents.executeJavaScript(`(() => {
      const shell = document.querySelector('.app-shell');
      const pseudo = getComputedStyle(shell, '::after');
      return {
        active: shell.classList.contains('pointer-field-active'),
        hovered: Boolean(document.querySelector('.interactive-surface.is-hovered')),
        opacity: pseudo.opacity,
        background: pseudo.backgroundImage,
        core: getComputedStyle(shell).getPropertyValue('--ambient-pointer-core').trim(),
        mid: getComputedStyle(shell).getPropertyValue('--ambient-pointer-mid').trim(),
        edge: getComputedStyle(shell).getPropertyValue('--ambient-pointer-edge').trim()
      };
    })()`);

    await win.webContents.executeJavaScript(`document.querySelector('.app-shell').dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })); void 0`);
    await wait(40);
    const cleared = await win.webContents.executeJavaScript(`!document.querySelector('.app-shell').classList.contains('pointer-field-active')`);

    // The model table is a clipped/scrollable panel in the full view. Verify
    // that the same window-wide field reaches it instead of stopping at the
    // row that owns the pointer.
    const modelTarget = await win.webContents.executeJavaScript(`(() => {
      const view = document.querySelector('.view-full');
      view.scrollTop = view.scrollHeight;
      const row = document.querySelector('.models-panel .table-row:not(.table-head)');
      const rect = row?.getBoundingClientRect();
      const x = Math.round((rect?.left || 50) + (rect?.width || 600) * .55);
      const y = Math.round((rect?.top || 260) + (rect?.height || 44) * .5);
      row?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' }));
      row?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' }));
      return { x, y, row: rect?.toJSON(), scrollTop: view.scrollTop };
    })()`);
    await wait(240);
    const modelActive = await win.webContents.executeJavaScript(`(() => {
      const shell = document.querySelector('.app-shell');
      const pseudo = getComputedStyle(shell, '::after');
      return { active: shell.classList.contains('pointer-field-active'), hovered: Boolean(document.querySelector('.models-panel .table-row.is-hovered')), opacity: pseudo.opacity, background: pseudo.backgroundImage };
    })()`);
    await win.webContents.executeJavaScript(`document.querySelector('.app-shell').dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })); void 0`);

    console.log(JSON.stringify({ target: result, active, cleared, modelTarget, modelActive }, null, 2));
    assert(active.active && active.hovered, 'ambient pointer field did not activate with the local surface');
    assert(active.opacity === '1', `ambient field opacity is ${active.opacity}`);
    assert(active.background.includes('clamp(420px, 72vmax, 900px)'), 'ambient field is not window-spanning');
    assert(/\.105\b|0\.105\b/.test(active.core) && /\.052\b|0\.052\b/.test(active.mid) && /\.018\b|0\.018\b/.test(active.edge), 'daylight red field tiers are missing');
    assert(cleared, 'ambient pointer field was not cleared on pointerleave');
    assert(modelActive.active && modelActive.hovered && modelActive.opacity === '1', 'ambient field did not reach the model usage panel');
    console.log('ambient pointer field contract passed');
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
