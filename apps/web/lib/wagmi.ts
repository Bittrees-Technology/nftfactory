import { createConfig } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { fallback, http } from 'viem';
import { getAppChain, getPrimaryAppChainId } from './chains';
import { resolveConfiguredWalletConnectProjectId } from './walletConnect';
export { hasConfiguredWalletConnectProjectId, isUsingDefaultWalletConnectProjectId } from './walletConnect';
export function createWagmiConfig(projectId = resolveConfiguredWalletConnectProjectId()) {
  const chain = getAppChain(getPrimaryAppChainId());
  // Rendering public pages must not require the entire contract deployment manifest.
  const configured = process.env[`NEXT_PUBLIC_RPC_URLS_${chain.id}`] || process.env[`NEXT_PUBLIC_RPC_URL_${chain.id}`] || process.env.NEXT_PUBLIC_RPC_URL || '';
  const urls = configured.split(',').map(s=>s.trim()).filter(Boolean);
  return createConfig({ chains: [chain], multiInjectedProviderDiscovery: true, connectors: [injected({ shimDisconnect: true }), ...(projectId ? [walletConnect({ projectId, metadata: { name: 'NFTFactory', description: 'Create and share your artwork', url: 'https://nftfactory.org', icons: [] }, showQrModal: true })] : [])], transports: { [chain.id]: urls.length > 1 ? fallback(urls.map(url=>http(url))) : http(urls[0]) }, ssr: true });
}
export const wagmiConfig = createWagmiConfig();
