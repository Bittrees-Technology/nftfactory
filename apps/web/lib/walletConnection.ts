type ConnectorLike = {id:string;type?:string;getProvider:()=>Promise<unknown>};
export async function prepareWalletConnection(connector:ConnectorLike,closeChooser:()=>void){
 if(connector.type==='injected'||connector.id==='injected'){
  if(!await connector.getProvider())throw new Error('No browser wallet was found. Open NFTFactory in your wallet-enabled browser, or choose WalletConnect.');
 }
 // Native dialogs are in the browser top layer: a QR modal cannot cover them.
 if(connector.id==='walletConnect'||connector.type==='walletConnect')closeChooser();
}
export function walletConnectionError(error:unknown):string{
 if(error instanceof Error&&error.message.startsWith('No browser wallet was found.'))return error.message;
 if(error&&typeof error==='object'&&'code' in error&&error.code===4001)return 'Connection canceled. You can choose a wallet and try again.';
 return 'Connection was not completed. Check your wallet or choose another connection method.';
}
