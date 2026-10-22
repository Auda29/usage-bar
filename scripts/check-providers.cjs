const { ProviderService } = require('../src/providers.cjs');

(async () => {
  const providers = await new ProviderService().readAll();
  // This command intentionally prints only normalized usage, never credentials or account identifiers.
  console.log(JSON.stringify(providers.map(({ id, status, rows, error, fetchedAt }) => ({ id, status, rows, error, fetchedAt })), null, 2));
  if (providers.some((provider) => provider.status !== 'ok')) process.exitCode = 1;
})();
