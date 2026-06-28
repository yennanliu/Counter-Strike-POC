# Counter-Strike POC — AWS Infrastructure Design

> Status: design v1 · 2026-06-28 · No code — architecture only.
> Companion to [`system-design.md`](./system-design.md) (§3 sketched this; here it
> is fleshed out as the deployable spec).
>
> Goal: take the working local build (static client + authoritative Colyseus
> WebSocket server + SQLite/file persistence) to AWS **simply and elegantly**,
> with a clean path from a one-box POC to a horizontally-scaled service.

---

## 1. What we're deploying (and the one hard constraint)

| Piece | What it is | Shape |
|-------|-----------|-------|
| **Client** | Vite-built static SPA (HTML/JS/WASM/assets) | **Stateless** → CDN |
| **Game server** | Colyseus (Node) — rooms, authoritative tick, lobby | **Stateful + WebSocket** |
| **Match DB** | match summaries + per-player stats | small relational |
| **Replays** | gzipped input-log blobs | object storage |

**The one constraint that drives everything:** a Colyseus **room lives in one
server process** and players talk to it over a **long-lived WebSocket**. So:
- connections must **stick** to the process holding their room, and
- scaling out means making rooms **discoverable across processes**.

Everything below follows from this. (HTTP/stateless services would be trivial; the
WebSocket+room affinity is the only real design work.)

---

## 2. Architecture (target)

```
                          Players (browser)
                 https (assets)        wss (game)
                      │                     │
            ┌─────────▼─────────┐   ┌───────▼────────────┐
   Route53─▶│   CloudFront      │   │   ALB (HTTPS/WSS)   │◀─ ACM cert
   (DNS)    │   (CDN) + ACM     │   │  WebSocket upgrade  │
            └─────────┬─────────┘   │  + sticky sessions  │
                      │ origin       └──────┬─────────────┘
                      ▼                     │ (private subnets)
            ┌───────────────────┐   ┌───────▼──────────────────┐
            │ S3 (static site)  │   │  ECS Fargate service     │
            └───────────────────┘   │  Colyseus task(s) 1..N   │
                                     └───┬──────────┬───────┬───┘
                          ┌──────────────┘          │       └────────────┐
                          ▼                         ▼                    ▼
                  ┌────────────────┐       ┌─────────────────┐   ┌──────────────┐
                  │ ElastiCache    │       │ RDS PostgreSQL  │   │ S3 (replays) │
                  │ Redis          │       │ (Aurora Svrless │   │  + lifecycle │
                  │ presence/driver│       │  v2 optional)   │   └──────────────┘
                  │ (only if N>1)  │       └─────────────────┘
                  └────────────────┘
   Cross-cutting: VPC · CloudWatch (logs/metrics/alarms) · Secrets Manager / SSM
                  · IAM (least-priv, OIDC for CI) · ECR (server images)
```

Two ingress paths on purpose: **static content via CloudFront/S3** (cached, global,
cheap) and **realtime game traffic via ALB→Fargate** (WebSocket, sticky). They share
one domain via Route53 (e.g. `play.example.com` → CloudFront, `gs.example.com` → ALB).

---

## 3. Components & service choices

| Concern | Service | Why this / vs alternatives |
|--------|---------|----------------------------|
| Static hosting | **S3 + CloudFront** | Cheapest, global, zero servers; the client is just files. |
| TLS / DNS | **ACM + Route 53** | Managed certs (CloudFront cert in `us-east-1`); WSS needs TLS at the ALB. |
| Game server runtime | **ECS on Fargate** | Containers, no EC2 to patch, scale by task count. *vs EC2*: less ops. *vs Lambda*: Lambda can't hold long-lived WebSocket game loops — wrong tool. *vs App Runner*: weak WebSocket/sticky story. |
| Ingress for WS | **Application Load Balancer** | Native WebSocket upgrade + **sticky sessions** (the room-affinity requirement). *vs API Gateway WebSocket*: it's message-routed/serverless, a poor fit for Colyseus's persistent room model. |
| Match DB | **RDS for PostgreSQL** (start `db.t4g.micro`); **Aurora Serverless v2** if spiky | Drops into the existing `MatchStore` Postgres seam. Aurora SLv2 scales to near-zero for bursty/low traffic. *Not SQLite on Fargate* — ephemeral disk + single-writer don't survive task restarts/scale. |
| Replay blobs | **S3** (+ lifecycle to IA/expire) | Drops into the `ReplayStore` S3 seam; replays are write-once, read-rarely → cheap. |
| Presence / scale-out | **ElastiCache (Redis)** | Colyseus presence + driver so rooms/matchmaking are shared across tasks. **Only when running >1 task.** |
| Images | **ECR** | Server container registry feeding Fargate. |
| Secrets/config | **Secrets Manager + SSM Parameter Store** | `DB_URL`, `REDIS_URL`, `REPLAY_STORE=s3://…` injected as env; no secrets in images. |
| Observability | **CloudWatch** (+ Container Insights) | Logs via `awslogs`, metrics, alarms; custom game gauges via EMF. |
| CI/CD | **GitHub Actions + OIDC** | Already have CI; OIDC = no long-lived AWS keys. |
| Edge protection (opt.) | **AWS WAF** on CloudFront | Rate limits / basic rules if exposed publicly. |

