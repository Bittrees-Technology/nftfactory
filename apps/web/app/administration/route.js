import {createProjectAdministration} from "../../../../shared/roles-administration/project-administration/portal.mjs";
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handle=createProjectAdministration("nftfactory");
export async function GET(request){const url=new URL(request.url);url.pathname="/administration";return handle(new Request(url,{headers:request.headers}));}
