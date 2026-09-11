import {notFound} from 'next/navigation';
import AssetDetailClient from '../../../../components/artwork/AssetDetailClient';
import {validAssetRoute} from '../../../../lib/assetRoutes';
export default async function Page({params}:{params:Promise<{chainId:string;address:string}>}) {
 const {chainId,address}=await params; if(!validAssetRoute(chainId,address))notFound();
 return <AssetDetailClient chainId={Number(chainId)} address={address.toLowerCase()}/>;
}
