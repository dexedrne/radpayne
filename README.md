# RadPayne

A third-person noir shooter in the browser. You play a Radbro who got rugged and shoots his way into
a Milady gang's rave in bullet time: dual pistols, slow motion, shootdodges, and a kill cam.

> they took everything I had. I went back for it.

**Status:** chapter 1, complete (third round); chapter 2 playable on placeholder art and voices. The chapter plays start to finish: title, the comic-panel
cutscene with the narrator, then room 1, the rainy Manhattan street outside CLUB MILADY (puddle
reflections, neon bloom, rain that slows in bullet time). Clear the Milady goons, watch the last bullet
land, walk to the club door, and the ending panels take you inside: room 2, the rave. The dance floor is
full, and only some of the girls are armed. The first shot kills the music, the crowd runs, the work
lights come up, and the backup charges in with SMGs. Cutscene 2 follows, then room 3, the back of the
house: a service corridor where the first rival Radbro comes round the corner with a pump shotgun, a
storage room, a locked office door you go through with a shootdodge, the security office with the dual
SMGs, the manager's office behind glass and the service elevator. The elevator cutscene takes you up,
and room 4 is the ride itself:
the car stops three times and its doors open on three floors of the gang (the laundry, the gallery, an
unfinished floor they pry the doors open onto), a rival heavy drops through the roof hatch on the way,
and the cables snap before the last stop. Cutscene 3 is the penthouse and the call; room 5 is the boss,
Madame Pockit, in her big oxblood coat: three phases, her adds through two doors, heart grenades, a
chandelier over the rug. Cutscene 4 brings the bag back. TO BE CONTINUED, then the chapter's results.

**Chapter 2: Keeping Score.** Madame Pockit's phone rings on the marble; whoever calls lives higher up.
After chapter 1's results, CHAPTER 2 starts it (and once chapter 1 is cleared on this browser, the title
has a chapter select). Its intro cutscene, then room 6, the tower's roof in the storm: a helicopter off
the edge sweeps the roof with its searchlight (standing in it, they aim better; shoot the lamp out and it
leaves) and lowers two squads onto the helipad on ropes (shoot them on the way down); snipers on the water
tower and the billboard. Over a glass bridge to room 7, the sky garden under glass: the walkway over the
koi pit cracks and gives way. Room 8, the private airship a mile up: the cargo door blows and the hold
pulls everything toward the sky (run against it; the girls go out). Room 9, the counting floor above the
clouds: shutters cut the floor in two (the way round is the catwalk) and the lights go out. Room 10, the
vault at sunrise: the Countess, who keeps the score, three phases (her rifle's white laser tell: move or
dive; shooting her while she aims hurts her more, and enough breaks her aim; red security beams sweep the
floor from phase 2: dive under the high one, jump the low one), her girls through two lifts, her last
stand. Every cutscene is rhymed; the panels and voices are placeholders for now (painted tones and
captions): `docs/chapter2-assets.md` lists what is still to make. Each room hides three secrets, a gold
Webring pin and an egg.

**The arsenal:** every hostile drops the gun she carried, and guns lie in the rooms from the first street
on: the hand cannon, a sawed-off, an assault rifle, a sniper rifle with a scope, frag grenades, #4764's
katana (a strike with the gun for everyone else). Rooms 1-3 each hide three secrets, two of the six Radbro
Webring pins among them, and a few easter eggs; the results count what you found.

**#4764's katana:** he wears it on his left hip in every room and draws it for the melee: tap F (Circle)
for a cut with reach that takes up to three in its arc (no blood: ink and sparks). Hold F (Circle) and
it is his guard, the blade across his body in both hands: he moves at half speed and cannot shoot, and
rounds from the front (a 120 degree arc) glance off the blade. The guard meter by the ammo drains while
he holds it and with every round it stops, refills once it is down, and breaks when it runs out; a
round inside the first 0.2 s of raising it is a perfect parry and costs nothing. A heavy's shotgun blast
drains a lot and pushes him back; grenades, Madame Pockit's heart grenades and anything from behind are
not blocked. In bullet time the guard sends the round back: at the Milady under the crosshair, else at
the one who fired it, as his own round, and a kill with it plays the kill cam's RETURN TO SENDER. The
gang notices: the goons in front hold their fire for a beat when the guard goes up, the rushers circle
for his side, and the heavies walk in with the pump gun.

