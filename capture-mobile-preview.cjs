const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const outputDir = path.join(process.cwd(), 'dist', 'mobile-preview');
const cases = [
  ['mobile-360-day', 360, 800, 'day'],
  ['mobile-360-night', 360, 800, 'night'],
  ['mobile-412-day', 412, 915, 'day'],
  ['mobile-412-night', 412, 915, 'night']
];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function capture(win, [name, width, height, theme]) {
  win.setBounds({ x: 0, y: 0, width, height });
  await win.loadFile(path.join(process.cwd(), 'mobile', 'index.html'));
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await win.webContents.executeJavaScript(`if(document.body.dataset.theme !== '${theme}') document.querySelector('#themeToggle').click(); void 0;`);
  // Let the section-enter animation and the offscreen compositor settle before
  // taking the frame. invalidate() is needed after a theme-only attribute
  // change because hidden WebContents may otherwise reuse the previous paint.
  win.webContents.invalidate();
  await wait(2800);
  const image = await win.webContents.capturePage({ stayHidden: true });
  fs.writeFileSync(path.join(outputDir, `${name}.png`), image.toPNG());
  const metrics = await win.webContents.executeJavaScript(`JSON.stringify({w:innerWidth,h:innerHeight,theme:document.body.dataset.theme,background:getComputedStyle(document.body).backgroundColor,sections:[...document.querySelectorAll('.mobile-section')].map(x=>({name:x.dataset.section,hidden:x.hidden,scroll:x.scrollHeight})),kpi:[...document.querySelectorAll('.kpi-mobile-card')].map(x=>x.getBoundingClientRect().toJSON()),horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})`);
  return { name, ...JSON.parse(metrics) };
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const win = new BrowserWindow({ width: 360, height: 800, show: false, offscreen: true, frame: false, backgroundColor: '#f0f0f0', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.webContents.debugger.attach('1.3');
  try {
    const metrics = [];
    for (const item of cases) metrics.push(await capture(win, item));
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
