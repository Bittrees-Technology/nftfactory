import { describe, expect, it } from "vitest";
import { evaluateIndexerProxyRequest } from "./indexerProxyPolicy";

describe("indexerProxyPolicy", () => {
  it("allows the public and user-scoped routes used by the web app", () => {
    expect(evaluateIndexerProxyRequest("GET", "/api/profiles")).toEqual({ ok: true });
    expect(evaluateIndexerProxyRequest("GET", "/api/profile/demo")).toEqual({ ok: true });
    expect(evaluateIndexerProxyRequest("POST", "/api/profile/demo/guestbook")).toEqual({ ok: true });
    expect(evaluateIndexerProxyRequest("POST", "/api/profiles/link")).toEqual({ ok: true });
    expect(evaluateIndexerProxyRequest("POST", "/api/tokens/sync")).toEqual({ ok: true });
    expect(evaluateIndexerProxyRequest("GET", "/api/wallets/0xabc/sync")).toEqual({ ok: true });
    expect(evaluateIndexerProxyRequest("POST", "/api/wallets/0xabc/sync")).toEqual({ ok: true });
  });

  it("blocks methods that are not part of the app-facing contract", () => {
    expect(evaluateIndexerProxyRequest("POST", "/api/profiles")).toEqual({
      ok: false,
      status: 405,
      error: "Indexer proxy does not allow POST /api/profiles."
    });
    expect(evaluateIndexerProxyRequest("DELETE", "/api/profile/demo")).toEqual({
      ok: false,
      status: 405,
      error: "Indexer proxy does not allow DELETE /api/profile/demo."
    });
  });

  it("blocks admin and webhook routes from the public proxy", () => {
    expect(evaluateIndexerProxyRequest("POST", "/api/admin/listings/sync")).toEqual({
      ok: false,
      status: 404,
      error: "Indexer proxy path is not exposed: /api/admin/listings/sync."
    });
    expect(evaluateIndexerProxyRequest("POST", "/api/webhooks/alchemy")).toEqual({
      ok: false,
      status: 404,
      error: "Indexer proxy path is not exposed: /api/webhooks/alchemy."
    });
  });
});
