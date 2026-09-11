import { pageMetadata } from '../../../lib/seo';
export const metadata = pageMetadata('Review artwork reports', 'Review reported content.', '/profile/moderation', true);
import ProfileModerationClient from "../../../components/profile/ProfileModerationClient";

export const dynamic = "force-dynamic";

export default function ProfileModerationPage() {
  return <ProfileModerationClient />;
}
