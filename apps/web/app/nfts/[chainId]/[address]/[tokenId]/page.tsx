import {getPublicArtwork,artworkMetadata} from '../../../../../lib/publicSeo';
import {getEnabledAppChainIds} from '../../../../../lib/chains';
import {notFound} from 'next/navigation';
import AssetDetailClient from '../../../../../components/artwork/AssetDetailClient';
import {validAssetRoute} from '../../../../../lib/assetRoutes';
export async function generateMetadata({params}:{params:Promise<{chainId:string;address:string;tokenId:string}>}) {
 const {chainId,address,tokenId}=await params;
 if(!getEnabledAppChainIds().includes(Number(chainId))||!validAssetRoute(chainId,address,tokenId)) return {title:'Artwork not found',robots:{index:false,follow:false}};
 return artworkMetadata(Number(chainId),address,tokenId,await getPublicArtwork(Number(chainId),address,tokenId));
}
export default async function Page({params}:{params:Promise<{chainId:string;address:string;tokenId:string}>}) {
 const {chainId,address,tokenId}=await params; if(!getEnabledAppChainIds().includes(Number(chainId))||!validAssetRoute(chainId,address,tokenId))notFound();
 const initialData=await getPublicArtwork(Number(chainId),address,tokenId);
 return <AssetDetailClient initialData={initialData} chainId={Number(chainId)} address={address.toLowerCase()} tokenId={tokenId}/>;
}
