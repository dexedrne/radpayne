# RadPayne: the long-gun hold, the arsenal, secrets and easter eggs

The owner's asks, in his words:

- *"the doesnt hold the shotgun right in his hands"* (the latest one, and the first thing to fix)
- *"add other guns that drop you can use because ive onyl had dual pistols right now"*
- *"levels need some secrets and easter eggs"*

His rules still apply to all of it: readability beats effects; the Radbro stays dark, serious and
noir, the Miladys stay cute; no cringe or meme slang in any text; hits stay stylised.

This spec covers, in order of priority:

1. [The long-gun hold](#1-the-long-gun-hold). Both hands on the gun, on every Radbro rig. This ships first,
   on its own.
2. [Guns that drop](#2-guns-that-drop). Every hostile drops its gun, and weapons are placed from room 1 on.
3. [New weapons](#3-new-weapons). The hand cannon, the sawed-off, the assault rifle, the sniper rifle,
   grenades, #4764's katana and a melee strike for everyone else.
4. [Secrets](#4-secrets). Three per room, six Radbro Webring pins, and a tally on the results screen.
5. [Easter eggs](#5-easter-eggs).
6. [Controls](#6-controls), [simulation and determinism](#7-simulation-and-determinism),
   [sound](#8-sound), [files](#9-files-and-merge-notes), [tests and checks](#10-tests-and-checks) and
   [order of work](#11-order-of-work).

Coordinates are metres in each room's level space, as used by `tools/room1.ts` to `tools/room3.ts`
(x runs west to east, north is -Z).

---

## 1. The long-gun hold

### 1.1 What is wrong today

The round-2 clips hold the shotgun correctly. In every `Shotgun_*` clip the stock sits in the right
shoulder pocket and the left hand is under the pump, with `pumpErrorCm = 0` on every clip in the
round-2 manifest. The game then overrides that hold in `PlayerView.tsx` ("the hip carry", commit
07799fe):

- **The gun turns inside his fist.** `aimLimb(rArm, rHand, hip)` swings the right arm to a point at the
  hip (`SHOTGUN_HIP`: 0.3 m forward, 0.16 m out, 0.48 m down). `aimGun(lg, aim, w, 1.4)` then rotates
  the gun *about its own grip, relative to the hand*, by up to 1.4 rad (80°). The grip leaves the palm
  and the trigger guard points away from the hand. The AK gets the same treatment.
- **The left hand never arrives.** `aimLimb(lArm, lHand, pump)` is a one-bone swing. It points the upper
  arm at the pump but never bends the elbow to reach it, so the hand hangs short of the pump or goes
  past it.
- **The pistols and SMGs have the same fault on a smaller scale.** `aimGun(..., 0.75)` turns each gun up
  to 43° inside the hand.

The Radbro rigs have 24 bones and no finger bones. "The trigger finger right" therefore means the gun
sits in the hand exactly at the measured grip (`RADBRO_GRIPS[id].right`, the clip set's pistol grip,
which the round-2 manifest confirms is also the shotgun's grip). **No aim correction may ever go
between the hand and the gun.**

Arm reach decides every pose below. Upper arm plus forearm (`ForeArm` and `Hand` bone offsets) measure
0.412 m on #652, 0.410 on #4764, 0.361 on #2564, 0.420 on #723, 0.405 on #3171 and 0.417 on #250. With
these short chibi arms, both hands fit on a 0.7 m gun only when the gun is high and close to the chest.
The clips solve this at 97-98% left-arm extension (manifest `leftArmExtension` 0.968-0.977). **A two-hand
low carry at the hip cannot reach**: the pump would be about 0.5 m from the left shoulder. That is why
the left hand only reaches toward it today.

### 1.2 The fix: the gun leads, and the hands follow it

Here is the idea. The game decides where the gun is. Both hands are then solved onto it with a two-bone
arm IK every frame, after the mixer and the spine layers. The authored clips stay the source of the
hold, and the game changes the gun's pose only a little.

New modules:

- `src/anim/ik.ts`
  - `solveTwoBone(upper, lower, end, targetPos, pole, weight)`: a law-of-cosines elbow in the plane of
    (shoulder, target, pole). Upper and lower are swung with the existing `aimLimb` world-delta method,
    so it works on raw glTF and on VRM normalized bones alike.
  - `setWorldQuaternion(bone, q, weight)`.
  - A forearm twist split: half of the hand's twist about the forearm axis goes to `ForeArm`, so the
    mesh does not twist like a candy wrapper.
  - Reach is clamped to 99.5% of the limb, and it reports its reach error.
- `src/anim/hold.ts`: `LongGunHold`, one per rig. It holds the gun-relative hand transforms and computes
  the targets each frame.

Every frame, in `FRAME.bones`, after the spine twist and pitch:

1. **`G_clip`** is the gun's world matrix as the mixer left the right hand, with the gun still at its grip.
2. **`G_target`** is where the gun should be:
   - **Base pose.**
     - When the base clip is a long-gun clip (`Shotgun_*`, `Heavy_Stagger`), use `G_clip`: it carries the
       clip's stance, walk bob and the run's lowered barrel.
     - For any other clip (the jump, the roll, hits and the pistol-set fallbacks), use the chest-relative
       pose `Spine_world × G_chest`. `G_chest` is sampled once per rig at build time from
       `Shotgun_Aim_Idle` at t = 0.
     - Blend the two by the long-gun clips' share of the base weight.
   - **Aim correction.** Rotate about the butt point (gun space (0, 0.04, -0.32) × scale) so the barrel
     meets `g.aimPoint`. Clamp this to 14° (25° in a dive or prone). The spine carries the rest: for long
     guns, raise the spine pitch share from 0.22 / 0.18 to 0.32 / 0.28 (`Spine01` / `Spine`), so the
     shouldered gun stays in the pose the clips reach.
   - **Ready offset.** See 1.3. It also rotates about the butt.
   - **Recoil.** It goes on `G_target`: 4 cm back along -Z and the muzzle up 5°, back to zero over
     0.12 s. The hands then ride the kick.
3. **Hand targets.** Let `D = G_target × G_clip⁻¹`.
   - **Long-gun clip, both hands.** Target = `D × hand_clip`. The clip's own hand-to-gun relation carries
     over: the pump error of 0 cm, `Shotgun_Reload`'s left hand going pump → belt → port ×4 → pump, and
     `Shotgun_Fire`'s rack.
   - **Any other clip.**
     - Right hand: `G_target × grip⁻¹`.
     - Left hand: `G_target × L_gun`. `L_gun` is the left hand in gun space, sampled from the same
       `Shotgun_Aim_Idle` frame.
   - **Per-gun left-hand shift.** Move the left target along gun +Z to that gun's left-hand rail
     (table in 1.5).
4. **Reach solver.** If the left target is past 99% of the left arm, slide it back along the gun's rail
   (the pump front, then the pump rear, then the receiver front) to the first point it can reach. If even
   the rail's rear end is out of reach, move `G_target` sideways toward the chest centre, keeping the
   barrel's direction, until it is in reach (6 cm at most). Then solve the right arm again. Whatever the
   pose, the left hand is always on the gun.
5. **Solve.**
   - Right arm: two-bone IK to its target, with the pole out to his right and down. Then set the hand's
     world rotation, so the grip is exact.
   - Left arm: two-bone IK with the pole down, to his left and a little forward. Then set its world
     rotation.
   - Starting pole points, in chest space from each shoulder:
     - right: (+0.6 out, -0.8 down, -0.1 back)
     - left: (-0.4 out, -0.7 down, +0.3 forward)
   - Per-rig overrides go in `LONG_HOLD[rig]` in `grips.ts`.
6. **The gun stays parented to the right hand, at its grip, with no `aimGun`.** With the right hand
   solved, the gun is at `G_target` to within the IK error.
7. **The pump.** The left target follows the pump mesh. It uses the existing `rackAt` curve, 0.08 back at
   the clip's `pumpBack`, so the hand racks the pump and does not slide over it.

**Weights and states:**

| State | IK weight | Notes |
|---|---|---|
| Stand, walk, run, strafe, back-pedal | 1 | the clip's stance, the aim correction, the ready offset (1.3) |
| Fire | 1 | recoil on `G_target`; the left hand rides the pump |
| Reload (shotgun) | 1 | `D × Shotgun_Reload`'s hands (the authored feed) |
| Reload (AK, rifle, sniper, sawed-off) | 1 | procedural left-hand keyframes in gun space (1.5); the right hand never leaves the grip |
| Dive, prone, get-up | 1 | `Shotgun_Shootdodge` / `Prone_*` clips plus the aim correction (clamp 25°): he shoots along the dive |
| Roll, jump | 1 | chest-relative fallback pose, ready offset on |
| Swap | 0 → 1 | the gun shows at `SWAP_AT`, then the IK comes in over 0.12 s from the swap clip's hands |
| Hit flinch | 1 | the additive flinch moves the chest; the gun and hands move with it |
| Death | 1 → 0 over 0.15 s | the gun stays in the right hand and follows the death clip |

`armW` / `swapW` scale the weight as they do today. `SHOTGUN_HIP`, the hip `aimLimb` and the long-gun
`aimGun` call are removed.

### 1.3 Aimed and ready

- **Aimed (shouldered).** No ready offset. The stock sits in the shoulder pocket and the barrel is on the
  crosshair. It is on while the trigger is down, for 1.2 s after a shot (the player's clock), in bullet
  time, in a dive or prone, and while scoped.
- **Ready (low ready).** Rotate about the butt: the muzzle 16° down and 6° out to his right. The gun
  drops 3 cm. The stock stays at the shoulder, because the chibi arms cannot hold it lower (1.1). It is
  on when none of the aimed conditions hold. While `Shotgun_Run` plays, the offset is 0, since that clip
  already lowers the barrel 15°.
- **Blend.** Up to aimed in 0.08 s (the shot is never late), and down to ready in 0.35 s. This is a view
  weight only: the sim fires as it does today, from `muzzleOf` toward the aim point.

### 1.4 Still visible from the shoulder camera

A shouldered gun points away from a camera behind him, so it is short on screen, and the torso and the
big head cover its rear half. The rule is to **move the camera and shape the gun, never hide the gun**.
The levers, in this order:

1. **Long-gun camera** (`CameraView.tsx`, camera only, eased over 0.3 s on a swap):
   - pivot `right` 0.72 → 0.90
   - `arm` 2.7 → 2.3
   - the eye 0.15 m *below* the sim pivot

   The view still looks at the sim's aim point, as it already does when a wall slides the pivot in. The
   crosshair stays exactly where shots go, and the sim's `SHOULDER` is unchanged. The eye is lower, so
   the head sits above the gun line instead of in front of it. The side wall raycast covers the larger
   offset. The fade rule uses the current base offset instead of `SHOULDER.right`.
2. **A longer front on the player's copy.** The barrel and magazine tube run 0.13 m further ahead of the
   pump: shotgun muzzle z 0.67 → 0.80 in gun space, the rifle's 0.68 → 0.80. The grip, pump and stock
   stay where the clips put the hands. The front of the gun then reaches into the clear zone below and
   left of the crosshair. The heavies keep the standard gun.
3. **A slight outward cant** of up to 8°, so the top and the right side of the receiver show.
4. **Last resort.** The existing crosshair fade thins *him* when his head crosses the crosshair. The gun
   never fades, except below the existing 0.6 cut-off when the camera is pinned inside him.

Acceptance is measured, not judged by eye (1.6). Start from the values above and tune within these
bounds: `right` 0.85-1.0, `arm` 2.1-2.5, eye 0-0.25 m down, barrel extension 0.08-0.18.

### 1.5 Per-gun geometry (gun space, the shotgun frame: origin = middle of the grip, +Z = barrel)

| Gun | Two hands? | Butt | Left-hand rail (z) | Player muzzle | Reload, left hand |
|---|---|---|---|---|---|
| Pump shotgun | yes | (0, 0.04, -0.32) | pump 0.33 → 0.46 (racks back 0.08) | (0, 0.07, 0.80) | the clip's feed |
| AK (#250) and rifle | yes | (0, 0.01, -0.28) | handguard 0.31 → 0.49 | (0, 0.06, 0.80) | handguard → the mag (z 0.15) → the mag drops → belt → mag in → handguard; 2.2 s |
| Sniper rifle | yes | (0, 0.03, -0.34) | handguard 0.33 → 0.47 | (0, 0.07, 0.92) | top-loads through the port (z 0.08) once per round; the bolt mesh cycles after each shot, and the right wrist twitches but stays on the grip |
| Sawed-off | **no**: one hand, arm out (3.2) | a stub | (the left hand comes in only to reload) | (0, 0.06, 0.42) | the barrels hinge down (z 0.12), 2 shells out, 2 in, snap shut; 1.5 s |
| Hand cannon | **no**: one hand, arm out (3.2) | none | (the left hand only to reload) | (0, 0.055, 0.26) | mag out, mag in, the left hand racks the slide; 1.6 s |

Every long gun uses the shotgun frame, so the grips, the long-gun clips and `L_gun` fit all of them.
Each rig attaches them with `SHOTGUN_SCALE[rig]` along Z and `SHOTGUN_THICK_PLAYER` across, as today.

### 1.6 One-handed guns: the wrist, not the gun

For the dual pistols, the dual SMGs, the hand cannon and the sawed-off:

- The arms aim as today (`ARM_SPREAD`).
- The residual correction that `aimGun` applied to the gun (up to 0.75 rad) goes to the **hand bone**
  (`aimHand`): the wrist bends, and the gun stays at its grip in the palm.
- The hand cannon and the sawed-off use the right arm's pistol spread (0.5 rad out, so the camera sees
  them). The left arm drops to a guard: `aimLimb` to a point 0.25 m below and 0.15 m ahead of the left
  shoulder. For their reloads, the left hand is IK'd to the gun's reload point (the mag well / the
  breech).

### 1.7 Checks on every rig

The rigs are #652, #4764, #2564, #723, #3171 and #250.

- **A dev mode `?holdcheck=<weapon>`**, together with a dev-only `?radbro=<id>` (`PlayPage.tsx`,
  development builds only). It runs a scripted input: stand, walk and back-pedal, strafe left and right,
  run, three shots, a reload, turns of 90° with the aim at +40° and -40°, a jump, a dive to prone to
  get-up, and a dive into a roll. Every frame it measures:
  - the grip error: right hand to the gun's grip, which must be < 0.3 cm
  - the distance from the left palm to the rail, which must be < 1.5 cm, except during the authored parts
    of a reload when the left hand has left the gun
  - hand-to-forearm bend, which must be < 60°
  - elbow flips: an elbow crossing its pole plane, which must not happen
  - every 10th frame, **the gun's visible pixels**. The gun is rendered alone with a flat mask material,
    and the Radbro is rendered as an occluder, into a 320×180 target. The targets at 1280×720 are:
    aimed at rest ≥ 1,200 px, ready ≥ 2,000 px, and the muzzle end visible in ≥ 95% of frames.

  The results go to `window.__holdcheck`.
- **`tools/holdcheck.ts`** (puppeteer, like `tools/smoke.ts`). It always uses a throwaway
  `--user-data-dir` and kills the browser by PID. It loops over the six rigs and the long guns, prints a
  pass/fail table and saves one frame per state per rig to `.local/shots/hold/<rig>-<gun>-<state>.png`.
- **Per rig, look at the shots.**
  - #4764's worn katana: the hilt is at the front of the belly and the scabbard at the right thigh, so
    the low-ready gun must clear it.
  - #2564's shorter arms and his 0.64 gun scale.
  - #3171 and #250: the newest clip packs.
- **The heavies** (rival #652 / #723) keep the clips' hold unchanged, which is already correct. Check
  them in the same shots with `?extra=heavy`.

---

## 2. Guns that drop

### 2.1 Every hostile drops its gun

`Game.killEnemy` already puts `e.drop` at the body. Drops become the rule for every kind:

| Hostile | Drops | The first time | After that |
|---|---|---|---|
| Goon (pistol) | `pistol`: her 9 mm pistol | +15 rounds of 9 mm for the dual SMGs, banked if he has no SMGs yet | +15 |
| Goon with a sniper rifle (new, 3.6) | `sniper` | the sniper rifle: 5 in the mag + 5 | +5 |
| Rusher | `smg` | the dual SMGs, both mags full + 30 | +30 |
| Heavy (pump shotgun) | `shotgun` | the shotgun: 6 in the tube + 12 | +6 |
| Heavy with a hand cannon (new, 3.6) | `handcannon` | the hand cannon: 7 + 7 | +7 |

- **Banked 9 mm.** `Player.banked` holds 9 mm picked up before he owns the SMGs. `giveWeapon("smgs")`
  moves it into the reserve, capped at `reserveMax`. The pistols never run dry, so the goons' pistols
  feed the SMGs, as 9 mm is shared in Max Payne.
- **A walked-over drop is always taken** when it can add anything. A full gun leaves it lying there, as
  today. For #250, a rifle pickup stays where it is, since he carries his own AK.
- **Drops land on the ground.** A perched body (a fire escape, a VIP booth) drops its gun to the ground
  below. It is pushed 1.3 m out from the perch toward the street or the floor and lands on
  `groundBelow`. The view lets the gun fall and tumble for 0.3 s (world time).
- Room 3's `room.drops = { rusher: "smgs_ammo" }` goes. The defaults above apply everywhere, and a
  marker's `drop` still overrides them.

### 2.2 How pickups look

Pickups work Max Payne style: you walk over them, within the existing 1.1 m radius.

- **Guns lie flat on the ground**, on their side, each turned by a hash of its id. There is no bobbing
  or spinning. Each has a **glowing edge**: a thin gold fresnel rim (the player's colour code, gold and
  white) that breathes slowly at 1.2 Hz, and a faint additive halo disc on the ground under it. Ammo
  boxes do the same.
- Copium keeps its upright orange canister.
- Pins (4.3) stand upright, turning slowly, with a rim in that Radbro's colour.
- The rim and halo stay under the bloom threshold, as the club and back-rooms looks require (≤ 0.35
  indoors).
- This moves out of `FxView.tsx` into a new `src/app/PickupsView.tsx`.

### 2.3 Placed weapons from room 1 on

| Room | Item | Where | Note |
|---|---|---|---|
| 1 | shotgun | behind concrete barrier-a, on the player's side (-4.9, 0.0, 1.5) | on the way to the first cover |
| 1 | dual SMGs | the north fire escape, first platform, west end (-8.6, 3.3, -11.35) | up the junk stack (4.2) |
| 1 | sniper rifle | dropped by the south perch goon, now a sniper (3.6); it falls to (9.5, 0.15, 10.1) | the long street |
| 2 | sawed-off | behind the bar, west end of the bartenders' lane (-8.4, 0.0, -12.5) | |
| 2 | assault rifle | on the DJ stage behind the desk (15.4, 1.0, -1.2) | the AK for everyone else |
| 2 | grenades ×2 | on the coat-check counter (-14.0, 1.15, 7.0) | |
| 3 | shotgun | on its rack in the storage room | as today |
| 3 | dual SMGs | the security office gun locker | as today |
| 3 | grenades ×2 | the security office desk (15.9, 0.8, -2.5) | |
| 3 | hand cannon | dropped by the manager, now a heavy with the hand cannon (3.6) | |

Section 4 lists the secret caches.

---

## 3. New weapons

### 3.1 The table

Existing rows are unchanged except where noted. Headshots stay ×3.

| id | Name (HUD) | Key | Mag | Damage | Pellets | Interval | Cone (full) | Reload | Pickup reserve / max | Auto | Pierces | Role |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `pistols` | PISTOLS | 1 | 2×12 | 34 | 1 | 0.12 | 0.35° | 1.3 | ∞ | yes | 0 | base |
| `ak` | AK | 1 (#250) | 30 | 30 | 1 | 0.10 | 0.9° | 2.2 | ∞ | yes | 0 | #250's base |
| `shotgun` | SHOTGUN | 2 | 6 | 14 | 8 | 0.8 | 3° | 2.0 | 24 / 48 | no | 0 | close |
| `sawedoff` | SAWED-OFF | 2, press again | 2 | 13 | 10 | 0.22 | 8° | 1.5 | 10 / 24 | no | 0 | point blank; two barrels in a blink |
| `smgs` | SMGS | 3 | 2×30 | 20 | 1 | 0.06 | 1.2° | 1.8 | 180 / 360 | yes | 0 | spray; fed by the goons' 9 mm; ~220/s sustained (pistols ~195) |
| `handcannon` | CANNON | 4 | 7 | 95 | 1 | 0.42 | 0.2° | 1.6 | 14 / 35 | no | 1 at 70% | one torso shot kills a goon; heavies in two |
| `rifle` | RIFLE | 5 | 30 | 42 | 1 | 0.10 | 0.6° | 2.2 | 60 / 180 | yes | 0 | the AK's model, a heavier round and a tighter cone; ~240/s sustained |
| `sniper` | SNIPER | 5, press again | 5 | 160 | 1 | 1.1 (bolt) | 2.5° unscoped, 0 scoped | 2.4 | 10 / 25 | no | 2 | the long street |
| grenade | (count) | G | carry 3 | 150 at the centre | | throw cooldown 0.8 | | | +1 or +2 per pickup | | | clusters, cover |
| katana (#4764) | | F | | 120 | | 0.45 | reach 2.0 m, ±55° | | | | | #4764's melee |
| strike (others) | | F | | 45 + flinch 0.6 s + knock-back | | 0.5 | reach 1.5 m, ±40° | | | | | everyone else's melee |

**Changes to `weapons.ts`:**

- `WeaponId` gains `handcannon | sawedoff | rifle | sniper`.
- `makeWeapon(id, base = false)`: base guns get an infinite reserve, so `ak` keeps ∞ for #250, and
  `WEAPONS.ak.reserve` stays ∞ for the tests.
- `pierce` and `hipSpread` fields.
- `isLongGun`: shotgun, ak, rifle, sniper. The sawed-off and hand cannon are one-handed.
- Slots are categories: `slotOf` gives 1 = base, 2 = shotguns, 3 = SMGs, 4 = hand cannon, 5 = rifles.
  **Keys 2 and 3 keep their meaning**, so muscle memory and the round-2 tests hold. Pressing a slot key
  again cycles within the category: shotgun ↔ sawed-off, rifle ↔ sniper.
- `SLOT_ORDER` becomes `pistols, ak, shotgun, sawedoff, smgs, handcannon, rifle, sniper`. The mouse wheel
  and LB walk it.
- `PICKUPS` gains `pistol, smg, handcannon, handcannon_ammo, sawedoff, sawedoff_ammo, rifle, rifle_ammo,
  sniper, sniper_ammo, grenade`.

### 3.2 Each weapon: model, feel and sound

All models are procedural low-poly in `guns.ts`, in the shotgun frame, using the existing lifted
materials. They must read against the night: satin steel, never black-hole metal.

- **Hand cannon.**
  - Model: a long-slide .50 pistol, bright chrome (`chrome` material), a big squared slide and a dark
    grip, about 1.3× the pistol.
  - Feel: a heavy kick (the right forearm 0.45 rad, the camera kick ×0.6), one huge flash, and a
    **pierce**. The trace continues past the first body through `trace(..., exclude)`, at 70% damage.
  - In bullet time the projectile goes on through that body the same way (`pierce` and `skip` on
    `Projectile`).
  - Sound: a deep crack with a long street tail.
- **Sawed-off.**
  - Model: a stubby side-by-side double barrel with a pistol-grip stock stub and walnut, one-handed with
    the arm out.
  - Feel: both barrels in quick succession, a wide 8° cone of 10 pellets, and devastating within 5 m.
    Point-blank kills blow the body back like the shotgun's (the `blast` flag within 4 m).
  - The pellets draw as the shotgun's hairlines (`look/read.tsx` tracer weight 0.45).
  - Sound: a fat boom, the break-open, shells dropping.
- **Assault rifle** (`rifle`).
  - `makeAk()` and the AK's numbers.
  - Its sound routes to the AK's key, so the gunshots branch's AK rework covers it, with no new files.
  - #250 cannot pick one up (2.1).
- **Sniper rifle.**
  - Model: a long bolt gun, dark green-grey furniture, a scope on top ((0, 0.12, 0.05-0.25)) and a bolt
    handle at (0.03, 0.08, 0.02).
  - **Hold to zoom:** with the sniper in hand, **hold the right mouse button** (pad: hold LT).
    - `InputFrame.zoom` goes to `Player.zoom`: the cone drops from 2.5° to 0 and he moves at 0.45×.
    - The camera goes to the sim pivot: arm 0, FOV 68 → 17, and his body is hidden while scoped.
    - Mouse and stick sensitivity scale by the FOV ratio.
    - The overlay (`ScopeOverlay.tsx`) is a black mask with a round window of 42% of the view height, a
      thin ink crosshair with a centre gap, and tick marks but no numbers or text.
    - Q still toggles bullet time, and bullet time works while scoped.
    - A swap, a reload, a dive or a hit that knocks him down drops the scope.
  - Bolt: 1.1 s between shots (the bolt mesh cycles).
  - Pierce 2: the long street's queue is the showcase.
  - Sound: a sharp supersonic crack, the bolt, and a scope glass tick in and out.
  - *Stretch, if time allows:* a sniper headshot beyond 25 m plays a 0.6 s bullet chase (the kill cam's
    chase segment, without its orbit).
- **Grenades.**
  - G throws one from **the left hand**. The right hand keeps the gun: the left pistol dips out of view,
    or the long gun's left hand lets go for 0.35 s and the IK brings it back.
  - It aims where you aim. The sim solves a 35° loft for the aim point's horizontal distance, clamped to
    3-20 m (launch speed 6-16 m/s, grenade gravity 16 m/s²).
  - It flies on world time, so bullet time slows it. It bounces off boxes (restitution 0.3, tangential
    0.6) and comes to rest below 0.4 m/s.
  - The fuse is 1.6 s of world time.
  - The blast: radius 5 m, damage 150·(1−d/5)^1.2 to anyone with a clear line (`world.clear`) from the
    blast point +0.25 m to their torso. He takes 50% of it himself.
  - A blast kill sends the body flying away from the centre. A heavy staggers at 40 or more.
  - The view:
    - a dark olive frag with the gold rim
    - a thin red ring on the floor under a live grenade, for readability
    - the blast: a gold-white flash, a flat shock ring on the ground, sparks, a smoke puff and a scorch
      decal
    - a camera kick by distance
    - no gore
- **Katana (#4764 only).**
  - F: a 0.45 s draw-cut on the player's clock, so it is twice as fast against the world in bullet time.
  - His guns hide for the cut. A procedural katana is in his right hand: a 0.75 m steel blade, a small
    gold guard and a dark wrapped hilt.
  - A curved slash ribbon, white core with his cyan (#3ff0ff) edge, fades over 0.2 s. The hit shows a
    red streak and a small burst; it is stylised.
  - **The worn katana hides for the cut.** It is part of his single skinned mesh: a straight object
    about 0.82 m long, in bind space from (-0.311, 0.471, -0.240) (the scabbard's end behind the right
    thigh) to (0.063, 0.801, 0.408) (the hilt in front of the belly), at most 4.5 cm thick, weighted to
    `Hips` and `RightUpLeg`.
    - `src/anim/katana.ts` finds its triangles on load: the mesh islands (connected components of the
      index buffer) that lie wholly inside a 6 cm capsule around that segment. It moves them into a
      second geometry group with their own material, which can then be hidden.
    - If the split picks up body faces (a dev check on vertex count), nothing is hidden, and the drawn
      blade still shows.
  - The arm: `aimLimb` the right arm along an arc from high right to low left over 0.18 s, with a spine
    twist from -0.6 to +0.4 rad.
- **Strike (everyone else).**
  - F: a pistol-whip (a right hook with the right gun) or, with a long gun, a butt-stroke. The butt-stroke
    rotates `G_target` about the midpoint of the hands so the butt swings 0.35 m forward, and the hold's
    IK keeps both hands on it.
  - Damage 45, a 0.6 s flinch and a 2.5 m/s knock-back (`Enemy.knockT`, applied in `moveEnemy`).
- **Melee in the sim.**
  - It resolves at a 0.1 s wind-up. It checks hostiles whose torso aim point is within reach and inside
    the arc around the aim yaw, with `world.clear`, and hits at most 3.
  - There are no headshots. Melee kills count as kills. A final melee kill plays the kill cam's orbit
    without a bullet chase (`KcPlan.chase = false`).

### 3.3 Slots, keys and the HUD

- **Weapon tabs** (`WeaponTabs.tsx`): five tabs: `1 PISTOLS` (or `1 AK`), `2 SHOTGUN` / `SAWED-OFF`,
  `3 SMGS`, `4 CANNON` and `5 RIFLE` / `SNIPER`.
  - A category tab shows the member in hand, or the last used.
  - A small `+` pip means both members are owned.
  - Unowned tabs stay the dashed `4 ———`. Current, owned and dry keep today's styles.
- **Ammo plate** (`AmmoPanel.tsx`), new icons in the same ink style:
  - hand cannon: a fat round, 1.3× the pistol bullet
  - sawed-off: two shells
  - rifle: slim rounds
  - sniper: a tall bottlenecked cartridge
- **Grenade stock** (`GrenadeStock.tsx`, in the bottom-left strip after the copium stock): a `G` keycap
  and up to three grenade glyphs.
- **Nudges** (`captions.ts`): the pickup nudges gain the new names ("picked up the hand cannon. [4]"). The
  sniper's first draw also shows "hold right mouse: scope." The voice stays lowercase and plain.
- **`director.ts`:**
  - The hint `1-3 / WHEEL: switch weapon` becomes `1-5 / WHEEL`.
  - `r3_shotgun` ("a shotgun. it didn't ask questions…") fires on the run's *first* shotgun, which is now
    in room 1.
  - There are **no new narrator lines** this round. The voices are another branch's work.

### 3.4 Where the new guns sit in his hands

Covered in 1.5-1.6. The bullet-time muzzle for the sim (`muzzleOf`) gets entries per weapon:

- the one-handed guns use the pistol's right-hand numbers
- the long guns keep `side 0.14`
- the sniper's forward offset is 0.85

### 3.5 The bot (the smoke runs and `?bot`)

- **Picks:**
  - the sawed-off under 4 m
  - the shotgun under 9 m
  - the hand cannon against heavies at any range
  - the sniper beyond 22 m, standing and scoped (`f.zoom`, no strafing while scoped)
  - the rifle at 9-40 m ahead of the pistols
  - the SMGs as today
  - the base gun when the rest are dry
- **Grenades:** when 2 or more live hostiles within 3.5 m of each other are visible at 8-18 m, and never
  within 6 m of itself. Cooldown 6 s.
- **Melee:** when a hostile's torso is within 1.4 m (the katana within 1.8 m).
- **Ignores** pickups more than 1.2 m above the ground under it, and every secret.
- The existing smoke assertions must still pass: rooms 1-3 cleared on their seeds.

### 3.6 The gang with the new guns

Marker `data.weapon` overrides a kind's gun. Tuning goes in `ENEMY_ARMS` in `tuning.ts`.

- **Sniper goon** (room 1: `goon-fire-escape-s`).
  - She holds her perch. Before each shot, a **0.8 s tell**: a thin *cold white* laser from her muzzle
    to him (the heavy's red laser kept apart by colour and length).
  - Then one round: 22 damage × difficulty, hit chance 0.75 without the far falloff up to 50 m.
  - 2.6 s between shots. She holds a shooter slot through the tell.
  - Her view:
    - a sniper rifle, right hand at the VRM pistol grip
    - the left hand IK'd to the handguard with the same `solveTwoBone` on VRM normalized bones
    - `MILADY_LONG_GRIP`, measured once like the Radbro fallback
  - She drops the sniper (2.1).
- **Hand cannon heavy** (room 3: `heavy-manager`).
  - He keeps the heavy's 0.35 s red laser tell, then fires one slug: 34 damage × difficulty.
  - 1.2 s between shots, 7 rounds, then a 1.6 s reload.
  - His view plays the pistol clip set, one-handed, with the wrist aim.
  - He drops the hand cannon.
- **Grenade avoidance.** A goon or rusher within 5 m of a grenade that has landed, and has a clear line
  to it, runs out of the radius after a 0.25 s reaction (world time): 1.0 s along the vector away from
  it, then back to her state. Deaf and idle girls hear it bounce.

---

## 4. Secrets

### 4.1 The mechanics (sim-side, deterministic)

- **`secret` marker kind** (`level.ts`): a volume like a trigger, with `data: { name, pin? }`.
  - The first time he enters it, it is found: `Game.found` and the event
    `{ type: "secret", id, n, of }`.
  - It goes in `Resume` (a checkpoint keeps it) and in `Stats` as `secrets` / `secretsTotal`.
- **Secret doors.** A box with `data: { secretDoor: "<id>", open: "swing" | "slide", hinge?, slide? }` is
  a normal collider until he presses **E** within 1.3 m, facing it within 60°.
  - Then `world.setEnabled(node, false)` and `{ type: "open", node }`.
  - `PropsView.tsx` swings it or slides it (0.5 s, world time).
  - A checkpoint keeps it open.
- **Breakables.** A box with `data: { breakable: hp, secret?, drop?, amount? }` takes damage from bullets,
  pellets, melee and grenades.
  - `TraceHit` gains `node`, the box's node id for world hits.
  - At 0 HP: `setEnabled(false)` and `{ type: "break", node, x, y, z }`, the drop spawns on the ground
    below, and the secret counts.
  - The debris reuses the breach door's pool: wood splinters, plaster or glitter by `surface`.
- **Interact.** `InputFrame.interact` (E) opens secret doors and triggers eggs. For an egg, the sim finds
  the nearest `egg` marker with `interact: true` within 1.3 m in front of him and emits
  `{ type: "interact", id }`. The eggs themselves are view-only.
- **Every secret has a tell**, so finding one is fair: a gate ajar, light behind a hatch, a misaligned
  seam, wood splinters where the rest of the wall shows plaster, a draught of dust.

### 4.2 Per room (3 each)

**Room 1: the street**

1. **The alley (and George).**
   - Cut a 2.6 m alley on the south side, between `sw1` and `sw2`: `sw1` becomes x -28..-21.3, `sw2`
     becomes -18.7..-13, and `sf-sw1` moves to -18.7..-13. 2.6 m is the corridor width the shoulder
     camera needs.
   - The alley runs from the sidewalk at z 12 to a chain-link fence at z 18.5: wet asphalt at the
     sidewalk's 0.15, bins, crates, a steel side door and a drain.
   - The mouth has a chain-link gate standing ajar, 9 m from the spawn. George is visible from the street.
   - Secret volume: x -21.3..-18.7, z 14..18.5.
   - Inside: **pin #723** behind a bin (-20.6, 0.15, 17.8), copium ×2, and George (5.1).
   - It is west of `trigger-alert` (x -12), so it can be explored before the fight.
2. **Behind the news kiosk.**
   - The kiosk (x -19.3..-16.7, z -9.1..-7.3) has an open back hatch with a warm light, facing the pocket
     against the facade (z -12..-9.1).
   - Secret volume: x -19.6..-16.4, z -11.9..-9.4.
   - Inside: the vendor's stash, grenades ×2 (-18.4, 0.15, -10.6) and copium ×1.
3. **The fire-escape roof: the sniper's nest.**
   - The climb onto the north fire escape (`fe-n`, x -9.5..-1.5), one readable step at a time, each hop
     ≤ 1.0 m (the jump reaches 1.18 m):
     - ground
     - a trash-bag collider (top 0.6)
     - the dumpster (top 1.5)
     - an AC crate on the lid, south half, clear of the platform above (top 2.3)
     - platform 1 (3.3), with the SMGs
   - The drop ladder and a gap in the railing move above the dumpster (a `ladderX` option in
     `fireEscape()`).
   - Up to the top: the four flights become stepped colliders (11 steps of 0.3 m along each decor stair).
     Platforms 2-5 become colliders with a stairwell left open above each flight, and the railings become
     invisible 1.0 m colliders with `camera: false`, so the lens passes them.
   - Platform 5 (16.5 m) gets a 2.1 m catwalk east to the roof of `nw4`, which is exactly 16.5 m high.
     `nw4`'s cornice is a 0.55 m collider lip along the roof's front edge (z -12.2..-11.5), and its top is
     0.48 m above the roof, more than the 0.35 m step-up. So the catwalk ends in a 0.25 m step box, then
     the cornice top, then down onto the roof. Water tower `wt-3` stands behind the nest.
   - The nest, on the roof at (3.5, 16.5, -13.2), looks down on the street and the club door: a folding
     chair, an ashtray, **pin #652**, sniper ammo ×10 and copium ×2.
   - Secret volume: over the roof, x 0..8, z -18..-12, y 16.5..19.5.
   - `trigger-door` (y ±1.5 around 1.0) does not fire up there.

**Room 2: the rave**

1. **Behind the DJ booth: the LED wall's service walk.**
   - The LED wall becomes a collider. Today it is decor and he can walk into it.
   - Its panel at z 4.2..5.4, y 1.0..3.2, on the stage, is a **swing secret door**. Its tell is a
     misaligned seam with a thin warm line of light.
   - Behind it runs a 2.2 m walk at stage height: x 19.4..21.6, z -6..6, ceiling 3.4. `wall-e` moves out
     to x 21.6 for z -6.2..6.2, with end walls, and `stage` extends under it.
   - At its north end are flight cases, cable and a work lamp, with **the hand cannon** (the weapon cache,
     +7), **pin #4764**, and the react-three-game sticker on a case (5.4).
2. **The fire exit.**
   - The crowd's fire door (x 6.9..8.1, on the VIP platform at 0.34) becomes a swing secret door. `wall-s`
     gets the door gap.
   - After the crowd runs out through it, the view leaves it standing ajar 10°. That is the tell.
   - Beyond it: a stair landing (x 6.3..8.7, z 14.5..17.0, floor 0.34, ceiling 3.4), with the stairs going
     down behind a chain (collider).
   - Inside: **pin #2564**, copium ×2, and the Milady figurine on the window ledge (5.5).
3. **The mirror ball.**
   - A 0.8 m breakable box around the ball at (0, 6, 0): `breakable: 1`, `surface: "glass"`,
     `drop: "grenade"`, `amount: 2`.
   - One shot drops it. The club look (`MirrorBall` in `look/club.tsx`) lets it fall on world time and
     shatter in a spray of silver glitter, and two grenades roll out onto the dance floor.
   - Shooting it counts as the secret.

**Room 3: the back of the house**

1. **The false wall.**
   - The storage room's east wall `b-wall-e` (x 17..17.2) splits:
     - z -22..-20.4
     - a plywood panel z -20.4..-18.8 (`breakable: 80`, `surface: "wood"`, a slightly different plywood
       texture)
     - z -18.8..-13.8
   - Its tells: wood splinters where the rest of the wall shows plaster, dust drifting through the seam,
     and light behind it.
   - It stands in the 1.6 m lane behind the east shelving, where `goon-store-1` stands, so her body and
     her drop take him there.
   - Behind it: a small room (x 17.2..20.6, z -21.8..-17.4). `floor` extends to x 20.8, with walls and a
     ceiling.
   - Inside: **the dev photo wall** (5.7), a desk and lamp, **pin #3171**, grenades ×2 and copium ×1.
2. **The west alcove's door.**
   - The shut steel door at the back of the west alcove (`alc-w-back`, x -5.3..-5.1, z -6.6..-5.4) becomes
     a slide secret door. Its tell is light under it.
   - Behind it: a janitor's closet (x -7.3..-5.3, z -7.0..-5.0; `floor` extends to x -7.5). It has
     shelves, a mop bucket, and a small radio playing the club's bass, muffled.
   - Inside: **pin #250** and copium ×2.
3. **The manager's bookshelf.**
   - `shelf-e3` (x -1.0..-0.55, z 1.4..4.6) slides 1.2 m north on E. Its tells are scrape marks on the
     carpet and a gap at its end.
   - It uncovers a wall safe that fits the 0.3 m cavity between `e-wall-w` and the corridor wall.
   - Inside the open safe: hand-cannon ammo ×14 (for the manager's gun) and copium ×1.

### 4.3 The set: Radbro Webring pins

- There are six enamel pins, one per Radbro, two per room: R1 #723 and #652, R2 #4764 and #2564, R3 #3171
  and #250.
- Each is a pickup `pin` with `data.pin = "<id>"`: a 6 cm disc with the Radbro's portrait
  (`/ui/radbro<id>.webp`, cut round) and a rim in its roster colour (`RADBROS[].color`). It stands
  upright and turns slowly.
- A pin counts toward its room's secret. The whole collection persists per viewer in `localStorage`
  (`radpayne.pins`), inside try/catch, and the game plays the same without it.

### 4.4 Found: chime, tally and results

- **The chime** is procedural, in the new sound block: three soft triangle notes, a minor arpeggio of
  0.35 s. It is "in his head", like the heartbeat: no bullet-time pitch and no low-pass. A pin adds a
  small metal tick.
- **The nudge** (bottom left):
  - "a secret. 2 of 3."
  - "a pin. radbro #652."
  - "all three." when the room's last one is found

  Plain lowercase, nothing else.
- **The results screen** (`ResultsScreen`):
  - a new stat card `secrets` showing `2/3`
  - under the cards, a **pins row**: six small circles in the roster colours, filled when collected (in
    any run), with a small `NEW` stamp on the ones from this run
  - The chapter total, `PINS 4/6`, sits at the row's end.

---

## 5. Easter eggs

Egg markers (`kind: "egg"`, `data: { egg, interact? }`) are drawn by a new `src/app/EggsView.tsx`. The
sim only reports E near an interactive one. None of them carry meme text.

1. **George the cat (room 1, the alley).**
   - RadRun's own George: the model (`george.glb`, 466 KB, with clips `Loaf`, `Sit_Idle`, `Happy`, `Sulk`
     and `Idle`) and his meows (`meow_happy`, 3 variants, and `meow_sulky`, 3 variants), copied into
     `public/models/george.glb` and `public/audio/sfx/meow_*.mp3`.
   - He loafs on a crate at (-19.4, 0.55, 16.8), at RadRun's render scale of 1.16.
   - **E:** he meows (happy) and plays `Happy`.
   - A gunshot landing within 4 m: he plays `Sulk` with a sulky meow.
   - He is never in the trace, like the crowd, so bullets pass him.
2. **The RadRun arcade cabinet (room 2, the vestibule, at (-19.4, 0, -3.9), facing east).**
   - A plain upright cabinet. Its screen shows RadRun's key art in attract mode: a slow pan and scanlines,
     under the club's bloom cap.
   - Its side art carries the react-three-game sticker too.
   - **E:** a short procedural chiptune, and the screen flashes.
3. **The Solscape poster (room 1).**
   - Wheat-pasted on the club wall in place of `poster-3` (x 19.0, by the queue), from Solscape's card
     art. It is rain-darkened and slightly torn, and graded down so it never outshines the neon.
   - `poster-1` (x 10.4) becomes a RadRun one-sheet.
4. **The react-three-game / prnth sticker (room 2 walk and the cabinet side).**
   - A die-cut sticker drawn once to a canvas: a small cube mark, `react-three-game`, and `prnth` under
     it. It is the credit the design spec already gives, in the world.
5. **The Milady figurine (room 2, the fire-exit landing).**
   - A 14 cm Pockit on the window ledge, sitting (`Sit_Idle`). It is Pockit #42, the bouncer's model and
     already cached.
   - **E:** a tiny squeak, and she tilts her head: an expression blink plus a 12° head tilt. Cute.
6. **The bullet-time TV (room 3, the manager's office, a small CRT on the side table at (-0.55, 0.6,
   -3.45)).**
   - On load, `EggsView` renders an 8-frame silhouette flipbook of **the player's own Radbro** doing his
     `Shootdodge` (t 0.15-0.95) into a small target. The TV loops it: a tiny grey figure diving across a
     static-grained screen.
   - **The gag:** when he is in bullet time within 6 m of the TV, the TV's figure hangs in mid-air and
     does not come down. When bullet time ends, it lands flat on its face with a tiny thud and a burst of
     static.
7. **The dev photo wall (room 3, behind the false wall).**
   - A noir evidence board: six polaroids of the Radbros (#652, #4764, #2564, #723, #3171 and #250, from
     `/ui/radbro<id>.webp`) pinned to cork and joined by red string.
   - The polaroid of the Radbro being played has a red marker circle. The labels are only the numbers.

The eggs' textures go in `public/textures/eggs/`: webp, each ≤ 150 KB.

---

## 6. Controls

| Input | Action |
|---|---|
| 1 / 2 / 3 / 4 / 5 | base gun / shotguns (press again: shotgun ↔ sawed-off) / SMGs / hand cannon / rifles (press again: rifle ↔ sniper) |
| wheel | previous / next owned weapon |
| F | melee: #4764's katana, everyone else's strike |
| G | throw a grenade |
| E | use: secret doors, George, the cabinet, the figurine |
| right mouse | bullet time; **with the sniper in hand, hold to scope** (Q stays bullet time) |

Gamepad:

- RT fires (RB no longer fires).
- LT is bullet time. With the sniper in hand, hold LT to scope, and D-pad up is bullet time.
- RB throws a grenade.
- R3 is melee. L3 stays the dive.
- D-pad down is use.
- D-pad left / right is the previous / next weapon, and LB stays next.

The pause and title key lists (`CONTROLS`) and the README's table get the new rows.

---

## 7. Simulation and determinism

- **Everything that affects gameplay stays in the sim, on `g.rng`**: drops and their landing, pierce,
  grenades (flight, bounces, fuse, blast), melee, zoom, secrets, secret doors, breakables, banked ammo
  and the enemy arms.
- **View-only:** poses, the IK, the camera, pickup looks, eggs, George and the TV. The sim reports E near
  an egg and nothing more.
- **`InputFrame`** gains `melee`, `throw` and `interact` (edges) and `zoom` (held). `emptyInput()`
  defaults them to false, so old input logs replay unchanged.
- **New state:**
  - `Player`: `grenades`, `meleeT`, `throwT`, `zoom`, `banked`
  - `Enemy`: `weapon` override, `knockT` / `knockX` / `knockZ`, `flee`
  - `Game`: `grenadesLive[]`, `found`, `opened`, `broken`
  - `Projectile`: `pierce`, `skip`
- **New events:** `throw`, `bounce`, `explode`, `melee`, `secret`, `open`, `break`, `interact`, `zoom`.
- **`Resume`** gains `grenades`, `banked`, `found`, `opened` and `broken`.
- **`hash()`** adds the grenade count, live grenade positions, the found count and `zoom`. There are no
  golden hashes, since the replay test compares two runs.
- **`TraceHit`** gains `node`. `trace()` gains an optional `exclude` actor, for pierce.

---

## 8. Sound

### 8.1 Generated sounds

- New sounds are **generated sound effects, built in layers like the gun rework**: a transient (the
  crack or click), the body (the boom), the mechanism, and the tail (room or street).
- The layers are generated separately and mixed offline. They stay in the assets folder outside the repo,
  under `radpayne-assets/arsenal/`. The generation scripts read their key from a local env file and never
  print it.
- Only the mixed finals are copied into `public/audio/sfx/` under the new names below.
- **Budget: 6,000 generation credits at most.** Plan on about 50 generations. Read the balance before
  and after the first call to learn the real cost, and stop at the cap.

### 8.2 The finals

These are all new names; no existing file changes:

- `handcannon_shot` (1-3), `handcannon_mag_out`, `handcannon_mag_in`, `handcannon_slide`
- `sawedoff_shot` (1-2), `sawedoff_open`, `sawedoff_shells_out`, `sawedoff_shell_in`, `sawedoff_close`
- `sniper_shot` (1-2), `sniper_bolt`, `scope_in`, `scope_out`
- `grenade_pin`, `grenade_throw`, `grenade_bounce` (1-2), `grenade_explode` (1-2)
- `katana_draw`, `katana_slash` (1-2), `katana_hit`, `melee_swing`, `melee_hit` (1-2)
- `plywood_break`, `secret_door`
- `meow_happy` / `meow_sulky`: copied from RadRun, not generated

**Procedural sounds** (no files): the secret chime, the pin tick, the arcade jingle, the figurine
squeak, the TV thud and static.

**The rifle** plays the AK's sound. The gang's sniper and hand cannon use the same finals with the
gang's gain and distance rules.

### 8.3 `sfx.ts` stays additive

The gunshots branch is redoing every existing gun sound in `src/audio/sfx.ts`. This work only
**appends** a block at the end of that file:

- its own `ARSENAL_FILES` list and loader, sharing the private buffer map and `play()`, and going
  through the world bus so bullet time pitches and filters them
- an exported `sfxArsenal` with `shot(weapon, …)`, `reload(weapon, dur)`, `grenade(kind, …)`,
  `melee(kind, hit)`, `secret(pin)`, `meow(mood)`, `egg(kind)` and `door()`

`shot()`, `reload()` and the existing `FILES` lines are not touched. `SimDriver.tsx` routes new weapons
to `sfxArsenal` with one early branch at the top of its `shot` and `reload` cases, and maps
`rifle` → `ak` when it calls the existing `sfx.shot`.

---

## 9. Files and merge notes

**New:**

- `src/anim/ik.ts`, `hold.ts`, `katana.ts`
- `src/app/PickupsView.tsx`, `EggsView.tsx`, `ArsenalFx.tsx` (grenades, blasts, slash ribbons)
- `src/ui/hud/GrenadeStock.tsx`, `ScopeOverlay.tsx`
- `tools/levels/arsenal.ts`: the per-room additions. The room tools import it.
- `tools/arsenal-levels.ts`: applies those additions to the existing JSONs idempotently.
- `tools/holdcheck.ts`
- `test/ik.test.ts`, `test/arsenal.test.ts`, `test/secrets.test.ts`
- `public/models/george.glb`
- `public/textures/eggs/*`
- `public/audio/sfx/<new names>.mp3`

**Changed:**

- Sim and combat:
  - `src/combat/weapons.ts`, `trace.ts`
  - `src/sim/game.ts`, `actors.ts`, `player.ts`, `tuning.ts`, `types.ts`, `bot.ts`
  - `src/ai/goon.ts`, `heavy.ts` (enemy arms, grenade avoidance)
  - `src/world/level.ts` (`secret` / `egg` kinds, door and breakable data)
  - `src/input/input.ts`
- Animation and views:
  - `src/anim/grips.ts` (`LONG_HOLD`, per-gun geometry), `rig.ts`
  - `src/app/guns.ts` (four new models, a grenade, a katana, the player's longer front)
  - `src/app/PlayerView.tsx` (the hold, the wrist aim, melee, throw, scope fade), `CameraView.tsx`
    (long-gun camera, scope)
  - `src/app/EnemiesView.tsx`, `HeavyView.tsx`
  - `src/app/PropsView.tsx` (secret doors, breakables), `FxView.tsx` (pickups move out)
  - `src/app/look/club.tsx` (the mirror ball falls), `look/read.tsx` (tracer weights)
  - `src/app/SimDriver.tsx`, `director.ts`, `PlayPage.tsx` (dev `?radbro=`, `?holdcheck=`,
    `?loadout=` with every id), `warmup.ts` (preload the new models)
- HUD and screens:
  - `src/ui/store.ts`
  - `src/ui/hud/WeaponTabs.tsx`, `AmmoPanel.tsx`, `BottomLeft.tsx`, `captions.ts`, `tokens.css`
  - `src/ui/Hud.tsx`, `screens.tsx`
- Levels:
  - `tools/room1.ts`, `room2.ts`, `room3.ts`
  - `public/levels/room1.json`, `room2.json`, `room3.json`
- `README.md`

**Shared with other branches (merge with care):**

| File | Also touched by | How to keep the merge easy |
|---|---|---|
| `src/audio/sfx.ts` | the gunshots rework | an appended block only; no edits to existing lines |
| `src/app/SimDriver.tsx` | the gunshots rework | one early branch per case, nothing rewritten |
| `public/audio/sfx/` | the gunshots rework | new file names only |
| `src/app/director.ts` | the door-voices branch | two hint strings and one condition; no new lines |
| `src/app/PlayPage.tsx`, `warmup.ts` | main (loading) | dev params and the preload list only |
| `src/app/PlayerView.tsx`, `CameraView.tsx`, `FxView.tsx`, `look/*.tsx` | main (graphics) | scoped edits; the pickups leave `FxView` in one block |
| `public/levels/*.json`, `tools/room*.ts` | possibly main | additions via `tools/levels/arsenal.ts`, applied by the idempotent patcher |

`room1.json` and `room2.json` are byte-identical to their tools' output today. `room3.json` differs
only by the material textures of 9702bd8, so those go back into `tools/room3.ts` first. Then regenerate,
or patch.

---

## 10. Tests and checks

- **`test/ik.test.ts`** (synthetic bone chains, no GLB):
  - the two-bone solve reaches targets inside its reach to within 1 mm
  - it clamps outside its reach
  - it keeps the elbow on the pole's side
  - it sets the end's world rotation exactly
  - it splits the twist
- **`test/arsenal.test.ts`:**
  - every new weapon's magazines, intervals, reloads and cones
  - the sawed-off's two barrels
  - the hand cannon's pierce, both hitscan and in bullet time, with the same result
  - the sniper: zoom and cone, and the scope dropping on a swap
  - slot categories and cycling; keys 2 and 3 unchanged
  - drops per kind, the first time and after; banked 9 mm; perch drops landing on the ground
  - #250 and the rifle
  - grenades: arc and landing point, bounces, fuse on world time, blast falloff, the line-of-sight rule,
    self-damage, stagger
  - melee: reach, arc, katana against strike, knock-back
  - a replay with grenades and melee, bit-exact
- **`test/secrets.test.ts`:**
  - each room's secret count (3, 3, 3)
  - the volumes fire once
  - a secret door opens on E only in range and facing
  - a breakable breaks at its HP and drops its item
  - `Resume` keeps found / opened / broken
  - `check-level` passes for rooms 1-3
- **Updated:** `round2.test.ts`'s `SLOT_ORDER.map(slotOf)` assertion (the new order). The other round-2
  and AK assertions hold.
- **The smoke bots** clear rooms 1-3 on their seeds, including the chain run.
- **`tools/holdcheck.ts`** passes on all six rigs × shotgun / rifle (and AK) / sniper, and the shots are
  saved (1.7).
- **Browser checks**, each in its own throwaway Chromium profile:
  - one per new weapon's view: a `?loadout=` with that gun and `?botgun=`
  - the scope
  - a grenade in bullet time
  - #4764's katana
  - each room's secrets and eggs, with `?cam=` markers placed at each one

---

## 11. Order of work

1. **The hold.** `ik.ts`, `hold.ts`, the `PlayerView` rework, the one-handed wrist aim, the long-gun
   camera and the player's longer front, `?holdcheck` and `tools/holdcheck.ts`, and the per-rig shots.
   This is what the owner asked for last, and it ships on its own before the rest.
2. **The arsenal.**
   - Weapons, slots and input.
   - Drops and pickups, with the new look.
   - Models and views.
   - Grenades and melee, the katana split, and the enemy arms.
   - HUD.
   - Sounds.
   - The bot.
   - Tests.
3. **Secrets and eggs.** Levels (the tools and the patcher), the sim mechanics, `PropsView`, `EggsView`
   and the results screen.
4. **README, smoke runs, browser checks.**

**Out of scope this round:**

- new narrator or bark lines
- molotovs (grenades cover the throw)
- a radial weapon wheel (the mouse wheel and number keys cover it)
- the sniper bullet chase (a stretch goal, 3.2)
- rooms 4-5 content
