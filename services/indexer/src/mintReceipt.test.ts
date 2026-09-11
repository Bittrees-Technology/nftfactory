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
