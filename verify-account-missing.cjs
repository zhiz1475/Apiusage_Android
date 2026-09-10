// Verify that omitted quota fields remain unknown instead of becoming $0.00.
// Run with: node verify-account-missing.cjs
const assert = require('node:assert/strict');
const { KapibalaClient } = require('./kapibala-client.cjs');

const makeClient = user => {
  const client = Object.create(KapibalaClient.prototype);
  client.baseUrl = 'https://mock.invalid';
  client.readStore = async () => ({ username: 'missing-quota-user', accessToken: 'token' });
  client.shouldRotate = () => false;
  client.readCache = async () => null;
  client.writeCache = async value => { client.lastDashboard = value; };
  client.sessionHeaders = () => ({ Authorization: 'Bearer token' });
  client.request = async url => {
    const parsed = new URL(url);
    if (parsed.pathname === '/api/status') return { body: { data: { quota_per_unit: 500000, quota_display_type: 'USD' } }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/user/self') return { body: { success: true, data: user }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/subscription/self' || parsed.pathname === '/api/subscription/plans') return { body: { success: true, data: [] }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/log/self/stat') return { body: { success: true, data: {} }, headers: new Headers(), status: 200 };
    if (parsed.pathname === '/api/data/self') return { body: { success: true, data: [] }, headers: new Headers(), status: 200 };
    throw new Error(`unexpected URL: ${url}`);
  };
  return client;
};

(async () => {
  const missingBoth = await makeClient({ request_count: '2' }).loadDashboard();
  assert.equal(missingBoth.account.balance, null);
  assert.equal(missingBoth.account.used, null);
  assert.equal(missingBoth.account.total, null);

  const missingRemaining = await makeClient({ used_quota: '250000' }).loadDashboard();
  assert.equal(missingRemaining.account.balance, null);
  assert.equal(missingRemaining.account.used, 0.5);
  assert.equal(missingRemaining.account.total, null);

  const missingUsed = await makeClient({ quota: '100000' }).loadDashboard();
  assert.equal(missingUsed.account.balance, 0.2);
  assert.equal(missingUsed.account.used, null);
  assert.equal(missingUsed.account.total, null);

  const whitespace = await makeClient({ quota: '  ', used_quota: ' , ' }).loadDashboard();
  assert.equal(whitespace.account.balance, null);
  assert.equal(whitespace.account.used, null);
  assert.equal(whitespace.account.total, null);
  console.log('missing quota contract passed (unknown values stay null)');
})();