---

## 4. Tech-stack summary

| Layer | Choice |
|-------|--------|
| Edge / CDN | CloudFront, S3, Route 53, ACM, (WAF) |
| Compute | ECS Fargate (Linux/ARM64 — Graviton, cheaper), ALB, ECR |
| Data | RDS PostgreSQL or Aurora Serverless v2, S3, ElastiCache Redis |
| Networking | VPC (2 AZ), public subnets (ALB), private subnets (Fargate/RDS/Redis), NAT (or VPC endpoints to cut NAT cost) |
| Config/secrets | Secrets Manager, SSM Parameter Store |
| Observability | CloudWatch Logs/Metrics/Alarms, Container Insights |
| IaC | **AWS CDK (TypeScript)** — same language as the monorepo |
| CI/CD | GitHub Actions → ECR/ECS + S3/CloudFront, via OIDC |

ARM64/Graviton for Fargate: Node + our deps build fine on arm64 and it's ~20% cheaper.

---

## 5. Logic / request flows

**A. Load the game**
`browser → CloudFront → (cache hit) or S3 origin → SPA loads`. Assets fingerprinted
+ long-cached; `index.html` short-cached so deploys roll instantly.

**B. Lobby & matchmaking (HTTP)**
`browser → ALB → Fargate(Colyseus)` POST `/matchmake/joinOrCreate game`.
Matchmaker (state in Redis when N>1) picks/creates a room, returns a **seat
reservation** (roomId, sessionId, processId, token). The LobbyRoom feeds live
field/player counts.

**C. Join a room (WebSocket)**
`browser wss → ALB (sticky) → Fargate task hosting the room` → consumes the seat,
joins, then the authoritative tick streams delta state; client predicts/interpolates.

**D. Match end → persist**
On `matchOver`, the task writes the **summary → RDS** and the **gzipped replay →
S3**, storing the S3 URL on the match row. Best-effort, off the hot path.

**E. View history / replay**
`browser → (lobby/history API) → RDS list` → fetch **replay blob from S3** (presigned
or via CloudFront) → the in-browser replay viewer re-plays it.

---

## 6. The WebSocket scaling model (start simple → scale)

**Phase 1 — one task (recommended start).**
A single Fargate task hosts *all* rooms (each room ≤5 players; one task handles many
rooms easily). ALB sticky sessions keep each client's WS on that task. **No Redis,
no cross-node routing.** Simplest possible thing that's production-shaped.

**Phase 2 — many tasks (scale out).**
Add **ElastiCache Redis** as Colyseus's presence + driver so matchmaking/lobby are
shared. The seat reservation names the **processId** that owns the room; the client
must reach *that* task. Two clean options:

- **Per-task addressing** — each task advertised on its own host/port (e.g. NLB
  target per task, or a known public address per task); the client connects
  directly to the room's task. Most robust for Colyseus.
- **Sticky + driver** — ALB stickiness keeps a session on one task and the Redis
  driver makes remote rooms discoverable; simpler but cross-task room access has
  edge cases.

> Be honest: cross-node WebSocket routing is the genuinely hard part of scaling
> Colyseus. For this POC's scale (5/room), **Phase 1 is plenty** — design for
> Phase 2, don't build it until CCU demands it.

**Autoscaling signal:** CPU is a weak proxy for a tick loop. Prefer a **custom
metric** (active rooms or CCU per task) → target-tracking scaling. Always keep
`minCapacity ≥ 1`.

---

## 7. CI/CD pipeline

```
push/tag ─▶ GitHub Actions (OIDC → AWS role)
  ├─ test + typecheck (existing CI)
  ├─ client:  vite build → s3 sync → CloudFront invalidation (/index.html)
  └─ server:  docker build (arm64) → push ECR → ECS update-service
                                     (rolling, minHealthyPercent, drain rooms)
```
- **OIDC**, not stored keys.
- **Graceful deploys:** ECS drains a task (`stopTimeout`) while Colyseus
  `gracefullyShutdown()` lets in-flight rounds finish / clients reconnect — so a
  deploy doesn't hard-drop matches.