## Play

```bash
npm install
npm run dev        # http://localhost:4880
```

Pick a Radbro and a difficulty, then press **PLAY**. Click the game to lock the mouse.

**Difficulty** (the title, or the pause menu's Settings from the next restart or room; remembered):
**Chill** (the story: the first release's easy), **Normal** (the default, and tougher than the first
release: they aim better at range, hit harder, lay fire on your cover, send one round the side, lob a
frag at a spot you hold too long, fewer cans lie around and a can heals less, bullet time drains a
quarter faster and a kill refills a little more), **Hard** (all of it harder: running in the open
spoils their aim less, two flank at once; you need cover) and **Hardcore** (no second chances: one can
to start, half the cans, bullet time drains almost twice as fast). Madame Pockit keeps her own, gentler
factor on every setting.

| Input | Action |
|---|---|
| WASD | move (you run and strafe relative to where you aim) |
| Mouse / left button | aim / fire (hold for the dual pistols' 0.12 s rhythm) |
| Right button or Q | bullet time (10 s meter; kills refill it). In cover the right button pops you out instead |
| Shift | shootdodge: a 0.9 s slow-motion dive; shoot while in the air |
| C | cover: take the marked cover (a gold ring; a short run to it); in cover, a dash to the next marked cover |
| Right button (in cover) | hold: up over low cover / out round a high edge, and aim; let go: back down |
| Space | jump (clears low cover); in cover: vault over it |
| R | reload |
| H | copium (+35 HP over 1 s, carry up to 8) |
| 1-5 / wheel | weapon by kind: 1 the dual pistols (#250: his AK), 2 the shotgun / sawed-off, 3 the dual SMGs, 4 the hand cannon, 5 the rifle / sniper. Press a key again for its twin |
| Right button (sniper in hand) | hold to scope (Q stays bullet time) |
| F | melee: everyone strikes with the gun; #4764 taps it for a katana cut and holds it to guard (in bullet time the guard sends rounds back) |
| G | throw a grenade (it lands where you aim, 3-20 m) |
| E | use: secret doors, the cat, the arcade cabinet |
| Esc | pause |

**Gamepad** (PlayStation or Xbox, standard mapping; plug it in any time). The layout is the console
shooters' (PlayStation names, Xbox in brackets):

| Button | Action |
|---|---|
| Left stick / right stick | move / aim |
| R2 (RT) | fire (analog: pull past a third) |
| L2 (LT) | aim: a steadier stick and the aim assist's pull; with the sniper in hand, hold to scope |
| R3 or L3 (click a stick) | bullet time |
| R1 (RB) | shootdodge |
| L1 (LB) | cover (again, in cover: dash to the marked cover) |
| L2 (LT), in cover | hold: pop out and aim; let go: back down |
| Cross (A) | jump; in cover: vault over it |
| Square (X) | reload, or use what is in reach (a secret door, the cat, the cabinet) |
| Triangle (Y) | throw a grenade |
| Circle (B) | melee (#4764: tap for the katana cut, hold to guard) |
| D-pad left-right | weapon (next / previous, twins included; the weapon tabs show which way reaches which) |
| D-pad up / down | copium / use |
| Options (Menu) | pause |

Every screen works on the pad alone: the title (d-pad or left stick to choose, Cross to play), the fight
prompt (Cross), the cutscenes (Cross next, Circle or Options skip), the pause menu and its settings
(Circle back, L1 / R1 pages), the results, TO BE CONTINUED; any button skips a kill cam. Every prompt,
hint and controls list follows the device used last: a pad button shows that pad's glyphs (Cross /
Circle / Square / Triangle for a Sony pad, A / B / X / Y otherwise), a key or a click brings the keys
back. Pause menu, Controls, GAMEPAD: **Stick sensitivity**, **Invert Y (stick)** (the mouse keeps its
own), **Dead zone** (radial, 5-30 %, default 12 %), **Vibration** (light: your shots, hits on you,
landings; where the browser has dual-rumble) and **Aim assist** Off / Low / Normal (the default): near
a Milady you can see, the stick slows down, and holding L2 (or firing) pulls the aim lightly onto her.
Never through a wall, never onto the dead, and the mouse never gets it. The pad feeds the same input
frames as the keys, so a recorded log replays the same whatever played it.

Walk over a gun to take it (the first one of a kind, then its ammo). The gang's pistols feed your SMGs
with 9 mm, banked until you have them. The hand cannon and the sniper put a round through a body into
the next one.

The cutscenes: click, Space or Enter turns the page, Esc skips the rest (the pad: Cross, Circle).

After you land from a dive you lie prone and can keep shooting. Press a move key to get up (0.6 s). If
you hold a move key as you land, you roll straight into a run. Kill the whole room, watch the last
bullet land, then walk to the club door.

**Cover** (Max Payne 3-style, it works in bullet time too). Near something waist high or a wall's edge,
a gold ring marks the cover: C (L1) takes it, from a step away or with a short low run to one you
are looking at. Behind low cover you tuck down under its top; behind high cover you stand at its edge.
Slide along it with the move keys; hold the right button (L2) to come up over it or step out round
the edge and aim, let go to duck back (the camera moves to your left shoulder at a left-hand edge).
Fire without popping out and you blind fire: the gun over the top or round the edge, much less
accurate. Space (Cross) vaults low cover; with another cover marked in view, C again dashes to it;
move away from it, or dive (Shift / R1), to leave. Cover really stops rounds from the front; from the
side it does nothing. The gang knows it: on Normal and up they keep firing at your cover while you hide
(stand up into it and you are hit), someone works round to your side, and after a while in one spot a
frag comes over (a red frag sign by the crosshair and a red ring on the floor) and a rusher comes in
close. They take the same cover you do, and work closer cover by cover. A first-time tutorial shows the
keys (or the pad's buttons) in your first fight.

In the elevator, the car moves on only once a floor is clear and you are back inside; each stop is a
checkpoint. Watch the roof hatch when something lands on it. At every stop the gang comes in waves from
two or three places the car cannot see (a service passage, a fire escape, a side room, a stairwell, a
service door, the hatch over your head), some straight into cover and some round to where the car's
doorway cannot cover you: the car is not a place to stay.

Madame Pockit's tells: two pink laser lines across the floor before she sweeps her SMGs (dive under it
or get behind something tall); a heart grenade held over her head before she throws it (shoot it there
and it goes off on her; a pink ring shows where a thrown one will go off); a red lamp over a door before
her girls come through it. The chandelier hangs by one chain over the white rug. Her coat soaks up body
hits until she throws it off; her head does not.

**The kill cam.** The room's last kill, and now and then a special shot (a sniper kill, a headshot past
25 m, one hand-cannon or sniper round through two bodies, a grenade that takes two), stops the fight:
the lens rides the round from the muzzle in deep slow motion with the world drained of colour, then
freezes on the impact in a noir X-ray (her skeleton glowing through a dark halftone body, the bone it
hit cracked in gold), holds a beat and snaps back; a round through two freezes on both of them. At most
one special shot every 20 s, none while Madame Pockit makes an entrance, changes phase or starts her last
stand, none while the elevator is between floors (her last kill, and every room's, always gets one); any
key skips it. Pause menu, Display: **Kill cam** Always / Special shots (the default) / Final kill only / Off.

In the back of the house, a locked door does not open: shootdodge through it. The room behind it runs
in slow motion for a moment and wakes late. Wait too long in front of it and the heavy inside kicks it
open himself. Clearing the security office is a checkpoint: dying after it retries from there.

## Develop

```bash
npm test           # node --test: time scale, weapons, hitboxes, projectiles vs hitscan, AI, the breach, checkpoints, replay, smoke bots, kill-cam framing and picks, the talk budget, the pad (layout, sticks, triggers, glyphs, aim assist, vibration, a pad-played replay)
npm run typecheck
npm run build      # production build in dist/
npm run greybox    # regenerate public/levels/greybox.json
npm run check-level [room]   # parse a level like the game does and list its markers, its derived cover and issues
node tools/balance.ts [--rooms room1,room4] [--diffs normal,hard] [--seeds 1,2,3] [--bot cover|plain]   # bot runs: deaths, health lost, copium, time, spawn kills
node tools/room1.ts      # regenerate public/levels/room1.json (overwrites hand edits made in the editor; room2.ts .. room5.ts likewise)
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
  - Chapter 2 (`node tools/room6.ts` .. `room10.ts`, on `tools/levels/kit2.ts`: cover points around the
    boxes meant as cover, waypoint grids, stairs with rails): a room's `stage` (`src/sim/stage.ts`,
    `src/sim/ch2/*`: `roof` the searchlight and rope `drops`, `garden` the glass that gives way, `airship`
    the cargo door, `counting` the shutters and the blackout, `vault` the Countess's room: its lifts'
    `waves`, the beams, the gate `lock`) starts its set pieces from trigger markers with action `setpiece`
    and a `cue`. `maxRise` (a room with floors above each other: no auto-link across more height; stairs
    link explicitly), a waypoint's `solo`. The enemy kind `countess` is the boss (`src/ai/countess.ts`,
    her numbers and the set pieces' in `src/sim/tuning2.ts`). The looks are `src/app/look/sky.tsx`, the
    moving parts `src/app/Chapter2View.tsx`, the lines `src/app/chapter2Lines.ts`, the cutscenes
    `node tools/chapter2-script.ts` (it writes `public/cutscenes/ch2a..ch2f.json` and the assets list).
    `node tools/ch2bot.ts [rooms] [seeds] [difficulty]`: the bot through each room (clear time, deaths,
    health lost, the set pieces that fired).
  - Round 3: a room's `later: [groups]` makes those groups wait unseen until the room's own mechanism
    brings them in. Room 4 (`node tools/room4.ts`) has `ride` in its settings (`src/sim/ride.ts`): the
    car (`car`, `hatch`) and the steps, legs (`t` seconds; `roof` + `group`: the heavy through the
    hatch; `cables`: the snap, the fall, the brakes) and stops (`side`, the `doors` colliders it takes
    out, the `groups` to clear, `slow` the door beat, `pry` seconds, `alert`, `checkpoint`, `last`, and
    `waves`: `[{group, after?, down?, hatch?}]`, a group brought in `after` seconds of the doors opening
    or once `down` of the stop's hostiles are down, whichever is first; `hatch`: she drops through the
    car's roof hatch). The level check lists each stop's waves and flags any that start in the car's
    sight.
    Room 5 (`node tools/room5.ts`) has `boss` (the chandelier's chain, the rug, the bag, the terrace
    door, the add `doors` and their groups, `after`: a door that lights that many seconds into phase 2:
    `src/sim/boss.ts`) and `chapterEnd`; the enemy kind
    `madame` is the boss (`src/ai/madame.ts`; her numbers are `MADAME` in `src/sim/tuning.ts`).
    Their looks are `elevator` and `penthouse` (`src/app/look/tower.tsx`); the moving parts are
    `src/app/RideView.tsx` (the gates, the landing doors, the scrolling shaft, the hatch, the cables)
    and `src/app/BossView.tsx` (her coat and second gun, the lasers, the grenades and their rings, the
    chandelier, the add doors, the glass, the screen).
  - Room 1's look (`src/app/look/street.tsx`) reads material names: `wet <k>` for reflective ground,
    `lit <gain>` for facades whose lit windows glow, and `glow <gain>` for neon, with `pulse` (the
    club's bass), `flicker` or `blink` added. Change the gain in the editor to retune a sign.
  - Room 2 (`node tools/room2.ts`) is the rave; its look (`src/app/look/club.tsx`) adds `party`,
    `worklight`, `ledfloor` and `ledwall` to the shared tokens (`src/app/look/tokens.ts`).
  - Room 3 (`node tools/room3.ts`) is the back of the house; its look (`src/app/look/backrooms.tsx`)
    uses `glow` (+ `flicker`) under cool fluorescent light. The breach door, the glass wall and the
    elevator doors are drawn and moved by `src/app/PropsView.tsx`; the sim keeps their colliders
    (invisible boxes with Data `{camera: true}`, so the camera still stops at them).
- **Cover is derived, not placed** (`src/sim/cover.ts`): every collider face with floor in front of it is
  sampled; where a capsule fits, the obstacle's height makes it low cover (0.85-1.35 m: tuck, pop up,
  vault) or high (hide, step out round an open edge). Samples in a row become segments he slides along;
  an end is an open edge when the obstacle stops there and there is room to step out. The gang's cover
  points come from the same segments (low: every ~2 m, high: at the open edges), next to any `cover`
  markers. `npm run check-level` prints each room's cover and how much of its waypoint graph has cover
  within 5 m (under 85 %: add props there; room 1 got three jersey barriers and a pallet stack that
  way). The gang's tactics against cover are `src/ai/tactics.ts`; the difficulty table is
  `DIFFICULTY` in `src/sim/tuning.ts`.
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
  - The kill cam keeps posts, pillars and steam away from its lens; when the bullet's path runs
    through steam it skips the ride and holds on the victim. Its X-ray is stylised (a clean
    skeleton, a crack line, no organs, no blood) and hides every HUD layer but its letterbox.
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
  cutscene 2, room 4 behind the elevator cutscene (once room 3's doors are open), room 5 behind
  cutscene 3. A loading card only shows what is still not there when the panels end (or are skipped).
  The later rooms' sounds and clips load while room 1 plays; from room 3 on, the elevator cutscene's
  lines (the "cs3a" group) and then rooms 4-5's own (the "end" group). Files in `public/` (the fonts too) are
  fetched by content-hashed URLs and cached for good (`vercel.json`); the Pockit models are
  kept in the browser's cache, and each visit's gang mixes girls already there with a couple of new ones.
- **Dev URL flags:**
  - `?room=<id>` loads a level file.
  - `?skip` skips the title and the cutscenes (`&cutscene` plays cutscene 1 anyway, `&ending` the
    ending).
  - `?bot` lets a bot play the room (`?bot=demo`: it also pops bullet time, shootdodges once and
    watches the whole kill cam; `?bot&blade&radbro=4764`: it plays #4764's guard, bullet time on and
    the guard up, the rounds sent back).
  - `?seed=N` fixes the seed.
  - `?hitboxes` shows the hit skeletons.
  - `?markers` shows the level markers.
  - `?milady=0` uses stand-ins instead of the Pockit models.
  - `?webgl2` forces the WebGL2 renderer.
  - `?gfx=low|medium|high|cinematic` picks a graphics preset for one page load (`?q=low` = Low).
  - `?cam=<camera marker>` holds the camera on a shot (room 1: `cam-wide`, `cam-club`, `cam-canyon`;
    room 2: `cam-floor`, `cam-dj`; room 3: `cam-hall`, `cam-store`, `cam-door`, `cam-office`,
    `cam-manager`, `cam-lobby`; room 4: `cam-car`, `cam-l1`, `cam-l2`, `cam-l3`; room 5: `cam-hall`,
    `cam-dais`, `cam-rug`, `cam-door-a`).
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

- **The kill cam** is presentation only (`src/app/cine.ts`: which kills, the timeline, `CINE` at the
  top). It holds the fight with `Session.hold`: no steps run while it plays, so the sim never sees it
  and a recorded input log replays the same with or without it; the views crawl at `CINE.crawl`
  (`Session.viewScale`). The lens is `CameraView`'s (on `killcam.ts`'s plan), the X-ray is
  `src/app/xray.ts` (the joints come from each view's rig: `xrayRigs`), projected by `CineView` and
  drawn by `src/ui/hud/XrayOverlay.tsx`; its sounds are procedural (`sfxCine` in `src/audio/sfx.ts`).
  The room's last kill keeps the sim's own final-kill cam, which plays on after the ride as the swing
  around her; Kill cam: Off skips it through the input frame (`Session.skipNext`).

- **Assets** (all generated outputs, web-ready):
  - `public/models/radbro4764.glb` wears his katana (1.03 m) on the left hip as its own rigid node
    (`Katana`, on the hips): the game splits its hilt off to hide while the blade is drawn, and the
    drawn katana (`src/app/guns.ts`) takes the same hilt.
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
    `grenade_*`, `katana_*` (the guard's too: `katana_guard`, `_deflect`, `_parry`, `_return`, `_break`,
    `_sheathe`), `melee_*`, `plywood_break`, `secret_door`) are generated layers mixed
    offline; George's meows (`meow_*`) and `models/george.glb` come from RadRun. The block at the end of
    `src/audio/sfx.ts` plays them (a missing file falls back to the round-1 / round-2 samples).
  - `public/textures/eggs/`: the posters and the arcade cabinet's screen.
  - `public/audio/`: `sfx/`, `music/` (calm street + fight loops), `voices/narrator/` (the Radbro's
    low, tired noir voice-over), `voices/radbro/` (his grunts, breath and last words in the fight) and
    the two high Milady voices in `voices/goon_a|goon_b/`. `src/audio/sfx.ts` plays them;
    `src/app/director.ts` runs the barks, her lines and the narrator under one talk budget (`TALK` at
    the top): one voice on the air at a time, at least 8 s between two lines that are not key moments,
    the gang talking mostly at the key moments (a group's first alert, a heavy's entrance and taunt, the
    first rusher's charge), the Radbro's grunts rarer and his bullet-time breath once per room. The
    narrator's story beats (a room's first and last word, the cables, her last stand) always play; his
    teaching lines (a key hint with each) play the first time ever on a browser (`radpayne.tutHeard`,
    `radpayne.linesHeard` in localStorage), at least 12 s apart and after the gap, or else only their
    hint shows; his asides (the rusher, the landings, the stairs, the brakes) only the first time ever
    with Normal. A retry does not replay a room line already heard. **Voice chatter** (pause menu,
    Sound): Normal, Less (no asides, fewer barks), or Off (combat: the narrator's story beats, the DJ's
    two cues and Madame Pockit's big lines; the hints still show). `node tools/chatter.ts
    [normal|less|off]` counts the lines per fight minute by speaker (the bot on rooms 1-5, rooms 1-3
    apart; a fake clock, seeded dice); the smoke run prints the same count from the real voices
    (`VOICE RATE`, and per room).
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
    floor, the DJ through the door); a panel's lines play in order, one after another. `cs3a.json`:
    the elevator between room 3 and room 4 (room 3's `cutsceneAfter`). A panel's
    `maxW` / `size` keep a long caption off the faces, and `push` (the push-in's end scale) keeps the
    caption box inside the frame through a long hold.
  - Round 2: `radbro<id>.r2.glb` (the shotgun set, the heavy's stagger, the weapon swap),
    `milady.r2.glb` (the crowd's dances, flee and cower, the DJ), `rival652.glb` / `rival723.glb`
    (the heavies), `textures/club/`, `textures/backrooms/`, and the music, crowd, PA and heavy voices.
  - Round 3: `textures/elevator/`, `textures/penthouse/`, `cutscenes/c3` (the call) and `c4` (the bag),
    the elevator muzak (and its failing take), the boss loop, the ride's and the boss room's sounds,
    and Madame Pockit's voice (`voices/madame/`). They are their own load group ("end",
    `src/audio/round3.ts`): rooms 1-3 never download them; they load once room 3 starts. Madame Pockit
    is Pockit #3099 (the goons never get her).
- **Headless check:** with the dev server up,
  `RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=1 RADPAYNE_CUTSCENE=1 node tools/smoke.ts
  "http://localhost:4880/?bot=demo&seed=1&webgl2" .local/shots/run` plays title -> cutscene, then the
  bot clears the room, and saves screenshots. `?bot=demo&cutscene&seed=1&webgl2` does it in one go:
  cutscene 1, the fight, the ending, the results, with every panel shot and the voice lines listed.
  From room 1 the chain runs on through room 2, cutscene 2 and room 3 to the results
  (`RADPAYNE_MAX_S=620` gives it the time); `?bot=demo&room=room3` runs room 3, room 4, cutscene 3,
  room 5 and cutscene 4 to the chapter's results, with a shot of each stop and each boss phase. The
  first four kill cams, and every last-kill and two-with-one cam after them, are shot on their ride and
  in their X-ray (`kc<n>-a-ride`, `kc<n>-b-xray`; the tour does the same), and the voice lines are
  counted per fight minute by speaker (`VOICE RATE`).
  `RADPAYNE_GPU=1` uses the machine's GPU (WebGL2); without it Chromium falls back to SwiftShader
  (very slow).
- **Pad check:** with the dev server up, `RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=1 node
  tools/padsmoke.ts "http://localhost:4880/?seed=1&webgl2" .local/shots/pad` plays with a fake
  DualSense only (`navigator.getGamepads` replaced in the page; no key, no click): the title, cutscene
  1, the fight prompt, room 1 (the bot's intent turned into sticks and buttons: the aim is the right
  stick with the aim assist, the fire is R2), the pause menu and its GAMEPAD settings, the quit to the
  title; then the same title with an Xbox pad. It shoots each screen and prints the frames the pad fed.
- **Hold check:** with the dev server up, `RADPAYNE_CHROME_PROFILE=<throwaway dir> node tools/holdcheck.ts
  http://localhost:4880 [rigs] [guns] [states]` walks every Radbro through stand, aim up / down, turn,
  walk, back-pedal, strafe, run, fire, reload, jump, dive, prone, get-up and roll with each long gun. It
  prints the grip error, the left palm's distance to the gun, the wrist bend, elbow flips and the gun's
  visible pixels from the gameplay camera, and saves a gameplay shot and a close-up per state in
  `.local/shots/hold/`. It fails a shouldered state (fire, bullet time, dive, prone) under 1,200 px.
  `node tools/holdcheck.ts http://localhost:4880 4764 pistols guard,slash` shoots #4764's katana guard
  and cut (`RADPAYNE_HOLD_VIEWS=game,side,front`).
- **Katana check:** with the dev server up, `RADPAYNE_CHROME_PROFILE=<throwaway dir> RADPAYNE_GPU=1 node
  tools/katanasmoke.ts "http://localhost:4880/?bot&blade&radbro=4764&seed=1&webgl2" .local/shots/katana`
  plays room 1 as #4764 with the blade bot and shoots the guard, the rounds off the blade, the rounds
  sent back and the RETURN TO SENDER kill cam; it fails when no round went back.
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
