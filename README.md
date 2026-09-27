# RadPayne

A third-person noir shooter in the browser. You play a Radbro who got rugged and shoots his way into
a Milady gang's rave in bullet time: dual pistols, slow motion, shootdodges, and a final-kill cam.

> they took everything I had. I went back for it.

**Status:** chapter 1, second round. The opening plays start to finish: title, the comic-panel
cutscene with the narrator, then room 1, the rainy Manhattan street outside CLUB MILADY (puddle
reflections, neon bloom, rain that slows in bullet time). Clear the Milady goons, watch the last bullet
land, walk to the club door, and the ending panels take you inside: room 2, the rave. The dance floor is
full, and only some of the girls are armed. The first shot kills the music, the crowd runs, the work
lights come up, and the backup charges in with SMGs. Cutscene 2 follows, then room 3, the back of the
house: a service corridor where the first rival Radbro comes round the corner with a pump shotgun, a
storage room, a locked office door you go through with a shootdodge, the security office with the dual
SMGs, the manager's office behind glass and the service elevator. To be continued: the elevator.

**The arsenal:** every hostile drops the gun she carried, and guns lie in the rooms from the first street
on: the hand cannon, a sawed-off, an assault rifle, a sniper rifle with a scope, frag grenades, #4764's
katana (a strike with the gun for everyone else). Each room hides three secrets, two of the six Radbro
Webring pins among them, and a few easter eggs; the results count what you found.

## Play

```bash
npm install
npm run dev        # http://localhost:4880
```

Pick a Radbro and a difficulty, then press **PLAY**. Click the game to lock the mouse.

