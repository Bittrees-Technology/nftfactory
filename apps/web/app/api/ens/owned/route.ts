import {getScopedChainPublicEnv} from '../../../../lib/publicEnv';
import {fetchOwnedEns} from '../../../../lib/ownedEns';

export const dynamic = 'force-dynamic';
const cache = new Map<string, {expires: number; data: Awaited<ReturnType<typeof fetchOwnedEns>>}>();
const pending = new Map<string, Promise<Awaited<ReturnType<typeof fetchOwnedEns>>>>();

function providerKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY;
  for (const rpc of [getScopedChainPublicEnv('NEXT_PUBLIC_RPC_URL', 1), process.env.NEXT_PUBLIC_RPC_URL]) {
    try {
      const url = new URL(rpc || '');
      if (url.protocol === 'https:' && url.hostname.endsWith('.g.alchemy.com')) {
        const match = url.pathname.match(/^\/v2\/([^/]+)$/);
        if (match) return match[1];
      }
    } catch { /* Try the next configured provider. */ }
  }
  return null;
}

export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get('owner')?.toLowerCase() || '';
  const headers = {'Cache-Control': 'no-store'};
  if (!/^0x[a-f0-9]{40}$/.test(owner)) return Response.json({error: 'A wallet address is required.'}, {status: 400, headers});
  const key = providerKey();
  if (!key) return Response.json({error: 'ENS ownership discovery is not configured.'}, {status: 503, headers});
  const cached = cache.get(owner);
  if (cached && cached.expires > Date.now()) return Response.json({...cached.data, chainId: 1}, {headers});
  try {
    if (!pending.has(owner)) {
      if (pending.size >= 20) return Response.json({error: 'ENS discovery is busy. Please retry shortly.'}, {status: 429, headers});
      pending.set(owner, fetchOwnedEns(owner, key).finally(() => pending.delete(owner)));
    }
    const data = await pending.get(owner)!;
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(owner, {expires: Date.now() + 15000, data});
    return Response.json({...data, chainId: 1}, {headers});
  } catch {
    return Response.json({error: 'We could not load your ENS names. Please retry.'}, {status: 502, headers});
  }
}
