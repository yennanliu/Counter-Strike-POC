# Counter-Strike POC — AWS Infrastructure Design (Phased)

> Status: design v2 · 2026-06-28 · No code — architecture only.
> Companion to [`system-design.md`](./system-design.md).
>
> Build the infra in **small, independently-deployable phases**. Each phase is a
> complete, working deployment that adds the *minimum* next thing. Start with one
> box and nothing fancy; add persistence, automation, then scale — only when
> needed. Keep it **simple, elegant, light**.

---

## 0. The one constraint (drives every phase)

A Colyseus **room lives in one server process**, and players hold a **long-lived
WebSocket** to it. So connections must **stick** to that process, and scaling out
later means making rooms **discoverable across processes**. Until then, **one node
is the simplest correct thing** — and for ≤5 players/room it's plenty.

Also key: the app's persistence is **opt-in by env** — unset `DB_URL`/`REPLAY_STORE`
and matches/replays simply aren't saved. That's what makes Phase 1 trivial.

---

## 1. Phases at a glance

| Phase | Adds | New AWS services | Outcome |
|------:|------|------------------|---------|
| **1 — Playable** | client CDN + 1 game node | S3, CloudFront, ACM, Route53, ECR, **ECS Fargate (1 task)**, ALB | Publicly playable; **no DB, no Redis**; matches not saved |
| **2 — Persistence** | save matches + replays | S3 (replays), **RDS Postgres**, Secrets Manager | Match history + downloadable replays |
| **3 — Automation & eyes** | CI/CD + observability | GitHub OIDC, CloudWatch alarms/SNS | Push-to-deploy, graceful rollouts, alerting |
| **4 — Scale out** | many game nodes | **ElastiCache Redis**, multi-task + autoscaling | Many concurrent matches |
| **5 — Harden** | prod-grade | WAF, multi-AZ/region, Cognito | Robust public service |

> Rule of thumb: **don't build a phase until the previous one is live and you feel
> its limit.** Phases 1–2 cover a real, shippable game.

---

## 2. Phase 1 — Minimal playable (single ECS node)

**Goal:** the game is deployed and playable on a URL. One game server. No database,
no cache, no replays. Cheapest thing that's still real.

```
            Players (browser)
       https │                 │ wss
             ▼                 ▼
       ┌───────────┐     ┌──────────────┐
 R53──▶│CloudFront │     │     ALB      │◀─ ACM (TLS, WS upgrade, sticky)
       │  + ACM    │     └──────┬───────┘
       └─────┬─────┘            │  (public subnet, public IP)
             ▼                  ▼
       ┌───────────┐     ┌──────────────────┐
       │ S3 (site) │     │ ECS Fargate ×1   │  ← image from ECR
       └───────────┘     │ Colyseus server  │     CloudWatch logs
                         │ DB_URL unset     │
                         └──────────────────┘
```

**Components**
- **S3 + CloudFront + ACM + Route 53** — host the static client over HTTPS.
- **ECR** — one server container image.
- **ECS Fargate**, `desiredCount = 1` (ARM64/Graviton), in a **public subnet with a
  public IP** → **no NAT Gateway** (saves cost).
- **ALB** — terminates TLS, upgrades WebSocket, **sticky sessions** so a client's WS
  stays on the one task. Health check hits a simple endpoint.
- **CloudWatch Logs** (`awslogs`) — only "extra" because you'll want logs day one.

