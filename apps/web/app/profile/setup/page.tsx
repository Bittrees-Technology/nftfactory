export const dynamic = "force-dynamic";
import ProfileLandingClient from "../../../components/profile/ProfileLandingClient";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

export default async function ProfileSetupPage({
  searchParams
}: {
  searchParams?: Promise<{ label?: string; collection?: string; mode?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const initialLabel = normalizeLabel(params?.label || "");
  const initialCollectionAddress = String(params?.collection || "").trim();
  const initialMode = String(params?.mode || "").trim();

  return (
    <ProfileLandingClient
      initialLabel={initialLabel}
      initialCollectionAddress={initialCollectionAddress}
      initialIdentityMode={initialMode}
    />
  );
}
