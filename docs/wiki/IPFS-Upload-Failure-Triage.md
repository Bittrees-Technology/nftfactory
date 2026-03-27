# IPFS Upload Failure Triage

Use this runbook when mint uploads fail on the live site.

Current live path:

1. browser
2. `nftfactory.org` on Vercel
3. `https://ipfs.nftfactory.org`
4. Cloudflare Tunnel
5. local Kubo API on `127.0.0.1:5001`

## Known good baseline

The deployment is healthy when all of the following are true:

- `https://nftfactory.org/api/deploy/health` returns `ok: true`
- the IPFS check message in that payload should include `auth: bearer` for a protected writable API, or `auth: public-override` when the deployment intentionally uses `ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1`
- `https://ipfs.nftfactory.org/api/v0/version` returns `200`
- local `http://127.0.0.1:5001/api/v0/version` returns `200`
- the `cloudflared` user service is running
- the `ipfs` user service is running

## Primary failure classes

### 1. Public IPFS API unreachable

Typical app error:

- `IPFS upload backend ... is not reachable from this deployment`

Likely cause:

- bad `IPFS_API_URL`
- tunnel/DNS misroute
- Kubo service down

Checks:

```bash
curl -i -X POST https://ipfs.nftfactory.org/api/v0/version
curl -i -X POST http://127.0.0.1:5001/api/v0/version
```

### 2. Cloudflare `502 Bad Gateway`

Typical app error:

- `IPFS upload failed (HTTP 502)`

Likely cause:

- Cloudflare reached the tunnel hostname but did not get a healthy upstream response from the Pi/Kubo path

Checks:

```bash
journalctl --user -u cloudflared -f
journalctl --user -u ipfs -f
```

Then compare:

```bash
printf 'test-ipfs-upload\n' > /tmp/ipfs-test.txt

curl -i -X POST \
  -F file=@/tmp/ipfs-test.txt \
  "http://127.0.0.1:5001/api/v0/add?pin=true&cid-version=1&wrap-with-directory=false&progress=false&stream-channels=false&quieter=true"
```

```bash
curl -i -X POST \
  -F file=@/tmp/ipfs-test.txt \
  "https://ipfs.nftfactory.org/api/v0/add?pin=true&cid-version=1&wrap-with-directory=false&progress=false&stream-channels=false&quieter=true"
```

Interpretation:

- local `/add` works, public `/add` fails:
  - tunnel/proxy issue
- local `/add` fails too:
  - Kubo/Pi/storage issue

### 3. `terminated` / response cutoff

Typical app error:

- `IPFS upload response ... terminated before completion`

Likely cause:

- upstream response body was cut off mid-stream
- tunnel or proxy reset
- Kubo too slow under current load

Current app hardening already in place:

- quieter Kubo add request params
- retry on transient `502/503/504/522/523/524`
- retry on `terminated`, `aborted`, `fetch failed`, `socket hang up`, `ECONNRESET`, and timeout-like failures

If this still happens after retries, the problem is infrastructure, not the mint client.

## Resource checks on the Pi

Watch during a failing upload:

```bash
top
```

Signals that matter:

- `ipfs` CPU pinned high for extended periods
- swap nearly full
- heavy disk wait
- multiple stray `cloudflared` processes

Check tunnel process hygiene:

```bash
systemctl --user status cloudflared
pgrep -af cloudflared
```

Prefer one systemd-managed tunnel process, not multiple manual/background copies.

## Security posture

If `IPFS_API_URL` is public:

- require bearer auth or basic auth
- do not expose the Kubo API unauthenticated
- keep `NEXT_PUBLIC_IPFS_GATEWAY` separate from the writable API endpoint

## When to stop debugging the app

Stop changing frontend code and move the writable IPFS API off the Pi when:

- local `/add` is consistently slow
- public `/add` still fails after tunnel cleanup
- the Pi is under sustained CPU or swap pressure during uploads
- upload failures correlate with tunnel resets or proxy timeouts

Recommended migration target:

1. move the writable IPFS API to a VPS-hosted Kubo node
2. keep the Pi as a secondary pinning node later
3. leave `ipfs://` URIs unchanged
