# Counter-Strike (Browser) — Implementation Plan (TDD)

> Status: Draft v1 · Owner: TBD · Last updated: 2026-06-27
> Companion to [`system-design.md`](./system-design.md). This plan turns the design
> into an ordered, **test-first** build. Every feature follows **Red → Green →
> Refactor**: write a failing test that pins the behavior, write the minimum code
> to pass, then clean up.

---

## Current status (2026-06-27)

**Done: P0 → P5.** **Next: P6 (browser client & E2E — first visually playable milestone).**

| | |
|---|---|
| ✅ **P0** | Monorepo (pnpm workspaces), Vitest, CI, walking-skeleton contract test |
| ✅ **P1** | Shared deterministic sim — constants, math, movement+collision, hitscan |
| ✅ **P2** | Authoritative netcode — Colyseus `GameRoom`, input validation, client prediction/reconciliation, entity interpolation |
| ✅ **P3** | Combat & scoring — hitscan damage/headshots/death/respawn, K/D/A + assists, 5-player cap |
| ✅ **P4** | Rounds FSM (freeze→live→ended), lobby + matchmaking, `MapRegistry` + 5 fields |
| ✅ **P5** | Persistence (SQLite via `node:sqlite`) + input-log replay recorder + replay store (file / memory-S3-stub), env-wired into GameRoom |
| ⏳ **P6** | **NEXT** — browser client (Three.js) & E2E; the first visually playable milestone |
| ⬜ **P7** | Stretch — bomb mode, economy, lag comp, UDP, AWS infra hardening |

**Where things stand:** 92 tests passing; typecheck clean; `shared/sim` coverage
100% stmt / 95% branch. The authoritative server runs (`pnpm --filter @cs/server dev`)
with combat, rounds, 5 selectable maps, a lobby, and **opt-in persistence** (set
`DB_URL` / `REPLAY_STORE`). There is **no rendered client yet** — that's P6.

**To start P6:** build `packages/client` rendering on top of the already-tested
net layer (`Predictor`, `InterpolationBuffer`). Test-first targets: input mapping
(T-080, jsdom), a two-browser Playwright smoke (T-081), and the replay viewer
(T-082) which re-feeds a recorded blob (`deserializeRecording` + `replayToSim`)
through the same renderer.

---

## 0. TDD Working Agreement

### 0.1 The loop (per feature)

1. **Red** — write a test that expresses the desired behavior; run it; watch it fail
   for the *right* reason.
2. **Green** — write the simplest code that makes it pass. No gold-plating.
3. **Refactor** — remove duplication, rename, extract; tests stay green.
4. Commit on green. One logical behavior per commit where practical.

### 0.2 Test pyramid & tooling

| Layer | Scope | Tooling | Speed |
|-------|-------|---------|-------|
| **Unit** | Pure logic in `packages/shared` (movement, hitscan, round rules, reconciliation math) | **Vitest** | ms |
| **Integration** | Server rooms, persistence adapters, recorder | **Vitest** + `@colyseus/testing` + SQLite tmp file | 10s–100s ms |
| **Contract** | Client↔server protocol schemas stay in sync | **Vitest** (shared schema snapshot) | ms |
| **E2E / smoke** | Browser loads, can move, two clients see each other | **Playwright** | seconds |

