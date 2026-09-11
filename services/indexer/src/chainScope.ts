// Each indexer worker serves exactly one network, including nested asset relations.
export function chainWhere(model:string, where:Record<string,unknown>|undefined, chainId:number) {
 const scope = ['Collection','Listing','Offer'].includes(model) ? {chainId} : model==='Token' ? {collection:{chainId}} : ['TokenHolding','TokenTag','Report','ModerationAction'].includes(model) ? {token:{collection:{chainId}}} : null;
 return scope ? {...where,AND:[...(Array.isArray(where?.AND)?where.AND:where?.AND?[where.AND]:[]),scope]} : where;
}
