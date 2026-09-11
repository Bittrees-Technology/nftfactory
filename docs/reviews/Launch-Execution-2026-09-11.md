# Launch execution, September 11

## Completed

- Added www.nftfactory.org to the existing Vercel project and configured a permanent 308 redirect to nftfactory.org. DNS was already a Vercel CNAME, so no nameserver move was needed. Public HTTPS validation now succeeds and the redirect preserves the page path. Vercel reports verified=true and misconfigured=false.
- Aligned the Vercel install command to npm ci and explicitly set the production public Filebase read gateway to https://neat-lime-mite.myfilebase.com. Existing sensitive replica/session credentials were preserved. Sensitive values cannot be diagnosed from empty CLI exports; the authenticated live health endpoint confirms backup storage and wallet sessions configured.
- Added server-rendered, indexed artwork and public wallet creator introductions, per-record titles/canonicals and 1200×630 sharing cards. Public reads use configured indexers, time limits, no credentials, and read-only artwork queries. Invalid/mismatched records and sparse or unproven NFT metadata remain noindex. The sitemap adds at most 100 eligible public wallet profiles per enabled chain; ENS aliases and artwork enumeration remain excluded until stronger publication/identity coverage is available.
- Added the creator walkthrough to public help and linked it from the homepage. Corrected guide heading hierarchy so the article title is the main heading.
- Prepared a launch invitation, post, consent-aware first-cohort process, and an empty aggregate funnel sheet. No messages, invented results, automatic trackers, or paid services were introduced.
- Confirmed the Safe as administrator and treasury, with raging.eth as proposer/signer. The Safe is deployed on Ethereum and Sepolia with the confirmed signer and threshold 1.
- Updated Deploy.s.sol to use an explicit signer address and require an existing administrator Safe; it initiates eight two-step ownership handoffs. The unsigned Sepolia simulation contains 22 transactions. Its estimate including margin was 20,104,116 gas / approximately 0.044 Sepolia test ETH at simulation time.
- Replayed all 22 requests on an isolated local Sepolia fork, then executed all eight acceptOwnership calls through the actual Safe contract. Every owner became the Safe and pendingOwner was cleared. No public transaction was sent by that rehearsal.

## User wallet step

A local-only wallet review is prepared at http://127.0.0.1:3042 in Brave. It checks the confirmed signer, Sepolia chain, sequential nonce, exact confirmed calldata, receipt status, and expected deployed addresses. Each request is individually approved in the wallet. It records public transaction hashes in the private provisioning directory and stops if the sequence changes.

After the 22 public deployment requests complete, verify exact runtime code and transfer targets, then have the Safe accept all eight ownership handoffs. The prepared acceptance JSON contains simulated addresses and must not be used before that verification. No private key or seed is needed by the review page.

## Still required before public promotion

1. Public Sepolia deployments and Safe acceptance, followed by two-wallet mint/import/list/buy/cancel acceptance. Rehearsal is not public-chain acceptance.
2. Coordinated Acer backup, migration and complete runtime installation with administrator privileges. Existing production remains on the older backend/contracts until that maintenance step.
3. Build the reviewed commit on Vercel using its own production environment, keep domains on the existing release until runtime/wallet checks pass, then promote the verified deployment.
4. Remove site protection and enable search indexing together in the approved public release. Verify robots, sitemap, canonical redirects, and individual public pages.
5. Submit the sitemap in the owner's Search Console account, then send approved invitations to named recipients and collect real voluntary feedback. Account access, recipient details, and permission to send are still needed.
6. Private offsite database backup remains a post-launch deferral under the $0/month constraint.

## Validation

Local: 247 web tests, web type check, production build, contract tests and isolated Safe deployment/acceptance rehearsal pass. The creator introduction and share image return server-rendered content locally. The sharing PNG was visually reviewed. GitHub CI and Vercel staging evidence are recorded with the release PR.

## Follow-up verification

PR #26 merged into main as `3562540260f92bbf2ad74fb4eea652308703408a`, with all three GitHub CI jobs passing. Merged local and remote feature branches were pruned; only main remains. A fresh dependency audit reported zero vulnerabilities. Vercel deployment `dpl_9yLinDJqFamNSAYioNVRVhTcWLMJ` reached READY; authenticated staging checks passed for home, creator walkthrough, marketplace, robots, sitemap and the deployment health endpoint. The live domain remained on the previous release pending the coordinated rollout.

The user completed all 22 Sepolia deployment transactions. Receipt contents and all ten runtime contracts were verified against the reviewed source. The eight ownership handoffs await Safe acceptance; a successful Safe Transaction Builder simulation and review are prepared. The same Safe is now verified on Base and Robinhood mainnet, but NFTFactory deployment to those chains remains outstanding.
