import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { adminProtection } from '../check-admin-protection.mjs';

test('an allowlisted address never substitutes for authentication', () => {
  assert.equal(adminProtection({ INDEXER_ADMIN_ALLOWLIST: '0x' + '1'.repeat(40) }).protected, false);
  assert.equal(adminProtection({ INDEXER_ADMIN_TOKEN: '  \n ' }).protected, false);
});
test('a token is required even when an allowlist exists', () => {
  assert.equal(adminProtection({ INDEXER_ADMIN_TOKEN: 'test-only', INDEXER_ADMIN_ALLOWLIST: '' }).protected, true);
  assert.equal(adminProtection({ INDEXER_ADMIN_TOKEN: 'test-only', INDEXER_ADMIN_ALLOWLIST: '0x' + '1'.repeat(40) }).protected, true);
});
test('production gates reject every supported unprotected override', () => {
  for (const value of ['1','true','TRUE','yes','on',' on ']) assert.equal(adminProtection({ INDEXER_ADMIN_TOKEN: 'test-only', INDEXER_ALLOW_UNPROTECTED_ADMIN: value }).protected, false);
  for (const value of ['0','false','off','']) assert.equal(adminProtection({ INDEXER_ADMIN_TOKEN: 'test-only', INDEXER_ALLOW_UNPROTECTED_ADMIN: value }).protected, true);
});
test('release CLI fails closed without disclosing the credential', () => {
  for (const [env,status] of [[{INDEXER_ADMIN_ALLOWLIST:'0x'+'1'.repeat(40)},1],[{INDEXER_ADMIN_TOKEN:'test-only-sentinel'},0],[{INDEXER_ADMIN_TOKEN:'test-only-sentinel',INDEXER_ALLOW_UNPROTECTED_ADMIN:'1'},1]]) {
    const r=spawnSync(process.execPath,[new URL('../check-admin-protection.mjs',import.meta.url).pathname],{env,encoding:'utf8'});
    assert.equal(r.status,status);assert(!`${r.stdout}${r.stderr}`.includes('test-only-sentinel'));
  }
});
