'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import Link from 'next/link';
import {useAccount, usePublicClient, useWalletClient} from 'wagmi';
import {normalize} from 'viem/ens';
import ExistingEnsNameField from './ExistingEnsNameField';
import {getContractsConfig} from '../../lib/contracts';
import {getAppChain} from '../../lib/chains';
import {fetchCollectionsByOwner, type ApiOwnedCollections} from '../../lib/indexerApi';
import {verifyOwnedCollectionsOnChain} from '../../lib/onchainCollections';
import {linkCreatorIdentity, verifyCreatorName} from '../../lib/linkCreatorIdentity';
import {readWalletSession, subscribeWalletSession} from '../../lib/walletSession';
import styles from './ProfileIdentity.module.css';

type Feedback = {key: string; status: 'checking' | 'ready' | 'error' | 'saving' | 'success'; message: string};
function normalizeName(value: string) {
  try {const name = normalize(value.trim()); return name.endsWith('.eth') && name.length <= 255 ? name : '';} catch {return '';}
}

export default function ProfileLandingClient({initialLabel = '', initialCollectionAddress = '', initialIdentityMode = ''}: {
  initialLabel?: string; initialCollectionAddress?: string; initialIdentityMode?: string;
}) {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = getAppChain(config.chainId);
  const {address, isConnected} = useAccount();
  const owner = isConnected ? address?.toLowerCase() || '' : '';
  const {data: walletClient} = useWalletClient();
  const publicClient = usePublicClient({chainId: config.chainId});
  const [mode, setMode] = useState(initialIdentityMode.startsWith('register-') ? 'register' : 'link');
  const [name, setName] = useState(normalizeName(initialLabel));
  const [refresh, setRefresh] = useState(0);
  const [inventory, setInventory] = useState({owner: '', names: [] as string[], loading: false, error: '', incomplete: false});
  const [sessionOwner, setSessionOwner] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [retryCheck, setRetryCheck] = useState(0);
  const [collection, setCollection] = useState(initialCollectionAddress.toLowerCase());
  const [collectionName, setCollectionName] = useState('');
  const [collectionState, setCollectionState] = useState({owner: '', items: [] as ApiOwnedCollections['collections'], loading: false, error: ''});
  const [collectionRefresh, setCollectionRefresh] = useState(0);
  const [collectionFeedback, setCollectionFeedback] = useState<Feedback | null>(null);
  const [legacyPending, setLegacyPending] = useState(false);
  const operation = useRef(false);
  const current = useRef('');
  const selectionKey = `${owner}:${mode}:${name}`;
  current.current = selectionKey;
  const names = owner && inventory.owner === owner ? inventory.names : [];
  const selectedName = names.includes(name) ? name : '';
  const visibleFeedback = feedback?.key === selectionKey ? feedback : null;
  const busy = visibleFeedback?.status === 'saving';
  const collections = owner && collectionState.owner === owner ? collectionState.items : [];
  const collectionKey = `${owner}:${collection}:${collectionName}`;
  const currentCollection = useRef(collectionKey);
  currentCollection.current = collectionKey;
  const visibleCollectionFeedback = collectionFeedback?.key === collectionKey ? collectionFeedback : null;
  const collectionBusy = visibleCollectionFeedback?.status === 'saving';
  const profilePath = owner ? `/profile/${owner}` : '';
  const aliasPath = selectedName ? `/profile/${selectedName.split('.').reverse().map(encodeURIComponent).join('.')}` : '';

  useEffect(() => {
    let cancelled = false;
    const update = () => void readWalletSession().then(session => {
      if (!cancelled) setSessionOwner(session.chainId === config.chainId ? session.address?.toLowerCase() || '' : '');
    }).catch(() => {if (!cancelled) setSessionOwner('');});
    update();
    const unsubscribe = subscribeWalletSession(update);
    window.addEventListener('focus', update);
    return () => {cancelled = true; unsubscribe(); window.removeEventListener('focus', update);};
  }, [owner, config.chainId]);

  useEffect(() => {
    setLegacyPending(false);
    if (!owner) return;
    try {setLegacyPending(Boolean(localStorage.getItem(`nftfactory:ens-registration:${owner}`)));} catch { /* Storage is optional. */ }
    const controller = new AbortController();
    setInventory({owner, names: [], loading: true, error: '', incomplete: false});
    void fetch(`/api/ens/owned?owner=${owner}`, {signal: controller.signal, cache: 'no-store'}).then(async response => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.names)) throw new Error();
      if (!controller.signal.aborted) setInventory({owner, names: data.names, loading: false, error: '', incomplete: Boolean(data.incomplete)});
    }).catch(() => {if (!controller.signal.aborted) setInventory({owner, names: [], loading: false, error: 'Your names could not be loaded. Please retry.', incomplete: false});});
    return () => controller.abort();
  }, [owner, refresh]);

  useEffect(() => {
    if (!owner || !selectedName || mode !== 'link') return;
    let cancelled = false;
    setFeedback({key: selectionKey, status: 'checking', message: 'Checking the Ethereum address record…'});
    void verifyCreatorName(selectedName, owner).then(() => {
      if (!cancelled) setFeedback({key: selectionKey, status: 'ready', message: 'Address verified. This name points to your connected wallet.'});
    }).catch(error => {
      if (!cancelled) setFeedback({key: selectionKey, status: 'error', message: error instanceof Error ? error.message : 'Name verification failed. Please retry.'});
    });
    return () => {cancelled = true;};
  }, [owner, selectedName, mode, selectionKey, retryCheck]);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    setCollectionState({owner, items: [], loading: true, error: ''});
    void fetchCollectionsByOwner(owner, {chainId: config.chainId}).then(async result => {
      const verified = await verifyOwnedCollectionsOnChain(publicClient, owner as `0x${string}`, result.collections);
      if (!cancelled) setCollectionState({owner, items: result.collections.filter(item => verified.some(v => v.contractAddress.toLowerCase() === item.contractAddress.toLowerCase())), loading: false, error: ''});
    }).catch(() => {if (!cancelled) setCollectionState({owner, items: [], loading: false, error: 'Collections could not be verified. Please retry.'});});
    return () => {cancelled = true;};
  }, [owner, publicClient, config.chainId, collectionRefresh]);

  async function save(forCollection = false) {
    if (operation.current || !owner || !walletClient || walletClient.account.address.toLowerCase() !== owner) return;
    if (forCollection ? !collections.some(item => item.contractAddress.toLowerCase() === collection) : !selectedName || visibleFeedback?.status !== 'ready') return;
    const key = forCollection ? collectionKey : selectionKey;
    const expectedOwner = owner;
    const assertCurrent = () => {
      if ((forCollection ? currentCollection.current : current.current) !== key) throw new Error('Wallet or selection changed. Please try again.');
    };
    const update = forCollection ? setCollectionFeedback : setFeedback;
    const fullName = forCollection ? normalizeName(collectionName) : selectedName;
    if (!fullName) return;
    operation.current = true;
    update({key, status: 'saving', message: 'Saving your link. Confirm sign-in in your wallet only if requested.'});
    try {
      await linkCreatorIdentity({name: fullName, source: fullName.split('.').length > 2 ? 'external-subname' : 'ens', ownerAddress: expectedOwner, ...(forCollection ? {collectionOnly: true, collectionAddress: collection} : {routeSlug: fullName.split('.').reverse().join('.')})}, args => {assertCurrent(); return walletClient.signMessage(args);}, assertCurrent);
      assertCurrent();
      update({key, status: 'success', message: forCollection ? 'Collection name linked. Your profile name is unchanged.' : `${fullName} is linked to your creator page.`});
    } catch (error) {
      update({key, status: 'error', message: error instanceof Error ? error.message : 'The link could not be saved. Please retry.'});
    } finally {operation.current = false;}
  }

  return <section className={styles.page}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>YOUR CREATOR IDENTITY</p><h1>A name for your work.</h1><p>Connect your ENS name to the creator page you already have.</p></div><Link href="/profile/setup" className="secondary ctaLink">Back to profile design</Link></header>
    <div className={styles.walletBar}><span><strong>{owner ? 'Wallet connected' : 'Connect your wallet'}</strong><span className={styles.address}>{owner || 'Use the wallet button in the header to get started.'}</span></span><span className={styles.badge}>{owner && sessionOwner === owner ? 'Signed in' : owner ? 'Sign-in requested when saving' : 'Not connected'}</span><span className={styles.badge}>ENS · Ethereum mainnet</span></div>
    <div className={styles.layout}>
      <div className={styles.main}>
        <section className={`card ${styles.panel}`} aria-labelledby="profile-name-title"><h2 id="profile-name-title">Profile name</h2><p className={styles.lead}>Your ENS name gives people another way to find your profile. Your artwork and design stay in place.</p>
          <div className={styles.actions} aria-label="Name action"><button type="button" aria-pressed={mode === 'link'} className={mode === 'link' ? '' : 'secondary'} disabled={busy || collectionBusy} onClick={() => setMode('link')}>Link a name I own</button><button type="button" aria-pressed={mode === 'register'} className={mode === 'register' ? '' : 'secondary'} disabled={busy || collectionBusy} onClick={() => setMode('register')}>Get a new name</button></div>
          {mode === 'register' ? <div className={styles.registration}><h3>Register with ENS</h3><p>Choose and register your name in the official ENS app on Ethereum mainnet. Review the registration price and network fee there.</p><ol><li>Register a name or manage a subname in ENS.</li><li>Set its Ethereum address record to your profile wallet.</li><li>Return here, refresh your names, and link your profile.</li></ol><a href="https://app.ens.domains/" target="_blank" rel="noopener noreferrer" className="ctaLink">Open ENS app ↗</a><p className="hint">Opens a new tab. NFTFactory does not submit a registration transaction from this page.</p>{legacyPending && <p role="status">An earlier registration draft is still stored in this browser. It has been preserved. Check its original network and transaction receipt before starting a new purchase; a testnet name does not register a mainnet name.</p>}</div> : <>
            <fieldset disabled={busy || collectionBusy} className={styles.fieldset}><ExistingEnsNameField value={selectedName} onChange={setName} options={names} connected={Boolean(owner)} loading={Boolean(owner) && (inventory.owner !== owner || inventory.loading)} error={inventory.owner === owner ? inventory.error : ''} incomplete={inventory.owner === owner && inventory.incomplete} onRefresh={() => setRefresh(value => value + 1)}/></fieldset>
            {visibleFeedback && <p role={visibleFeedback.status === 'error' ? 'alert' : 'status'} className={visibleFeedback.status === 'error' ? 'error' : styles.feedback}>{visibleFeedback.message}</p>}
            {visibleFeedback?.status === 'error' && <div className={styles.actions}><button className="secondary" onClick={() => setRetryCheck(value => value + 1)}>Check again</button><a href="https://app.ens.domains/" target="_blank" rel="noopener noreferrer">Manage address record ↗</a></div>}
            <button className={styles.save} disabled={!owner || !walletClient || collectionBusy || visibleFeedback?.status !== 'ready'} onClick={() => void save()}>{busy ? 'Linking profile…' : visibleFeedback?.status === 'success' ? 'Name linked' : 'Link name to profile'}</button><p className="hint">Linking is free. A sign-in signature may be requested; it grants no permission to transfer assets.</p>
          </>}
        </section>
        <details className={`card ${styles.panel}`} open={initialCollectionAddress ? true : undefined}><summary>Collection naming <span>Separate from your profile</span></summary><div className={styles.collection}><p>Attach an ENS label to a collection you administer. This updates its NFTFactory listing, not its contract name or ENS records.</p><p className={styles.badge}>Collection network: {appChain.name}{appChain.testnet ? ' · Testnet' : ''}</p><label>Collection<select disabled={!owner || busy || collectionBusy || collectionState.loading} value={collections.some(item => item.contractAddress.toLowerCase() === collection) ? collection : ''} onChange={event => setCollection(event.target.value)}><option value="">Choose a verified collection</option>{collections.map(item => <option value={item.contractAddress.toLowerCase()} key={item.contractAddress}>{item.ensSubname || item.contractAddress}</option>)}</select></label>{owner && !collectionState.loading && !collections.length && <p role="status">{collectionState.error || 'No administered collections found on this network.'}</p>}{owner && <button type="button" className="secondary" disabled={collectionState.loading || collectionBusy} onClick={() => setCollectionRefresh(value => value + 1)}>{collectionState.loading ? 'Verifying collections…' : 'Refresh collections'}</button>}<label>Collection ENS name<input value={collectionName} disabled={!owner || busy || collectionBusy} onChange={event => setCollectionName(event.target.value)} placeholder="collection.artist.eth" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={255}/></label>{collectionName && !normalizeName(collectionName) && <p className="error">Enter a complete ENS name ending in .eth.</p>}<button disabled={!owner || !walletClient || !collections.some(item => item.contractAddress.toLowerCase() === collection) || !normalizeName(collectionName) || collectionBusy || busy} onClick={() => void save(true)}>{collectionBusy ? 'Linking collection…' : 'Verify & link collection name'}</button>{visibleCollectionFeedback && <p role={visibleCollectionFeedback.status === 'error' ? 'alert' : 'status'}>{visibleCollectionFeedback.message}</p>}<Link href="/mint?view=manage&collection=custom">Manage collections →</Link></div></details>
      </div>
      <aside className={styles.aside}><section className={`card ${styles.panel}`}><p className={styles.eyebrow}>YOUR PUBLIC PAGE</p><h2>One profile. Another way in.</h2><p>Your wallet link always leads to your creator page.</p>{profilePath ? <Link href={profilePath} className={styles.route}>{profilePath}</Link> : <p className="hint">Connect a wallet to see your profile link.</p>}{aliasPath && <div className={styles.preview}><span className={styles.eyebrow}>{visibleFeedback?.status === 'success' ? 'LINKED ENS ADDRESS' : 'ENS LINK PREVIEW'}</span><strong>{selectedName}</strong>{visibleFeedback?.status === 'success' ? <Link href={aliasPath} className={styles.route}>{aliasPath}</Link> : <span className={styles.route}>{aliasPath}</span>}<p className="hint">{visibleFeedback?.status === 'success' ? 'Ready to share.' : 'This address becomes active after you link the name.'}</p></div>}<Link href="/profile/setup">Edit your profile design →</Link></section><p className={styles.note}>Names are read from Ethereum mainnet, regardless of the network selected in your wallet. Recently registered or transferred names may take time to appear. Unwrapped subnames are not listed yet.</p></aside>
    </div>
  </section>;
}
