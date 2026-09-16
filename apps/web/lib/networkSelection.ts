import {getPrimaryAppChainId} from './chains';
let selectedChainId:number|undefined;
// Updated by the provider so non-React sign-in callers use the toolbar network.
export function setSelectedNetworkId(chainId:number){selectedChainId=chainId;}
export function getSelectedNetworkId(){return selectedChainId??getPrimaryAppChainId();}
