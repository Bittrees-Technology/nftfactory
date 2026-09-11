'use client';
import {useNftMetadataPreview} from '../../lib/nftMetadata';
import Link from 'next/link';
import ArtworkImage from '../profile/ArtworkImage';
import { getAppChain } from '../../lib/chains';
import { nftPath, collectionPath } from '../../lib/assetRoutes';
import type { ApiMintFeedItem } from '../../lib/indexerApi';
export default function ArtworkCard({item}:{item:ApiMintFeedItem}) {
  const metadata=useNftMetadataPreview({metadataUri:item.metadataUrl||item.metadataCid,mediaUri:item.mediaUrl,gateway:(process.env.NEXT_PUBLIC_IPFS_GATEWAY||'https://ipfs.io')+'/ipfs'});
  const title = item.draftName || metadata.name || `Artwork #${item.tokenId}`;
  return <article className="card artworkCard"><Link className="artworkCardImage" href={nftPath(item.collection.chainId,item.collection.contractAddress,item.tokenId)} aria-label={`View ${title}`}><ArtworkImage source={item.mediaUrl || metadata.imageUrl || (item.mediaCid ? `ipfs://${item.mediaCid}` : '')} alt={title}/></Link><div className="artworkCardBody"><p className="eyebrow">{getAppChain(item.collection.chainId).name}</p><h3><Link href={nftPath(item.collection.chainId,item.collection.contractAddress,item.tokenId)}>{title}</Link></h3><Link className="hint" href={collectionPath(item.collection.chainId,item.collection.contractAddress)}>{item.collection.ensSubname || `Collection ${item.collection.contractAddress.slice(0,6)}…${item.collection.contractAddress.slice(-4)}`}</Link><p className="hint">{item.activeListing ? 'Listed for sale' : 'Not listed'}</p></div></article>;
}
