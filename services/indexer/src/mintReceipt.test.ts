import {encodeEventTopics,encodeAbiParameters,parseAbiItem,zeroAddress} from 'viem';
import { expect, it, vi } from 'vitest';
import { verifyMintReceipt } from './mintReceipt.js';
const address = '0x1111111111111111111111111111111111111111';
const contract = '0x2222222222222222222222222222222222222222';
const input = { contractAddress: contract, tokenId: '5', mintTxHash: `0x${'ab'.repeat(32)}`, metadataCid: 'ipfs://test', standard: 'ERC721' };
function client() {
  return {
    getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', logs: [{ address: contract, data: '0x', topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', `0x${'0'.repeat(64)}`, `0x${'0'.repeat(24)}${address.slice(2)}`, `0x${'0'.repeat(63)}5`] }] }),
    readContract: vi.fn().mockImplementation(({functionName}) => Promise.resolve(functionName === 'tokenURI' ? 'ipfs://test' : address))
  };
}
it('derives wallet and collection authority from confirmed chain data', async () => {
  expect(await verifyMintReceipt(client() as any, input, address)).toEqual({ ownerAddress: address, creatorAddress: address, collectionOwnerAddress: address });
});
it('rejects a receipt belonging to a different wallet or token', async () => {
  await expect(verifyMintReceipt(client() as any, input, contract)).rejects.toThrow('Receipt');
  await expect(verifyMintReceipt(client() as any, {...input, tokenId:'6'}, address)).rejects.toThrow('Receipt');
});
it('rejects forged metadata, failed transactions, and transferred ownership', async () => {
  await expect(verifyMintReceipt(client() as any, {...input,metadataCid:'ipfs://forged'}, address)).rejects.toThrow('metadata');
  const failed=client();failed.getTransactionReceipt.mockResolvedValue({status:'reverted',logs:[]});
  await expect(verifyMintReceipt(failed as any,input,address)).rejects.toThrow('Receipt');
  const transferred=client();transferred.readContract.mockResolvedValue(contract);
  await expect(verifyMintReceipt(transferred as any,input,address)).rejects.toThrow('owner');
});

it('verifies an ERC1155 mint quantity and rejects insufficient current holdings',async()=>{
 const event=parseAbiItem('event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)');
 const mock={getTransactionReceipt:vi.fn().mockResolvedValue({status:'success',logs:[{address:contract,topics:encodeEventTopics({abi:[event],eventName:'TransferSingle',args:{operator:address,from:zeroAddress,to:address}}),data:encodeAbiParameters([{type:'uint256'},{type:'uint256'}],[5n,3n])}]}),readContract:vi.fn().mockImplementation(({functionName})=>Promise.resolve(functionName==='balanceOf'?3n:functionName==='uri'?'ipfs://test':address))};
 const result=await verifyMintReceipt(mock as any,{...input,standard:'ERC1155'},address);expect(result.mintedAmountRaw).toBe('3');expect(result.heldAmountRaw).toBe('3');
 mock.readContract.mockImplementation(({functionName})=>Promise.resolve(functionName==='balanceOf'?2n:functionName==='uri'?'ipfs://test':address));
 await expect(verifyMintReceipt(mock as any,{...input,standard:'ERC1155'},address)).rejects.toThrow('owner');
});
