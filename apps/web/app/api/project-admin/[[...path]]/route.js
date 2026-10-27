import {createProjectAdministration} from "../../../../../../shared/roles-administration/project-administration/portal.mjs";
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handle=createProjectAdministration("nftfactory");
export const GET=handle;
export const POST=handle;
