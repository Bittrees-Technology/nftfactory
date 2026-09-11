import test from "node:test";
import assert from "node:assert/strict";
import { getAuditReportError, summarizeAuditPolicy } from "./auditPolicy.mjs";

test("getAuditReportError rejects npm registry failures and incomplete reports", () => {
  assert.match(
    getAuditReportError({ message: "audit endpoint returned an error", error: { detail: "network unavailable" } }),
    /network unavailable/
  );
  assert.match(getAuditReportError({ vulnerabilities: {} }), /incomplete advisory report/);
  assert.equal(
    getAuditReportError({ vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } }),
    ""
  );
});

test("summarizeAuditPolicy allows the known wallet advisory family", () => {
  const summary = summarizeAuditPolicy({
    vulnerabilities: {
      wagmi: { severity: "moderate", isDirect: true, via: ["@wagmi/connectors"] },
      uuid: { severity: "moderate", isDirect: false, via: ["@metamask/sdk"] }
    },
    metadata: { vulnerabilities: { moderate: 2, total: 2 } }
  });

  assert.deepEqual(summary.blocking, []);
  assert.equal(summary.knownWalletStack.length, 2);
  assert.deepEqual(summary.metadata, { moderate: 2, total: 2 });
});

test("summarizeAuditPolicy blocks unexpected or high severity advisories", () => {
  const summary = summarizeAuditPolicy({
    vulnerabilities: {
      lodash: { severity: "moderate", isDirect: true, via: [] },
      next: { severity: "high", isDirect: true, via: [] }
    }
  });

  assert.deepEqual(summary.blocking, ["lodash: unexpected moderate", "next: high"]);
});
