import { createConfig } from 'wagmi';
import {injected} from '@wagmi/connectors/injected';
import {walletConnect} from '@wagmi/connectors/walletConnect';
import { fallback, http } from 'viem';
import { getAppChain, getPrimaryAppChainId, getEnabledAppChains } from './chains';
import {resolveScopedChainPublicRpcUrls} from './publicEnv';
import { resolveConfiguredWalletConnectProjectId } from './walletConnect';
export { hasConfiguredWalletConnectProjectId, isUsingDefaultWalletConnectProjectId } from './walletConnect';
export function createWagmiConfig(projectId = resolveConfiguredWalletConnectProjectId()) {
  const chain = getAppChain(getPrimaryAppChainId());
  const others=getEnabledAppChains().filter(c=>c.id!==chain.id);
  const chains=[chain,...others] as [typeof chain,...typeof chain[]];
  const transports=Object.fromEntries(chains.map(c=>{const urls=resolveScopedChainPublicRpcUrls(c.id);return [c.id,urls.length>1?fallback(urls.map(url=>http(url))):http(urls[0])];}));
  return createConfig({ chains, multiInjectedProviderDiscovery: true, connectors: [injected({ shimDisconnect: true }), ...(projectId ? [walletConnect({ projectId, metadata: { name: 'NFTFactory', description: 'Create and share your artwork', url: 'https://nftfactory.org', icons: [] }, showQrModal: true })] : [])], transports, ssr: true });
}