**Config:** `PORT` only. `DB_URL`, `REPLAY_STORE`, `REDIS_URL` **unset** → persistence
off (the app runs fine; matches just aren't recorded).

**What works:** join via Game Center, play all fields/weapons/bomb mode, real-time
multiplayer. **Deferred:** saved matches, replays, scaling, alarms.

**Why one task is fine:** a single task hosts *many* 5-player rooms; sticky ALB keeps
each client on it. No room-routing problem yet.

**Cost:** ~1 small Fargate task + ALB + CloudFront/S3 → low tens of USD/month.

---

## 3. Phase 2 — Persistence (matches + replays)

**Goal:** matches and input-log replays survive. Flip the app's storage seams on
via env — no code change.

```
   … Phase 1 … ECS Fargate ×1
                  │  DB_URL=postgres://…   REPLAY_STORE=s3://…
        ┌─────────┴──────────┐
        ▼                    ▼
 ┌────────────────┐   ┌──────────────┐
 │ RDS PostgreSQL │   │ S3 (replays) │  (+ lifecycle: IA → expire)
 │ t4g.micro      │   └──────────────┘
 └────────────────┘
        ▲ creds
 ┌────────────────┐
 │ Secrets Manager│
 └────────────────┘
```

**Adds**
- **RDS for PostgreSQL** (`db.t4g.micro` to start; Aurora Serverless v2 if traffic is
  spiky) in a **private subnet** → maps to the existing `MatchStore` Postgres adapter.
- **S3 bucket for replays** (+ lifecycle to IA after ~30d, expire later) → the
  `ReplayStore` S3 adapter.
- **Secrets Manager** for DB credentials; injected as env at task start.
- Networking nudge: Fargate now needs to reach RDS/S3 privately → keep the task in a
  **private subnet** with a small NAT, or use **VPC endpoints** (S3, ECR, Logs,
  Secrets) to avoid NAT cost.

**Config:** set `DB_URL`, `REPLAY_STORE=s3://…` → persistence turns on. (Implementing
the two adapters behind the existing interfaces is app work, but the *infra* is just
these resources.)

**What works:** match history, per-player stats, replay blobs in S3.

---

## 4. Phase 3 — Automation & observability

**Goal:** stop deploying by hand; know when something breaks; don't drop matches on
deploy.

**Adds (no new data-plane infra — process + signals)**
- **CI/CD via GitHub Actions + OIDC** (no static keys):
  - client → `vite build` → S3 sync → CloudFront invalidation
  - server → docker build (arm64) → ECR → `ecs update-service` (rolling)
- **Graceful deploys:** ECS task `stopTimeout` + Colyseus graceful shutdown so
  in-flight rounds finish / clients reconnect instead of hard-dropping.
- **CloudWatch alarms → SNS:** ALB 5xx / unhealthy targets, task restarts, RDS
  connections, and a custom **game metric** (active rooms / CCU / tick time via EMF).
- **Environments:** promote dev → staging → prod (separate CDK stacks/params).

**What works:** push-to-deploy, alerting, safe rollouts.

---

## 5. Phase 4 — Scale out (many game nodes)

**Goal:** more concurrent matches than one task can hold. This is the first phase
with real complexity (the WebSocket constraint), so do it only when CCU demands it.

```
   ALB ──▶ ECS Fargate ×N  ──▶ ElastiCache Redis (presence + driver)
   (sticky)   (autoscaled)        shared matchmaking/lobby state
```

**Adds**
- **ElastiCache (Redis)** — Colyseus **presence + driver** so rooms, matchmaking, and
  the lobby are shared across tasks.
- **Multi-task Fargate** with **autoscaling on a custom metric** (rooms/CCU per task —
  CPU is a poor proxy for a tick loop); `minCapacity ≥ 1`.
- **Cross-node WebSocket routing** — the genuinely hard part. Two clean options:
  - **Per-task addressing** (each task reachable directly; client connects to the
    task that owns its room) — most robust for Colyseus.
  - **Sticky + Redis driver** (simpler; some cross-task edge cases).

> Honest note: this is where Colyseus scaling gets fiddly. For 5-per-room it is very
> unlikely to be needed soon — design for it, build it later.

---

## 6. Phase 5 — Harden (production-grade)

- **AWS WAF** on CloudFront (rate limits, basic rules).
- **Multi-AZ** RDS; consider **multi-region** game servers if latency matters (pairs
  with the UDP/geckos.io option from the design doc).
- **Cognito** for optional accounts → persistent stats on top of stored matches.
- App-level anti-cheat hardening (already server-authoritative): tighter input
  bounds, per-IP create/join limits.

---

## 7. Cross-cutting (constant across phases)

**Tech stack**
| Layer | Choice |
|-------|--------|
| Edge | CloudFront, S3, Route 53, ACM (WAF in P5) |
| Compute | ECS Fargate (ARM64), ALB, ECR |
| Data | RDS Postgres / Aurora SLv2 (P2), S3 replays (P2), Redis (P4) |
| Config/secrets | Secrets Manager + SSM Parameter Store |
| Observability | CloudWatch Logs/Metrics/Alarms (P1 logs, P3 alarms) |
| IaC | **AWS CDK (TypeScript)** — same language as the monorepo |
| CI/CD | GitHub Actions + OIDC (P3) |

**Why these (vs alternatives):** Fargate over EC2 (no servers to patch) and over
Lambda (Lambda can't hold a long-lived WebSocket game loop). **ALB** over API Gateway
WebSocket (Colyseus wants persistent rooms + stickiness, not message routing). S3+
CloudFront because the client is just files.

**IaC, grown per phase** — composable CDK stacks, add as you go:
- P1: `Network` (minimal), `Edge` (S3+CloudFront+R53), `Compute` (ECR+ECS+ALB)
- P2: `Data` (RDS, S3 replays, Secrets)
- P3: `Pipeline` (OIDC + deploy roles), alarms
- P4: Redis + autoscaling in `Data`/`Compute`

**Going live is config, not a rewrite:** the app's `MatchStore` / `ReplayStore` /
env factory already abstract storage — Phases 2/4 are mostly *resources + env vars*
(`DB_URL`, `REPLAY_STORE`, `REDIS_URL`).

**Cost discipline:** ARM64 Fargate, `minCapacity 1`, public-subnet task in P1 (no
NAT), VPC endpoints in P2 (shrink NAT), Aurora SLv2 idle-down, S3 lifecycle on
replays, idle rooms auto-dispose (already in app).

---

## 8. Open decisions (per phase)

1. **P1 DNS/TLS:** one domain split — `play.…` (CloudFront) and `gs.…` (ALB) — or a
   single CloudFront with path/behavior routing to the ALB origin? *Lean: split
   sub-domains; simplest.*
2. **P2 DB:** Aurora Serverless v2 (idle-cheap, autoscale) vs RDS `t4g.micro` (fixed,
   simplest)? *Lean: t4g.micro to start, Aurora SLv2 if play is bursty.*
3. **P2 networking:** small NAT vs VPC endpoints to reach RDS/S3 privately? *Lean:
   VPC endpoints (cheaper at low scale).*
4. **P4 trigger:** which CCU / rooms-per-task number moves us from 1→N nodes? Define
   it before building Redis/multi-node.
5. **Accounts:** single AWS account with env separation vs per-env accounts (prod
   isolation)?
