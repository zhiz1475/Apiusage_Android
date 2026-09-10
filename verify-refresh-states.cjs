// Minimal state contract checks for refresh() error handling.
// Run with: node verify-refresh-states.cjs
const assert = require('node:assert/strict');
const { KapibalaClient, ClientError } = require('./kapibala-client.cjs');

function makeClient(error, { cache = null, username = 'state-user' } = {}) {
  const client = Object.create(KapibalaClient.prototype);
  client.refreshPromise = null;
  client.authState = 'authenticated';
  client.loadDashboard = async () => { throw error; };
  client.readStore = async () => ({ username, accessToken: 'expired-token' });
  client.readCache = async () => cache;
  return client;
}

(async () => {
  const expired = makeClient(new ClientError('expired', 'AUTH_EXPIRED'), {
    cache: { username: 'cached-name', provider: 'kapibala.asia', authenticated: true }
  });
  const expiredResult = await expired.refresh();
  assert.equal(expiredResult.authenticated, false);
  assert.equal(expiredResult.dataState, 'auth_expired');
  assert.equal(expiredResult.errorCode, 'AUTH_EXPIRED');
  assert.equal(expiredResult.username, 'state-user');
  assert.equal(expiredResult.provider, 'kapibala.asia');
  assert.equal(expired.authState, 'expired');

  const offline = makeClient(new ClientError('offline', 'NETWORK_ERROR'), {
    cache: { authenticated: true, username: 'cached-name', account: { balance: 1 } }
  });
  const offlineResult = await offline.refresh();
  assert.equal(offlineResult.authenticated, true);
  assert.equal(offlineResult.dataState, 'offline');
  assert.equal(offlineResult.stale, true);
  assert.equal(offlineResult.account.balance, 1);
  console.log('refresh state contract passed (auth_expired/offline)');
})();
