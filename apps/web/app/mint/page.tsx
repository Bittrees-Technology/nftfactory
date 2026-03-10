export const dynamic = "force-dynamic";
import MintClient from "../../components/mint/MintClient";

type MintPageProps = {
  searchParams?: Promise<{
    view?: string;
    collection?: string;
    profile?: string;
    address?: string;
  }>;
};

export default async function MintPage({ searchParams }: MintPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const initialPageMode =
    params?.view === "manage" ? "manage" : params?.view === "view" ? "view" : "mint";
  const initialMintMode = params?.collection === "custom" ? "custom" : "shared";
  const initialProfileLabel = params?.profile?.trim() || "";
  const initialCollectionAddress = params?.address?.trim() || "";

  return (
    <MintClient
      initialPageMode={initialPageMode}
      initialMintMode={initialMintMode}
      initialProfileLabel={initialProfileLabel}
      initialCollectionAddress={initialCollectionAddress}
    />
  );
}
