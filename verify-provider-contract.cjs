// Offline provider-contract checks for Kapibala response compatibility.
//
// These checks replace the client's request method with an in-memory mock, so
// no network connection, account, token, or credential file is used.
// Run with either:
//   node verify-provider-contract.cjs
//   npx electron verify-provider-contract.cjs

const assert = require('node:assert/strict');
const { KapibalaClient } = require('./kapibala-client.cjs');

// `require('electron')` resolves to a package path under plain Node.  When
// this file is launched by Electron it exposes the app object; use it only to
// terminate the one-shot verifier cleanly after the mock assertions finish.
const electronApp = (() => {
  try {
    const electron = require('electron');
    return electron && typeof electron === 'object' ? electron.app : null;
  } catch {
    return null;
  }
})();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const secondsStamp = Math.floor((now - DAY) / 1000);
const millisStamp = now - 2 * DAY;

function bareClient(request) {
  const client = Object.create(KapibalaClient.prototype);
  client.baseUrl = 'https://mock.invalid';
  client.lastHistoryComplete = true;
  client.request = request;
  return client;
}

async function verifyDataExportRows() {
  const calls = [];
  const client = bareClient(async url => {
    calls.push(new URL(url));
    return {
      body: {
        // The provider wraps aggregate rows in `data`.
        data: [
          // Millisecond timestamp and numeric strings.
          { created_at: millisStamp, model_name: 'gpt-4o', quota: '50', token_used: '120', count: '3' },
          // Second timestamp; token count is inferred from input/output fields.
          { created_at: String(secondsStamp), model: 'claude-3', used_quota: '25', prompt_tokens: '4', completion_tokens: '6', count: '2' },
          // A valid row with optional fields missing exercises defaults.
          { created_at: String(secondsStamp + 1), model_name: '', quota: null },
          // Rows without a timestamp are invalid and must be ignored.
          { model_name: 'missing-date', quota: '999' }
        ]
      },
      headers: new Headers(),
      status: 200
    };
  });

  const start = new Date(millisStamp - DAY);
  const end = new Date(now + DAY);
  const rows = await client.fetchUsageDataRange(start, end, {});

  assert.equal(calls.length, 1, 'a short data-export range should use one request');
  assert.ok(Number(calls[0].searchParams.get('start_timestamp')) < 1e12, 'request timestamps use seconds');
  assert.ok(Number(calls[0].searchParams.get('end_timestamp')) < 1e12, 'request timestamps use seconds');
  assert.equal(rows.length, 3, 'invalid rows without timestamps are dropped');

  const millisRow = rows.find(row => row.model === 'gpt-4o');
  assert.ok(millisRow, 'millisecond row is retained');
  assert.equal(millisRow.createdAt.getTime(), millisStamp, 'millisecond timestamp is normalized');
  assert.equal(millisRow.quota, 50, 'numeric quota string is converted');
  assert.equal(millisRow.tokens, 120, 'explicit token count is converted');
  assert.equal(millisRow.requests, 3, 'numeric request count string is converted');

  const secondsRow = rows.find(row => row.model === 'claude-3');
  assert.ok(secondsRow, 'second-based row is retained');
  assert.equal(secondsRow.createdAt.getTime(), secondsStamp * 1000, 'second timestamp is normalized');
  assert.equal(secondsRow.quota, 25, 'used_quota alias is accepted');
  assert.equal(secondsRow.tokens, 10, 'input/output token fields are summed');
  assert.equal(secondsRow.requests, 2, 'request count is retained');

  const defaultRow = rows.find(row => row.model === 'Unknown Model');
  assert.ok(defaultRow, 'missing optional fields receive a safe model default');
  assert.equal(defaultRow.quota, 0, 'missing quota defaults to zero');
  assert.equal(defaultRow.tokens, 0, 'missing token fields default to zero');
  assert.equal(defaultRow.requests, 1, 'missing request count defaults to one');

  return { rows: rows.length, calls: calls.length };
}

