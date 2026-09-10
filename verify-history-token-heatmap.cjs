const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 800,
    show: false,
    offscreen: true,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  try {
    await win.loadFile(path.join(process.cwd(), 'index.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const base = {
        authenticated: true,
        currencySymbol: '$',
        account: {},
        subscriptionSummary: {},
        subscriptions: [],
        models: { week: [], today: [] },
        today: { spent: 1, tokens: '2500', requests: 2 },
        week: { spent: 9, tokens: 999999, inputTokens: 500000, outputTokens: 499999, requests: 9 },
        daily: [
          { date: '2026-09-01', tokens: '1000', requests: 1, spent: .1 },
          { date: '2026-09-02', tokens: 2000, requests: 2, spent: .2 },
          { date: '2026-09-03', tokens: null, requests: 0, spent: 0 },
          { date: '2026-09-04', requests: 0, spent: 0 }
        ]
      };
      renderDashboard(base);
      const text = id => document.querySelector(id)?.textContent;
      const populated = {
        today: text('#kpiTodayTokens'),
        history: text('#kpiTokenValue'),
        input: text('#kpiInputTokens'),
        output: text('#kpiOutputTokens'),
        inputBar: document.querySelector('#kpiInputBar')?.style.width,
        outputBar: document.querySelector('#kpiOutputBar')?.style.width
      };

      renderDashboard({
        ...base,
        today: { spent: 0, requests: 0 },
        daily: [
          { date: '2026-09-01', requests: 4, spent: .1 },
          { date: '2026-09-02', tokens: '', requests: 2, spent: .2 }
        ]
      });
      const missing = {
        today: text('#kpiTodayTokens'),
        history: text('#kpiTokenValue'),
        input: text('#kpiInputTokens'),
        output: text('#kpiOutputTokens')
      };

      const heatDaily = Array.from({ length: 9 }, (_, index) => ({
        date: '2026-09-' + String(index + 1).padStart(2, '0'),
        tokens: index,
        requests: index,
        spent: index / 100
      }));
      setMode('full');
      setTheme('day');
      renderHeatmap(heatDaily);
      setChart('heatmap');
      const color = level => getComputedStyle(document.querySelector('.heat-cell.level-' + level)).backgroundColor;
      const levels = [...document.querySelectorAll('.heat-cell')]
        .filter(cell => !cell.disabled)
        .reduce((counts, cell) => {
          const level = [...cell.classList].find(name => name.startsWith('level-'));
          counts[level] = (counts[level] || 0) + 1;
          return counts;
        }, {});
      const day = [0, 1, 2, 3, 4].map(color);
      setTheme('night');
      await new Promise(resolve => setTimeout(resolve, 220));
      void document.body.offsetHeight;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const night = [0, 1, 2, 3, 4].map(color);
      return { populated, missing, levels, day, night, bodyClass: document.body.className };
    })()`);

    console.log(JSON.stringify(result, null, 2));
    assert(result.populated.today === 'Token 2.5K', `today token: ${result.populated.today}`);
    assert(result.populated.history === '3.0K', `history token: ${result.populated.history}`);
    assert(result.populated.history !== '1000.0K', 'history token reused the weekly aggregate');
    assert(result.populated.input === '输入 —' && result.populated.output === '输出 —', 'invented historical input/output split');
    assert(result.populated.inputBar === '0%' && result.populated.outputBar === '0%', 'unknown token split should have empty bars');
    assert(result.missing.today === 'Token —', 'missing today token should render as dash');
    assert(result.missing.history === '—', 'missing historical token should render as dash');
    [0, 1, 2, 3, 4].forEach(level => assert(result.levels[`level-${level}`] > 0, `missing heat level ${level}`));
    assert(result.day[0] === 'rgb(229, 229, 229)' && result.day[1] === 'rgb(199, 199, 199)', 'day no/low usage must stay grayscale');
    assert(result.day[2] === 'rgb(154, 74, 82)' && result.day[4] === 'rgb(85, 27, 34)', 'day high usage must use dark-red tiers');
    assert(result.bodyClass.includes('night-mode'), 'night theme class was not applied');
    assert(result.night[0] === 'rgb(56, 56, 60)' && result.night[1] === 'rgb(85, 85, 90)', 'night no/low usage must stay grayscale');
    assert(result.night[2] === 'rgb(99, 48, 57)' && result.night[4] === 'rgb(145, 63, 73)', 'night high usage must use visible dark-red tiers');
    console.log('history token and heatmap contract passed');
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.exit(process.exitCode || 0);
  }
});
