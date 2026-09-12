export type RecoveredMetadata={name:string|null;description:string|null;imageUrl:string|null;audioUrl:string|null;source:string;sourceUrl:string;recoveredAt:string};
export function boundedProviderJson(url:string,headers?:Record<string,string>,fetcher?:typeof fetch,maxBytes?:number):Promise<any>;
export function safeMetadataLink(value:unknown):string|null;
export function recoverMetadata(chainId:number,contract:string,tokenId:string,options?:{openSeaKey?:string;fetcher?:typeof fetch}):Promise<RecoveredMetadata|null>;
