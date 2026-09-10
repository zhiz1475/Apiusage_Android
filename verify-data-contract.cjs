// Offline provider contract checks for the client-side response adapters.
// Run with: node verify-data-contract.cjs
const assert = require('node:assert/strict');
const { KapibalaClient } = require('./kapibala-client.cjs');

const now = Math.floor(Date.now() / 1000);

function makeClient() {
  const client = Object.create(KapibalaClient.prototype);
  client.baseUrl = 'https://mock.invalid';
  client.readStore = async () => ({ username: 'mock-user', accessToken: 'token', tokenType: 'Bearer' });
  client.shouldRotate = () => false;
  client.readCache = async () => null;
  client.writeCache = async value => { client.lastDashboard = value; };
  client.request = async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/api/status') return { body: { data: {
      quota_per_unit: '500000', quota_display_type: 'USD', usd_exchange_rate: '1', enable_data_export: true
    } }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/user/self') return { body: { success: true, data: {
      quota: '100000', used_quota: '250000', request_count: '3', status: '1'
    } }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/subscription/self') return { body: { success: true, data: [] }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/subscription/plans') return { body: { success: true, data: [] }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/log/self/stat') return { body: { success: true, data: { quota: '500000', rpm: '7', tpm: '99' } }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/data/self') return { body: { success: true, data: [{
      created_at: String(now * 1000), model_name: 'mock-model', quota: '500000', token_used: '1200', count: '4'
    }] }, headers: new Headers(), status: 200 };
    throw new Error(`unexpected URL: ${url}`);
  };
  client.sessionHeaders = () => ({ Authorization: 'Bearer token' });
  return client;
}

(async () => {
  const client = makeClient();
  const result = await client.loadDashboard();
  assert.equal(result.account.balance, 0.2, 'quota is converted to remaining balance');
  assert.equal(result.account.used, 0.5, 'used_quota is converted to used amount');
  assert.equal(result.account.total, 0.7, 'total is remaining + used');
  assert.equal(result.today.requests, 4, 'aggregate count is used for requests');
  assert.equal(result.today.tokens, 1200, 'token_used is used for token totals');
  assert.equal(result.today.spent, 1, 'stat quota is converted to current spend');
  assert.equal(result.week.spent, 1, 'stat quota is converted to weekly spend');
  assert.ok(result.historySync?.rows?.length, 'aggregate rows are persisted for incremental sync');
  console.log('data contract mock passed');
})();

