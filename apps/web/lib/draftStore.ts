export type ArtworkDraft = { name: string; description: string; file?: File; metadataUri?: string; imageGatewayUrl?: string; wallet?: string; chainId?: number; contract?: `0x${string}`; txHash?: `0x${string}`; status?: 'published' };
export type DraftScope = { chainId: number; wallet?: string };
export function artworkDraftKey(scope: DraftScope) { return `artwork:${scope.chainId}:${scope.wallet?.toLowerCase() || 'guest'}`; }
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nftfactory-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode); let value: T;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Draft storage failed')); };
    run(tx.objectStore('drafts'), result => { value = result; });
  });
}
export async function loadArtworkDraft(scope: DraftScope): Promise<ArtworkDraft | undefined> {
  return transaction('readwrite', (store, result) => {
    const key = artworkDraftKey(scope); const req = store.get(key);
    req.onsuccess = () => {
      if (req.result) { result(req.result.status === 'published' ? undefined : req.result); return; }
      // Claim an old unscoped draft only for its original wallet/network. Never
      // silently display another wallet's NFT or replay a receipt on a new chain.
      const legacy = store.get('artwork');
      legacy.onsuccess = () => {
        const value: ArtworkDraft | undefined = legacy.result;
        if (value && value.chainId === scope.chainId && value.wallet?.toLowerCase() === scope.wallet?.toLowerCase()) {
          store.put(value, key); store.delete('artwork'); result(value.status === 'published' ? undefined : value);
        } else if (scope.wallet) {
          const guestKey = artworkDraftKey({ chainId: scope.chainId }); const guest = store.get(guestKey);
          guest.onsuccess = () => { if (guest.result && !guest.result.txHash) { store.put(guest.result, key); store.delete(guestKey); result(guest.result); } };
        } else if (value && !value.wallet && !value.chainId && !value.txHash) {
          store.put(value, key); store.delete('artwork'); result(value);
        }
      };
    };
  });
}
function archive(store: IDBObjectStore, value: ArtworkDraft, scope: DraftScope) {
  // Retain receipt recovery data but release large source images from completed work.
  if (value.txHash) store.put({ ...value, file: undefined }, `receipt:${scope.chainId}:${scope.wallet?.toLowerCase()}:${value.txHash}`);
  store.delete(artworkDraftKey(scope));
}
export async function saveArtworkDraft(value: ArtworkDraft, scope: DraftScope) {
  return transaction<void>('readwrite', store => {
    if (value.status === 'published') archive(store, value, scope);
    else store.put(value, artworkDraftKey(scope));
  });
}
export async function archiveArtworkDraft(value: ArtworkDraft, scope: DraftScope) {
  return transaction<void>('readwrite', store => archive(store, value, scope));
}
export async function loadArtworkReceipts(scope: DraftScope): Promise<ArtworkDraft[]> {
  return transaction('readonly', (store, result) => {
    const prefix = `receipt:${scope.chainId}:${scope.wallet?.toLowerCase()}:`;
    const req = store.getAll(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    req.onsuccess = () => result(req.result);
  });
}
