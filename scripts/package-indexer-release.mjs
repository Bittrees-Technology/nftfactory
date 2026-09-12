import {mkdir,readFile,readdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const outputIndex=process.argv.indexOf('--out');
if(outputIndex<0||!process.argv[outputIndex+1])throw new Error('Provide a new output directory with --out.');
const output=resolve(process.argv[outputIndex+1]);
const dirtyWorktree=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim());
// Refuse to overwrite an existing release or mix it with a checkout/data folder.
await mkdir(output,{recursive:false,mode:0o700});
const files=[];
for(const directory of ['services/indexer/src','services/indexer/prisma','packages/auth','packages/profile']){
 for(const file of await readdir(join(root,directory),{recursive:true,withFileTypes:true})){
  if(!file.isFile()||file.name.includes('.test.')||file.name.startsWith('.'))continue;
  const source=join(file.parentPath||file.path,file.name);const relative=source.slice(root.length+1);
  if(!/\.(ts|mjs|mts|prisma|sql|toml)$/.test(relative))continue;
  await mkdir(dirname(join(output,relative)),{recursive:true});await copyFile(source,join(output,relative));files.push(relative);
 }
}
const indexer=JSON.parse(await readFile(join(root,'services/indexer/package.json'),'utf8'));
const workspace=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const manifest={name:'nftfactory-indexer-runtime',version:'1.0.0',private:true,type:'module',engines:workspace.engines,dependencies:{...indexer.dependencies,prisma:indexer.devDependencies.prisma,tsx:indexer.devDependencies.tsx},overrides:workspace.overrides};
await writeFile(join(output,'package.json'),JSON.stringify(manifest,null,2)+'\n');files.push('package.json');
const lockSourceIndex=process.argv.indexOf('--lock-from');
if(lockSourceIndex>=0){
 const previous=resolve(process.argv[lockSourceIndex+1]);
 const previousManifest=JSON.parse(await readFile(join(previous,'package.json'),'utf8'));
 if(JSON.stringify(previousManifest)!==JSON.stringify(manifest))throw new Error('Previous runtime dependencies differ; generate a fresh lockfile.');
 await copyFile(join(previous,'package-lock.json'),join(output,'package-lock.json'));
}else execFileSync('npm',['install','--package-lock-only','--ignore-scripts','--omit=dev'],{cwd:output,stdio:'pipe'});
files.push('package-lock.json');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const hashes=Object.fromEntries(await Promise.all(files.sort().map(async file=>[file,createHash('sha256').update(await readFile(join(output,file))).digest('hex')])));
await writeFile(join(output,'release-manifest.json'),JSON.stringify({sourceCommit,dirtyWorktree,deployable:!dirtyWorktree,createdAt:new Date().toISOString(),files:hashes},null,2)+'\n');
console.log(JSON.stringify({output,sourceCommit,dirtyWorktree,fileCount:files.length,note:'Source and locked dependencies packaged. Install dependencies, generate Prisma client, and verify before deployment. Never deploy a package marked dirtyWorktree. No credentials or application data included.'}));
