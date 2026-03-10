export const dynamic = "force-dynamic";
import ProfileClient from "../../../components/profile/ProfileClient";

export default async function ProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <ProfileClient name={name} />;
}
