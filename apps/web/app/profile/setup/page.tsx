import ProfileLandingClient from "../ProfileLandingClient";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

export default async function ProfileSetupPage({
  searchParams
}: {
  searchParams?: Promise<{ label?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const initialLabel = normalizeLabel(params?.label || "");

  return <ProfileLandingClient initialLabel={initialLabel} />;
}
