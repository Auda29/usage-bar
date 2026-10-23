const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ProviderService } = require('../src/providers.cjs');
const { loadCredential } = require('../src/credentials.cjs');
const credential = { token: 'test-token', accountId: 'test-account', expiresAt: 9999999999999, source: 'Test' };
const good = () => Response.json({ rate_limit: { primary_window: { used_percent: 44, limit_window_seconds: 604800 } }, credits: { balance: '109.0869435' } });

test('no credentials makes no network call', async () => {
  let called = false;
  const service = new ProviderService({ credentialLoader: async () => null, fetchImpl: async () => { called = true; } });
  const result = await service.read('codex');
  assert.equal(called, false);
  assert.equal(result.status, 'unconfigured');
});

test('Claude OAuth environment credentials reach the usage endpoint without exposing the token', async () => {
  let calls = 0;
  const service = new ProviderService({
    credentialLoader: () => loadCredential('claude', { env: { CLAUDE_CODE_OAUTH_TOKEN: 'explicit-oauth-token' } }),
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.anthropic.com/api/oauth/usage');
      assert.equal(options.headers.Authorization, 'Bearer explicit-oauth-token');
      return Response.json({ five_hour: { utilization: 25 }, seven_day: { utilization: 65 } });
    },
  });
  const result = await service.read('claude');
  assert.equal(calls, 1);
  assert.equal(result.status, 'ok');
  assert.equal(result.source, 'Claude Code OAuth');
  assert.equal(result.rows[0].usedPercent, 25);
  assert(!JSON.stringify(result).includes('explicit-oauth-token'));
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

test('a selected-provider refresh never sends requests to unchecked providers', async () => {
  const seen = [];
  const service = new ProviderService({ credentialLoader: async (id) => { seen.push(id); return credential; }, fetchImpl: async () => good() });
  await service.readAll(['codex']);
  assert.deepEqual(seen, ['codex']);
  await service.readAll([]);
  assert.deepEqual(seen, ['codex']);
});
test('new providers use the documented request methods and authorization schemes', async () => {
  const seen = [];
  const service = new ProviderService({ credentialLoader: async () => credential, fetchImpl: async (url, options) => {
    seen.push({ url, options });
    if (url.includes('github.com')) return Response.json({ quota_snapshots: { premium_interactions: { entitlement: 100, remaining: 75 } } });
    if (url.includes('cursor.sh')) return Response.json({ planUsage: { totalPercentUsed: 25 } });
    return Response.json({ data: { limit: 100, limit_remaining: 75 } });
  } });
  for (const id of ['copilot', 'cursor', 'openrouter']) assert.equal((await service.read(id)).status, 'ok');
  assert.equal(seen[0].options.headers.Authorization, 'token test-token');
  assert.equal(seen[1].options.method, 'POST');
  assert.equal(seen[1].options.headers['Connect-Protocol-Version'], '1');
  assert.equal(seen[2].url, 'https://openrouter.ai/api/v1/key');
  assert(seen.every(({ options }) => options.redirect === 'error'));
});
test('Gemini renews an expired Google token in memory and discovers the quota project', async () => {
  const seen = [];
  const service = new ProviderService({ now: () => 100000, credentialLoader: async () => ({ token: 'old', refreshToken: 'refresh', expiresAt: 90000, oauthClient: { clientId: 'example-client', clientSecret: 'example-public-parameter' }, source: 'Gemini CLI' }), fetchImpl: async (url, options) => {
    seen.push(url);
    if (url.includes('oauth2.googleapis.com')) {
      assert.equal(new URLSearchParams(options.body).get('client_id'), 'example-client');
      assert.equal(new URLSearchParams(options.body).get('client_secret'), 'example-public-parameter');
      return Response.json({ access_token: 'fresh', expires_in: 3600 });
    }
    assert.equal(options.headers.Authorization, 'Bearer fresh');
    if (url.endsWith('loadCodeAssist')) return Response.json({ cloudaicompanionProject: 'example-project' });
    assert.equal(JSON.parse(options.body).project, 'example-project');
    return Response.json({ buckets: [{ modelId: 'gemini-pro', remainingFraction: 0.75 }] });
  } });
  assert.equal((await service.read('gemini')).rows[0].usedPercent, 25);
  await service.read('gemini');
  assert.equal(seen.filter((url) => url.includes('oauth2.googleapis.com')).length, 1);
  assert.equal(seen.filter((url) => url.endsWith('loadCodeAssist')).length, 1);
});

test('replacing a saved credential discards an in-flight reading from the previous account', async () => {
  let release;
  let started;
  const requestStarted = new Promise((resolve) => { started = resolve; });
  const response = new Promise((resolve) => { release = resolve; });
  const service = new ProviderService({ credentialLoader: async () => credential, fetchImpl: async () => { started(); return response; } });
  const pending = service.read('codex');
  await requestStarted;
  service.forget('codex');
  release(good());
  const result = await pending;
  assert.deepEqual(result.rows, []);
  assert.equal(result.fetchedAt, null);
});

test('expired Gemini token without local client configuration asks for CLI renewal without a network request', async () => {
  const service = new ProviderService({ now: () => 100000, credentialLoader: async () => ({ token: 'old', refreshToken: 'refresh', expiresAt: 90000 }), fetchImpl: async () => { assert.fail('No request without client configuration'); } });
  const result = await service.read('gemini');
  assert.equal(result.status, 'error');
  assert.match(result.error, /mit Gemini CLI erneuern/);
});
