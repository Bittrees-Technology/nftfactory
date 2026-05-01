import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFailureFingerprint,
  buildMonitorAlertText,
  buildMonitorEnvironmentLabel,
  computeMonitorTransition
} from "./liveMonitor.mjs";

test("buildMonitorEnvironmentLabel prefers explicit configuration", () => {
  assert.equal(buildMonitorEnvironmentLabel({ RUNTIME_MONITOR_LABEL: "prod-main" }), "prod-main");
  assert.equal(buildMonitorEnvironmentLabel({ RELEASE_WEB_BASE_URL: "https://nftfactory.org" }), "nftfactory.org");
});

test("buildFailureFingerprint is stable across check ordering", () => {
  const checks = [
    { label: "ipfs-api", url: "https://ipfs.example/api/v0/version", ok: false, message: "HTTP 530" },
    { label: "deploy-health", url: "https://nftfactory.org/api/deploy/health", ok: false, message: "ipfs: down" }
  ];

  assert.equal(buildFailureFingerprint(checks), buildFailureFingerprint([...checks].reverse()));
});

test("computeMonitorTransition notifies on new failures, changed failures, and recovery", () => {
  const checkedAt = "2026-05-01T00:00:00.000Z";
  const firstFailure = computeMonitorTransition(null, [{ label: "deploy-health", url: "https://nftfactory.org", ok: false, message: "ipfs down" }], checkedAt);
  assert.equal(firstFailure.shouldNotify, true);
  assert.equal(firstFailure.alertKind, "failure");

  const sameFailure = computeMonitorTransition(firstFailure.nextState, [{ label: "deploy-health", url: "https://nftfactory.org", ok: false, message: "ipfs down" }], checkedAt);
  assert.equal(sameFailure.shouldNotify, false);

  const changedFailure = computeMonitorTransition(firstFailure.nextState, [{ label: "deploy-health", url: "https://nftfactory.org", ok: false, message: "indexer down" }], checkedAt);
  assert.equal(changedFailure.shouldNotify, true);
  assert.equal(changedFailure.alertKind, "failure-change");

  const recovery = computeMonitorTransition(firstFailure.nextState, [{ label: "deploy-health", url: "https://nftfactory.org", ok: true, message: "OK" }], checkedAt);
  assert.equal(recovery.shouldNotify, true);
  assert.equal(recovery.alertKind, "recovery");
});

test("buildMonitorAlertText includes failing checks", () => {
  const text = buildMonitorAlertText({
    environmentLabel: "nftfactory.org",
    checkedAt: "2026-05-01T00:00:00.000Z",
    transition: {
      currentStatus: "fail",
      alertKind: "failure"
    },
    checks: [
      { label: "site-root", url: "https://nftfactory.org/", ok: true, message: "OK" },
      { label: "ipfs-api", url: "https://ipfs-api.nftfactory.org/api/v0/version", ok: false, message: "HTTP 530" }
    ]
  });

  assert.match(text, /runtime failure/);
  assert.match(text, /ipfs-api/);
  assert.match(text, /HTTP 530/);
});
