import Link from 'next/link';
import ArtworkImage from '../profile/ArtworkImage';
import { getAppChain } from '../../lib/chains';
import { nftPath, collectionPath } from '../../lib/assetRoutes';
import type { ApiMintFeedItem } from '../../lib/indexerApi';
export default function ArtworkCard({item}:{item:ApiMintFeedItem}) {
  const title = item.draftName || `Artwork #${item.tokenId}`;
  return <article className="card artworkCard"><Link className="artworkCardImage" href={nftPath(item.collection.chainId,item.collection.contractAddress,item.tokenId)} aria-label={`View ${title}`}><ArtworkImage source={item.mediaUrl || (item.mediaCid ? `ipfs://${item.mediaCid}` : '')} alt={title}/></Link><div className="artworkCardBody"><p className="eyebrow">{getAppChain(item.collection.chainId).name}</p><h3><Link href={nftPath(item.collection.chainId,item.collection.contractAddress,item.tokenId)}>{title}</Link></h3><Link className="hint" href={collectionPath(item.collection.chainId,item.collection.contractAddress)}>{item.collection.ensSubname || `Collection ${item.collection.contractAddress.slice(0,6)}…${item.collection.contractAddress.slice(-4)}`}</Link><p className="hint">{item.activeListing ? 'Listed for sale' : 'Not listed'}</p></div></article>;
}
