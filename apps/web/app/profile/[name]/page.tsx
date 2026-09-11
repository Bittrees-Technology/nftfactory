export const dynamic = "force-dynamic";
import CreatorPageClient from "../../../components/profile/CreatorPageClient";
import CreatorIdentityClient from "../../../components/profile/CreatorIdentityClient";
import ProfileClient from "../../../components/profile/ProfileClient";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<{advanced?:string}> }) {
  const { name } = await params;
  if (/^0x[0-9a-f]{40}$/i.test(name)) return <CreatorPageClient address={name.toLowerCase()} />;
  if ((await searchParams).advanced === "1") return <ProfileClient name={name} />;
  return <CreatorIdentityClient name={name} />;
}
