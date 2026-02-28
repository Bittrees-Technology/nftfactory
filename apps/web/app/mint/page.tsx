import MintClient from "./MintClient";

type MintPageProps = {
  searchParams?: Promise<{
    view?: string;
    collection?: string;
    profile?: string;
  }>;
};

export default async function MintPage({ searchParams }: MintPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const initialPageMode = params?.view === "manage" ? "manage" : "mint";
  const initialMintMode = params?.collection === "custom" ? "custom" : "shared";
  const initialProfileLabel = params?.profile?.trim() || "";

  return (
    <MintClient
      initialPageMode={initialPageMode}
      initialMintMode={initialMintMode}
      initialProfileLabel={initialProfileLabel}
    />
  );
}