async function verifyLogPagination() {
  const records = Array.from({ length: 205 }, (_, index) => ({
    id: `log-${index + 1}`,
    created_at: index % 2 ? String(secondsStamp) : millisStamp,
    model_name: index % 2 ? 'gpt-4o' : 'deepseek-chat',
    quota: String(index + 1),
    total_tokens: String((index + 1) * 10)
  }));
  const calls = [];
  const client = bareClient(async url => {
    const parsed = new URL(url);
    calls.push(parsed);
    const page = Number(parsed.searchParams.get('p') || 1);
    const start = (page - 1) * 100;
    return {
      // `total` is deliberately a numeric string to exercise schema coercion.
      body: { data: { total: '205', items: records.slice(start, start + 100) } },
      headers: new Headers(),
      status: 200
    };
  });

  const logs = await client.fetchLogs(new Date(millisStamp - DAY), new Date(now + DAY), {});
  assert.equal(logs.length, 205, 'log pagination returns all pages');
  assert.deepEqual([...new Set(calls.map(call => Number(call.searchParams.get('p'))))].sort((a, b) => a - b), [1, 2, 3], 'pages 1–3 are requested');
  assert.ok(logs.every(log => log.createdAt instanceof Date), 'all log timestamps are Date instances');
  assert.equal(logs[0].createdAt.getTime(), millisStamp, 'millisecond log timestamp is normalized');
  assert.equal(logs[1].createdAt.getTime(), secondsStamp * 1000, 'second log timestamp is normalized');
  assert.equal(logs[0].quota, 1, 'log quota numeric string is converted');
  assert.equal(logs[0].tokens, 10, 'log token numeric string is converted');

  // A response without `total` must still be accepted when the first page is
  // short. This also verifies the provider's optional pagination metadata.
  const noTotalClient = bareClient(async () => ({
    body: { data: { items: [{ id: 'short-1', created_at: String(secondsStamp), model: 'gpt-4o' }] } },
    headers: new Headers(),
    status: 200
  }));
  const shortLogs = await noTotalClient.fetchLogs(new Date(millisStamp - DAY), new Date(now + DAY), {});
  assert.equal(shortLogs.length, 1, 'missing pagination total is compatible');
  assert.equal(shortLogs[0].requests, 1, 'missing log fields receive safe defaults');

  return { rows: logs.length, pages: 3, noTotalRows: shortLogs.length };
}

async function verifyDashboardContract() {
  // Keep the aggregate row inside the current week even when the verifier is
  // run near a local-week boundary on a different host/time zone.
  const dashboardRowMillis = now - 2 * 60 * 60 * 1000;
  const createdAt = Math.floor(dashboardRowMillis / 1000);
  const dataCalls = [];
  let cachedDashboard = null;
  const client = bareClient(async url => {
    const parsed = new URL(url);
    switch (parsed.pathname) {
      case '/api/status':
        return { body: { data: { quota_per_unit: '100', quota_display_type: 'USD' } }, headers: new Headers(), status: 200 };
      case '/api/user/self':
        return {
          body: {
            data: {
              // Explicit total must win over remaining + used (900 vs 500+200).
              quota: '500',
              used_quota: '200',
              total_quota: '900',
              request_count: '7',
              created_at: String(createdAt)
              // status intentionally omitted to exercise a missing field.
            }
          },
          headers: new Headers(),
          status: 200
        };
      case '/api/subscription/self':
      case '/api/subscription/plans':
        return { body: { data: [] }, headers: new Headers(), status: 200 };
      case '/api/log/self/stat':
        // Stats responses may expose rates only; those values must not replace
        // the aggregate row's quota/token/request totals.
        return { body: { data: { rpm: '14.5', tpm: '1200' } }, headers: new Headers(), status: 200 };
      case '/api/data/self':
        dataCalls.push(parsed);
        return {
          body: {
            data: [{ created_at: dashboardRowMillis, model_name: 'gpt-4o', quota: '50', token_used: '120', count: '3' }]
          },
          headers: new Headers(),
          status: 200
        };
      default:
        throw new Error(`unexpected mock endpoint: ${parsed.pathname}`);
    }
  });
  client.readStore = async () => ({ accessToken: 'mock-token', tokenType: 'Bearer', username: 'contract-user', accessExpiresAt: Math.floor(Date.now() / 1000) + 3600 });
  client.readCache = async () => null;
  client.writeCache = async value => { cachedDashboard = value; };

  const dashboard = await client.loadDashboard();
  assert.equal(dataCalls.length, 1, 'dashboard reads the aggregate /api/data/self endpoint');
  assert.equal(dashboard.authenticated, true, 'dashboard remains authenticated with mock session');
  assert.equal(dashboard.account.balance, 5, 'remaining quota is converted using quota_per_unit');
  assert.equal(dashboard.account.used, 2, 'used quota is converted using quota_per_unit');
  assert.equal(dashboard.account.total, 9, 'explicit account total takes priority over a derived sum');
  assert.equal(dashboard.account.requests, 7, 'account request count accepts numeric strings');
  assert.equal(dashboard.account.status, 'enabled', 'missing account status receives a safe default');
  assert.equal(dashboard.week.requests, 3, 'aggregate row request count is applied to the weekly total');
  assert.equal(dashboard.week.tokens, 120, 'aggregate row token count is applied to the weekly total');
  assert.equal(dashboard.week.spent, 0.5, 'aggregate row quota is converted to display currency');
  assert.ok(cachedDashboard, 'dashboard cache write is attempted');

  return { total: dashboard.account.total, weekRequests: dashboard.week.requests, dataCalls: dataCalls.length };
}

(async () => {
  try {
    const data = await verifyDataExportRows();
    const logs = await verifyLogPagination();
    const dashboard = await verifyDashboardContract();
    console.log('provider contract mock passed');
    console.log(JSON.stringify({ data, logs, dashboard }, null, 2));
    electronApp?.exit?.(0);
  } catch (error) {
    console.error('provider contract mock failed');
    console.error(error?.stack || error);
    process.exitCode = 1;
    electronApp?.exit?.(1);
  }
})();
