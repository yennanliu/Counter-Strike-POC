# Counter-Strike-POC

A lightweight, browser-playable **Counter-Strike–style multiplayer shooter**.
Two teams, round-based combat, up to 5 concurrent players per room, 5 playable
fields, and saved match replays — built reuse-first on a small web stack.

- 📐 **System design:** [`doc/system-design.md`](doc/system-design.md)
- ✅ **Build plan (TDD):** [`doc/implementation-plan.md`](doc/implementation-plan.md)

---

## Status

| Phase | Scope | State |
|-------|-------|-------|
| **P0** | Monorepo, CI, walking-skeleton contract test | ✅ done |
| **P1** | Shared deterministic sim: constants, movement + collision, hitscan | ✅ done |
| P2 | Authoritative netcode (GameRoom tick, prediction/reconciliation, interpolation) | ⏳ next |
| P3 | Combat & scoring (damage/HP/death/respawn, 5-player cap) | ⏳ |
| P4 | Rounds, lobby & 5 fields | ⏳ |
| P5 | Persistence & replay (SQLite/Postgres + S3/local) | ⏳ |
| P6 | Client render (Three.js) & E2E | ⏳ |

---

## Quick start

### Prerequisites

- **Node.js ≥ 20** (developed on 24)
- **pnpm 11** (`corepack enable` will provide it)

### Install & test

```bash
pnpm install
pnpm test          # all unit + contract tests (Vitest)
```

First install builds esbuild's native binary (needed by Vitest). It is approved in
`pnpm-workspace.yaml` (`onlyBuiltDependencies` / `allowBuilds`), so a clean
`pnpm install` handles it automatically. If your environment ever reports
`ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds` once.

### Commands

| Command | What it does |
|---------|--------------|
| `pnpm test` | Run all unit + contract tests once |
| `pnpm test:watch` | TDD watch mode (re-runs on change) |
| `pnpm test:cov` | Run with coverage; **fails under 90%** on `packages/shared/src/sim` |
| `pnpm typecheck` | `tsc --noEmit` across the whole workspace |

> The game server and browser client land in **P2 / P6**. Until then this repo is
> the tested **simulation core** — there is no app to launch yet, by design (see the
> build order below). Run the tests to exercise it.

---

## Architecture

Authoritative client–server model: **clients send inputs, the server decides
outcomes.** The same deterministic simulation runs on both sides — the client uses
it to predict locally, the server uses it as the source of truth.

```
        BROWSER CLIENT                         GAME SERVER (Node)
  ┌────────────────────────┐            ┌──────────────────────────────┐
  │ Three.js render + HUD   │  inputs    │ Colyseus GameRoom (cap = 5)   │
  │ pointer-lock input      │ ─────────▶ │  authoritative tick @20–30Hz  │
  │ prediction + reconcile  │            │   ├─ shared sim (movement,    │
  │ entity interpolation    │ ◀───────── │   │  hitscan) ← same module   │
  └───────────┬────────────┘  state      │   ├─ round/score logic        │
              │              (delta-sync) │   └─ state history (replay)   │
              │                           └───────┬───────────┬──────────┘
       reuses │ same code                         │           │
              ▼                                   ▼           ▼
        ┌──────────────┐                   ┌──────────┐  ┌──────────┐
        │ @cs/shared    │                   │ DB        │  │ Replay    │
        │ deterministic │                   │ SQLite→   │  │ store     │
        │ simulation    │                   │ Postgres  │  │ local→S3  │
        └──────────────┘                   └──────────┘  └──────────┘
```

- **`@cs/shared`** is the keystone: pure, deterministic (no `Date.now()` /
  `Math.random()`), imported by **both** client and server so prediction and
  authority can never drift. It is also what makes input-log replays reproducible.
- **Deployment:** static client on **S3 + CloudFront**; server on **ECS Fargate
  behind an ALB** (sticky WebSocket sessions) with **ElastiCache Redis** for
  multi-node room presence; **RDS Postgres** + **S3** for data. Local dev mirrors
  this with SQLite + local folders. Full topology and diagrams in
  [`doc/system-design.md`](doc/system-design.md) §3.

### Tech stack

| Layer | Choice |
|-------|--------|
| Rendering | Three.js (WebGL) |
| Physics/collision | simple AABB sweep now → Rapier (WASM) later, behind one API |
| Netcode / rooms | Colyseus (authoritative, WebSocket; WebRTC/UDP upgrade path) |
| Language | TypeScript everywhere (shared sim + types) |
| Tests | Vitest (unit/integration/contract), Playwright (E2E, later) |
| Persistence | SQLite (local) → RDS Postgres; local folder → S3 (replays) |
| Hosting | AWS (S3+CloudFront, ECS Fargate+ALB, ElastiCache, RDS) |

---

## Project layout (pnpm workspaces)

```
counter-strike-poc/
├─ packages/
│  ├─ shared/   # @cs/shared — deterministic sim: constants, math, movement, hitscan
│  ├─ client/   # @cs/client — browser app (thin view over shared logic)  [grows in P6]
│  └─ server/   # @cs/server — authoritative game server                  [grows in P2]
├─ tests/       # cross-package contract tests (e.g. client/server share TICK_RATE)
├─ doc/         # system-design.md, implementation-plan.md
├─ infra/       # AWS deploy (Dockerfile.server, CDK/Terraform)           [P5–P6]
├─ docker-compose.yml   # local dev (server + optional postgres/redis parity)
└─ .env.example         # config; copy to .env for local dev
```

---

## How we build: TDD

Every feature follows **Red → Green → Refactor** — write a failing test that pins
the behavior, write the minimum code to pass, then clean up. The pure `@cs/shared`
sim is held to **≥ 90% coverage**; rendering is smoke-tested, not unit-tested.

The deliberate ordering: **the game is correct before it is visible.** The
authoritative simulation and netcode are fully tested first; the Three.js client is
added last as a thin view. See [`doc/implementation-plan.md`](doc/implementation-plan.md)
for the per-phase, test-first task breakdown and the live test inventory.
