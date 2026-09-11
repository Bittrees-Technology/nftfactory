'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
export default function DeployHealthBanner() {
  const path = usePathname() || '/';
  const [unavailable, setUnavailable] = useState(false);
  const relevant = path.startsWith('/mint') || path.startsWith('/profile/setup');
  useEffect(() => {
    if (!relevant) return;
    const controller = new AbortController();
    fetch('/api/deploy/health', { signal: controller.signal }).then(r=>r.json()).then(p=>setUnavailable(!p.ok)).catch(()=> { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, [relevant]);
  if (!relevant || !unavailable) return null;
  return <p className="serviceNotice" role="status">Some publishing services are unavailable. You can prepare your draft and retry later.</p>;
}
