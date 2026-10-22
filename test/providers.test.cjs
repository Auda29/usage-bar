const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ProviderService } = require('../src/providers.cjs');
const credential = { token: 'test-token', accountId: 'test-account', expiresAt: 9999999999999, source: 'Test' };
const good = () => Response.json({ rate_limit: { primary_window: { used_percent: 44, limit_window_seconds: 604800 } }, credits: { balance: '109.0869435' } });

test('no credentials makes no network call', async () => {
  let called = false;
  const service = new ProviderService({ credentialLoader: async () => null, fetchImpl: async () => { called = true; } });
  const result = await service.read('codex');
  assert.equal(called, false);
  assert.equal(result.status, 'unconfigured');
});
test('request uses fixed endpoint, disallows redirects, and keeps credentials out of results', async () => {
  const service = new ProviderService({ credentialLoader: async () => credential, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://chatgpt.com/backend-api/wham/usage');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.headers['ChatGPT-Account-Id'], 'test-account');
    assert.equal(options.redirect, 'error');
    return good();
  } });
  const result = await service.read('codex');
  assert.equal(result.status, 'ok');
  assert(!JSON.stringify(result).includes('test-token'));
  assert(!JSON.stringify(result).includes('test-account'));
});
test('provider failure preserves the last reading and marks it stale', async () => {
  let fail = false;
  const service = new ProviderService({ credentialLoader: async () => credential, fetchImpl: async () => fail ? new Response(null, { status: 503 }) : good() });
  const first = await service.read('codex'); fail = true;
  const second = await service.read('codex');
  assert.equal(second.status, 'stale');
  assert.deepEqual(second.rows, first.rows);
  assert.equal(second.fetchedAt, first.fetchedAt);
});
test('switching accounts clears cached readings before a failed request', async () => {
  let current = credential;
  let fail = false;
  const service = new ProviderService({ credentialLoader: async () => current, fetchImpl: async () => fail ? new Response(null, { status: 503 }) : good() });
  await service.read('codex');
  current = { ...credential, accountId: 'other-account' }; fail = true;
  const result = await service.read('codex');
  assert.equal(result.status, 'error');
  assert.equal(result.rows.length, 0);
  assert.equal(result.fetchedAt, null);
});
test('signing out drops previous readings', async () => {
  let current = credential;
  const service = new ProviderService({ credentialLoader: async () => current, fetchImpl: async () => good() });
  await service.read('codex'); current = null;
  const result = await service.read('codex');
  assert.equal(result.status, 'unconfigured');
  assert.deepEqual(result.rows, []);
});
test('429 honors Retry-After, blocks manual polling, then retries', async () => {
  let now = 100000;
  let calls = 0;
  const service = new ProviderService({ now: () => now, credentialLoader: async () => credential, fetchImpl: async () => {
    calls++;
    return calls === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '60' } }) : good();
  } });
  assert.equal((await service.read('codex')).retryAt, 160000);
  await service.read('codex'); assert.equal(calls, 1);
  now = 160001;
  assert.equal((await service.read('codex')).status, 'ok');
  assert.equal(calls, 2);
});
test('concurrent refresh requests share one provider request', async () => {
  let calls = 0;
  const service = new ProviderService({ credentialLoader: async () => credential, fetchImpl: async () => { calls++; return good(); } });
  const [first, second] = await Promise.all([service.read('codex'), service.read('codex')]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
});
test('expired credential never triggers a provider request or token refresh', async () => {
  let calls = 0;
  const service = new ProviderService({ now: () => 200000, credentialLoader: async () => ({ ...credential, expiresAt: 100000 }), fetchImpl: async () => { calls++; return good(); } });
  const result = await service.read('codex');
  assert.equal(calls, 0);
  assert.match(result.error, /abgelaufen/);
});
test('unsupported Codex login explains usage access restriction', async () => {
  const service = new ProviderService({ credentialLoader: async () => credential, fetchImpl: async () => Response.json({ error: { type: 'rejected_by_access_enforcement' } }, { status: 401 }) });
  assert.match((await service.read('codex')).error, /keine Usage-Abfrage/);
});
test('one provider failure does not discard the other provider result', async () => {
  const service = new ProviderService({ credentialLoader: async () => credential, fetchImpl: async (url) => url.includes('anthropic') ? new Response(null, { status: 500 }) : good() });
  const results = await service.readAll();
  assert.equal(results[0].status, 'error');
  assert.equal(results[1].status, 'ok');
});
