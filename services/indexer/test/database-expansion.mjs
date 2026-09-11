import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const url=process.env.DATABASE_URL;
if(!url?.includes('127.0.0.1:58432')||!url.endsWith('/nftfactory_test'))throw new Error('Use only the isolated NFTFactory test database.');
const db=new PrismaClient();
const runId=randomBytes(20).toString('hex');
const nonceId=`race-${runId}`,tagSlug=`private-${runId}`;
const contract='0x'+runId,owner='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20);
try {
 const collections=await Promise.all([1,8453].map(chainId=>db.collection.create({data:{chainId,contractAddress:contract,ownerAddress:owner,standard:'ERC721'}})));
 assert.notEqual(collections[0].id,collections[1].id);
 await assert.rejects(db.collection.create({data:{chainId:1,contractAddress:contract,ownerAddress:owner,standard:'ERC721'}}),error=>error.code==='P2002');
 const tokens=await Promise.all(collections.map(c=>db.token.create({data:{collectionId:c.id,tokenId:'1',ownerAddress:owner,creatorAddress:owner,metadataCid:'ipfs://test'}})));
 assert.notEqual(tokens[0].id,tokens[1].id);
 const attempts=await Promise.allSettled(Array.from({length:12},()=>db.authNonce.create({data:{id:nonceId,expiresAt:new Date(Date.now()+300000)}})));
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
 const tag=await db.tag.create({data:{slug:tagSlug,label:tagSlug}});
 await db.tokenTag.create({data:{tokenId:tokens[0].id,tagId:tag.id,addedByAddress:owner,private:true}});
 assert.equal(await db.tokenTag.count({where:{tagId:tag.id,OR:[{private:false},{addedByAddress:other}]}}),0);
 assert.equal(await db.tokenTag.count({where:{tagId:tag.id,OR:[{private:false},{addedByAddress:owner}]}}),1);
 console.log(JSON.stringify({ok:true,checks:['same contract on two chains','same token ID on two chains','duplicate asset rejected','12 concurrent nonce uses: exactly one accepted','private tags excluded for other wallets']}));
}finally{
 await db.tokenTag.deleteMany({where:{tag:{slug:tagSlug}}});
 await db.tag.deleteMany({where:{slug:tagSlug}});
 await db.token.deleteMany({where:{collection:{contractAddress:contract}}});
 await db.collection.deleteMany({where:{contractAddress:contract}});
 await db.authNonce.deleteMany({where:{id:nonceId}});
 await db.$disconnect();
}
