export type ProfileDesign = {version:1;customScope:'section'|'page';top8Targets:{label:string;url:string}[];customHtml:string;customCss:string;customHeight:number;palette:'acid'|'bubblegum'|'ice';pattern:'stars'|'grid'|'plain';headline:string;mood:string;sticker:string;top8:string[];panels:{title:string;body:string}[];featured:string[];theme:'gallery'|'midnight'|'paper'|'retro';font:'sans'|'serif';modules:string[]};
export const PROFILE_MODULES: string[];
export function normalizeDesign(value:unknown):ProfileDesign;
export function safeProfileLink(value:unknown):string|null;

export function safeProfileTarget(value:unknown):string|null;
