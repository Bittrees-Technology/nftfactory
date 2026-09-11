export const productLinks = [
 {href:'/discover',label:'Explore'},
 {href:'/marketplace',label:'Marketplace'},
 {href:'/mint',label:'Create'},
 {href:'/profile',label:'My studio'}
] as const;
const studioRoutes=['/profile','/profile/setup','/profile/import','/profile/tags','/profile/listings','/profile/moderation'];
export function productSection(pathname:string): string | undefined {
 if(studioRoutes.some(route=>pathname===route||(route!=='/profile'&&pathname.startsWith(route+'/'))))return '/profile';
 if(pathname==='/mint'||pathname.startsWith('/mint/'))return '/mint';
 if(pathname==='/marketplace'||pathname.startsWith('/marketplace/'))return '/marketplace';
 if(['/discover','/examples/','/collections/','/nfts/','/profile/'].some(route=>pathname===route||pathname.startsWith(route.endsWith('/')?route:route+'/')))return '/discover';
 return undefined;
}
