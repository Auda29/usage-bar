const { ProviderService } = require('../src/providers.cjs');
const { PROVIDER_IDS } = require('../src/catalog.cjs');

(async () => {
  const requested = process.argv.slice(2);
  const ids = requested.includes('--all') ? PROVIDER_IDS : requested.length ? requested : ['claude', 'codex'];
  if (ids.some((id) => !PROVIDER_IDS.includes(id))) throw new Error(`Provider: ${PROVIDER_IDS.join(', ')}`);
  const providers = await new ProviderService().readAll(ids);
  // This command intentionally prints only normalized usage, never credentials or account identifiers.
  console.log(JSON.stringify(providers.map(({ id, status, rows, error, fetchedAt }) => ({ id, status, rows, error, fetchedAt })), null, 2));
  if (providers.some((provider) => provider.status !== 'ok')) process.exitCode = 1;
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
