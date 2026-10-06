# Level surface maps

Both game builds use the same surface maps; react-three-game remains pinned at 0.0.113.
`src/app/look/pbrProfiles.ts` explicitly lists tiling surfaces and their finishes. Posters,
screens, glass/window masks, signs, transparent trim, character art and nonrepeating props
are excluded. Metalness stays authored by the level.

Run `npm run pbr-maps` with Node and ImageMagick (`magick`). No downloaded art or extra npm
packages are needed. `-- --set=backrooms/wall_cinderblock` regenerates one surface;
`-- --check` compares a deterministic rebuild with the shipped bytes;
`-- --preview=<directory>` also writes estimated heights outside public.
The input hashes, profiles and output hashes live in `docs/pbr-maps.json`.

The height is an art estimate from luminance, periodic high-pass filtering and coherent
joint detection. Mortar/grout and dark cavities recess; wood/metal grooves retain their
broad relief; marble, fabric and asphalt get much less fine relief. All blur and central
normal differences wrap around the image. A small smooth collar matches opposite edge
values and derivatives. Normals use OpenGL (+Y), with green = positive image-row height
gradient for the albedo's three.js flipY convention. Lossless WebP preserves linear data.
Dark damp patches and low height areas on asphalt/sidewalk lower roughness. The street's
existing puddle mask still makes standing water smoother than the damp surface.

`pbr.tsx` installs normalMap, normalScale and roughnessMap on repeating standard node
materials and copies each albedo's repeat, offset, rotation, anisotropy and flipY. A normal
node supplies the tangent frame of the existing world-space projection, including opposite
wall orientations and floor/ceiling faces. The map textures are shared across matching
transforms. Projection planes use geometry normals, so relief cannot move the albedo UVs;
normal samples explicitly retain the texture matrix when Three clears the default UV context.
Map loads join the room's existing shader warm-up. Preset changes release the
old map textures and rebuild under the existing render gate.

Desktop uses 1024 normals and roughness. LOW (`lite`) and phones/tablets use only 512
roughness: no normal texture fetch or normal sampling. The policy depends on the preset
and device, never on FPS on the busy capture host. Reproduce the comparison with
`RADPAYNE_CHROME_PROFILE=<throwaway-profile> npm run pbr-shots -- <dev-url> <output> before|after`.
The helper uses fixed room cameras, a paused simulation, a seeded random sequence and
frame-based settling. Its JSON records renderer.info texture allocation, draws, triangles,
and independent RGBA8 + mip estimates of material image sources and PBR texture allocations.
The latter counts texture instances: different tiling/offset transforms can allocate separate
GPU textures even when their image source is shared.
Renderer totals also include character textures and postprocess/render-target allocations.
Animated lights and weather continue while gameplay is paused; these are visual comparisons,
not pixel-identical captures or frame-time benchmarks.

## Capture measurements

Baseline: `bf9b00b`. Chromium / WebGL2, 1280 x 720, fixed cameras and seeded assets.
Screenshots and raw renderer JSON are in `~/Documents/pbr-rp/before` and `after`.
MiB means bytes / 1048576. Map bytes include RGBA8 mip chains per distinct texture transform.
The saved allocation estimates were derived from prefab repeat/offset transforms and checked
against renderer texture-count deltas; the helper now records them directly per texture UUID.

| View / preset | Renderer texture MiB before → after | Added map MiB | Draws before → after |
| --- | ---: | ---: | ---: |
| Street night / HIGH | 107.80 → 181.57 | 64.00 | 681 → 697 |
| Street night / LOW | 110.12 → 118.12 | 8.00 | 427 → 427 |
| Club party / HIGH | 168.88 → 243.52 | 74.67 | 680 → 680 |
| Club fight / HIGH | 152.74 → 243.52 | 74.67 | 640 → 680 |
| Club fight / LOW | 150.33 → 159.66 | 9.33 | 485 → 485 |
| Club fight / mobile | 150.33 → 159.66 | 9.33 | 485 → 485 |
| Backrooms / HIGH | 120.61 → 216.59 | 96.00 | 344 → 344 |
| Garden day / HIGH | 138.73 → 245.37 | 106.67 | 399 → 399 |
| Vault sunrise / HIGH | 99.86 → 153.18 | 53.33 | 286 → 286 |

The LOW choice cuts the surface-map budget by 8×, removes normal-map sampling and tangent-frame
work, and leaves both busy LOW draw counts unchanged. No geometry, extra render pass, collider,
simulation rule or character/decal material was added or changed. Mobile attaches zero normal maps.

Renderer totals are allocation estimates for the entire scene, including the existing warm-up
and render targets; their difference is not an isolated surface-map cost. The baseline club fight
had some crowd models still warming (130.47 MiB of original material textures versus 146.60 MiB
afterward), explaining its higher final draw/model count. Use the separate map-byte column for
the added surface budget, and the matching LOW counts for draw-cost comparison.

A live club HIGH → LOW → HIGH switch returned to exactly the starting allocation:
243.52 → 171.77 → 243.52 MiB total, 74.67 → 9.33 → 74.67 MiB of surface maps,
and 9 → 0 → 9 materials with normals. The LOW textures were all 512; draws were
680 → 485 → 680. The existing post chain retains more allocation during a live LOW
switch than a fresh LOW load; the normal textures were released and the return to HIGH
showed no growth. Raw results are saved in `~/Documents/pbr-rp/preset-switch.json`.

The rendered comparisons were inspected: cinderblock/masonry joints catch light, floor highlights
are less uniform, and the subtle fabric/marble relief avoids plastic finishes and fine noise.
All 33 normal maps have matching opposite edge pixels; normal length error is below 0.006 after
8-bit encoding. Typecheck, the 269 existing tests, the updated graphics-setting check, and both
production builds pass. A cinderblock regeneration byte-check and all 99 output hashes match.