- Environments promoted dev → staging → prod (separate stacks; ideally separate
  accounts).

---

## 8. Networking & security

- **VPC, 2 AZs.** ALB in **public** subnets; Fargate, RDS, Redis in **private**
  subnets. Security groups: ALB→task on the app port only; task→RDS/Redis only.
- **TLS everywhere:** HTTPS at CloudFront, **WSS** at the ALB; internal hops in-VPC.
- **Least-privilege IAM:** task role can read its secrets + write its S3 prefix +
  connect RDS/Redis — nothing else. CI role assumes via OIDC, scoped to deploy.
- **Secrets** in Secrets Manager (DB creds) / SSM (config); injected as env at task
  start — matches the app's env-driven persistence factory.
- **Cost-aware networking:** use **VPC gateway/interface endpoints** (S3, ECR, Logs,
  Secrets) to avoid/shrink NAT Gateway spend.
- **App-level fairness** (already server-authoritative): input validation, fire-rate
  caps, per-IP create/join limits; optional WAF rate rules at the edge.

---

## 9. Observability

- **Logs:** `awslogs` driver → CloudWatch Logs (one group per service/env).
- **Infra metrics:** Container Insights (CPU/mem/task count), ALB (5xx, target
  health, active WebSockets), RDS (connections, CPU), Redis.
- **Game metrics** (custom, via CloudWatch EMF): rooms, CCU, avg tick time, p95 RTT,
  matches persisted, replay write failures.
- **Alarms:** ALB 5xx / unhealthy targets, task restarts, RDS connections high, tick
  time over budget → SNS notify.
- Optional **X-Ray** for the matchmaking HTTP path.

---

## 10. Cost guardrails (keep it cheap)

- Fargate **ARM64**, right-sized task, `minCapacity 1`, scale on CCU.
- **Aurora Serverless v2** (or `t4g.micro` RDS) — scale/idle down for low traffic.
- CloudFront caching + S3 (pennies); **S3 lifecycle** for replays (IA after 30d,
  expire after N days).
- VPC endpoints to cut NAT; single NAT (or none) for a POC.
- Idle rooms auto-dispose (already in app) → fewer running tasks.

Ballpark idle POC footprint: 1 small Fargate task + Aurora SLv2 min + S3/CloudFront
≈ low tens of USD/month; scales with CCU.

---

## 11. Environments & IaC

- **dev** — local `docker-compose` (already): SQLite + local replay folder, no AWS.
- **staging / prod** — AWS, identical CDK stacks, different sizes/params.
- **AWS CDK (TypeScript)** in `infra/`, split into composable stacks:
  1. **Network** (VPC, subnets, endpoints)
  2. **Data** (RDS/Aurora, ElastiCache, S3 buckets)
  3. **Edge** (S3 site bucket, CloudFront, Route53, ACM)
  4. **Compute** (ECR, ECS cluster, Fargate service, ALB, autoscaling)
  5. **Pipeline / CI roles** (OIDC provider + deploy roles)

Same `MatchStore`/`ReplayStore`/factory interfaces the app already has → going live
is *config* (`DB_URL`, `REPLAY_STORE`, `REDIS_URL`), not a rewrite.

---

## 12. Phased rollout

| Phase | Footprint | Outcome |
|-------|-----------|---------|
| **0 — POC live** | S3+CloudFront, 1 Fargate task (ALB sticky), Aurora SLv2 (or skip DB), S3 replays | Publicly playable; cheapest |
| **1 — Production-shaped** | + RDS Postgres, Secrets Manager, CloudWatch alarms, CI/CD (OIDC), graceful deploys | Reliable, observable, automated deploys |
| **2 — Scale out** | + ElastiCache Redis, multi-task Fargate, custom-metric autoscaling, per-task addressing | Many concurrent matches |
| **3 — Harden** | + WAF, multi-AZ/region, anti-cheat, accounts (Cognito) | Robust public service |

---

## 13. Open decisions (for the team)

1. **DB:** Aurora Serverless v2 (idle-cheap, autoscale) vs plain RDS `t4g.micro`
   (simpler, fixed cheap)? *Lean: Aurora SLv2 for spiky play.*
2. **Domain & TLS:** one apex with sub-paths/sub-domains for CDN vs ALB.
3. **Scale trigger:** what CCU/room count moves us from Phase 1→2? (Define before
   building Redis/multi-node.)
4. **Region(s):** single region to start; latency may later justify multi-region
   game servers (with the UDP/geckos.io option from the design doc).
5. **Accounts:** one account with env separation vs per-env accounts (prod isolation).
