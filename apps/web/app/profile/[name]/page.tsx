export const dynamic = "force-dynamic";
import CreatorPageClient from "../../../components/profile/CreatorPageClient";
import ProfileClient from "../../../components/profile/ProfileClient";

export default async function ProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (/^0x[0-9a-f]{40}$/i.test(name)) return <CreatorPageClient address={name.toLowerCase()} />;
  return <ProfileClient name={name} />;
}
