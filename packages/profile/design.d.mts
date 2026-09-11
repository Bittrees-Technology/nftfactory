export type ProfileDesign = {version:1;featured:string[];theme:'gallery'|'midnight'|'paper';font:'sans'|'serif';modules:string[]};
export const PROFILE_MODULES: string[];
export function normalizeDesign(value:unknown):ProfileDesign;
export function safeProfileLink(value:unknown):string|null;
