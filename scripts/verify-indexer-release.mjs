import {readFile,lstat,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const [directory,expectedCommit]=process.argv.slice(2);
if(!directory||!/^[a-f0-9]{40}$/.test(expectedCommit||''))throw new Error('Usage: verify-indexer-release.mjs DIRECTORY EXPECTED_FULL_COMMIT');
const root=resolve(directory);
const manifest=JSON.parse(await readFile(join(root,'release-manifest.json'),'utf8'));
if(manifest.sourceCommit!==expectedCommit||manifest.dirtyWorktree!==false||manifest.deployable!==true)throw new Error('Release is dirty, not deployable, or has the wrong source commit.');
const files=manifest.files;
if(!files||typeof files!=='object'||Array.isArray(files))throw new Error('Missing release file hashes.');
for(const required of ['package.json','package-lock.json','services/indexer/src/indexer.ts','services/indexer/prisma/schema.prisma','packages/auth/session.mjs','packages/profile/design.mjs'])if(!files[required])throw new Error(`Missing required runtime file: ${required}`);
for(const [name,expected] of Object.entries(files)){
 if(name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')||!/^([a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+$/.test(name)||!/^[a-f0-9]{64}$/.test(expected))throw new Error('Invalid release manifest entry.');
 const parts=name.split('/');let current=root;
 for(const part of parts){current=join(current,part);if((await lstat(current)).isSymbolicLink())throw new Error('Release must not contain symbolic links.');}
 if(!(await lstat(current)).isFile())throw new Error(`Not a regular file: ${name}`);
 const actual=createHash('sha256').update(await readFile(current)).digest('hex');
 if(actual!==expected)throw new Error(`Release hash mismatch: ${name}`);
}
async function scan(directory,prefix=''){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const name=prefix+entry.name;
  if(entry.isSymbolicLink())throw new Error(`Unexpected symbolic link: ${name}`);
  if(entry.isDirectory())await scan(join(directory,entry.name),name+'/');
  else if(name!=='release-manifest.json'&&!Object.hasOwn(files,name))throw new Error(`Untracked release file: ${name}`);
 }
}
await scan(root);
console.log(`Verified ${Object.keys(files).length} files for ${expectedCommit}. This verifies package integrity against the supplied manifest, not publisher identity.`);
