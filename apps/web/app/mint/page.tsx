import { pageMetadata } from '../../lib/seo';
export const metadata = pageMetadata('Create an NFT', 'Upload your artwork, preview its details, and review network fees before minting.', '/mint', true);
export const dynamic = "force-dynamic";
import {notFound} from "next/navigation";
import {getReadableAppChainIds,getPrimaryAppChainId} from "../../lib/chains";
import CreateClient from "../../components/create/CreateClient";
import MintClient from "../../components/mint/MintClient";

type MintPageProps = {
  searchParams?: Promise<{
    view?: string;
    chainId?: string;
    collection?: string;
    profile?: string;
    address?: string;
    identityMode?: string;
  }>;
};

export default async function MintPage({ searchParams }: MintPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const targetChainId=params?.chainId?Number(params.chainId):getPrimaryAppChainId();
  if(!getReadableAppChainIds().includes(targetChainId))notFound();
  const initialPageMode =
    params?.view === "manage" ? "manage" : params?.view === "view" ? "view" : "mint";
  const initialMintMode = params?.collection === "custom" ? "custom" : "shared";
  const initialProfileLabel = params?.profile?.trim() || "";
  const initialCollectionAddress = params?.address?.trim() || "";
  const initialCollectionIdentityMode = params?.identityMode?.trim() || "";

  if (initialPageMode === "mint" && initialMintMode === "shared") return <CreateClient key={targetChainId} initialChainId={params?.chainId ? targetChainId : undefined} />;

  return (
    <MintClient
      key={`${targetChainId}:${initialPageMode}:${initialCollectionAddress}`}
      initialChainId={params?.chainId ? targetChainId : undefined}
      initialPageMode={initialPageMode}
      initialMintMode={initialMintMode}
      initialProfileLabel={initialProfileLabel}
      initialCollectionAddress={initialCollectionAddress}
      initialCollectionIdentityMode={initialCollectionIdentityMode}
    />
  );
}
