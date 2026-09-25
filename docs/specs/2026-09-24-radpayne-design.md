# RadPayne — design

A third-person noir shooter in the browser. You play a Radbro who got rugged and shoots his way
up a Milady gang's tower in bullet time. Built on
[react-three-game](https://prnth.com/react-three-game/) by prnth, the engine RadRun uses, with
prnth's Pockit Milady models as the gang.

## 1. Scope of the first build

**Chapter 1, "Rugged": one linear level, about 6 minutes, playable start to finish on desktop.**

In scope:
- five fight rooms plus a boss room
- three weapons and four enemy kinds, including the boss
- bullet time, shootdodge and the final-kill cam
- four comic-panel cutscenes with a narrator
- checkpoints at each room, three difficulties, and a results screen

Out of scope for now: phone controls, more chapters, online leaderboards, multiplayer. A later
leaderboard would use its own tables in an existing hosted database.

## 2. Cast and story

- **You:** pick one of the four Radbros (#652, #4764 with his katana, #2564 GHOST, #723 cowboy).
  The story is the same whichever you pick; only the model and voice change.
- **The gang:** Pockit Miladys. There are 500+ numbered models in prnth's Pockit repo. Every goon
  loads a different one, chosen by a seeded pick per spawn, so rooms look varied without new
  assets. Their eyes and mouths are rigged, so they blink, flinch and talk.
- **The heavies:** rival Radbros in dark recolours carry shotguns.
- **The boss:** Madame Pockit, a Milady in a big coat, in the penthouse.

The story is a rug-pull revenge story told as a narrator parody in Radbro slang ("they said wagmi.
they lied."). The rooms:

| # | Room | Beat |
|---|---|---|
| 0 | Cutscene 1 | The rug: the bag is gone, the Radbro wakes up in the rain |
| 1 | Rainy alley | Tutorial fight: move, shoot, first bullet time |
| 2 | Club Milady, dance floor | Neon, many goons, cover behind booths |
| — | Cutscene 2 | The bouncer talks; the elevator key |
| 3 | Back rooms and office | Tight corridors, shotgun heavies, first shootdodge through a door |
| 4 | Service elevator ride | Doors open on two floors of goons in turn (arena) |
| — | Cutscene 3 | The penthouse, the boss on a video call |
| 5 | Penthouse | The boss fight: she has phases and goons respawn from two doors |
| — | Cutscene 4 | The bag back, the narrator's last line, "to be continued" |

## 3. Core mechanics

All gameplay runs in a fixed 120 Hz simulation. Bullet time is a `timeScale` on that simulation;
nothing else changes. This is the same approach RadRun's simulation uses.

**Bullet time.**
- Meter: 10 s of real time when full. Q or right mouse button toggles it.
- While on, the world runs at timeScale 0.3. The player aims at full speed and moves at 0.5.
- Kills refill it (+1.5 s each, +2.5 s for a headshot).
- The screen goes warm-toned and desaturated, sound is pitched down, and a heartbeat plays.

**Shootdodge.** Shift dives in the move direction.
- 0.9 s airborne, at timeScale 0.3 whether or not the meter has charge. It costs 1 s of meter if
  there is any.
- You can shoot during the dive, then land prone and get up in 0.6 s, or roll straight into a run
  if you're holding a move key.

**Final-kill cam.** The last kill in a room plays back from a camera that follows the bullet at
timeScale 0.1 for about 1.2 s. Any key skips it.

**Health.**
- 100 HP. No regeneration.
- **Copium** canisters (the painkillers) are carried, up to 8. H uses one: +35 HP over 1 s.
- Pickups sit in each room.

**Weapons.** Normal speed uses hitscan with tracers. In bullet time each shot becomes a visible
projectile at 60 m/s (world time), with a trail.

| Weapon | Mag | Damage | Fire interval | Notes |
|---|---|---|---|---|
| Dual pistols | 2×12 | 34 | 0.12 s, alternating hands | start weapon, infinite reserve |
| Shotgun | 6 | 8 pellets × 14 | 0.8 s | 6° spread, heavies drop it |
| Dual SMGs | 2×30 | 14 | 0.06 s | 3° spread, from room 3 |

- Headshots do ×3. Head hitboxes follow the Head bone.
- Wheel or 1–3 switch weapons; R reloads.

**Hits.** Stylised, not gory:
- a small blood puff on each hit, and a decal on walls behind the target
- hit enemies flinch (a VRM pain expression plus an additive hit clip)
- the dead play a death clip and stay down for the rest of the room

## 4. Enemies

| Kind | Model | Weapon | HP | Behaviour |
|---|---|---|---|---|
| Goon | Pockit Milady | pistol | 60 | goes to cover points, peeks and shoots |
| Rusher | Pockit Milady | SMG | 50 | closes distance, strafes, less cover |
| Heavy | recoloured Radbro | shotgun | 140 | slow advance, dangerous up close |
| Madame Pockit (boss) | Pockit Milady, scaled coat | dual SMG + grenades | 900 | three phases at 66% and 33% HP; each phase opens a door of adds |

Behaviour runs as a small state machine: idle/patrol → alert (a reaction delay) → take cover →
peek-and-shoot → reposition. The level marks cover points; there is no navmesh. Enemies move on a
waypoint graph of the room, the way RadRun's runner uses its junction graph.

Accuracy falls off with distance and with the player's speed. In bullet time the player has
effectively 3× the reaction window.

Difficulty scales enemy damage (0.5 / 1 / 1.5), reaction delay (0.9 / 0.6 / 0.4 s) and the copium
in pickups.

## 5. Camera and controls (desktop first)

The camera is over the right shoulder with pointer lock. Mouse aims, and the camera collides with
walls. A gamepad works as twin-stick with aim assist.

| Input | Action |
|---|---|
| WASD | move |
| Mouse / left button | aim / fire |
| Right button or Q | bullet time |
| Shift | shootdodge |
| Space | jump over low cover |
| R | reload |
| 1–3 or wheel | weapon |
| H | copium |
| Esc | pause |

## 6. Architecture

The layout mirrors RadRun so its modules can be copied and slimmed:

```
src/sim/        fixed-step loop with timeScale, player controller (capsule vs box world), shootdodge
src/combat/     weapons, hitscan, bullet-time projectiles, damage, hitboxes on bones
src/ai/         enemy state machine, cover and waypoint graph, boss phases
src/world/      level loading: prefab boxes become colliders; markers (spawn, cover, waypoint,
                pickup, trigger, checkpoint)
src/anim/       animation machine: locomotion base + upper-body aim layer + additive hits,
                spine/arm aim offset toward the crosshair
src/vrm/        Pockit loader, retargeting, expressions (from RadRun)
src/audio/      engine (from RadRun), time-scaled pitch
src/ui/         HUD (health, meter, ammo, copium, crosshair), comic-panel player, menus, results
public/levels/  chapter1/*.json prefabs (hand-tunable in the engine's editor)
tools/          asset build, level checks
```

- **Simulation boundary:** the simulation owns state and is deterministic for a given input log.
  The React views only read it.
- **Level markers** are plain prefab objects with a `marker` field, so levels stay editable in the
  editor.

## 7. Assets

- **Radbros:**
  - the four finished game characters from RadRun (same rig, 24 bones)
  - a new gun clip set bought once on one rig and copied onto the others by bone name: pistol
    aim idle, aimed walk/strafe, dive, prone, get-up, hit, two deaths
  - more free clips from prnth's moviemaker set (Shooting Gun, Dying, Prone Death, Falling To
    Roll, Walk Strafe), retargeted the same way
- **Miladys:** Pockit models pinned to one repo commit and loaded on demand with fallbacks. The
  Radbro clips are retargeted onto them (the existing RadRun retarget code). Expressions drive
  blink, talk and pain.
- **Guns:** low-poly models built from primitives, attached to the hand bones, with muzzle
  flashes as billboards.
- **Rooms:** engine unit boxes with textures. Rain, neon strips and emissive signs.
- **Comic panels:** 4 cutscenes × 3–4 panels. They are generated images in a graphic-novel style,
  using renders of our own models as reference so the characters match. The budget is 20
  generations.
- **Audio:** generated gunshots, reloads, shell casings, the slow-mo whoosh and heartbeat, noir
  music (calm and fight loops), the narrator, and the Radbro and Milady barks. The voices follow
  RadRun's Radbro and Milady voices.

## 8. Testing (kept light)

- **Unit tests:**
  - timeScale stepping
  - weapon fire intervals and magazines
  - hitscan against bone hitboxes
  - that a projectile hit in bullet time equals the hitscan result
  - AI state transitions
  - that a recorded input log replays deterministically
- **Smoke test:** one headless playthrough with a simple bot that clears room 1.
- Everything else is tuned by hand in the editor.

## 9. Release

- Repo `github.com/dexedrne/radpayne`, public.
- `radpayne.vyvanse.beer`, deployed the same way as RadRun.
- A card in vyvanse.beer's Games section, with credits to react-three-game and Pockit by prnth.
