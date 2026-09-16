import {expect,it} from 'vitest';
import {encodeEventTopics,encodeAbiParameters,parseAbi,pad,zeroAddress,type Log} from 'viem';
import {mintedTokenId,positiveUint256,readPendingMint,pendingMintKey} from './mintReceipt';
const address='0x1111111111111111111111111111111111111111';
const owner='0x2222222222222222222222222222222222222222';
const abi=parseAbi(['event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)','event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
const single={address,topics:encodeEventTopics({abi,eventName:'TransferSingle',args:{operator:owner,from:zeroAddress,to:owner}}),data:encodeAbiParameters([{type:'uint256'},{type:'uint256'}],[9007199254740993n,2n])} as Log;
it('reads the actual ERC1155 mint ID rather than returning zero or the requested ID',()=>{expect(mintedTokenId({status:'success',logs:[single]},address,'ERC1155',owner)).toBe('9007199254740993');});
it('rejects reverted receipts, foreign contracts, wrong recipients and non-mint transfers',()=>{expect(()=>mintedTokenId({status:'reverted',logs:[single]},address,'ERC1155',owner)).toThrow(/reverted/);expect(()=>mintedTokenId({status:'success',logs:[single]},owner,'ERC1155',owner)).toThrow(/No matching/);expect(()=>mintedTokenId({status:'success',logs:[single]},address,'ERC1155',address)).toThrow(/No matching/);const transfer={...single,topics:[...single.topics.slice(0,2),pad(owner),single.topics[3]]} as Log;expect(()=>mintedTokenId({status:'success',logs:[transfer]},address,'ERC1155',owner)).toThrow(/No matching/);});
it('extracts ERC721 mint IDs from the correct contract and owner',()=>{const log={address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:zeroAddress,to:owner,tokenId:42n}}),data:'0x'} as Log;expect(mintedTokenId({status:'success',logs:[log]},address,'ERC721',owner)).toBe('42');});
it('preserves uint256 precision and rejects partial or fractional inputs',()=>{expect(positiveUint256('9007199254740993','ID')).toBe(9007199254740993n);for(const value of ['1.5','2abc','1e3','-2','0','',String(2n**256n)])expect(()=>positiveUint256(value,'ID')).toThrow();});
it('keeps recovery isolated by wallet and chain',()=>{const value={hash:'0x'+'ab'.repeat(32),wallet:owner,chainId:8453,contract:address,standard:'ERC1155',mode:'shared',amount:'2',metadataUri:'ipfs://draft'};expect(readPendingMint(JSON.stringify(value),8453,owner)?.hash).toBe(value.hash);expect(()=>readPendingMint(JSON.stringify(value),4663,owner)).toThrow();expect(()=>readPendingMint(JSON.stringify(value),8453,address)).toThrow();expect(pendingMintKey(8453,owner)).not.toBe(pendingMintKey(4663,owner));});

it('restores collection confirmation only on its original wallet and network', async()=>{
  const {pendingCollectionKey,readPendingCollection}=await import('./mintReceipt');
  const value={hash:'0x'+'cd'.repeat(32),chainId:8453,wallet:owner,factory:address,standard:'ERC721',ensSubname:'studio'};
  expect(readPendingCollection(JSON.stringify(value),8453,owner)).toEqual(value);
  expect(readPendingCollection(null,8453,owner)).toBeNull();
  expect(()=>readPendingCollection(JSON.stringify(value),4663,owner)).toThrow();
  expect(()=>readPendingCollection(JSON.stringify(value),8453,address)).toThrow();
  expect(()=>readPendingCollection('{broken',8453,owner)).toThrow();
  expect(pendingCollectionKey(8453,owner)).not.toBe(pendingCollectionKey(8453,address));
});
