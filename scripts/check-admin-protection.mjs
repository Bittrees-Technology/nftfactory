#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export function adminProtection(env) {
  const tokenConfigured = Boolean(String(env.INDEXER_ADMIN_TOKEN ?? '').trim());
  const unprotected = ['1', 'true', 'yes', 'on'].includes(String(env.INDEXER_ALLOW_UNPROTECTED_ADMIN ?? '').trim().toLowerCase());
  return { protected: tokenConfigured && !unprotected, tokenConfigured, unprotected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = adminProtection(process.env);
  if (!result.protected) {
    console.error('Release readiness requires a nonempty INDEXER_ADMIN_TOKEN and disabled INDEXER_ALLOW_UNPROTECTED_ADMIN. An address allowlist does not authenticate callers.');
    process.exitCode = 1;
  } else {
    console.log('Indexer administrator authentication configuration passed.');
  }
}
