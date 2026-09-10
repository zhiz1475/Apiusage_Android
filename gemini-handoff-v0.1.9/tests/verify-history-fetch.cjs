// Minimal offline verification for full-history log partitioning.
// Run with: node verify-history-fetch.cjs
const assert = require('node:assert/strict');
const { KapibalaClient } = require('../source/kapibala-client.cjs');

const DAY = 86400;
const records = Array.from({ length: 12050 }, (_, index) => ({
  id: String(index + 1),
  created_at: new Date((index % 30) * DAY * 1000).toISOString(),
  model_name: 'gpt-4o',
  quota: 1,
  total_tokens: 10
}));

function makeClient({ includeTotal = true } = {}) {
  const client = Object.create(KapibalaClient.prototype);
  client.baseUrl = 'https://mock.invalid';
  client.request = async url => {
    const parsed = new URL(url);
    const start = Number(parsed.searchParams.get('start_timestamp') || 0);
    const end = Number(parsed.searchParams.get('end_timestamp') || Number.MAX_SAFE_INTEGER);
    const page = Number(parsed.searchParams.get('p') || 1);
    const filtered = records.filter(item => {
      const timestamp = Math.floor(Date.parse(item.created_at) / 1000);
      return timestamp >= start && timestamp <= end;
    });
    // Simulate New API's 10,000-row hard cap per time range.
    const capped = filtered.slice(0, 10000);
    const items = capped.slice((page - 1) * 100, page * 100);
    const data = { items };
    if (includeTotal) data.total = Math.min(filtered.length, 10000);
    return { body: { data }, headers: new Headers(), status: 200 };
  };
  return client;
}

(async () => {
  const withTotal = await makeClient({ includeTotal: true }).fetchLogs(new Date(0), new Date(30 * DAY * 1000), {});
  assert.equal(withTotal.length, records.length, 'partitioning should recover records beyond 10,000 cap');

  const withoutTotal = await makeClient({ includeTotal: false }).fetchLogs(new Date(0), new Date(30 * DAY * 1000), {});
  assert.equal(withoutTotal.length, records.length, 'pagination fallback should work without total');
  console.log(`history fetch mock passed (${withTotal.length} records, total/no-total)`);
})();
