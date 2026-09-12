import {createPublicClient,http,fallback} from 'viem';
import {mainnet} from 'viem/chains';
import {normalize} from 'viem/ens';
export async function resolveProfileEns(name,primaryRpc){
 const urls=[...new Set([primaryRpc,'https://ethereum-rpc.publicnode.com'].filter(Boolean))];
 const client=createPublicClient({chain:mainnet,transport:fallback(urls.map(url=>http(url,{timeout:3000,retryCount:0})),{retryCount:0})});
 return client.getEnsAddress({name:normalize(name)});
}
