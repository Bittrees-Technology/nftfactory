import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReleaseManifest} from './release-manifest.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('../../docs/reviews/mint-release-2026-09-16/base-mainnet/unsigned-deployment.json',import.meta.url)));
test('accepts reviewed Base and Robinhood release packages',()=>{
 for(const network of ['base-mainnet','robinhood-mainnet'])validateReleaseManifest(JSON.parse(readFileSync(new URL(`../../docs/reviews/mint-release-2026-09-16/${network}/unsigned-deployment.json`,import.meta.url))));
});
for(const [label,mutate] of Object.entries({
 chain:m=>m.chainId=1,
 authority:m=>m.signer='0x'+'1'.repeat(40),
 value:m=>m.transactions[0].transaction.value='0x1',
 nonce:m=>m.transactions[1].transaction.nonce=m.transactions[0].transaction.nonce,
 ownership:m=>m.transactions.find(t=>t.function==='transferOwnership(address)').transaction.input='0xf2fde38b'+'0'.repeat(64),
 target:m=>m.transactions.find(t=>t.transactionType!=='CREATE').transaction.to='0x'+'1'.repeat(40)
}))test(`rejects changed ${label}`,()=>{const m=fixture();mutate(m);assert.throws(()=>validateReleaseManifest(m));});
