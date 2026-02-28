"use client";

import { truncateHash } from "../../lib/abi";
import { getContractsConfig } from "../../lib/contracts";
import { getExplorerBaseUrl } from "../../lib/chains";

export type TxState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

export default function TxStatus({ state }: { state: TxState }) {
  const explorerBase = getExplorerBaseUrl(getContractsConfig().chainId);
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
