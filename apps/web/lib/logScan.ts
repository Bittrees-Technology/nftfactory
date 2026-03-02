import type { Address } from "viem";

const DEPLOYMENT_START_BLOCK_BY_CHAIN: Record<number, bigint> = {
  11155111: 10_359_560n
};

const LOG_CHUNK_SIZE_BY_CHAIN: Record<number, bigint> = {
  11155111: 10n
};
const LOG_SCAN_MAX_RETRIES = 4;
const LOG_SCAN_RETRY_BASE_DELAY_MS = 750;
const LOG_SCAN_CACHE_TTL_MS = 30_000;
const LOG_SCAN_CACHE_MAX_ENTRIES = 400;
const LOG_SCAN_MIN_GAP_MS = 180;

const logChunkCache = new Map<string, { ts: number; logs: any[] }>();
const logChunkInflight = new Map<string, Promise<any[]>>();
let logRequestQueue: Promise<void> = Promise.resolve();
let lastLogRequestAt = 0;

export type LogScanDebugStats = {
  cacheHits: number;
  cacheMisses: number;
  inflightHits: number;
  retries: number;
  failures: number;
  chunksFetched: number;
  chunksReturned: number;
};

const logScanStats: LogScanDebugStats = {
  cacheHits: 0,
  cacheMisses: 0,
  inflightHits: 0,
  retries: 0,
  failures: 0,
  chunksFetched: 0,
  chunksReturned: 0
};

export function getDeploymentStartBlock(chainId: number): bigint {
  return DEPLOYMENT_START_BLOCK_BY_CHAIN[chainId] ?? 0n;
}

export function getLogChunkSize(chainId: number): bigint {
  return LOG_CHUNK_SIZE_BY_CHAIN[chainId] || 900n;
}

export function getLogScanDebugStats(): LogScanDebugStats {
  return { ...logScanStats };
}

export function resetLogScanDebugStats(): void {
  logScanStats.cacheHits = 0;
  logScanStats.cacheMisses = 0;
  logScanStats.inflightHits = 0;
  logScanStats.retries = 0;
  logScanStats.failures = 0;
  logScanStats.chunksFetched = 0;
  logScanStats.chunksReturned = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runQueuedLogRequest<T>(work: () => Promise<T>): Promise<T> {
  const previous = logRequestQueue;
  let releaseQueue!: () => void;
  logRequestQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previous;
  const gapMs = Math.max(0, LOG_SCAN_MIN_GAP_MS - (Date.now() - lastLogRequestAt));
  if (gapMs > 0) {
    await sleep(gapMs);
  }

  try {
    return await work();
  } finally {
    lastLogRequestAt = Date.now();
    releaseQueue();
  }
}

function getEventCacheKey(event: any): string {
  if (!event || typeof event !== "object") return "unknown";
  const name = typeof event.name === "string" ? event.name : "event";
  const inputs = Array.isArray(event.inputs)
    ? event.inputs
        .map((input: any) => `${String(input?.name || "")}:${String(input?.type || "")}:${Boolean(input?.indexed)}`)
        .join("|")
    : "";
  return `${name}:${inputs}`;
}

function getChunkCacheKey(params: {
  chainId: number;
  address: Address;
  event: any;
  fromBlock: bigint;
  toBlock: bigint;
}): string {
  return [
    params.chainId,
    params.address.toLowerCase(),
    getEventCacheKey(params.event),
    params.fromBlock.toString(),
    params.toBlock.toString()
  ].join(":");
}

function readCachedChunk(cacheKey: string): any[] | null {
  const cached = logChunkCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts > LOG_SCAN_CACHE_TTL_MS) {
    logChunkCache.delete(cacheKey);
    return null;
  }
  return cached.logs;
}

function writeCachedChunk(cacheKey: string, logs: any[]): void {
  logChunkCache.set(cacheKey, {
    ts: Date.now(),
    logs
  });

  if (logChunkCache.size <= LOG_SCAN_CACHE_MAX_ENTRIES) return;

  const oldestKey = logChunkCache.keys().next().value;
  if (typeof oldestKey === "string") {
    logChunkCache.delete(oldestKey);
  }
}

function isRetryableLogError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("429") ||
    message.includes("compute units") ||
    message.includes("throughput") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("network error") ||
    message.includes("failed to fetch")
  );
}

async function getLogsChunkWithRetry(params: {
  publicClient: any;
  chainId: number;
  address: Address;
  event: any;
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<any[]> {
  const { publicClient, chainId, ...request } = params;
  const cacheKey = getChunkCacheKey({
    chainId,
    address: request.address,
    event: request.event,
    fromBlock: request.fromBlock,
    toBlock: request.toBlock
  });
  const cached = readCachedChunk(cacheKey);
  if (cached) {
    logScanStats.cacheHits += 1;
    logScanStats.chunksReturned += 1;
    return cached;
  }
  logScanStats.cacheMisses += 1;

  const inflight = logChunkInflight.get(cacheKey);
  if (inflight) {
    logScanStats.inflightHits += 1;
    return inflight;
  }

  const loader: Promise<any[]> = (async (): Promise<any[]> => {
    for (let attempt = 0; attempt <= LOG_SCAN_MAX_RETRIES; attempt += 1) {
      try {
        const logs = await runQueuedLogRequest<any[]>(() => publicClient.getLogs(request) as Promise<any[]>);
        logScanStats.chunksFetched += 1;
        logScanStats.chunksReturned += 1;
        writeCachedChunk(cacheKey, logs);
        return logs;
      } catch (error) {
        if (!isRetryableLogError(error) || attempt === LOG_SCAN_MAX_RETRIES) {
          logScanStats.failures += 1;
          throw error;
        }

        logScanStats.retries += 1;
        await sleep(LOG_SCAN_RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }

    return [];
  })();

  logChunkInflight.set(cacheKey, loader);

  try {
    return await loader;
  } finally {
    logChunkInflight.delete(cacheKey);
  }
}

export async function getLogsChunked(params: {
  publicClient: any;
  chainId: number;
  address: Address;
  event: any;
  fromBlock?: bigint;
}): Promise<any[]> {
  const { publicClient, chainId, ...request } = params;
  const latestBlock = await publicClient.getBlockNumber();
  const chunkSize = getLogChunkSize(chainId);
  const logs: any[] = [];
  const startBlock = request.fromBlock ?? 0n;

  for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += chunkSize) {
    const toBlock = fromBlock + chunkSize - 1n > latestBlock ? latestBlock : fromBlock + chunkSize - 1n;
    const chunk = await getLogsChunkWithRetry({
      publicClient,
      chainId,
      ...request,
      fromBlock,
      toBlock
    });
    logs.push(...chunk);
  }

  return logs;
}
