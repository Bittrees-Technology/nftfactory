"use client";

import { truncateHash } from "../../lib/abi";

export type TxState = {
  status: "idle" | "pending" | "success" | "error";
  hash?: string;
  message?: string;
};

function toExplorerTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export default function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") return <p className="hint">{state.message}</p>;
  if (state.status === "error") return <p className="error">{state.message}</p>;
  if (state.status === "success" && state.hash) {
    return (
      <p className="success">
        {state.message || "Success"}{" "}
        <a href={toExplorerTx(state.hash)} target="_blank" rel="noreferrer">
          {truncateHash(state.hash)}
        </a>
      </p>
    );
  }
  return <p className="success">{state.message}</p>;
}