- Coverage gate: **≥ 90% on `packages/shared`** (it's pure and critical), best-effort
  elsewhere. Rendering code is smoke-tested, not unit-tested.
- `pnpm test` runs unit+integration in CI on every PR; Playwright runs nightly + pre-release.
- **Determinism rule:** no `Date.now()` / `Math.random()` inside `shared/sim` — time
  and RNG are injected (tick number, seeded PRNG) so tests and replays are reproducible.

### 0.3 Definition of Done (per feature)

- Failing test written first, now passing.
- Public behavior covered (happy path + at least one edge/failure case).
- No `shared/sim` non-determinism.
- Typechecks clean, lints clean, all existing tests green.

---

## 1. Phase Overview

| Phase | Status | Theme | Key features | Exit criteria |
|-------|--------|-------|--------------|---------------|
| **P0** | ✅ done | Repo & test harness skeleton | Monorepo, CI, empty packages, first "walking skeleton" test | `pnpm test` runs & passes a trivial cross-package test in CI |
| **P1** | ✅ done | Shared deterministic sim | Movement/collision, hitscan, constants | Sim is pure, deterministic, ≥90% covered |
| **P2** | ✅ done | Authoritative netcode | GameRoom tick, input validation, prediction/reconciliation, interpolation | 2 simulated clients converge with server in integration tests |
| **P3** | ✅ done | Combat & scoring | Damage/HP/death/respawn, scoreboard, 5-player cap | Full kill→score flow tested server-side |
| **P4** | ✅ done | Rounds, lobby & 5 fields | Round state machine, team assign, lobby/matchmaking, MapRegistry + 5 maps | Create/join room on any of 5 maps; round cycle tested |
| **P5** | ✅ done | Persistence & replay | SQLite/Postgres adapter, S3/local replay store, recorder, replay viewer | Match summary + replay round-trip tested; viewer replays a recorded match |
| **P6** | ⏳ next | Client render & E2E | Three.js scene, HUD, pointer-lock input, Playwright smoke | Two browsers join a room and see each other move |
| **P7 (stretch)** | ⬜ todo | Bomb mode, economy, lag comp, UDP, AWS infra hardening | per design §10 M5 | — |

> Phases map to design doc §10 milestones (P0–P1≈M0, P2≈M1, P3≈M2, P4≈M3, P5≈M4, P6 ties it together, P7≈M5).

---

## 2. Phase Details (test-first tasks)

Each feature below lists the **tests to write first**, then the **implementation**,
then the **exit check**.

### P0 — Repo & test harness skeleton

**Feature: Monorepo + CI that can run a test.**

- *Tests first:*
  - `shared`: a trivial `add(2,3) === 5`–style test proving Vitest runs in the package.
  - **Walking-skeleton contract test:** `client` and `server` both import a constant
    from `shared` (`TICK_RATE`) and a test asserts they see the *same* value — proves
    the workspace wiring and shared-module reuse actually work end to end.
- *Implement:*
  - `pnpm` workspaces, `tsconfig.base.json`, Vitest config per package.
  - Empty `packages/{shared,client,server}` with `package.json` + one `src` file each.
  - GitHub Actions (or AWS CodeBuild) running `pnpm install && pnpm test`.
  - `docker-compose.yml` + `.env.example` placeholders.
- *Exit:* CI green on the walking-skeleton test.

### P1 — Shared deterministic simulation (`packages/shared/src/sim`)

**Feature: Player movement + collision (`movement.ts`).**

- *Tests first:*
  - Given input `{moveVec, dtTick}`, position advances by `speed * dt` in the facing frame.
  - Moving into a wall (from a fixed test collision box) clamps position — no tunneling.
  - Same inputs from same start state → **identical** output across N runs (determinism).
- *Implement:* capsule move over a static collision set via Rapier (WASM) or a simple
  AABB sweep for the first cut; wrap so the API is `step(state, input, ctx) → state`.

**Feature: Hitscan resolution (`hitscan.ts`).**

- *Tests first:*
  - A ray from A through B's capsule returns a hit with correct distance.
  - Ray blocked by a wall between A and B returns no hit.
  - Headshot region returns the headshot flag (drives damage multiplier later).
- *Implement:* raycast against player capsules + world geometry; return `{hit, target, point, isHead}`.

**Feature: Tunable constants (`constants.ts`).**

- *Tests first:* a config-shape test (tick rate > 0, speeds/damage positive, timers sane).
- *Implement:* central constants; everything else imports from here.

- *Exit:* `shared/sim` ≥ 90% coverage, zero non-determinism, no engine/DOM imports.

### P2 — Authoritative netcode (`packages/server` + `client/net`)

**Feature: GameRoom authoritative tick (`server/rooms/GameRoom.ts`).**

- *Tests first* (`@colyseus/testing`):
  - Client joins → appears in room state with a spawn position.
  - Sending an input advances that player's server state by exactly one sim step.
  - Server ignores/clamps an **illegal input** (speed hack: oversized moveVec → clamped).
- *Implement:* fixed-step loop calling `shared/sim.step`, input queue per client, Colyseus Schema state.

**Feature: Client prediction + reconciliation (`client/net/prediction.ts`).**

- *Tests first* (headless, no DOM):
  - Client predicts local position from input immediately (matches `shared/sim`).
  - On a server snapshot with `lastProcessedSeq`, client replays unacked inputs and
    converges to the server-corrected position (reconciliation).
  - A deliberately wrong prediction is corrected toward the server value.
- *Implement:* input ring buffer keyed by `seq`, re-simulation from last ack.

**Feature: Entity interpolation (`client/net/interpolation.ts`).**

- *Tests first:* given two timestamped snapshots, render position at `t-100ms` is the
  linear interpolation between them; clamps at buffer ends.
- *Implement:* snapshot buffer + interpolation by render clock.

- *Exit:* integration test with two scripted clients + server shows positions converge within tolerance.

### P3 — Combat & scoring (`server`)

**Feature: Damage, HP, death, respawn.**

- *Tests first:*
  - A validated hit subtracts `weapon.damage` (× headshot multiplier) from target HP.
  - HP ≤ 0 → player marked dead, removed from active sim, attacker credited a kill.
  - Dead player respawns at round start at a team spawn point.
- *Implement:* damage application in the tick after hitscan validation; death/respawn state.

**Feature: Scoreboard + 5-player cap.**

- *Tests first:*
  - Kills/deaths/assists aggregate correctly across several events.
  - 6th join attempt is rejected; 5th succeeds (cap enforced).
- *Implement:* per-player stats in state; `maxClients = 5` + reserved spectator logic.

- *Exit:* server-side test drives a full “A shoots B → B dies → score updates” flow.

### P4 — Rounds, lobby & the 5 fields

**Feature: Round state machine (freeze/buy → live → end → next).**

- *Tests first:*
  - State transitions on timer expiry and on win condition (team eliminated → round end).
  - Inputs that fire during freeze phase are rejected.
  - First-to-N rounds ends the match.
- *Implement:* explicit FSM in `GameRoom`; timers driven by tick count (deterministic/testable).

**Feature: MapRegistry + 5 map manifests.**

- *Tests first:*
  - Registry loads all 5 manifests; each validates against the `MapManifest` schema
    (has T & CT spawns, bounds, name).
  - GameRoom bound to `mapId` spawns players only at that map's spawn points.
- *Implement:* `MapRegistry.ts` + `definitions/{dust-lite,warehouse,office,arena,bridge}.json`.

**Feature: Lobby / matchmaking (`LobbyRoom.ts`).**

- *Tests first:*
  - Create room with `{mapId, mode}` → appears in room list.
  - Join-by-id places client into that GameRoom; full room not listed as joinable.
  - Team auto-assignment balances (2v2) within the cap.
- *Implement:* Colyseus matchmaking room + room listing.

- *Exit:* integration test creates a room on each of the 5 maps and runs one round cycle.

### P5 — Persistence & replay

**Feature: DB adapter (SQLite local / Postgres prod) behind one interface.**

- *Tests first* (against a tmp SQLite file):
  - `saveMatch(summary)` then `getMatch(id)` round-trips all fields.
  - `listMatchesByUser` returns matches in recent-first order.
  - Same test suite passes against the Postgres adapter (run in CI service container).
- *Implement:* `persistence/db.ts` interface + SQLite & Postgres adapters; migrations.

**Feature: Replay recorder (`recording/recorder.ts`).**

- *Tests first:*
  - Recorder captures initial state + per-tick inputs + keyframe every N ticks.
  - **Round-trip determinism:** replaying the recorded log through `shared/sim`
    reproduces the final state exactly (proves the input-log model works).
- *Implement:* ring buffer + serializer (ndjson) + gzip.

**Feature: Replay store (local fs / S3 behind one interface).**

- *Tests first:* `put(matchId, blob)` then `get(matchId)` round-trips bytes; local
  adapter writes to tmp dir; S3 adapter tested with a mock/localstack.
- *Implement:* `persistence/replayStore.ts` + adapters; DB row stores the blob URL.

- *Exit:* end-to-end persistence test: play a scripted match → summary in DB + replay
  blob stored → reload blob → sim reproduces the match.

### P6 — Client render & E2E

**Feature: Three.js scene + HUD + pointer-lock input.**

- *Tests first:*
  - Input module: a `KeyboardEvent('w')` produces the expected `moveVec`; mouse delta
    maps to yaw/pitch within clamps (jsdom unit test, no WebGL).
  - Smoke: scene bootstraps and a frame renders without throwing (headless WebGL/mock).
- *Implement:* `render/`, `ui/`, `input/` wired to the net client.

**Feature: Two-player E2E smoke (Playwright).**

- *Tests first:* spin up the server; open two browser contexts; both join the same
  room; assert each sees the other’s avatar move after sending input.
- *Implement:* glue + a test-friendly “bot input” hook.

**Feature: Replay viewer.**

- *Tests first:* given a recorded blob, the viewer reaches the same final scoreboard
  as the live match did (reuses render path, fed by the log).
- *Implement:* `client/replay/` feeding the recorded stream into the renderer.

- *Exit:* `pnpm test:e2e` green: two browsers play; a replay plays back.

### P7 — Stretch (per design §10 M5)

Bomb plant/defuse mode, buy economy, **lag compensation** (server already keeps the
state ring buffer from P5), **geckos.io UDP transport** swap, and AWS infra
hardening (CDK stack tests, autoscaling, anti-cheat basics). Each still TDD: write
the behavior test (e.g. “server rewinds N ms and validates the historical hit”) first.

---

## 3. Suggested Build Order (first two weeks, concrete)

1. P0 walking-skeleton test green in CI. *(Proves the whole TDD pipeline before any game code.)*
2. P1 `movement.ts` Red→Green→Refactor, then `hitscan.ts`.
3. P2 GameRoom join + single-input tick (integration), then prediction/reconciliation.
4. Vertical slice: two scripted clients move and converge — **demoable without any rendering**.
5. Only then start P6 rendering, so the client is a thin view over already-tested logic.

> The point of this ordering: the **game is correct before it is visible**. Rendering
> is the last thing added, on top of a fully tested authoritative core.

---

## 4. Test Inventory (initial backlog)

| ID | Status | Phase | Test | Type |
|----|--------|-------|------|------|
| T-001 | ✅ | P0 | shared constant equal in client & server | contract |
| T-010 | ✅ | P1 | movement advances by speed×dt | unit |
| T-011 | ✅ | P1 | movement clamps at wall (no tunneling) | unit |
| T-012 | ✅ | P1 | movement deterministic over N runs | unit |
| T-020 | ✅ | P1 | hitscan hits capsule / blocked by wall / headshot flag | unit |
| T-030 | ✅ | P2 | join populates room state with spawn | integration |
| T-031 | ✅ | P2 | one input = one sim step on server | integration |
| T-032 | ✅ | P2 | illegal (oversized) input clamped | integration |
| T-040 | ✅ | P2 | client reconciles to server after wrong prediction | unit |
| T-041 | ✅ | P2 | entity interpolation at t−100ms | unit |
| T-050 | ✅ | P3 | hit applies damage (× headshot), death credits kill (+assists) | integration |
| T-051 | ✅ | P3 | 6th join rejected (cap=5) | unit + wire |
| T-060 | ✅ | P4 | round FSM transitions on timer & elimination | unit |
| T-061 | ✅ | P4 | all 5 map manifests validate & load | unit |
| T-062 | ✅ | P4 | create/join/list room via lobby + team balance | wire |
| T-070 | ✅ | P5 | match summary DB round-trip (SQLite; Postgres = deploy adapter) | integration |
| T-071 | ✅ | P5 | replay log replays to identical final state | integration |
| T-072 | ✅ | P5 | replay store put/get round-trip (local + memory/S3-stub) | integration |
| T-080 | ⬜ | P6 | key/mouse → moveVec/yaw mapping | unit |
| T-081 | ⬜ | P6 | two browsers see each other move | e2e |
| T-082 | ⬜ | P6 | replay viewer reaches same final scoreboard | e2e |

This inventory is the live checklist — add a row before you write code, check it off on green.
**Done: T-001 … T-072 (18 behaviors). Next: T-080 (P6).**

### Notes from implementation (deviations worth knowing)

- **Netcode "integration" tests** for P2 run as: pure two-client convergence
  (deterministic, no sockets) **plus** a real server + `colyseus.js` client
  "wire-check" run in a child process (`packages/server/src/rooms/wire-check.ts`),
  because the colyseus.js client can't hold a WebSocket inside a vitest worker.
- **Tooling pins:** `@colyseus/core` + `@colyseus/ws-transport` (the meta package
  pulls `uWebSockets.js` via a blocked git dep); `useDefineForClassFields:false`
  on the server (required for `@colyseus/schema` encoding); `colyseus.js` aliased
  to its ESM build in `vitest.config.ts`.
- **T-062** uses Colyseus's built-in `LobbyRoom` "rooms" message for listing
  (the 0.16 client SDK has no `getAvailableRooms`).
- **P5 persistence:** SQLite uses Node's built-in `node:sqlite` (no native build).
  The **Postgres** (RDS) and **S3** adapters are deploy-time — they implement the
  same `MatchStore` / `ReplayStore` interfaces and the env factory throws a clear
  "add at deploy" error for `postgres:`/`s3:` URLs. Tests cover SQLite + a
  `MemoryReplayStore` that stands in for S3. Persistence is **off unless `DB_URL`
  is set**, wired into `GameRoom` (records inputs/keyframes, saves summary + replay
  blob on `matchOver`).
