'use client';
import {useCallback,useEffect, useRef, useState} from 'react';
import {useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain, useWalletClient} from 'wagmi';
import {getAppChain} from '../lib/chains';
import {networkWorkspaceUrl} from '../lib/networkNavigation';
import {getToolbarChains,useNetwork,useSelectedNetwork} from '../lib/networkContext';
import {clearWalletSession, ensureWalletSession, readWalletSession, subscribeWalletSession} from '../lib/walletSession';
import {prepareWalletConnection, walletConnectionError} from '../lib/walletConnection';

export default function HeaderWalletButton() {
  const {address, chainId, status} = useAccount();
  const connectors = useConnectors();
  const {connectAsync, isPending} = useConnect();
  const {disconnectAsync} = useDisconnect();
  const {switchChainAsync} = useSwitchChain();
  const {data: wallet} = useWalletClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [session, setSession] = useState<'checking' | 'signed-in' | 'signed-out' | 'unavailable'>('checking');
  const network = useNetwork();
  const target = useSelectedNetwork();
  const [switching, setSwitching] = useState(false);
  const [networkError, setNetworkError] = useState('');
  const identity = `${address || ''}:${chainId || ''}:${target}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const previousIdentity = useRef('');
  const refreshVersion = useRef(0);

  const refreshSession=useCallback(async () => {
    const version = ++refreshVersion.current;
    const expected = currentIdentity.current;
    if (!address) { setSession('signed-out'); return; }
    try {
      const value = await readWalletSession();
      if (version === refreshVersion.current && expected === currentIdentity.current) setSession(value.address?.toLowerCase() === address.toLowerCase() && value.chainId === target ? 'signed-in' : 'signed-out');
    } catch {
      if (version === refreshVersion.current && expected === currentIdentity.current) setSession('unavailable');
    }
  },[address,target]);
  useEffect(() => {
    if ((status === 'connecting' || status === 'reconnecting') && !previousIdentity.current) return;
    const previous = previousIdentity.current;
    previousIdentity.current = address ? identity : '';
    setBusy(false); setError(''); setSession(address ? 'checking' : 'signed-out');
    if (previous && previous !== identity) {
      setSession('checking');
      void clearWalletSession().then(() => {if (currentIdentity.current === identity) {setLogoutFailed(false); void refreshSession();}}).catch(error => {if (currentIdentity.current === identity) {setLogoutFailed(true); setSession('unavailable'); setError(error.message);}});
    } else void refreshSession();
  }, [address, chainId, status, target,identity,refreshSession]);
  useEffect(() => {
    const refresh = () => { void refreshSession(); };
    const unsubscribe = subscribeWalletSession(refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => { if (dialog.current?.open) refresh(); }, 30_000);
    return () => {unsubscribe(); window.removeEventListener('focus', refresh); window.clearInterval(timer);};
  }, [address, chainId, target,refreshSession]);

  async function signIn() {
    if (!wallet || !address) return;
    const expected = currentIdentity.current;
    setBusy(true); setError('');
    try {
      await ensureWalletSession(address, args => wallet.signMessage(args), target);
      if (expected === currentIdentity.current) await refreshSession();
    } catch (error) {
      if (expected === currentIdentity.current) setError(error instanceof Error ? error.message : 'Sign-in was not completed.');
    } finally {if (expected === currentIdentity.current) setBusy(false);}
  }
  async function disconnectWallet() {
    setLoggingOut(true); setError(''); setSession('signed-out'); setBusy(false);
    refreshVersion.current++;
    // clearWalletSession invalidates pending signing synchronously, then waits
    // for any verification response before deleting and checking the cookie.
    const logout = clearWalletSession();
    previousIdentity.current = '';
    try {
      await Promise.all([logout, disconnectAsync()]);
      setLogoutFailed(false); dialog.current?.close();
    } catch (error) {
      setLogoutFailed(true);
      setError(error instanceof Error ? error.message : 'Disconnect did not complete. Please retry.');
    } finally {setLoggingOut(false);}
  }
  async function changeNetwork(next:number){
    if(switching)return;
    const expected=currentIdentity.current;
    setSwitching(true);setNetworkError('');
    try {
      if(address && chainId!==next) await switchChainAsync({chainId:next});
      // Account changes invalidate an outstanding wallet request.
      if(currentIdentity.current.split(':')[0]===expected.split(':')[0]) {
        network?.selectNetwork(next);
        const href=networkWorkspaceUrl(window.location.href,next);
        if(href)window.history.replaceState(window.history.state,'',href);
      }
    } catch { setNetworkError('Network switch was not completed. Your selection is unchanged.'); }
    finally {setSwitching(false);}
  }
  return <>
    <div className="headerNetworkControl">
      <label className="srOnly" htmlFor="header-network">Network</label>
      <select id="header-network" aria-label="Network" value={target} disabled={switching || loggingOut || busy || isPending} onChange={e=>void changeNetwork(Number(e.target.value))}>{getToolbarChains().map(chain=><option key={chain.id} value={chain.id}>{chain.name}</option>)}</select>
      {address && chainId !== target && <button className="secondary" disabled={switching || loggingOut} onClick={()=>void changeNetwork(target)}>Connect network</button>}
      {networkError && <p role="alert">{networkError}</p>}
    </div>
    <button className={`headerWalletButton ${address ? 'walletConnected' : ''}`} disabled={isPending || loggingOut} onClick={() => {setError(''); void refreshSession(); dialog.current?.showModal();}} aria-label={address ? 'Open wallet account' : 'Connect wallet'}>{address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Connect'}</button>
    <dialog ref={dialog} className="walletDialog" aria-labelledby="wallet-title">
      <div className="walletDialogHeader"><h2 id="wallet-title">{address ? 'Your wallet' : 'Connect a wallet'}</h2><button className="secondary" aria-label="Close wallet dialog" onClick={() => dialog.current?.close()}>Close</button></div>
      {logoutFailed && <button disabled={loggingOut} onClick={() => void disconnectWallet()}>Retry disconnect</button>}
      {!address ? <div className="walletOptions">
        {connectors.map(connector => <button key={connector.uid} disabled={isPending || loggingOut || logoutFailed} onClick={async () => {setError(''); try {await prepareWalletConnection(connector, () => dialog.current?.close()); await connectAsync({connector}); dialog.current?.close();} catch (error) {setError(walletConnectionError(error)); if (!dialog.current?.open) dialog.current?.showModal();}}}>{connector.id === 'injected' ? 'Browser wallet' : connector.name}</button>)}
        <p className="hint">Use an installed wallet or scan with a supported mobile wallet.</p>
      </div> : <>
        <p className="receiptHash">{address}</p>
        <p>Selected network: {getAppChain(target).name}</p>{chainId !== target && <p className="hint">Your wallet is on {chainId ? getAppChain(chainId).name : 'an unknown network'}. Select {getAppChain(target).name} in the toolbar before transacting.</p>}
        <div className="walletOptions">
          <button disabled={switching || chainId !== target || busy || loggingOut || logoutFailed || !wallet || session === 'checking' || session === 'signed-in'} onClick={() => void signIn()}>{busy ? 'Waiting for wallet…' : session === 'checking' ? 'Checking sign-in…' : session === 'signed-in' ? 'Signed in' : session === 'unavailable' ? 'Retry sign-in' : 'Sign in to save changes'}</button>
          <button className="secondary" disabled={loggingOut} onClick={() => void disconnectWallet()}>{loggingOut ? 'Disconnecting…' : 'Disconnect'}</button>
        </div>
        <p className="hint">{session === 'signed-in' ? 'You can save changes. No additional sign-in is needed.' : session === 'unavailable' ? 'Sign-in status could not be checked. Please retry.' : 'Connecting shares your address. Signing in lets you save changes.'}</p>
      </>}
      <p role="status">{error}</p>
    </dialog>
  </>;
}
