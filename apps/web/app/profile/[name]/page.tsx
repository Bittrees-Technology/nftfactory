import ProfileClient from "./ProfileClient";

export default async function ProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <ProfileClient name={name} />;
}
