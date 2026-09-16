import {getAppChain} from '../lib/chains';
export default function NetworkUnavailable({chainId,feature}:{chainId:number;feature:string}){
 return <section className="studioPage"><h1>{feature}</h1><p>{feature} is not available on {getAppChain(chainId).name} yet. Choose a supported network in the top-right toolbar.</p></section>;
}