| Input | Action |
|---|---|
| WASD | move (you run and strafe relative to where you aim) |
| Mouse / left button | aim / fire (hold for the dual pistols' 0.12 s rhythm) |
| Right button or Q | bullet time (10 s meter; kills refill it) |
| Shift | shootdodge: a 0.9 s slow-motion dive; shoot while in the air |
| Space | jump (clears low cover) |
| R | reload |
| H | copium (+35 HP over 1 s, carry up to 8) |
| 1-5 / wheel | weapon by kind: 1 the dual pistols (#250: his AK), 2 the shotgun / sawed-off, 3 the dual SMGs, 4 the hand cannon, 5 the rifle / sniper. Press a key again for its twin |
| Right button (sniper in hand) | hold to scope (Q stays bullet time) |
| F | melee: #4764 draws his katana, everyone else strikes with the gun |
| G | throw a grenade (it lands where you aim, 3-20 m) |
| E | use: secret doors, the cat, the arcade cabinet |
| Esc | pause |

A gamepad also works: left stick to move, right stick to aim, RT to fire, LT for bullet time (with the
sniper in hand hold LT to scope; d-pad up is bullet time then), B to dive, A to jump, X to reload, Y for
copium, RB to throw a grenade, R3 for melee, d-pad down to use, d-pad left / right or LB for the weapon.

Walk over a gun to take it (the first one of a kind, then its ammo). The gang's pistols feed your SMGs
with 9 mm, banked until you have them. The hand cannon and the sniper put a round through a body into
the next one.

The cutscenes: click, Space or Enter turns the page, Esc skips the rest.

After you land from a dive you lie prone and can keep shooting. Press a move key to get up (0.6 s). If
you hold a move key as you land, you roll straight into a run. Kill the whole room, watch the last
bullet land, then walk to the club door.

In the back of the house, a locked door does not open: shootdodge through it. The room behind it runs
in slow motion for a moment and wakes late. Wait too long in front of it and the heavy inside kicks it
open himself. Clearing the security office is a checkpoint: dying after it retries from there.

## Develop

```bash
npm test           # node --test: time scale, weapons, hitboxes, projectiles vs hitscan, AI, the breach, checkpoints, replay, smoke bots, kill-cam framing
npm run typecheck
npm run build      # production build in dist/
npm run greybox    # regenerate public/levels/greybox.json
npm run check-level [room]   # parse a level like the game does and list its markers and issues
node tools/room1.ts      # regenerate public/levels/room1.json (overwrites hand edits made in the editor; room2.ts / room3.ts likewise)
node tools/textures.ts   # re-bake the procedural tiling textures in public/textures (needs ImageMagick)
```

- **Levels** are engine prefabs in `public/levels/<room>.json`. Open `/?editor=<room>` on the dev server
  to edit one in the engine's editor. **Save** writes the file back and runs the level check.
  - Every box becomes a collider, except under a node with Data `{collider: false}` (room 1's `decor`
    group: signs, awnings, fire escapes, the far blocks and the skyline).
  - Nodes with a Data `marker` field are gameplay markers: `spawn`, `enemy`, `cover`, `waypoint`,
    `pickup`, `trigger`, `checkpoint`, `exit`, `light`, `fx` (steam / drips) and `camera`.
    `src/world/level.ts` lists the fields each one takes. An enemy with `perch: true` holds its spot
    (fire escapes, VIP booths). Enemy kinds: `goon` (pistol, cover and peek), `rusher` (SMG, charges
    and strafes) and `heavy` (a rival Radbro with a pump shotgun, a red laser-sight tell, staggers).
    Room 2 adds `crowd` (non-hostile dancers in an area: they flee at the first shot) and `crowdExit`.
    Room 3 adds `deaf: true` (behind a closed door: gunshots and shouts do not wake her), `hold: true`
    (a heavy that never walks), the trigger action `breach` (`{door, group}`: a dive into that door
    inside the trigger takes it out; the group behind it wakes) and the trigger conditions
    `afterKills: N` / `whenClear: <group>`. A group waits unseen only when a `spawn` trigger names it.
    A `checkpoint` trigger (`at`: a checkpoint marker) saves the room; a retry resumes from it.
  - The arsenal (`docs/specs/2026-09-26-arsenal-secrets.md`): an enemy's `weapon` (`sniper` for a goon,
    `handcannon` for a heavy) and `drop` (default: the gun she carries); `pickup` items are the keys of
    `PICKUPS` in `src/combat/weapons.ts` plus `copium` and `pin` (`{pin: "<radbro id>"}`), and
    `behind: <node>` keeps one until that secret door or breakable is out of the way. `secret` is a
    volume marker (`{name, via?: "break"}`); a box with Data `{secretDoor, open: "swing" | "slide",
    hinge?, slide?, mesh?}` opens on E, one with `{breakable: hp, drop?, amount?, secret?}` breaks under
    fire, melee and grenades; `egg` markers (`{egg, interact?}`) are drawn by `src/app/EggsView.tsx`.
    The rooms' additions live in `tools/levels/arsenal.ts` (the room tools apply them; `node
    tools/arsenal-levels.ts` patches the JSONs in place, idempotently).
  - Room 1's look (`src/app/look/street.tsx`) reads material names: `wet <k>` for reflective ground,
    `lit <gain>` for facades whose lit windows glow, and `glow <gain>` for neon, with `pulse` (the
    club's bass), `flicker` or `blink` added. Change the gain in the editor to retune a sign.
  - Room 2 (`node tools/room2.ts`) is the rave; its look (`src/app/look/club.tsx`) adds `party`,
    `worklight`, `ledfloor` and `ledwall` to the shared tokens (`src/app/look/tokens.ts`).
  - Room 3 (`node tools/room3.ts`) is the back of the house; its look (`src/app/look/backrooms.tsx`)
    uses `glow` (+ `flicker`) under cool fluorescent light. The breach door, the glass wall and the
    elevator doors are drawn and moved by `src/app/PropsView.tsx`; the sim keeps their colliders
    (invisible boxes with Data `{camera: true}`, so the camera still stops at them).
- **Readability comes before the effects.** The fight is 23-46 m out, so room 1 keeps it legible
  (`READ` in `src/app/look/street.tsx`, `COMBAT` in `src/app/look/read.tsx`):
  - Goons: a bright edge with a dark keyline, and from range a solid, slowly breathing silhouette.
    Neon near a goon on screen dims, and everything past the fight (~46 m) is dimmer.
  - Gunfire has one colour code: gold / white is yours (flashes, bullets, where your shots land),
    red is theirs (muzzle flashes, tracers, bullets). Their misses kick up only dull grit.
  - Rain, bloom and puddle reflections stay subtle by default. The goon outlines and the gold vs red
    gunfire stay on in every graphics setting.
  - The rave has no rain and no reflections, a thin haze and a gentle bloom. The lasers fade out
    around the crosshair and switch off with the first shot, when the LED floor and wall dim and
    warm work lights come up. Armed girls get a thin pink-red rim; the crowd is desaturated, holds
    cyan glow sticks and is never a target (bullets pass through them).
  - The back rooms have almost no haze and mid-dark walls under flat white light; every hostile keeps
    the pink-red rim and outline. The outline never draws over the player's own body.
  - The final-kill cam keeps posts, pillars and steam away from its lens; when the bullet's path runs
    through steam it skips the chase and holds on the victim.
- **Graphics settings** (pause menu, Display; the preset is on the title too), saved in the browser:
  - Presets: Low (no bloom, no puddle reflections, a light drizzle, 75 % resolution, a smaller rave
    crowd and fewer lasers), Medium (subtle bloom, a plain wet road, thin rain; the default on the WebGL2
    fallback), High (subtle bloom, soft reflections, thin rain; the default with WebGPU) and Cinematic
    (the original bloom and the sharp half-res mirror puddles, thin rain). MSAA stays on in all of them
    (without it the thin neon letters break up).
  - Or one control at a time: Bloom (Off / Subtle / Original: the first night's glow, with its
    full-strength shop windows, exposure, blue grade, vignette and haze), Reflections (Off / Soft / Sharp),
    Rain (Off / Thin / Light: a drizzle; never denser than the thin default) and Resolution (50-100 %;
    75 % never drops under the screen's own pixels, so the thin neon stays whole on a standard screen).
  - Changing one applies at once. Turning the puddle mirror on or off recompiles the street's shaders
    in the background, so the picture holds for a moment.
- **Loading:** the title only needs the page. The room's shaders compile in the background while the
  title is up (the street fades in behind it), and PLAY works at once. The Radbro files, the gang's
  models and the sounds load behind the title and cutscene 1, and each room gets ready (its gang, its
  shaders, its sounds) under the cutscene before it: rooms 2 and 3 swap in behind the ending panels and
  cutscene 2. A loading card only shows what is still not there when the panels end (or are skipped).
  The later rooms' sounds and clips load while room 1 plays. Files in `public/` (the fonts too) are
  fetched by content-hashed URLs and cached for good (`vercel.json`); the Pockit models are
  kept in the browser's cache, and each visit's gang mixes girls already there with a couple of new ones.
- **Dev URL flags:**
  - `?room=<id>` loads a level file.
  - `?skip` skips the title and the cutscenes (`&cutscene` plays cutscene 1 anyway, `&ending` the
    ending).
  - `?bot` lets a bot play the room (`?bot=demo`: it also pops bullet time, shootdodges once and
    watches the whole kill cam).
  - `?seed=N` fixes the seed.
  - `?hitboxes` shows the hit skeletons.
  - `?markers` shows the level markers.
  - `?milady=0` uses stand-ins instead of the Pockit models.
  - `?webgl2` forces the WebGL2 renderer.
  - `?gfx=low|medium|high|cinematic` picks a graphics preset for one page load (`?q=low` = Low).
  - `?cam=<camera marker>` holds the camera on a shot (room 1: `cam-wide`, `cam-club`, `cam-canyon`;
    room 2: `cam-floor`, `cam-dj`; room 3: `cam-hall`, `cam-store`, `cam-door`, `cam-office`,
    `cam-manager`, `cam-lobby`).
  - `?loadout=shotgun,sniper` starts with those weapons (any weapon id; the last one in hand),
    `?grenades=N` with N frags.
  - `?radbro=<id>` plays that Radbro for one page load.
  - `?holdcheck=<weapon id>` runs the hold check: an empty street, that gun in hand,
    and a scripted player instead of the input (`src/app/dev/holdcheck.ts`, `window.__holdcheck`).
  - `?bot&tour` is the arsenal tour: the bot fights on each new gun in turn, then walks the room's
    secrets and eggs once it is clear (`src/app/dev/tour.ts`; `tools/tour.ts` shoots it).
  - `?look=fight` holds the club in its fight lighting; `?extra=heavy` adds a heavy by the staff door
    (`?cam=cam-heavy`); `?still` hides the click-to-fight veil (for screenshots without the bot).
  - `?fx=clean` is the old Effects: Clean for one page load (no bloom, no puddle mirror, the drizzle, at
    full resolution; `?fx=full`: High). Works in production builds too.

The simulation runs at a fixed 120 Hz and is deterministic for a given level, seed, difficulty and
input log. Bullet time is a time scale on it.

- **Assets** (all generated outputs, web-ready):
  - `public/models/radbro<id>.gun.glb`: the shooter clip set per Radbro (aimed idle / walk / back /
    strafe / run, Shootdodge -> Prone_Idle -> Prone_GetUp, Land_Roll, Hit_Small, Reload, cover crouch,
    four deaths). `milady.gun.glb` is the same set as the source the Miladys are retargeted from.
    Pistol grip offsets per hand: `src/anim/grips.ts`.
  - **How he holds the guns.** Every gun sits in the palm at the clip set's grip and is never turned
    inside the fist. The pistols and SMGs aim with the arms and a bend of the wrist. The long guns (the
    shotgun, #250's AK) are shouldered as the long-gun clips hold them (`src/anim/hold.ts`): the game
    places the gun (turned about the butt onto the crosshair, or a low ready when he is not shooting:
    muzzle down and out, the chest turned a little to his right) and both hands are solved onto it
    every frame with two-bone arm IK (`src/anim/ik.ts`): the right hand on the grip, the left on the
    pump or handguard, riding the clips' pump rack and shell feed. The AK's mag change is a scripted
    left-hand path. While a long gun is out the shoulder camera sits further out to his right, closer
    and lower (`LONG_CAM` in `src/app/CameraView.tsx`); shouldered (shooting, bullet time) it comes
    closer, wider and lower still, and in a dive or prone it climbs and he rolls onto his left side, so
    the gun under his cheek clears the big head and hair. The crosshair still marks exactly where shots
    go. The rifle and the sniper take the same hold; the hand cannon and the sawed-off are one-handed
    (the left arm drops to a guard). The new guns are procedural (`src/app/guns.ts`).
  - The arsenal's sounds (`public/audio/sfx/handcannon_*`, `sawedoff_*`, `sniper_*`, `scope_*`,
    `grenade_*`, `katana_*`, `melee_*`, `plywood_break`, `secret_door`) are generated layers mixed
    offline; George's meows (`meow_*`) and `models/george.glb` come from RadRun. The block at the end of
    `src/audio/sfx.ts` plays them (a missing file falls back to the round-1 / round-2 samples).
  - `public/textures/eggs/`: the posters and the arcade cabinet's screen.
  - `public/audio/`: `sfx/`, `music/` (calm street + fight loops), `voices/narrator/` (the Radbro's
    low, tired noir voice-over), `voices/radbro/` (his grunts, breath and last words in the fight) and
    the two high Milady voices in `voices/goon_a|goon_b/`. `src/audio/sfx.ts` plays them;
    `src/app/director.ts` runs the barks (chances and cooldowns at the top) and the narrator's
    tutorial lines.
  - The guns (`GUNS` at the top of `src/audio/sfx.ts`): each of his guns has its own dry shots
    (`pistol_shot*`, `ak_shot*`, `shotgun_shot*`, `smg_shot*`) and a tail per room (`*_tail_street`,
    `*_tail_club` / `*_tail_backrooms`, or `*_tail_room` for both indoor rooms). The pistols' and the
    shotgun's tail starts with every shot; the SMGs' and the AK's plays when the trigger is let go.
    The gang has its own darker shots (`enemy_pistol*`, `enemy_smg*`, `enemy_shotgun*`). In bullet
    time his own shots stay brighter than the world and the pistols and the AK get `pistol_bt_boom`
    under them. `window.__rp.guns` lists the gun samples that played (a tail when it rings out).
  - `public/cutscenes/c1.json` + `c1/panel_*.webp`: cutscene 1's comic panels, each with its caption
    box position, voice lines and hold time. `e1.json` + `e1/panel_e*.webp`: the room 1 ending (the
    first clear, after the walk to the door, voiced). `c2.json`: cutscene 2 after the rave. A line
    with a `speaker` plays that voice instead of the narrator's (the girls at the door and on the
    floor, the DJ through the door); a panel's lines play in order, one after another. A panel's
    `maxW` / `size` keep a long caption off the faces, and `push` (the push-in's end scale) keeps the
    caption box inside the frame through a long hold.
  - Round 2: `radbro<id>.r2.glb` (the shotgun set, the heavy's stagger, the weapon swap),
    `milady.r2.glb` (the crowd's dances, flee and cower, the DJ), `rival652.glb` / `rival723.glb`
    (the heavies), `textures/club/`, `textures/backrooms/`, and the music, crowd, PA and heavy voices.
- **Headless check:** with the dev server up,
  `RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=1 RADPAYNE_CUTSCENE=1 node tools/smoke.ts
  "http://localhost:4880/?bot=demo&seed=1&webgl2" .local/shots/run` plays title -> cutscene, then the
  bot clears the room, and saves screenshots. `?bot=demo&cutscene&seed=1&webgl2` does it in one go:
  cutscene 1, the fight, the ending, the results, with every panel shot and the voice lines listed.
  From room 1 the chain runs on through room 2, cutscene 2 and room 3 to the results
  (`RADPAYNE_MAX_S=620` gives it the time).
  `RADPAYNE_GPU=1` uses the machine's GPU (WebGL2); without it Chromium falls back to SwiftShader
  (very slow).
- **Hold check:** with the dev server up, `RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/holdcheck.ts
  http://localhost:4880 [rigs] [guns] [states]` walks every Radbro through stand, aim up / down, turn,
  walk, back-pedal, strafe, run, fire, reload, jump, dive, prone, get-up and roll with each long gun. It
  prints the grip error, the left palm's distance to the gun, the wrist bend, elbow flips and the gun's
  visible pixels from the gameplay camera, and saves a gameplay shot and a close-up per state in
  `.local/shots/hold/`. It fails a shouldered state (fire, bullet time, dive, prone) under 1,200 px.
- **Arsenal tour:** with the dev server up, `RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/tour.ts
  "http://localhost:4880/?bot&tour&seed=1&webgl2&room=room1&loadout=handcannon,sawedoff,rifle&grenades=3"
  .local/shots/tour1` shoots the first shot with each gun, a melee, a grenade, the scope, the drops
  picked up, and each secret, door and egg.

## Use it

RadPayne is under the [Viral Public License](LICENSE), the same license as Milady, Remilio and
react-three-game. Fork it, remix it, ship your own version, sell it; no credit needed. Anything made
from it keeps the license. The four Radbros are also free to use on their own, as rigged and animated
models: [dexedrne/radbros-3d](https://github.com/dexedrne/radbros-3d).

The license covers what is in this repo. It does not cover the Pockit Milady models: they are prnth's,
they load at runtime from his repo, and they are not part of this one. Ask him before using them in
your own thing.

## Credits

- Built on [react-three-game](https://prnth.com/react-three-game/) by prnth, used with his permission.
- The Milady gang are [Pockit](https://github.com/prnthh/Pockit) models by prnth, used with his
  permission. They load at runtime from one pinned commit and are not part of this repo.
- Radbros #652, #4764, #2564 and #723 are dexedrne's own, used with permission from the Radbro Webring
  dev. The models come from RadRun.
- Fonts: Bebas Neue by Dharma Type and Courier Prime by the Courier Prime Project Authors, under the
  SIL Open Font License 1.1 (the licences are next to the files in `public/fonts`).
- By [@dexedrne](https://x.com/dexedrne).
