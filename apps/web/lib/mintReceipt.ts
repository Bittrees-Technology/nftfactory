import {parseEventLogs, parseAbi, zeroAddress, type Log} from 'viem';
const mintEvents = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)', 'event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)']);
export function positiveUint256(value: string, label: string): bigint {
  if (!/^[0-9]+$/.test(value) || BigInt(value) <= 0n || BigInt(value) >= 2n ** 256n) throw new Error(`${label} must be a positive whole number within uint256.`);
  return BigInt(value);
}
export function mintedTokenId(receipt: {status: string; logs: Log[]}, contract: string, standard: 'ERC721'|'ERC1155', recipient: string): string {
  if (receipt.status !== 'success') throw new Error('The mint transaction reverted. No NFT was created.');
  const logs = parseEventLogs({abi: mintEvents, logs: receipt.logs});
  const mint = logs.find(log => log.address.toLowerCase() === contract.toLowerCase() && log.args.from === zeroAddress && log.args.to.toLowerCase() === recipient.toLowerCase() && log.eventName === (standard === 'ERC721' ? 'Transfer' : 'TransferSingle'));
  if (!mint) throw new Error('No matching mint event was found. Keep the transaction hash for review.');
  return (mint.eventName === 'Transfer' ? mint.args.tokenId : mint.args.id).toString();
}
export type PendingMint = {hash:`0x${string}`;chainId:number;wallet:`0x${string}`;contract:`0x${string}`;standard:'ERC721'|'ERC1155';mode:'shared'|'custom';amount:string;metadataUri:string;name:string;description:string;mediaUri:string|null;immutable:boolean;ensSubname:string|null;collectionCreatedAt:string|null};
export function pendingMintKey(chainId:number, wallet:string) { return `nftfactory:pending-mint:${chainId}:${wallet.toLowerCase()}`; }
export function readPendingMint(raw:string|null,chainId:number,wallet:string):PendingMint|null {
  if(!raw)return null;
  const value=JSON.parse(raw) as PendingMint;
  if(value.chainId!==chainId||value.wallet?.toLowerCase()!==wallet.toLowerCase()||!/^0x[0-9a-f]{64}$/i.test(value.hash)||!/^0x[0-9a-f]{40}$/i.test(value.contract)||!['ERC721','ERC1155'].includes(value.standard)||!['shared','custom'].includes(value.mode)||!value.metadataUri?.startsWith('ipfs://'))throw new Error('Saved mint recovery data is invalid. Keep its transaction hash for review.');
  positiveUint256(value.amount,'Saved quantity');return value;
}

export type PendingCollection = {hash:`0x${string}`;chainId:number;wallet:`0x${string}`;factory:`0x${string}`;standard:'ERC721'|'ERC1155';ensSubname:string};
export function pendingCollectionKey(chainId:number,wallet:string) { return `nftfactory:pending-collection:${chainId}:${wallet.toLowerCase()}`; }
export function readPendingCollection(raw:string|null,chainId:number,wallet:string):PendingCollection|null {
  if (!raw) return null;
  const value=JSON.parse(raw) as PendingCollection;
  if(value.chainId!==chainId||value.wallet?.toLowerCase()!==wallet.toLowerCase()||!/^0x[0-9a-f]{64}$/i.test(value.hash)||!/^0x[0-9a-f]{40}$/i.test(value.factory)||!['ERC721','ERC1155'].includes(value.standard)||typeof value.ensSubname!=='string') throw new Error('Saved collection recovery data is invalid. Keep its transaction hash for review.');
  return value;
}
