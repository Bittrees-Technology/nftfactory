export const IMPORT_NETWORKS = [
  {id:1,name:'Ethereum mainnet',rpcUrl:'https://ethereum-rpc.publicnode.com'},
  {id:8453,name:'Base',rpcUrl:'https://mainnet.base.org'},
  {id:4663,name:'Robinhood Chain',rpcUrl:'https://rpc.mainnet.chain.robinhood.com'},
  {id:11155111,name:'Sepolia (testnet)',rpcUrl:'https://ethereum-sepolia-rpc.publicnode.com'}
];
export function importNetwork(id) {
  const network=IMPORT_NETWORKS.find(n=>n.id===id);
  if(!network)throw new Error('Unsupported artwork network.');
  return network;
}
export function isArtworkNetworkPath(path, method, readOnly) {
  return /^\/api\/artwork\/[^/]+\/[^/]+\/tags$/.test(path) && ['GET','POST'].includes(method)
    || path==='/api/imports' && method==='POST'
    || /^\/api\/users\/[^/]+\/holdings$/.test(path) && method==='GET'
    || /^\/api\/collections\/[^/]+\/tokens$/.test(path) && method==='GET' && readOnly==='1';
}
