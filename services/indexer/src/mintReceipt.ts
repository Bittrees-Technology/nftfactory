import { parseAbi, parseAbiItem, parseEventLogs, zeroAddress, type PublicClient, type Address, type Hash } from 'viem';
export async function verifyMintReceipt(client: Pick<PublicClient, 'getTransactionReceipt' | 'readContract'>, input: {
  contractAddress: string; tokenId: string; mintTxHash?: string | null; metadataCid: string; standard?: string;
}, signer: string) {
  if (!['ERC721','ERC1155'].includes(input.standard||'') || !/^0x[\da-f]{40}$/i.test(input.contractAddress) || !/^\d{1,78}$/.test(input.tokenId) || BigInt(input.tokenId)>=2n**256n || !/^0x[\da-f]{64}$/i.test(input.mintTxHash || '')) throw new Error('A confirmed ERC721 or ERC1155 mint receipt is required.');
  const contract=input.contractAddress as Address,tokenId=BigInt(input.tokenId);
  const receipt=await client.getTransactionReceipt({hash:input.mintTxHash as Hash});
  if(receipt.status!=='success')throw new Error('Receipt does not show a successful mint transaction.');
  const abi=parseAbi(['function ownerOf(uint256) view returns (address)','function balanceOf(address,uint256) view returns (uint256)','function tokenURI(uint256) view returns (string)','function uri(uint256) view returns (string)','function owner() view returns (address)']);
  let quantity=0n;
  if(input.standard==='ERC721') {
    const logs=parseEventLogs({abi:[parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)')],logs:receipt.logs});
    if(logs.some(log=>log.address.toLowerCase()===contract.toLowerCase()&&log.args.from===zeroAddress&&log.args.to.toLowerCase()===signer.toLowerCase()&&log.args.tokenId===tokenId))quantity=1n;
  } else {
    const single=parseEventLogs({abi:[parseAbiItem('event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)')],logs:receipt.logs});
    for(const log of single)if(log.address.toLowerCase()===contract.toLowerCase()&&log.args.from===zeroAddress&&log.args.to.toLowerCase()===signer.toLowerCase()&&log.args.id===tokenId)quantity+=log.args.value;
    const batch=parseEventLogs({abi:[parseAbiItem('event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)')],logs:receipt.logs});
    for(const log of batch)if(log.address.toLowerCase()===contract.toLowerCase()&&log.args.from===zeroAddress&&log.args.to.toLowerCase()===signer.toLowerCase())for(let i=0;i<log.args.ids.length;i++)if(log.args.ids[i]===tokenId)quantity+=log.args.values[i];
  }
  if(quantity<1n)throw new Error('Receipt does not prove this wallet minted this NFT.');
  const [ownerOrBalance,uri,collectionOwner]=await Promise.all([
    input.standard==='ERC721'?client.readContract({address:contract,abi,functionName:'ownerOf',args:[tokenId]}):client.readContract({address:contract,abi,functionName:'balanceOf',args:[signer as Address,tokenId]}),
    client.readContract({address:contract,abi,functionName:input.standard==='ERC721'?'tokenURI':'uri',args:[tokenId]}),
    client.readContract({address:contract,abi,functionName:'owner'}).catch(()=>zeroAddress)
  ]);
  const owns=input.standard==='ERC721'?String(ownerOrBalance).toLowerCase()===signer.toLowerCase():BigInt(ownerOrBalance)>=quantity;
  if(!owns||uri!==input.metadataCid)throw new Error('On-chain owner or metadata does not match the request.');
  // A mint recipient is not necessarily its creator. Attribute only a matching
  // publication event from the NFT contract; external mints remain unverified.
  let creatorAddress: string = zeroAddress;
  const publishedAbi = parseAbi([
    'event TokenPublished(address indexed creator,uint256 indexed tokenId,string uri)',
    'event TokenPublished(address indexed creator,uint256 indexed tokenId,uint256 amount,string uri)',
    'event Published(address indexed creator,uint256 indexed tokenId,string creatorSubname,string uri)',
    'event Published(address indexed creator,uint256 indexed tokenId,string creatorSubname,uint256 amount,string uri)'
  ]);
  for (const log of parseEventLogs({abi:publishedAbi,logs:receipt.logs})) {
    if (log.address.toLowerCase()===contract.toLowerCase() && log.args.tokenId===tokenId && log.args.uri===input.metadataCid) creatorAddress=log.args.creator.toLowerCase();
  }
  return {ownerAddress:signer.toLowerCase(),creatorAddress,collectionOwnerAddress:String(collectionOwner).toLowerCase(),mintedAmountRaw:quantity.toString(),heldAmountRaw:input.standard==='ERC1155'?String(ownerOrBalance):'1'};
}
