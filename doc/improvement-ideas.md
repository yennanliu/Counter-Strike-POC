# Counter-Strike POC — Review & Improvement Ideas

> Status: review v1 · Last updated: 2026-06-28
> Companion to [`system-design.md`](./system-design.md) and
> [`implementation-plan.md`](./implementation-plan.md).
>
> A review of the current build against the original **Counter-Strike (1.6)**
> ([store page](https://store.steampowered.com/app/10/CounterStrike/)), with
> concrete, prioritized improvement ideas across every core aspect — kept true to
> the project's north star: **light, simple, reuse-first**.

---

## 0. Guiding principle (don't lose this)

CS 1.6 is ~20 years of iteration; we are a ~2,900-line browser POC. The goal is
**not** to clone it — it's to keep the *recognizable CS loop* (buy → rush/hold →
aim duel → plant/defuse or eliminate → round economy) while staying small and
web-native. Every idea below is filtered through: *does it add CS feel for little
code?* Reuse libraries, ship data not engines, prefer one well-tested module over
a framework.

---

## 1. Where we are vs Counter-Strike 1.6

| Aspect | Counter-Strike 1.6 | This POC today | Gap |
|--------|--------------------|----------------|-----|
| Core loop | Round-based, bomb defusal / hostage | Round FSM (freeze→live→ended→matchOver), elimination + timer | **No objective mode** (bomb) |
| Economy | Buy menu, kill/round rewards, eco rounds | None — flat loadout | **No economy** |
| Weapons | ~25 (pistols, rifles, AWP, nades, knife) | 2 (pistol, rifle), hitscan only | Few weapons; no nades/knife |
| Gunplay | Recoil/spray patterns, spread, movement penalty | Single-shot/auto, no recoil/spread | **No recoil/spread** (aim is trivial) |
| Movement | Walk/run/crouch/jump, bhop, accel | Constant-speed XZ, AABB collide | No crouch/jump/accel |
| Hit reg | Lag-compensated, hitboxes | Authoritative hitscan, capsule, **no lag comp** | High-ping players disadvantaged |
| Maps | Detailed, vertical, bomb sites | 5 flat fields (boxes + pads) | Geometry is placeholder |
| Audio | Footsteps, gunfire, radio, voice | **None** | Big "feel" gap |
| Models/anim | Skinned T/CT, weapon viewmodels | Capsules + a box gun | Placeholder visuals |
| Spectate/reconnect | Yes | No | No spectator / rejoin |
| Persistence | Local | SQLite match summary + input-log replay | Ahead in some ways (replays!) |
| Platform | Windows native | **Any browser, no install** | Ahead (web-native) |

**Honest summary:** the *plumbing* is strong (authoritative netcode, prediction,
deterministic sim, replays, lobby, tests). The **game feel** is thin — no audio,
no recoil, trivial aim, placeholder art, no economy/objective. The biggest
perceived-quality wins are cheap (sound, recoil, hit-confirm) and don't require
new systems.

---

## 2. Improvement ideas by aspect

Each idea: the gap, a **light** approach, and **Impact / Effort** (S/M/L).

### A. Core gameplay

| # | Idea | Approach (keep light) | Impact | Effort |
|---|------|-----------------------|:------:|:------:|
| A1 | **Recoil & spread** | Add per-weapon `spread` + a simple recoil curve to `shared/sim` (deterministic, seeded). Spray grows with consecutive shots, resets when idle. Aim stops being trivial. | **High** | S |
| A2 | **Sound** (gunfire, footsteps, hit, death, round start) | Web Audio API + a few free .ogg samples; trigger on the existing `shot`/state events. No new system. | **High** | S |
| A3 | **Hit-confirm from server** | Already broadcasting `shot` with `hit/dmg/killed`; add a per-victim "you were hit" + directional damage indicator. Tiny. | Med | S |
| A4 | **Buy phase / economy** | Reuse the freeze phase: `money` per player, kill/round rewards, a buy menu (pistol/rifle/armor). Pure server logic + a small UI. | **High** (CS identity) | M |
| A5 | **Bomb defusal mode** | Already scoped (P7). One bomb entity, plant zone, plant/defuse timers as round-state. Win conditions extend the FSM. | **High** | M |
| A6 | **More weapons + reload + ammo** | Data-driven (extend `WEAPONS`): mag size, reload time, fire rate, falloff. Reload is a timer in the sim. | Med | M |
| A7 | **Crouch / jump / movement accel** | Add to `shared/sim/movement` (still deterministic). Crouch = smaller hitbox + accuracy bonus. | Med | M |
| A8 | **Knife + grenades** | Knife = short-range hitscan; grenade = the one place to use Rapier rigid bodies (smoke/he/flash as effects). | Low–Med | M–L |

> **Pick first:** A1 + A2 + A3 — together they transform "feels like a tech demo"
> into "feels like a shooter" for a few days of work, zero new architecture.

### B. User experience / game feel

| # | Idea | Approach | Impact | Effort |
|---|------|----------|:------:|:------:|
| B1 | **Kill feed** + death/respawn cam | Render the existing kill events as a top-right feed; on death, free-look or spectate killer until respawn. | Med | S |
| B2 | **Tab scoreboard** (full, teams, ping, money) | The data exists in state; a held-Tab overlay grouped by team. | Med | S |
| B3 | **Settings** (sensitivity, FOV, volume, keybinds) | Small panel in the Game Center; persist to `localStorage`. Lowers the "hard to play" bar. | Med | S |
| B4 | **Round/match flow polish** | Win banner with reason ("Terrorists win — eliminated"), score animation, match-end summary screen with replay link. | Med | S |
| B5 | **Reconnect** | On disconnect, keep the seat for N seconds (Colyseus `allowReconnection`) so a refresh rejoins the same match. | Med | S |
| B6 | **Better visuals** | Swap capsules for a low-poly skinned model (one free glTF), add a weapon viewmodel + muzzle/tracer (have tracer) and simple textures. Keep <15 MB budget. | Med | M |
| B7 | **Mobile/touch best-effort** | On-screen sticks + tap-to-fire; the netcode already abstracts input. | Low | M |
| B8 | **Accessibility** | Colorblind-safe team colors, adjustable crosshair, captions for audio cues. | Low | S |

### C. Content (maps & art)

| # | Idea | Approach | Impact | Effort |
|---|------|----------|:------:|:------:|
| C1 | **Real map geometry** | Author the 5 fields as proper glTF (walls, cover, sightlines, bomb sites) instead of box primitives; keep the manifest (spawns/colliders) as the source of truth, add a `meshUrl`. | **High** | M |
| C2 | **Map variety / verticality** | Ramps, boxes to climb, chokepoints. Needs crouch/jump (A7) to matter. | Med | M |
| C3 | **In-browser map JSON editor** | Tiny tool to place spawns/colliders and export a manifest — lets non-coders add fields. | Low | M |

### D. Netcode / system architecture

| # | Idea | Approach | Impact | Effort |
|---|------|----------|:------:|:------:|
| D1 | **Lag compensation** | Server already could keep a per-tick state ring buffer (the replay recorder is 80% of it). On a shot, rewind targets to the shooter's render-time before the raycast. Fair hit-reg for high ping. | **High** | M |
| D2 | **Delta-rate / interest tuning** | Tune Colyseus patch rate; only sync what changed; quantize positions. Cheap bandwidth wins at scale. | Low–Med | S |
| D3 | **UDP transport (geckos.io)** | Reserved swap behind the message layer; lower/steadier latency for twitch aim. Do only if WS latency proves painful. | Med | M |
| D4 | **Server-side input buffering / fixed-step authority** | Today inputs apply on receive; a true buffered fixed-step would tighten determinism and pair with lag comp. | Med | M |
| D5 | **Postgres + S3 prod adapters** | Implement the two deploy-time adapters behind the existing `MatchStore`/`ReplayStore` interfaces (the seam is ready; factory throws today). | Med | S–M |
| D6 | **Replay viewer page** | The `ReplayViewer` model + recorder exist; add a browser page that scrubs a stored replay through the same renderer. | Med | M |

### E. Infrastructure / deployment / ops

| # | Idea | Approach | Impact | Effort |
|---|------|----------|:------:|:------:|
| E1 | **CI/CD to AWS** | GitHub Actions → build client to **S3+CloudFront**, server image to **ECR → ECS Fargate** behind the ALB (per design §3). Currently CI only tests. | **High** (it's not deployed) | M |
| E2 | **IaC (CDK/Terraform)** | Codify the design's AWS stack (ALB sticky WS, Fargate, RDS, ElastiCache, Route53/ACM, Secrets). | Med | M |
| E3 | **Horizontal scale** | ElastiCache (Redis) as Colyseus presence/driver so multiple Fargate tasks share matchmaking/lobby; ALB sticky sessions. | Med | M |
| E4 | **Observability** | CloudWatch logs/metrics + a few game gauges (rooms, CCU, tick time, p95 RTT). Colyseus exposes hooks; we already saw `@pm2/io` metrics. | Med | S–M |
| E5 | **Health/readiness + graceful drain** | `/healthz`, graceful shutdown that drains rooms before task replacement (Colyseus supports it). | Med | S |
| E6 | **Cost guardrails** | Scale-to-zero / min tasks, short idle-room dispose (have autoDispose), CDN caching. | Low | S |

### F. Testing & quality

| # | Idea | Approach | Impact | Effort |
|---|------|----------|:------:|:------:|
| F1 | **Keep the TDD discipline as features land** | Recoil/economy/bomb are pure sim logic → unit-test first (the project's strength). Hold `shared/sim` ≥90%. | High | — |
| F2 | **Run E2E in CI nightly** | Playwright is wired (`test:e2e`); add a nightly job (browsers cached). | Med | S |
| F3 | **Load/soak test** | Script N bot clients per room × many rooms; measure tick time + bandwidth before claiming scale. | Med | M |
| F4 | **Replay-based regression** | Replays are deterministic → use a recorded match as a golden test (sim must reproduce final state). Already proven in P5; formalize. | Med | S |

### G. Security & fairness

| # | Idea | Approach | Impact | Effort |
|---|------|----------|:------:|:------:|
| G1 | **Server stays authoritative (it is)** | Keep validating all inputs (speed, fire-rate, LoS). Add server-side fire-rate enforcement to match client cap. | High | S |
| G2 | **Basic anti-cheat** | Sanity bounds (impossible aim deltas, teleports), rate limits, never trust client "I hit". Most is already true. | Med | M |
| G3 | **Accounts / identity** | Guest handles now; optional sign-in (e.g., Cognito) for persistent stats + the match history we already store. | Low–Med | M |
| G4 | **Abuse protection** | Per-IP room/create rate limits, name filtering, WS message size/flood caps. | Low | S |

---

## 3. Prioritized roadmap (impact-first, light-first)

**Phase “game feel” (cheap, transformative) — do this next**
- A1 recoil/spread · A2 sound · A3 hit-confirm · B1 kill feed · B2 tab scoreboard
- *Why:* turns a tech demo into a shooter with no new architecture. Days, not weeks.

**Phase “CS identity”**
- A4 economy/buy · A5 bomb mode · A6 weapons/reload · B4 flow polish · B5 reconnect
- *Why:* this is what makes it read as *Counter-Strike*, not just an arena FPS.

**Phase “fair & real”**
- D1 lag compensation · A7 crouch/jump · C1 real map geometry · B6 models
- *Why:* competitive integrity + production-looking content.

**Phase “ship it”**
- E1 CI/CD to AWS · E2 IaC · E3 scale-out · E4 observability · D5 Postgres/S3 adapters
- *Why:* it's currently only runnable locally; this makes it a live service.

---

## 4. Top 5 quick wins (highest impact ÷ effort)

1. **Sound (A2)** — biggest perceived-quality jump per line of code.
2. **Recoil & spread (A1)** — makes aiming a *skill*; pure deterministic sim.
3. **Hit-confirm + damage direction (A3)** — combat finally feels responsive.
4. **Economy/buy in the freeze phase (A4)** — the core CS identity loop.
5. **CI/CD to AWS (E1)** — turn the POC into something people can actually open.

---

## 5. What NOT to do (stay light)

- Don't adopt a heavy engine (Unity/Unreal WebGL) — kills load time & simplicity.
- Don't build matchmaking/ranking/skins/anti-cheat-at-scale for a POC.
- Don't chase pixel-accurate CS maps/weapons — originals/simplified keep it legal and small.
- Don't add UDP/lag-comp/voice until the cheap game-feel wins are in and latency is *measured* to be a problem.

---

### Appendix — current strengths to protect
Deterministic shared sim (client+server reuse), authoritative netcode with
prediction/reconciliation/interpolation, **input-log replays**, a tested core
(103 tests, ≥90% sim coverage), data-driven maps, and a clean storage seam
(SQLite→Postgres / file→S3). These are the foundation; the ideas above build on
them without throwing any away.
