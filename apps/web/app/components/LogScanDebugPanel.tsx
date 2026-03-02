"use client";

import type { LogScanDebugStats } from "../../lib/logScan";

type LogScanDebugPanelProps = {
  stats: LogScanDebugStats;
  updatedAt: string;
  description: string;
  onReset: () => void;
  onRefresh: () => void;
  collapsible?: boolean;
  title?: string;
};

export default function LogScanDebugPanel({
  stats,
  updatedAt,
  description,
  onReset,
  onRefresh,
  collapsible = false,
  title = "Browser Log Scan Debug"
}: LogScanDebugPanelProps) {
  const requests = stats.cacheHits + stats.cacheMisses;
  const hitRate = requests > 0 ? `${Math.round((stats.cacheHits / requests) * 100)}%` : "-";
  const updatedLabel = Number.isNaN(new Date(updatedAt).getTime())
    ? updatedAt
    : new Date(updatedAt).toLocaleString();

  const content = (
    <>
      {collapsible ? null : <h3>{title}</h3>}
      <p className="sectionLead">{description}</p>
      <p className="hint">Last updated: {updatedLabel}</p>
      <div className="listTable">
        <article className="listRow">
          <span><strong>Cache Hits</strong> {stats.cacheHits}</span>
          <span><strong>Cache Misses</strong> {stats.cacheMisses}</span>
          <span><strong>Hit Rate</strong> {hitRate}</span>
          <span><strong>In-Flight Reuse</strong> {stats.inflightHits}</span>
        </article>
        <article className="listRow">
          <span><strong>Retries</strong> {stats.retries}</span>
          <span><strong>Failures</strong> {stats.failures}</span>
          <span><strong>Chunks Fetched</strong> {stats.chunksFetched}</span>
          <span><strong>Chunks Returned</strong> {stats.chunksReturned}</span>
        </article>
      </div>
      <div className="row">
        <button type="button" onClick={onReset}>
          Reset Log Scan Stats
        </button>
        <button type="button" onClick={onRefresh}>
          Refresh Log Scan Stats
        </button>
      </div>
    </>
  );

  if (collapsible) {
    return (
      <details className="card formCard">
        <summary>{title}</summary>
        {content}
      </details>
    );
  }

  return <div className="card formCard">{content}</div>;
}
