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

export default function DeployHealthBanner() {
  const [payload, setPayload] = useState<DeployHealthResponse | null>(null);

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
        <strong>Service interruption</strong>
        <Link href="/wiki/infrastructure-and-operations" className="deployHealthBannerLink">
          Ops notes
        </Link>
      </div>
      <div className="deployHealthBannerList">
        {failingChecks.map((check) => (
          <p key={check.label} className="deployHealthBannerItem">
            <span className="deployHealthBannerLabel">{check.label}</span>
            <span>{check.message}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
