import test from 'node:test';
import assert from 'node:assert/strict';
import { issueToken, readToken } from '../../packages/auth/session.mjs';
const secret = 'test-only-secret-'.repeat(3);
const address = '0x' + 'ab'.repeat(20);
test('wallet sessions reject tampering, expiry, wrong purpose and wrong key', () => {
 const token = issueToken({ address, purpose:'session', exp:2000 }, secret);
 assert.equal(readToken(token,secret,'session',1000).address,address);
 assert.equal(readToken(token+'x',secret,'session',1000),null);
 assert.equal(readToken(token,secret,'session',2000),null);
 assert.equal(readToken(token,secret,'challenge',1000),null);
 assert.equal(readToken(token,'different-secret'.repeat(3),'session',1000),null);
 assert.throws(()=>issueToken({address,purpose:'session',exp:2000},'short'));
});
