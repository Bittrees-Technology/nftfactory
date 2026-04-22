"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ServiceCheck = {
  label: string;
  url: string | null;
  ok: boolean;
  status: number | null;
  message: string;
};

type DeployHealthResponse = {
  ok: boolean;
  checks: ServiceCheck[];
};

const HEALTH_REFRESH_MS = 60_000;

function getCheckGuidance(check: ServiceCheck): string {
  const label = String(check.label || "").toLowerCase();
  const message = String(check.message || "").toLowerCase();

  if (label.includes("ipfs") || message.includes("ipfs")) {
    return "Check the IPFS node, local auth proxy, and cloudflared tunnel before retrying uploads.";
  }

  if (label.includes("indexer") || label.includes("api") || message.includes("indexer")) {
    return "Confirm the indexer API is reachable on its public URL and that the tunnel can still reach the local upstream.";
  }

  return "Check the deploy health route, origin service, and tunnel status before treating the app as healthy.";
}

export default function DeployHealthBanner() {
  const [payload, setPayload] = useState<DeployHealthResponse | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/deploy/health", {
          method: "GET",
          cache: "no-store"
        });
        const nextPayload = (await response.json()) as DeployHealthResponse;
        if (!cancelled) {
          setPayload(nextPayload);
          setUpdatedAt(Date.now());
        }
      } catch {
        if (!cancelled) {
          setPayload({
            ok: false,
            checks: [
              {
                label: "deploy-health",
                url: null,
                ok: false,
                status: null,
                message: "Runtime health checks are unavailable."
              }
            ]
          });
          setUpdatedAt(Date.now());
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, HEALTH_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const failingChecks = useMemo(() => payload?.checks.filter((check) => !check.ok) || [], [payload]);

  if (!payload || payload.ok || failingChecks.length === 0) {
    return null;
  }

  return (
    <div className="deployHealthBanner" role="status" aria-live="polite">
      <div className="deployHealthBannerHeader">
        <div className="deployHealthBannerTitleGroup">
          <strong>Service interruption</strong>
          <span className="deployHealthBannerMeta">
            {updatedAt ? `Last checked ${new Date(updatedAt).toLocaleTimeString()}` : `Checks refresh every ${HEALTH_REFRESH_MS / 1000}s`}
          </span>
        </div>
        <div className="deployHealthBannerActions">
          <Link href="/wiki/infrastructure-and-operations" className="deployHealthBannerLink">
            Ops notes
          </Link>
          <Link href="/wiki/ipfs-upload-failure-triage" className="deployHealthBannerLink">
            IPFS
          </Link>
        </div>
      </div>
      <div className="deployHealthBannerList">
        {failingChecks.map((check) => (
          <p key={check.label} className="deployHealthBannerItem">
            <span className="deployHealthBannerLabel">{check.label}</span>
            <span>{check.message}</span>
            <span className="deployHealthBannerGuidance">{getCheckGuidance(check)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
