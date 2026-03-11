export type RoyaltySplitRegistryEnvHint = {
  chainId: number;
  scopedEnvVarName: string;
  legacyEnvVarName?: string;
};

export function getRoyaltySplitRegistryEnvHint(
  chainId: number,
  allowLegacyAlias: boolean
): RoyaltySplitRegistryEnvHint {
  return {
    chainId,
    scopedEnvVarName: `NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_${chainId}`,
    legacyEnvVarName: allowLegacyAlias ? "NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS" : undefined
  };
}

export function formatRoyaltySplitRegistryMissingMessage(
  chainName: string,
  hint: RoyaltySplitRegistryEnvHint
): string {
  if (hint.legacyEnvVarName) {
    return `Royalty split registry is not configured for ${chainName}. Set ${hint.scopedEnvVarName} (or the legacy primary-chain alias ${hint.legacyEnvVarName}) and redeploy to enable collaborator split storage here.`;
  }
  return `Royalty split registry is not configured for ${chainName}. Set ${hint.scopedEnvVarName} and redeploy to enable collaborator split storage here.`;
}
