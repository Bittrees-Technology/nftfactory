import {profileReader} from '../../../../lib/server/sharedProfile';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return profileReader()(request);}
