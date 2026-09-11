import { pageMetadata } from '../../../lib/seo';
export const metadata = pageMetadata('Customize your creator page', 'Choose your theme, cover image, and featured work.', '/profile/setup', true);
export const dynamic = "force-dynamic";
import CreatorSetupClient from "../../../components/profile/CreatorSetupClient";
import ProfileLandingClient from "../../../components/profile/ProfileLandingClient";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

export default async function ProfileSetupPage({
  searchParams
}: {
  searchParams?: Promise<{ label?: string; collection?: string; mode?: string; advanced?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  if (params?.advanced !== "1") return <CreatorSetupClient />;
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
