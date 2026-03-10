"use client";

import { truncateHash } from "../../lib/abi";
import type { ActionState } from "../../lib/actionState";
import { getContractsConfig } from "../../lib/contracts";
import { getExplorerBaseUrl } from "../../lib/chains";

export default function ListingManagementTxStatus({ state }: { state: ActionState }) {
  const explorerBase = getExplorerBaseUrl(state.chainId || getContractsConfig().chainId);
  if (state.status === "idle") return null;
  if (state.status === "pending") return <p className="hint">{state.message}</p>;
  if (state.status === "error") return <p className="error">{state.message}</p>;
  if (state.status === "success" && state.hash) {
    return (
      <p className="success">
        {state.message || "Success"}{" "}
        {explorerBase ? (
          <a href={`${explorerBase}/tx/${state.hash}`} target="_blank" rel="noreferrer">
            {truncateHash(state.hash)}
          </a>
        ) : (
          <span className="mono">{truncateHash(state.hash)}</span>
        )}
      </p>
    );
  }
  return <p className="success">{state.message}</p>;
}
