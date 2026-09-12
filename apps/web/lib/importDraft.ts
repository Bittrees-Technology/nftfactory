import {IMPORT_NETWORKS} from '../../../packages/profile/import-networks.mjs';
export type ImportDraft={chainId:number;contract:string;ids:string;mode?:'collected'|'collection'};
export const emptyImportDraft=():ImportDraft=>({chainId:1,contract:'',ids:''});
export function importDraftKey(address?:string){return `nftfactory:import-draft:v1:${address?.toLowerCase()||'guest'}`;}
export function readImportDraft(key:string):ImportDraft|null {
 const raw=localStorage.getItem(key);if(!raw)return null;
 if(raw.length>1500)return null;
 try{const d=JSON.parse(raw);return d.version===1&&IMPORT_NETWORKS.some(n=>n.id===d.chainId)&&typeof d.contract==='string'&&d.contract.length<=42&&typeof d.ids==='string'&&d.ids.length<=800?{chainId:d.chainId,contract:d.contract,ids:d.ids,...(d.mode==='collection'||d.mode==='collected'?{mode:d.mode}:{})}:null;}catch{return null;}
}
export function writeImportDraft(key:string,draft:ImportDraft){localStorage.setItem(key,JSON.stringify({version:1,...draft}));}
