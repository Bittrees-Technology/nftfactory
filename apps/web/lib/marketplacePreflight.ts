import type { Address, PublicClient } from "viem";
import { readPaymentTokenAllowed, ZERO_ADDRESS } from "./marketplace";

type MarketplaceConfigLike = {
  marketplace?: string | null;
};

export function resolveMarketplaceAddress(
  config: MarketplaceConfigLike
): Address | null {
  return config.marketplace ? (config.marketplace as Address) : null;
}

export function requireMarketplaceAddress(
  config: MarketplaceConfigLike,
  options: { missingMessage: string }
): Address {
  const address = resolveMarketplaceAddress(config);
  if (!address) {
    throw new Error(options.missingMessage);
  }
  return address;
}

export async function ensureAllowedPaymentToken({
  publicClient,
  registry,
  paymentToken,
  disallowedMessage = "This ERC20 is not allowed in the registry. Use an allowlisted payment token or ETH.",
  unavailableMessage = "Payment token allowlist check failed. Try again."
}: {
  publicClient: PublicClient;
  registry: Address;
  paymentToken: Address;
  disallowedMessage?: string;
  unavailableMessage?: string;
}): Promise<void> {
  if (paymentToken.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    return;
  }

  let allowed: boolean;
  try {
    allowed = await readPaymentTokenAllowed(publicClient, registry, paymentToken);
  } catch {
    throw new Error(unavailableMessage);
  }

  if (!allowed) {
    throw new Error(disallowedMessage);
  }
}
