# RadPayne

A third-person noir shooter in the browser. You play a Radbro who got rugged and shoots his way into
a Milady gang's rave in bullet time: dual pistols, slow motion, shootdodges, and a final-kill cam.

> they said wagmi. they lied.

**Status:** chapter 1, first round. Room 1 is playable with the core mechanics: the rainy Manhattan
street outside the Milady rave, with puddle reflections, neon bloom and rain that slows in bullet time.
The pistol animations and the other rooms come next.

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
| 1-3 / wheel | weapon |
| Esc | pause |

A gamepad also works: left stick to move, right stick to aim, RT to fire, LT for bullet time, B to dive,
A to jump, X to reload, Y for copium.

After you land from a dive you lie prone and can keep shooting. Press a move key to get up (0.6 s). If
you hold a move key as you land, you roll straight into a run. Kill the whole room, watch the last
bullet land, then walk to the club door.

## Develop

```bash
npm test           # node --test: time scale, weapons, hitboxes, projectiles vs hitscan, AI, replay, smoke bot
npm run typecheck
npm run build      # production build in dist/
npm run greybox    # regenerate public/levels/greybox.json
npm run check-level [room]   # parse a level like the game does and list its markers and issues
node tools/room1.ts      # regenerate public/levels/room1.json (overwrites hand edits made in the editor)
node tools/textures.ts   # re-bake the procedural tiling textures in public/textures (needs ImageMagick)
```

- **Levels** are engine prefabs in `public/levels/<room>.json`. Open `/?editor=<room>` on the dev server
  to edit one in the engine's editor. **Save** writes the file back and runs the level check.
  - Every box becomes a collider, except under a node with Data `{collider: false}` (room 1's `decor`
    group: signs, awnings, fire escapes, the far blocks and the skyline).
  - Nodes with a Data `marker` field are gameplay markers: `spawn`, `enemy`, `cover`, `waypoint`,
    `pickup`, `trigger`, `checkpoint`, `exit`, `light`, `fx` (steam / drips) and `camera`.
    `src/world/level.ts` lists the fields each one takes. An enemy with `perch: true` holds its spot
    (fire escapes).
  - Room 1's look (`src/app/look/street.tsx`) reads material names: `wet <k>` for reflective ground,
    `lit <gain>` for facades whose lit windows glow, and `glow <gain>` for neon, with `pulse` (the
    club's bass), `flicker` or `blink` added. Change the gain in the editor to retune a sign.
- **Dev URL flags:**
  - `?room=<id>` loads a level file.
  - `?skip` skips the title and the cutscene.
  - `?bot` lets a bot play the room.
  - `?seed=N` fixes the seed.
  - `?hitboxes` shows the hit skeletons.
  - `?markers` shows the level markers.
  - `?milady=0` uses stand-ins instead of the Pockit models.
  - `?webgl2` forces the WebGL2 renderer.
  - `?q=low` switches to low quality.
  - `?cam=<camera marker>` holds the camera on a shot (room 1: `cam-wide`, `cam-club`, `cam-canyon`).
  - `?fx=clean` starts with Effects on Clean (also in the pause menu): no rain near the camera, no
    bloom, a plain wet sheen instead of the puddle reflections. Works in production builds too.

The simulation runs at a fixed 120 Hz and is deterministic for a given level, seed, difficulty and
input log. Bullet time is a time scale on it.

## Credits

- Built on [react-three-game](https://prnth.com/react-three-game/) by prnth.
- The Milady gang are [Pockit](https://github.com/prnthh/Pockit) models by prnth, loaded at runtime from
  one pinned commit.
- The Radbros come from RadRun.
- By [@dexedrne](https://x.com/dexedrne).
