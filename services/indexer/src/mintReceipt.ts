import { parseAbi, parseAbiItem, parseEventLogs, zeroAddress, type PublicClient, type Address, type Hash } from 'viem';

export async function verifyMintReceipt(client: Pick<PublicClient, 'getTransactionReceipt' | 'readContract'>, input: {
  contractAddress: string; tokenId: string; mintTxHash?: string | null; metadataCid: string; standard?: string;
}, signer: string) {
  if (input.standard !== 'ERC721' || !/^0x[\da-f]{40}$/i.test(input.contractAddress) || !/^\d{1,78}$/.test(input.tokenId) || !/^0x[\da-f]{64}$/i.test(input.mintTxHash || '')) throw new Error('A confirmed ERC721 mint receipt is required.');
  const contract = input.contractAddress as Address;
  const tokenId = BigInt(input.tokenId);
  const receipt = await client.getTransactionReceipt({ hash: input.mintTxHash as Hash });
  const logs = parseEventLogs({ abi: [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)')], logs: receipt.logs });
  if (receipt.status !== 'success' || !logs.some(log => log.address.toLowerCase() === contract.toLowerCase() && log.args.from === zeroAddress && log.args.to.toLowerCase() === signer.toLowerCase() && log.args.tokenId === tokenId)) throw new Error('Receipt does not prove this wallet minted this NFT.');
  const abi = parseAbi(['function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)', 'function owner() view returns (address)']);
  const [owner, uri, collectionOwner] = await Promise.all([
    client.readContract({ address: contract, abi, functionName: 'ownerOf', args: [tokenId] }),
    client.readContract({ address: contract, abi, functionName: 'tokenURI', args: [tokenId] }),
    client.readContract({ address: contract, abi, functionName: 'owner' })
  ]);
  if (String(owner).toLowerCase() !== signer.toLowerCase() || uri !== input.metadataCid) throw new Error('On-chain owner or metadata does not match the request.');
  return { ownerAddress: String(owner).toLowerCase(), creatorAddress: signer.toLowerCase(), collectionOwnerAddress: String(collectionOwner).toLowerCase() };
}
