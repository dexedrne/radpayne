# Level surface maps

Both builds use the same maps; react-three-game remains pinned at 0.0.113.
The explicit surface allowlist in `src/app/look/pbrProfiles.ts` excludes posters,
screens, glass/window masks, signs, transparent trim, character art and props
without tiling textures. Metalness stays authored by the level.

## Generation and packing

Run `npm run pbr-maps` with Node and ImageMagick. No downloaded art or additional
npm packages are needed. `-- --set=backrooms/wall_cinderblock` rebuilds a surface
and its shared sources; `-- --check` compares deterministic output bytes;
`-- --preview=<directory>` writes height previews outside public.
Input hashes, profiles, map sizes, shared sources and output hashes are recorded
in `docs/pbr-maps.json`.

Height is estimated from luminance, periodic high-pass filtering and coherent
joint detection. Mortar/grout and dark cavities recess; wood/metal grooves retain
broad relief; marble, fabric and asphalt have much less fine relief. Blurs and
central normal differences wrap. A narrow collar matches opposite edge values
and derivatives. OpenGL (+Y) normals use green = positive image-row height
gradient for the albedo's three.js flipY convention.

Normals are compressed 8-bit lossless WebP, method 6, quality 100. ImageMagick
also derives near-lossless preprocessing from quality, so a lower quality with
the lossless flag alone does not preserve normal components exactly.
ORM uses quality-88 WebP and linear data: R = neutral AO (255), G = roughness,
B = neutral metalness multiplier (255). There is no authored AO input; neutral
channels preserve existing ambient light and the level's metalness factors.
AO, roughness and metalness slots reference the same texture, with no separate
AO or roughness downloads.

Cinderblock and wood-panel walls retain 1024 normals for their close joints and
broad grooves. The remaining normals and every HIGH ORM are 512. LOW and mobile
still omit normal fetches and sampling, and use half-size roughness (256 ORM).
This depends on the graphics preset/device, never measured FPS. Subtle office/VIP
carpet grain and grey/black floor-marble grain share maps; shaft/bare concrete
share ORM. Structural joints, curtains, slats and other distinct relief keep
their own source-aligned normals.

## Loading and sampling

Maps load for the active level during room preparation, after PLAY/loading begins.
The title's level and actor warm-up fetches no surface maps. Maps attach only
after decoding: an overlapping actor warm-up must not compile a needsUpdate
texture whose image is still null. Room preparation waits for downloads and the
material walk before its shader warm-up. Returning to the title and changing
levels or the lite preset release retired maps after outstanding warm-up work.

Repeating standard node materials sample the albedo's world projection and UV
matrix. The projected tangent frame differentiates that same transformed UV,
including opposite wall orientations and floor/ceiling faces. Geometry normals
choose the projection plane, so relief does not move the albedo UVs. Normal
sampling retains the explicit transformed UV when Three clears the default UV
context. A shared texture uses identity UV transforms; materials supply their
albedo matrix in the shader. Only actual flipY/anisotropy differences require
separate sampler textures, so repeated/offset copies do not multiply allocations.

## Verification and captures

The maps added 24,763,886 bytes in the first pass (977b845). The reduced set adds
4,861,892 bytes: 31 normals and 30 ORM sources with HIGH/LOW variants, 91 files
shared by 33 surface sets. The download regression check counts actual shipped
files, rejects obsolete maps, and verifies every runtime map path. All 91 hashes
match. All 31 normal maps have identical opposite edge pixels and decoded
normal-length error below 0.006. Cinderblock regeneration matches byte for byte.

Run `RADPAYNE_CHROME_PROFILE=<throwaway-profile> npm run pbr-shots -- <dev-url> <output> before|after`.
Add `--passes=high,medium,cinematic,low,mobile` for every preset. Captures use the
same six fixed cameras, a seeded random sequence, paused simulation and frame
settling. They wait for crowd files and shader work, and check that LOW/mobile
fetch no normals and the title fetches no surface maps. Animated lights, weather
and crowd poses can vary; these are visual/allocation comparisons, not frame-time
benchmarks. Renderer texture totals include original material textures and render
targets. PBR allocation estimates count texture instances (RGBA8 plus mips).
Resource download observations may be zero when the browser reuses cached files;
the total shipped-byte budget above is independent of HTTP caching.

Fresh comparisons and renderer JSON live in `~/Documents/pbr-rp/shrink/`.
Historical pre-PBR reference captures at bf9b00b live in the parent directory.
The original/shrunk comparisons retain mortar, padded-wall relief and grooves.
Typecheck, all 271 tests, and both production builds pass.

| View / preset | Renderer MiB original → shrunk | Map MiB original → shrunk | Draws original → shrunk |
| --- | ---: | ---: | ---: |
| room1/high/night | 181.57 → 133.58 | 64.00 → 16.00 | 697 → 697 |
| room1/low/night | 118.12 → 112.12 | 8.00 → 2.00 | 427 → 427 |
| room2/high/party | 243.52 → 187.54 | 74.67 → 18.67 | 680 → 680 |
| room2/high/fight | 243.52 → 187.54 | 74.67 → 18.67 | 680 → 680 |
| room2/low/fight | 159.66 → 152.67 | 9.33 → 2.33 | 485 → 485 |
| room3/high/interior | 216.59 → 149.94 | 96.00 → 29.33 | 344 → 344 |
| room7/high/day | 245.37 → 153.39 | 106.67 → 14.67 | 399 → 399 |
| room10/high/sunrise | 153.18 → 107.85 | 53.33 → 8.00 | 286 → 286 |
| room1/medium/night | 180.55 → 132.56 | 64.00 → 16.00 | 439 → 439 |
| room1/cinematic/night | 184.65 → 136.66 | 64.00 → 16.00 | 697 → 697 |
| room2/medium/fight | 243.52 → 187.54 | 74.67 → 18.67 | 680 → 680 |
| room2/cinematic/fight | 243.52 → 187.54 | 74.67 → 18.67 | 680 → 680 |
| room2/mobile/fight | 159.66 → 152.67 | 9.33 → 2.33 | 485 → 485 |

HIGH growth against the historical pre-PBR reference: room1/high/night 23.9%; room3/high/interior 24.3%; room2/high/party 11.1%; room7/high/day 10.6%; room10/high/sunrise 8.0%. Every measured HIGH view stays below 25%. LOW/mobile draws are unchanged at 427 (street) and 485 (club), with zero normals. Title surface-map requests: zero.

The live club HIGH → LOW → HIGH check returns to exactly 196,648,618 renderer
bytes (187.54 MiB), with no allocation growth or console errors. LOW has zero
normal maps and only 256px surface maps; HIGH restores nine normal samplers and
512px maps. Live LOW retains existing render targets (164.77 MiB), whereas the
fresh LOW capture above starts with its smaller render targets.
