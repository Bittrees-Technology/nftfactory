'use client';
import ProductPageHeader from '../ProductPageHeader';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEventLogs, parseAbiItem, zeroAddress } from 'viem';
import { syncMintedToken } from '../../lib/indexerApi';
import { encodePublish721 } from '../../lib/abi';
import { getContractsConfig } from '../../lib/contracts';
import { getAppChain, getPrimaryAppChainId } from '../../lib/chains';
import { ensureWalletSession } from '../../lib/walletSession';
import { loadArtworkDraft, saveArtworkDraft, type ArtworkDraft } from '../../lib/draftStore';
import HeaderWalletButton from '../HeaderWalletButton';
const LIMIT = 3 * 1024 * 1024 - 64 * 1024;
export default function CreateClient({initialChainId}:{initialChainId?:number}={}) {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const targetChainId = initialChainId || getPrimaryAppChainId();
  const client = usePublicClient({ chainId: targetChainId });
  const [draft, setDraft] = useState<ArtworkDraft>({ name: '', description: '' });
  const [stage, setStage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const [preview, setPreview] = useState('');
  const [draftNotice, setDraftNotice] = useState('Your draft stays private on this device until you publish.');
  useEffect(() => { void loadArtworkDraft().then(value => { if (value) { setDraft(value); if (value.txHash) setStage(2); } }).catch(() => setDraftNotice('Local saving is unavailable. Keep this page open to retain your draft.')).finally(() => setLoaded(true)); }, []);
  useEffect(() => { if (loaded) void saveArtworkDraft(draft).catch(() => setDraftNotice('Local saving is unavailable. Keep this page open to retain your draft.')); }, [draft, loaded]);
  useEffect(() => { if (!draft.file) { setPreview(''); return; } const url = URL.createObjectURL(draft.file); setPreview(url); return () => URL.revokeObjectURL(url); }, [draft.file]);
  function edit(change: Partial<ArtworkDraft>) { setDraft(current => ({ ...current, ...change, metadataUri: undefined, imageGatewayUrl: undefined })); setMessage(''); }
  async function publish() {
    if (busyRef.current || !address || !wallet || !client) return;
    if (chainId !== targetChainId) { setMessage('Select the supported network from the wallet menu.'); return; }
    busyRef.current = true; setBusy(true); setMessage('');
    try {
      if (draft.wallet && draft.txHash && draft.wallet.toLowerCase() !== address.toLowerCase()) throw new Error('Reconnect the wallet that submitted this mint to check its receipt.');
      if(draft.txHash&&draft.chainId!==targetChainId)throw new Error("This pending mint belongs to another network. Open its original network before checking confirmation.");
      let current = { ...draft };
      if (!current.txHash) {
        if (!current.file || !current.name.trim()) throw new Error('Choose artwork and enter a name.');
        setMessage('Confirm wallet sign-in. This does not move any assets.');
        await ensureWalletSession(address, args => wallet.signMessage(args),targetChainId);
        setMessage('Uploading artwork and securing the backup copy…');
        const form = new FormData(); form.append('image', current.file); form.append('name', current.name.trim()); form.append('description', current.description);
        const response = await fetch('/api/ipfs/metadata', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok || result.storage?.copies !== 2 || !result.metadataUri?.startsWith('ipfs://')) throw new Error(result.error || 'Storage could not confirm both copies. Your draft is preserved.');
        current = { ...current, metadataUri: result.metadataUri, imageGatewayUrl: result.imageGatewayUrl, wallet: address, chainId: targetChainId };
        const config = getContractsConfig(targetChainId);
        const data = encodePublish721('', result.metadataUri) as `0x${string}`;
        await client.call({ account: address, to: config.shared721, data });
        setMessage('Two storage copies confirmed. Review the mint and network fee in your wallet.');
        const hash = await wallet.sendTransaction({ account: address, chain: getAppChain(targetChainId), to: config.shared721, data });
        current = { ...current, txHash: hash }; setDraft(current);
        // Preserve the submitted hash before waiting; retries only check its receipt.
        await saveArtworkDraft(current).catch(() => setDraftNotice('Write down your transaction hash; local saving is unavailable.'));
      }
      setMessage('Waiting for the transaction confirmation…');
      const receipt = await client.waitForTransactionReceipt({ hash: current.txHash!, timeout: 60_000 });
      if (receipt.status !== 'success') throw new Error('The transaction reverted. No NFT was created. Check its receipt before starting a new draft.');
      const contract = getContractsConfig(targetChainId).shared721;
      const mint = parseEventLogs({ abi: [parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)')], logs: receipt.logs })
        .find(log => log.address.toLowerCase() === contract.toLowerCase() && log.args.from === zeroAddress && log.args.to.toLowerCase() === address.toLowerCase());
      if (!mint) throw new Error('Transaction confirmed, but its NFT mint could not be identified. Keep the transaction hash for review.');
      setMessage('Your NFT is minted. Adding it to your creator page…');
      await ensureWalletSession(address, args => wallet.signMessage(args),targetChainId);
      const metadataUri = current.metadataUri || await client.readContract({ address: contract, abi: [{ type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{type:'uint256'}], outputs: [{type:'string'}] }], functionName: 'tokenURI', args: [mint.args.tokenId] });
      try {
        await syncMintedToken({ chainId: targetChainId, contractAddress: contract, tokenId: mint.args.tokenId.toString(), creatorAddress: address, ownerAddress: address, standard: 'ERC721', isFactoryCreated: true, isUpgradeable: false, mintTxHash: current.txHash, draftName: current.name, draftDescription: current.description, metadataCid: metadataUri, mediaCid: current.imageGatewayUrl?.includes('/ipfs/') ? `ipfs://${current.imageGatewayUrl.split('/ipfs/')[1]}` : null, immutable: true });
      } catch {
        throw new Error('Your NFT is minted, but your creator page has not updated yet. Choose Check confirmation to retry indexing without minting again.');
      }
      setComplete(true); setMessage('Your NFT is minted and indexed. View it on your creator page.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Publishing did not complete. Your draft is preserved.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <section className="studioPage">
    <ProductPageHeader section="Create" title="Create an NFT" description="Upload your artwork, preview the details, and publish a one-of-one collectible." />
    <ol className="creationSteps" aria-label="Creation progress">{['Artwork', 'Details & preview', 'Review & mint'].map((name, i) => <li key={name} aria-current={stage === i ? 'step' : undefined}>{i + 1}. {name}</li>)}</ol>
    <p className="hint">{draftNotice}</p>
    <div className="createLayout">
      <div className="card formCard">
        {stage === 0 && <><h2>Choose your artwork</h2><label>PNG, JPEG, or WebP · under 3 MiB<input aria-label="Artwork file" type="file" accept="image/png,image/jpeg,image/webp" disabled={!loaded || busy || Boolean(draft.txHash)} onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > LIMIT || !['image/png','image/jpeg','image/webp'].includes(file.type)) { setMessage('Choose a PNG, JPEG, or WebP smaller than 3 MiB.'); return; } edit({ file }); }} /></label><p>Original files are stored on IPFS. A public copy is created only when you choose Mint.</p></>}
        {stage === 1 && <><h2>Tell the story</h2><label>Artwork name<input value={draft.name} maxLength={120} disabled={busy || Boolean(draft.txHash)} onChange={e => edit({ name: e.target.value })} /></label><label>Description <span className="hint">Optional</span><textarea value={draft.description} maxLength={2000} disabled={busy || Boolean(draft.txHash)} onChange={e => edit({ description: e.target.value })} /></label></>}
        {stage === 2 && <><h2>{complete ? 'Published' : 'Review your NFT'}</h2><dl className="reviewFacts"><dt>Collection</dt><dd>NFTFactory shared collection</dd><dt>Edition</dt><dd>One of one</dd><dt>Network</dt><dd>{getAppChain(targetChainId).name}</dd><dt>Storage</dt><dd>Local and offsite copies required before minting</dd></dl><p>You own the NFT. NFTFactory operates the shared collection. Public IPFS content may remain accessible even if removed from this site.</p><p>Your wallet shows the network fee before you confirm.</p>{!address && <HeaderWalletButton />}{address && !complete && <button disabled={busy || !loaded} onClick={() => void publish()}>{busy ? 'Please wait…' : draft.txHash ? 'Check confirmation' : 'Mint NFT'}</button>}{complete && <><Link className="ctaLink" href="/profile/setup">Set up your creator page</Link><button className="secondary" onClick={() => { setDraft({ name: '', description: '' }); setComplete(false); setStage(0); setMessage(''); }}>Create another NFT</button></>}{draft.txHash && <p className="receiptHash">Transaction: {draft.txHash}</p>}</>}
        <div role="status" aria-live="polite" className="flowMessage">{message}</div>
        <div className="formActions">{stage > 0 && !draft.txHash && <button className="secondary" disabled={busy} onClick={() => setStage(stage - 1)}>Back</button>}{stage < 2 && <button disabled={!loaded || !draft.file || (stage === 1 && !draft.name.trim())} onClick={() => setStage(stage + 1)}>Continue</button>}</div>
      </div>
      <aside className="artworkPreview card" aria-label="Artwork preview">{preview ? <img src={preview} alt={draft.name || 'Your artwork preview'} /> : <div className="artworkPlaceholder">Your artwork<br />starts here.</div>}<h2>{draft.name || 'Untitled artwork'}</h2><p>{draft.description || 'Your preview will update as you add details.'}</p><span className="hint">One of one · NFTFactory</span></aside>
    </div>
    <details className="advancedTools"><summary>Advanced collection tools</summary><p><Link href={`/mint?view=manage&chainId=${targetChainId}`}>Manage a collection</Link> · <Link href={`/mint?view=mint&collection=custom&chainId=${targetChainId}`}>Use your own collection</Link></p></details>
  </section>;
}
