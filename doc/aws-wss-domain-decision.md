# Decision record — `wss://` browser play & the Cloudflare DNS blocker

**Date:** 2026-06-29
**Status:** Backtracked. `wss://` deferred; live infra remains `ws://` (Phase-1 smoke test).
**Region:** ap-northeast-1 · Stack: `CsPhase1` · Account: 187326049035

---

## 1. Situation / goal

The Phase-1 AWS stack is live (ECS Fargate game server behind an ALB, client on
S3 + CloudFront). We wanted the **hosted client to be playable in a browser**.

The hosted client loads fine over `https://<dist>.cloudfront.net`, but **cannot
join a match**. Root reason: the game server is exposed over **`ws://`** (plain
WebSocket on the ALB), and browsers **block insecure `ws://` from a secure
`https://` page** (mixed-content policy). The connection is killed before it
reaches the server — surfacing in the client as `joinOrCreate failed: (no
message)` / `could not connect`. The server itself was verified healthy
throughout (direct `ws://` join from Node works).

➡️ The only real fix is to serve the game server over **`wss://`** (TLS), which
needs a **domain + certificate**.

## 2. What we tried

Plan: give the **ALB** a TLS cert + a subdomain so it speaks `wss://`, while
keeping the client on the default CloudFront HTTPS domain (no mixed content, and
**no us-east-1 needed** — only CloudFront custom-domain certs must live there; an
ALB cert can live in-region).

Implemented (and later reverted, see §4):
- CDK: decoupled the game-server (ALB) domain from the CloudFront domain — a
  `gameDomain` context that creates an **in-region ACM cert** + Route 53 record and
  flips the ALB listener to **443/HTTPS (wss)**, leaving CloudFront on its default
  domain. `clientDomain`/`domainName` remained for the optional full us-east-1 path.
- `deploy.sh`: resolve the client's `VITE_SERVER_URL` from `gameDomain` →
  `wss://<gameDomain>`.
- Deployed with `-c gameDomain=gs.xn--rfrst-0sa.com -c hostedZoneId=Z08076861WL8XZKW2J99W`.

The deploy **hung on ACM certificate validation** (`PENDING_VALIDATION`).

## 3. Root cause discovered — DNS is on Cloudflare, not Route 53

The domain **`rfírst.com`** (punycode `xn--rfrst-0sa.com`, registered in Route 53
Domains) has its **nameservers pointed at Cloudflare**:

| | Nameservers |
|---|---|
| Registrar (actual delegation) | `adel.ns.cloudflare.com`, `gerardo.ns.cloudflare.com` |
| Route 53 hosted zone `Z0807…J99W` | `ns-79.awsdns-09.com`, `ns-1620.awsdns-10.co.uk`, … |

So the **Route 53 hosted zone is orphaned** — nothing on the public internet
queries it. The ACM DNS-validation `CNAME` and the `gs.` `A`-record that CDK
created in Route 53 were never visible publicly (`dig` returned nothing), so:
- ACM could not validate → cert stuck in `PENDING_VALIDATION` forever.
- Even if validated, `gs.rfírst.com` would not resolve.

**Any Route 53-based approach (incl. the CDK `gameDomain`/`domainName` paths) is a
dead end while live DNS lives in Cloudflare.**

## 4. Decision

**Backtrack and defer `wss://`.** (User chose "Skip wss:// for now.")

Actions taken:
- Cancelled the stuck CloudFormation update → `UPDATE_ROLLBACK_COMPLETE` (cert,
  ALB listener change, and `gs.` record rolled back; ALB back to `ws://:80`).
- Reverted the uncommitted CDK + `deploy.sh` `gameDomain` changes → back to
  commit `c8cd838` (clean working `ws://` state with automated client upload).
- Cleaned AWS leftovers: deleted the orphaned ACM cert (auto, via rollback) and
  the orphaned Route 53 validation `CNAME`; rebuilt + re-uploaded the client at
  `ws://<ALB>` so S3/CloudFront matches the live server.

## 5. Current status (after backtrack)

| Thing | Value | State |
|---|---|---|
| Game server | `ws://CsPhas-Alb16-PYhix1lQUhsp-373590828.ap-northeast-1.elb.amazonaws.com` | ✅ live, healthy |
| Client (hosted) | `https://d2ctudvhs0zdu6.cloudfront.net` | ⚠️ loads, can't join (mixed content) |
| Code | `c8cd838` | ✅ clean, no `wss://` changes |
| Route 53 zone | only `NS` + `SOA` | ✅ cleaned |
| Cost | ~tens USD/mo (Fargate + ALB + CloudFront/S3) | running |

**Play right now** — run the client locally against the live server (localhost is
exempt from mixed-content rules):
```bash
VITE_SERVER_URL=ws://CsPhas-Alb16-PYhix1lQUhsp-373590828.ap-northeast-1.elb.amazonaws.com \
  pnpm --filter @cs/client dev
# open http://localhost:5173
```

## 6. Options to enable `wss://` later

1. **Cloudflare proxied CNAME (recommended, simplest).** In Cloudflare DNS for
   `rfírst.com`, add `gs` → the ALB DNS name, **Proxied (orange cloud) ON**.
   Cloudflare terminates TLS (Universal SSL covers `gs.rfírst.com`) and proxies the
   WebSocket to the existing `ws://` ALB. **No ACM cert, no CDK change.** Then build
   the client with `VITE_SERVER_URL=wss://gs.rfírst.com` and re-upload. (May need
   Cloudflare SSL mode = *Flexible* so CF→origin uses port 80, since the ALB is
   `ws://` only.)
2. **Cloudflare API token** → automate option 1 end-to-end from here.
3. **Repoint NS to Route 53** → the CDK `gameDomain` path works as designed (auto
   ACM + records). ⚠️ Affects the whole domain (any Cloudflare email/other records);
   NS propagation takes time.
4. **Stay on `ws://`** + local client (current state).

> The `gameDomain` CDK implementation we built (and reverted) is the right shape
> for options 1/3 — re-introduce it from this doc + git history (`git show c8cd838`
> was the baseline; the reverted diff added a `gameDomain` context that certs the
> ALB in-region and leaves CloudFront on its default domain).
