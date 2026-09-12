export type ImportNetwork={id:number;name:string;rpcUrl:string};
export const IMPORT_NETWORKS:ImportNetwork[];
export function importNetwork(id:number):ImportNetwork;
export function isArtworkNetworkPath(path:string,method:string,readOnly:string|null):boolean;
