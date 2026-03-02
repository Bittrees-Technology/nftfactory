"use client";

import { useEffect, useState } from "react";
import {
  getLogScanDebugStats,
  resetLogScanDebugStats,
  type LogScanDebugStats
} from "./logScan";

function areLogScanStatsEqual(left: LogScanDebugStats, right: LogScanDebugStats): boolean {
  return (
    left.cacheHits === right.cacheHits &&
    left.cacheMisses === right.cacheMisses &&
    left.inflightHits === right.inflightHits &&
    left.retries === right.retries &&
    left.failures === right.failures &&
    left.chunksFetched === right.chunksFetched &&
    left.chunksReturned === right.chunksReturned
  );
}

export function useLogScanStatsSnapshot(): {
  logScanStats: LogScanDebugStats;
  logScanStatsUpdatedAt: string;
  syncLogScanStats: (options?: { forceTimestamp?: boolean }) => void;
  resetBrowserLogScanStats: () => void;
} {
  const [logScanStats, setLogScanStats] = useState<LogScanDebugStats>(() => getLogScanDebugStats());
  const [logScanStatsUpdatedAt, setLogScanStatsUpdatedAt] = useState(() => new Date().toISOString());

  function syncLogScanStats(options?: { forceTimestamp?: boolean }): void {
    const nextStats = getLogScanDebugStats();
    setLogScanStats((currentStats) => {
      const statsChanged = !areLogScanStatsEqual(nextStats, currentStats);
      if (statsChanged || options?.forceTimestamp) {
        setLogScanStatsUpdatedAt(new Date().toISOString());
      }
      return statsChanged ? nextStats : currentStats;
    });
  }

  function resetBrowserLogScanStats(): void {
    resetLogScanDebugStats();
    syncLogScanStats({ forceTimestamp: true });
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      syncLogScanStats();
    }, 1500);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return {
    logScanStats,
    logScanStatsUpdatedAt,
    syncLogScanStats,
    resetBrowserLogScanStats
  };
}
