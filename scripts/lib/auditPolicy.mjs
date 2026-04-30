export const KNOWN_WALLET_STACK_ADVISORIES = new Set([
  "@gemini-wallet/core",
  "@metamask/rpc-errors",
  "@metamask/sdk",
  "@metamask/sdk-communication-layer",
  "@metamask/utils",
  "@rainbow-me/rainbowkit",
  "@wagmi/connectors",
  "uuid",
  "wagmi"
]);

export function summarizeAuditPolicy(report) {
  const vulnerabilities = report?.vulnerabilities && typeof report.vulnerabilities === "object" ? report.vulnerabilities : {};
  const findings = Object.entries(vulnerabilities).map(([name, advisory]) => ({
    name,
    severity: String(advisory?.severity || "unknown"),
    isDirect: Boolean(advisory?.isDirect),
    viaCount: Array.isArray(advisory?.via) ? advisory.via.length : 0
  }));

  const blocking = [];
  const knownWalletStack = [];

  for (const finding of findings) {
    if (finding.severity === "high" || finding.severity === "critical") {
      blocking.push(`${finding.name}: ${finding.severity}`);
      continue;
    }

    if (!KNOWN_WALLET_STACK_ADVISORIES.has(finding.name)) {
      blocking.push(`${finding.name}: unexpected ${finding.severity}`);
      continue;
    }

    knownWalletStack.push(finding);
  }

  return {
    blocking,
    knownWalletStack,
    metadata: report?.metadata?.vulnerabilities || null
  };
}
