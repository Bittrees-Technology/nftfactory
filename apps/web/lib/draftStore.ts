export type ArtworkDraft = { name: string; description: string; file?: File; metadataUri?: string; imageGatewayUrl?: string; wallet?: string; chainId?: number; txHash?: `0x${string}` };
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('nftfactory-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
export async function loadArtworkDraft(): Promise<ArtworkDraft | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts'); const req = tx.objectStore('drafts').get('artwork');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close();
  });
}
export async function saveArtworkDraft(value: ArtworkDraft) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put(value, 'artwork');
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
