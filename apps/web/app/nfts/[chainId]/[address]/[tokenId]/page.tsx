import {notFound} from 'next/navigation';
import AssetDetailClient from '../../../../../components/artwork/AssetDetailClient';
import {validAssetRoute} from '../../../../../lib/assetRoutes';
export default async function Page({params}:{params:Promise<{chainId:string;address:string;tokenId:string}>}) {
 const {chainId,address,tokenId}=await params; if(!validAssetRoute(chainId,address,tokenId))notFound();
 return <AssetDetailClient chainId={Number(chainId)} address={address.toLowerCase()} tokenId={tokenId}/>;
}
