# Counter-Strike (Browser) — System Design Document

> Status: Draft v1 · Owner: TBD · Last updated: 2026-06-27
>
> A lightweight, browser-playable Counter-Strike–style multiplayer shooter. The
> goal is **simple, reuse-first, and shippable** — not a pixel-perfect clone of
> [counter-strike.net](https://www.counter-strike.net/). We borrow the *core
> loop* (two teams, round-based, buy/plant/defuse-or-deathmatch, aim & shoot) and
> deliver it as a small web app.

---

## 1. Goals & Scope

### 1.1 Functional requirements (from brief)

| # | Requirement | Design implication |
|---|-------------|--------------------|
| 1 | Play CS in the browser | Pure web client, no install; WebGL render + WASM/JS logic |
| 2 | Players join the same field and fight each other | Real-time authoritative multiplayer server with rooms |
| 3 | Game records must be saved | Match/replay persistence (input-log + result summary) |
| 4 | Up to 5 concurrent players | Single small room cap = 5 (e.g. 2v2 + 1 spectator, or 5-player FFA) |
| 5 | Light, simple, reuse frameworks/tools | Off-the-shelf engine + netcode framework, no custom engine |
| 6 | 5 different fields (playgrounds) | 5 static maps shipped as data, selectable in lobby |

### 1.2 Non-goals (explicitly out of scope for v1)

- Anti-cheat hardening, ranked matchmaking, skins/economy store.
- Mobile-native clients (browser-on-mobile is best-effort only).
- Voice chat, in-game purchases, clans, friends graph.
- Pixel-accurate Valve maps/weapons (we ship original/simplified geometry).
- Massive scale — 5 players per room is the hard cap; we scale by *adding rooms*, not by growing a room.

### 1.3 Quality targets

- **Latency budget:** playable at ≤120 ms RTT; smooth at ≤60 ms.
- **Tick rate:** 20–30 Hz server simulation (CS-lite; 64-tick is overkill here).
- **Client:** 60 FPS on a mid-range laptop; first interactive load ≤ 5 s.
- **Footprint:** keep total client download < ~15 MB (models + textures + code).

---

## 2. Survey & Technology Selection

Research summary of the current (2026) browser-game landscape and the choices it drives.

### 2.1 Rendering / game engine

| Option | Strengths | Weaknesses | Verdict |
|--------|-----------|------------|---------|
| **Three.js** | Largest ecosystem (~5M weekly downloads, 300× others), huge community, tons of FPS examples, very flexible | Low-level: you assemble input/physics/loop yourself | **Recommended** — fits "light & reusable"; abundant reference FPS code |
| **Babylon.js** | Batteries-included (scene mgmt, input, loop, physics), best raw render perf, MS-backed | Heavier, larger bundle, smaller community than Three | Strong alternative if we want more built-in structure |
| **PlayCanvas** | Cloud visual editor, great for artist/designer teams, real-time collab | SaaS-flavored workflow, less "just code" | Better for content-heavy teams; overkill here |
| **Unity/Unreal → WebGL/WASM** | AAA tooling | Huge bundles (50–100 MB+), slow loads, fights "light & simple" | Rejected |

**Decision: Three.js** for rendering. Rationale: maximum reusable example code
(several open-source three.js FPS bases exist, e.g. `three-fps`, `enari-engine`),
smallest mental + bundle footprint, and it pairs cleanly with a separate netcode
library. Babylon.js is the fallback if we later want a more integrated engine.

> Reference open-source bases to crib from: `mohsenheydari/three-fps`,
> `iErcann/enari-engine` (three.js FPS playgrounds with shoot/reload/respawn/map
> loading), `MoniJS/Moxxi`. For nostalgia/inspiration only: `modesage/cs1.6-browser`
> (runs real CS 1.6 via Xash3D WASM) and `VadimDez/Counter-Strike-JS`.

### 2.2 Physics & collision

- **`cannon-es`** or **`rapier` (Rust→WASM)** for collision, hitscan rays, and
  player capsule movement. **Rapier** is the recommendation: deterministic-ish,
  fast WASM, runs identically on Node server and browser client → lets us share
  one movement/collision module across both sides.
- Most shooting is **hitscan** (instant raycast), so we lean on raycasts more than
  rigid-body sim. Grenades (optional, v2) would use the physics body path.

### 2.3 Networking / netcode framework

| Option | Transport | Notes |
|--------|-----------|-------|
| **Colyseus** | WebSocket (TCP) | Authoritative-server framework for Node. Auto state sync (delta-compressed, binary), rooms, matchmaking, schema-based state. MIT, free. **Best "reuse a framework" fit.** |
| **geckos.io** | WebRTC DataChannel (UDP, unreliable/unordered) | Lower & more stable latency than WS; ideal for fast FPS. More plumbing, no built-in state sync. |
| **socket.io** | WebSocket | Mature, simple, but TCP head-of-line blocking hurts twitch gameplay; no game-state primitives. |
| **Raw WebTransport** | HTTP/3 / QUIC (UDP) | The future, but ecosystem still thin for game frameworks in 2026. |

**Decision: Colyseus as the room/orchestration & state-sync backbone**, because
it directly gives us rooms (= "fields"), an authoritative server model, automatic
binary delta state sync, and matchmaking — covering requirements #2, #4, #6 out
of the box with minimal code.

**Transport nuance:** WebSocket/TCP is fine for a 5-player, 20–30 Hz, hitscan
CS-lite. We design the message layer so we can **swap the transport to geckos.io
(WebRTC/UDP) later** if twitch latency demands it, without rewriting game logic.
This is the pragmatic "light & simple now, fast later" path.

### 2.4 Why authoritative server (not P2P / client-authoritative)

- Requirement #2 (players fight each other) + #3 (trustworthy records) demand a
  **single source of truth**. Clients send *inputs*; the server decides outcomes.
  This is the standard FPS model and the only sane base for fair hit detection and
  cheat resistance. P2P/lockstep is rejected (NAT pain, cheat-prone, hard to record).

### 2.5 Reference netcode techniques (industry standard, we implement the lite versions)

Borrowed from Gabriel Gambetta's canonical "Fast-Paced Multiplayer" series:

- **Client-side prediction** — client simulates its own movement immediately.
- **Server reconciliation** — client replays unacknowledged inputs after a server snapshot (each input carries a sequence number).
- **Entity interpolation** — remote players are rendered ~100 ms in the past, interpolated between snapshots for smoothness.
- **Lag compensation** — server rewinds to the shooter's view-time to validate hits.

For v1 we ship **prediction + reconciliation + interpolation**; lag compensation
is a v1.5 enhancement (cheap to add later because the server already keeps a state
history ring buffer for the replay system — see §6).

---

## 3. High-Level Architecture

```
                          BROWSER CLIENT (per player)
  ┌──────────────────────────────────────────────────────────────────┐
  │  UI / Lobby (React or plain TS)                                    │
  │  ├─ Render: Three.js scene + WebGL                                 │
  │  ├─ Input: pointer-lock mouse + WASD, sampled @ client tick        │
  │  ├─ Prediction: local movement via shared sim module (Rapier WASM) │
  │  ├─ Interpolation buffer for remote entities                       │
  │  └─ Net client: Colyseus client SDK (WS now, WebRTC-swappable)     │
  └───────────────▲───────────────────────────┬──────────────────────┘
        snapshots  │ (state deltas, 20-30Hz)   │ inputs (seq#, @client rate)
                   │                           ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                      GAME SERVER (Node.js)                         │
  │  Colyseus process                                                  │
  │   ├─ MatchmakingRoom / Lobby                                       │
  │   ├─ GameRoom (1 per "field instance", cap = 5)                    │
  │   │    ├─ Authoritative sim loop @ 20-30Hz                         │
  │   │    │    ├─ apply validated inputs                              │
  │   │    │    ├─ shared movement/collision (Rapier WASM)             │
  │   │    │    ├─ hitscan resolution + round/score logic              │
  │   │    │    └─ write state to Colyseus Schema (auto-synced)        │
  │   │    └─ State history ring buffer (for replay + lag comp)        │
  │   └─ MapRegistry: 5 static map definitions (JSON/glTF)             │
  └───────────────┬────────────────────────────┬─────────────────────┘
                  │ match result + replay log    │ auth/profile
                  ▼                              ▼
        ┌──────────────────┐          ┌────────────────────┐
        │ Object storage   │          │  Database          │
        │ (replays: S3/    │          │  (Postgres/SQLite) │
        │  GCS, .json.gz)  │          │  users, matches,    │
        │                  │          │  scoreboard        │
        └──────────────────┘          └────────────────────┘
```

### 3.1 Deployment topology

- **Static client** → CDN (Vercel/Netlify/Cloudflare Pages). Just HTML/JS/WASM/assets.
- **Game server** → a single Node process (Colyseus) on one small VM/container is
  enough for the 5-player target and even for dozens of parallel 5-player rooms.
  Scale horizontally later with Colyseus' built-in presence/driver (Redis) if many
  rooms are needed.
- **DB** → start with **SQLite** (single file) for the POC; migrate to **Postgres**
  when multi-instance. **Object storage** (S3/GCS/R2) for replay blobs.

---

## 4. Core Game Loop & Rules (CS-lite)

Keep rules minimal but recognizably "Counter-Strike."

- **Teams:** Terrorists (T) vs Counter-Terrorists (CT). With a 5-cap, default is
  **2v2** with 1 optional spectator slot, configurable to 5-player FFA.
- **Round flow:** freeze/buy (5 s) → live round → round end → score → repeat.
- **Win condition (v1, simplest):** eliminate the other team, OR round timer
  expires (CT wins). **Bomb plant/defuse is a v1.5 mode** (one objective entity,
  plant zone, defuse timer) — architecture already supports it as round state.
- **Combat:** hitscan weapons (pistol + rifle to start), HP, headshot multiplier,
  reload, simple recoil/spread. Death → respawn at round start.
- **Economy (optional/lite):** flat loadout in v1; buy menu in v1.5.

State machine lives **server-side only**; clients render whatever state arrives.

---

## 5. The "Fields" (5 Playgrounds) — Requirement #6

- A **field = a map definition** = static data, not code. Each map is:
  - a **glTF/GLB** mesh for visuals (walls, crates, skybox) — kept low-poly for size,
  - a **collision mesh / simplified geometry** for the shared physics module,
  - a **JSON manifest**: spawn points (T/CT), bomb sites (if used), bounds, lighting, name, thumbnail.
- Ship **5 maps**: e.g. `dust-lite`, `warehouse`, `office`, `arena`, `bridge`.
- `MapRegistry` on the server loads manifests; the lobby lists them; a `GameRoom`
  is created bound to one `mapId`. Multiple rooms can run the same or different maps.
- Maps are **versioned** (`mapId` + `version`) so saved replays can reload the exact
  geometry they were recorded on.

Keeping maps as data (not code) is the cheapest way to satisfy "5 fields" and to add
more later with zero engine changes.

---

## 6. Game Recording / Replay — Requirement #3

Two layers, chosen for simplicity + usefulness:

### 6.1 Match summary (always saved) — relational

On round/match end, write a row: `match_id, map_id, mode, start/end time,
players[], team_scores, per-player stats (kills/deaths/assists/accuracy),
winner`. Cheap, queryable, powers the scoreboard/history UI.

### 6.2 Full replay (input + snapshot log) — blob

Because the server is authoritative and already runs a fixed-tick loop, recording
is nearly free:

- **What we record:** the **initial state** + the **per-tick input stream** of all
  players + periodic **state keyframes** (every N ticks) for fast seeking.
- This is the standard, compact "deterministic input-log" replay model used in
  FPS/RTS netcode: the server *is* the recorder; replays store inputs and let the
  sim regenerate frames. Keyframes guard against any non-determinism drift.
- **Format:** newline-delimited JSON or a compact binary, **gzip-compressed**,
  stored as one object per match in object storage; the DB row holds the blob URL.
- **Playback:** a replay viewer reuses the *exact same client renderer*, fed by the
  recorded stream instead of a live socket. Scrub via nearest keyframe + replay
  inputs forward. (This same ring buffer also enables **lag compensation** later.)

Size estimate: 5 players × ~30 inputs/s × ~10 min ≈ small (tens of KB–low MB gzipped).

---

## 7. Networking Protocol Detail

- **Client → Server (inputs):** `{seq, dtTick, moveVec, yaw, pitch, buttons(fire/reload/jump), fireRayAtTick}`. Sent at client tick; small.
- **Server → Client (state):** Colyseus Schema delta — player transforms, HP,
  ammo, round state, scoreboard, events (shot, hit, death, round-start/end). Binary,
  delta-compressed automatically.
- **Tick model:** server fixed step 20–30 Hz; client renders at display refresh and
  interpolates remote entities ~100 ms behind; local player predicted, reconciled
  against `lastProcessedInputSeq` echoed by server.
- **Authority rules:** server validates every input (speed caps, fire-rate, line of
  sight, ammo) before applying — never trust client positions or "I hit them" claims.

---

## 8. Data Model (sketch)

```
users(id, handle, created_at, [auth fields])
matches(id, map_id, map_version, mode, started_at, ended_at,
        winner_team, replay_blob_url)
match_players(match_id, user_id, team, kills, deaths, assists,
              shots_fired, shots_hit)
maps(id, version, name, thumbnail_url, manifest_url)   -- or static config
```

Auth for the POC can be a guest handle (random name) with an optional
sign-in later; nothing about the architecture requires accounts in v1.

---

## 9. Tech Stack Summary

| Layer | Choice | Why |
|-------|--------|-----|
| Rendering | **Three.js** | Light, huge ecosystem, reusable FPS examples |
| Physics/collision | **Rapier (WASM)** shared client+server | One deterministic sim module both sides |
| Netcode framework | **Colyseus** (WS) | Authoritative rooms + auto state sync + matchmaking, MIT |
| Transport (future) | **geckos.io** (WebRTC/UDP) | Drop-in lower-latency upgrade path |
| Server runtime | **Node.js + TypeScript** | Same language client+server → share sim & types |
| Client app/UI | **TypeScript** (+ optional React for lobby) | Simple, typed, matches server |
| Persistence | **SQLite → Postgres**; **S3/GCS/R2** for replays | Start trivial, scale when needed |
| Hosting | CDN (client) + 1 container (server) | Cheap; scale by adding rooms |
| Build | **Vite** | Fast, WASM-friendly bundling |

**Shared-code win:** Three.js + Rapier + Colyseus + TS lets the *movement &
collision simulation be one module* imported by both the predicting client and the
authoritative server — the single biggest simplicity lever in this design.

---

## 10. Build Phases / Roadmap

1. **M0 — Skeleton (1 walking player):** Three.js scene, pointer-lock FPS controls,
   one map, local movement only. *(Reuse a `three-fps`-style base.)*
2. **M1 — Authoritative netcode:** Colyseus GameRoom, server tick, prediction +
   reconciliation + interpolation. 2 players see each other move.
3. **M2 — Combat:** hitscan shooting, HP/damage/death/respawn, scoreboard, 5-cap.
4. **M3 — Rounds & lobby:** round state machine, team assignment, map-select lobby,
   matchmaking; ship all **5 maps**.
5. **M4 — Persistence & replay:** match summary to DB, input-log replay to storage,
   replay viewer. *(Satisfies #3.)*
6. **M5 (stretch):** bomb/defuse mode, buy economy, lag compensation, geckos.io/UDP
   transport, basic anti-cheat.

---

## 11. Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| WebSocket/TCP latency feels laggy for twitch aim | Client prediction + interpolation hide it at 5p/30Hz; UDP (geckos.io) upgrade path reserved |
| Client/server sim divergence (non-determinism) | Shared Rapier module + periodic keyframes; server is always authoritative |
| Cheating (modified clients) | Server validates all inputs; v1 accepts residual risk (non-goal); real anti-cheat = v1.5+ |
| Asset bloat blows the "light" budget | Low-poly glTF, texture atlases, draco/meshopt compression, <15 MB budget |
| Scope creep toward full CS | Strict non-goals (§1.2); CS-lite ruleset (§4) |

---

## 12. Open Questions (for the user / team)

1. **Mode for the 5-player cap:** 2v2 + spectator, or 5-player free-for-all, or both selectable?
2. **Accounts:** guest-only for v1, or real auth (and which provider) from the start?
3. **Maps:** original simplified geometry (safe), or stylized homages to real CS maps?
4. **Replay UI depth:** just "watch back" playback, or scrubbing + per-kill highlights?
5. **Hosting target:** any existing cloud (GCP, given the org domain) we should standardize on?

---

## Sources

- [Three.js vs Babylon.js vs PlayCanvas (2026)](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison)
- [Best Browser Game Engines 2026](https://nilo.io/articles/best-browser-game-engines-2026)
- [Web game engines in 2026 comparison (Cinevva)](https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison.html)
- [JS game rendering benchmark](https://github.com/Shirajuki/js-game-rendering-benchmark)
- [Colyseus — Multiplayer Framework for Node.js](https://colyseus.io/) · [docs](https://docs.colyseus.io/) · [GitHub](https://github.com/colyseus/colyseus)
- [geckos.io — UDP/WebRTC for Node.js](https://github.com/geckosio/geckos.io) · [Web Game Dev: WebRTC](https://www.webgamedev.com/backend/webrtc)
- [Gabriel Gambetta — Client-Side Prediction & Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) · [Lag Compensation](https://www.gabrielgambetta.com/lag-compensation.html) · [Live demo](https://www.gabrielgambetta.com/client-side-prediction-live-demo.html)
- [Preparing your game for deterministic netcode](https://yal.cc/preparing-your-game-for-deterministic-netcode/)
- Reference FPS/CS bases: [three-fps](https://github.com/mohsenheydari/three-fps) · [enari-engine](https://github.com/iErcann/enari-engine) · [Moxxi](https://github.com/MoniJS/Moxxi) · [cs1.6-browser (Xash3D WASM)](https://github.com/modesage/cs1.6-browser) · [Counter-Strike-JS](https://github.com/VadimDez/Counter-Strike-JS)
