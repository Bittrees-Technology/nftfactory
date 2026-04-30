const PATH_RULES: Array<{
  pattern: RegExp;
  methods: ReadonlySet<string>;
}> = [
  { pattern: /^\/health$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/moderation\/hidden-listings$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/moderation\/reports$/, methods: new Set(["POST"]) },
  { pattern: /^\/api\/payment-tokens\/log$/, methods: new Set(["POST"]) },
  { pattern: /^\/api\/profile\/[^/]+$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/profile\/[^/]+\/guestbook$/, methods: new Set(["GET", "POST"]) },
  { pattern: /^\/api\/profile\/[^/]+\/guestbook\/hide$/, methods: new Set(["POST"]) },
  { pattern: /^\/api\/profile\/[^/]+\/guestbook\/restore$/, methods: new Set(["POST"]) },
  { pattern: /^\/api\/profile\/[^/]+\/guestbook\/delete$/, methods: new Set(["POST"]) },
  { pattern: /^\/api\/profiles$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/profiles\/link$/, methods: new Set(["POST"]) },
  { pattern: /^\/api\/profiles\/transfer$/, methods: new Set(["POST"]) },
  { pattern: /^\/api\/collections$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/collections\/[^/]+\/tokens$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/feed$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/listings$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/offers$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/users\/[^/]+\/offers-made$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/users\/[^/]+\/offers-received$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/users\/[^/]+\/holdings$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/participants\/[^/]+\/summary$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/owners\/[^/]+\/summary$/, methods: new Set(["GET"]) },
  { pattern: /^\/api\/wallets\/[^/]+\/sync$/, methods: new Set(["GET", "POST"]) },
  { pattern: /^\/api\/tokens\/sync$/, methods: new Set(["POST"]) }
];

export type IndexerProxyPolicyDecision =
  | { ok: true }
  | { ok: false; status: 404 | 405; error: string };

export function evaluateIndexerProxyRequest(method: string, path: string): IndexerProxyPolicyDecision {
  const normalizedMethod = String(method || "").trim().toUpperCase();
  const normalizedPath = `/${String(path || "").trim()}`.replace(/\/+/g, "/");

  for (const rule of PATH_RULES) {
    if (!rule.pattern.test(normalizedPath)) {
      continue;
    }

    if (!rule.methods.has(normalizedMethod)) {
      return {
        ok: false,
        status: 405,
        error: `Indexer proxy does not allow ${normalizedMethod} ${normalizedPath}.`
      };
    }

    return { ok: true };
  }

  return {
    ok: false,
    status: 404,
    error: `Indexer proxy path is not exposed: ${normalizedPath}.`
  };
}
