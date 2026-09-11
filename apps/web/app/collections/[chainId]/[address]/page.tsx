import {getPublicArtwork,artworkMetadata} from '../../../../lib/publicSeo';
import {getEnabledAppChainIds} from '../../../../lib/chains';
import {notFound} from 'next/navigation';
import AssetDetailClient from '../../../../components/artwork/AssetDetailClient';
import {validAssetRoute} from '../../../../lib/assetRoutes';
export async function generateMetadata({params}:{params:Promise<{chainId:string;address:string}>}) {
 const {chainId,address}=await params;
 if(!getEnabledAppChainIds().includes(Number(chainId))||!validAssetRoute(chainId,address,undefined)) return {title:'Artwork not found',robots:{index:false,follow:false}};
 return artworkMetadata(Number(chainId),address,undefined,await getPublicArtwork(Number(chainId),address,undefined));
}
export default async function Page({params}:{params:Promise<{chainId:string;address:string}>}) {
 const {chainId,address}=await params; if(!getEnabledAppChainIds().includes(Number(chainId))||!validAssetRoute(chainId,address))notFound();
 const initialData=await getPublicArtwork(Number(chainId),address,undefined);
 return <AssetDetailClient initialData={initialData} chainId={Number(chainId)} address={address.toLowerCase()}/>;
}
