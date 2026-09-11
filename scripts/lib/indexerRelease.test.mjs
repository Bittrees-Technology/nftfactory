import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const verifier=resolve('scripts/verify-indexer-release.mjs');
const commit='a'.repeat(40);
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'nftfactory-release-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const names=['package.json','package-lock.json','services/indexer/src/indexer.ts','services/indexer/prisma/schema.prisma','packages/auth/session.mjs','packages/profile/design.mjs'];const files={};for(const name of names){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),'fixture');files[name]=createHash('sha256').update('fixture').digest('hex');}const manifest={sourceCommit:commit,dirtyWorktree:false,deployable:true,files};await writeFile(join(dir,'release-manifest.json'),JSON.stringify(manifest));return{dir,manifest};}
function verify(dir,expected=commit){return spawnSync(process.execPath,[verifier,dir,expected],{encoding:'utf8'});}
test('release verifier accepts a complete clean package and rejects wrong commits',async t=>{const{dir}=await fixture(t);assert.equal(verify(dir).status,0);assert.notEqual(verify(dir,'b'.repeat(40)).status,0);});
test('release verifier rejects tampered and unexpected files',async t=>{const{dir}=await fixture(t);await writeFile(join(dir,'package.json'),'tampered');assert.match(verify(dir).stderr,/hash mismatch/);await writeFile(join(dir,'package.json'),'fixture');await writeFile(join(dir,'.env'),'secret');assert.match(verify(dir).stderr,/Untracked release file/);});
test('release verifier rejects dirty manifests and traversal paths',async t=>{const{dir,manifest}=await fixture(t);manifest.dirtyWorktree=true;await writeFile(join(dir,'release-manifest.json'),JSON.stringify(manifest));assert.match(verify(dir).stderr,/dirty/);manifest.dirtyWorktree=false;manifest.files['../escape']='0'.repeat(64);await writeFile(join(dir,'release-manifest.json'),JSON.stringify(manifest));assert.match(verify(dir).stderr,/Invalid release manifest/);});
test('release verifier rejects symbolic links',async t=>{const{dir}=await fixture(t);await rm(join(dir,'package.json'));await symlink('package-lock.json',join(dir,'package.json'));assert.match(verify(dir).stderr,/symbolic links/);});
