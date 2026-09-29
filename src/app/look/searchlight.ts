// Room 6's searchlight, drawn as light rather than as geometry. The helicopter's lamp is one SpotLight
// that lives in the scene for the whole room (only its intensity, angle, cutoff and aim change: the
// shaders never rebuild) and a soft beam mesh:
//  - the beam is additive haze, brightest along its axis and near the lamp, feathered at its edges and
//    where it meets the roof, and faded out within a few metres of the lens (the camera is inside it
//    whenever it has him: it must never paint a slab over the screen);
//  - the pool: the sim's circle (ROOF.radius round its spot) lit on every level surface in it (the roof,
//    the pad, a box top, a wall facing the lamp) by the roof look's materials (`poolLight`: a fake light,
//    so it reads on the black asphalt without blowing out the pale boxes), plus the SpotLight on the
//    girls and him; both end at the first thing in the lamp's way (under a stairwell's roof it is dark:
//    the pool stays on top and the SpotLight is cut off just past it);
//  - every number stays under the look's bloom threshold: the lamp itself is the only thing that glows;
//  - the storm's rain lights up where it falls through the beam (look/sky.tsx reads `searchFx`).
import { AdditiveBlending, CylinderGeometry, DoubleSide, Mesh, SpotLight, Vector2, Vector3 } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { abs, cameraPosition, clamp, dot, float, length, materialColor, max, mix, normalWorld, normalize, positionWorld, pow, saturate, smoothstep, step, uniform, uv, vec3, vec4 } from "three/tsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** The look's numbers (linear HDR; the roof look's bloom threshold is 0.86). */
export const SEARCH = {
  color: "#dde6ff",
  /** The pool on the level's surfaces: a floor that reads on any albedo plus a share of the surface's
   *  own colour (linear, before the look's exposure), x `lit` while it has him. */
  poolFloor: 0.1,
  poolAlbedo: 0.45,
  poolLitK: 1.35,
  /** The SpotLight on the girls, him and the props (no distance falloff) while it sweeps / has him. Kept
   *  low: at a grazing angle the wet roof throws it back as a glare. */
  pool: 1.2,
  poolLit: 1.5,
  /** The pool's edge: the cone's half-angle reaches this x the sim's radius, soft over `penumbra`. */
  spread: 1.22,
  penumbra: 0.5,
  /** Blocked short of the roof: the light is cut off this far past what it hits (no light leaks into
   *  the room under a stairwell's roof) and boosted back up to at most `boost`. */
  cutoffPast: 3,
  boost: 4,
  /** The beam: its haze per face on the axis (two faces add), how much of it is left at the roof, its
   *  radius at the lamp (m), the lens fade (m) and what is left of it with the lens inside the beam. */
  haze: 0.06,
  foot: 0.35,
  lampRadius: 0.3,
  lensFade: [0.8, 6] as const,
  floorFade: 1.8,
  inside: 0.4,
  /** The rain inside the beam: brightness and opacity lift. */
  rainLift: 2.2,
  /** Fade in / out (1/s, real time). */
  fade: 6,
} as const;

/** The beam as the rain sees it (world space): the lamp, the unit direction, the length, the radii at
 *  the lamp and at its end, and the strength (0 = no beam). */
export const searchFx = {
  a: uniform(new Vector3()),
  d: uniform(new Vector3(0, -1, 0)),
  len: uniform(1),
  r0: uniform(0.3),
  r1: uniform(3),
  k: uniform(0),
};

/** The pool as the level's materials see it: the sim's spot (x, z), its radius, the lowest height it
 *  reaches (a roof in the lamp's way keeps it off everything under it), the lamp, its strength (0 = off)
 *  and 0..1 while it has him. */
export const poolFx = {
  c: uniform(new Vector2()),
  r: uniform(3.2),
  yMin: uniform(-1e3),
  lamp: uniform(new Vector3(0, 50, 0)),
  k: uniform(0),
  lit: uniform(0),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poolNode: any = null;
/** The pool's light for a level material's emissive (one graph shared by every material: one shader
 *  each, as before). A soft circle (a touch past the sim's radius, brighter at the middle), on surfaces
 *  facing the lamp, above `yMin`. */
export function poolLight(): N {
  if (poolNode) return poolNode;
  const p: N = positionWorld;
  const d: N = length(p.xz.sub(poolFx.c));
  const r: N = poolFx.r;
  const edge: N = float(1).sub(smoothstep(r.mul(0.72), r.mul(1.08), d));
  const core: N = mix(float(0.7), float(1), float(1).sub(smoothstep(float(0), r.mul(0.85), d)));
  const toLamp: N = normalize(poolFx.lamp.sub(p));
  const facing: N = saturate(dot(normalize(normalWorld), toLamp).mul(1.3).add(0.15));
  const above: N = step(poolFx.yMin, p.y);
  const alb: N = max(max(materialColor.r, materialColor.g), materialColor.b);
  const gain: N = float(SEARCH.poolFloor).add(alb.mul(SEARCH.poolAlbedo)).mul(mix(float(1), float(SEARCH.poolLitK), poolFx.lit));
  poolNode = vec3(0.8, 0.86, 1.0).mul(gain.mul(edge).mul(core).mul(facing).mul(above).mul(poolFx.k));
  return poolNode;
}

/** How far inside the beam a world position is (0 outside, 1 on its axis, feathered at the edge). */
export function inBeam(p: N): N {
  const ap: N = p.sub(searchFx.a);
  const t: N = dot(ap, searchFx.d);
  const u: N = t.div(searchFx.len);
  const r: N = mix(searchFx.r0, searchFx.r1, clamp(u, 0, 1));
  const off: N = length(ap.sub(searchFx.d.mul(t)));
  const along: N = smoothstep(0, 0.05, u).mul(float(1).sub(smoothstep(0.97, 1.02, u)));
  return float(1).sub(smoothstep(r.mul(0.55), r, off)).mul(along).mul(searchFx.k);
}

/** The beam's strength uniforms (Chapter2View drives them); `floorY`: the height it lands at (the haze
 *  thins out over the last `floorFade` m above it: the pool on the roof takes over there). */
export const beamU = { k: uniform(0), inside: uniform(0), floorY: uniform(0) };

/** A unit beam: its lamp end at the origin, its foot 1 m down -Y with radius 1 (scale x / z by the foot
 *  radius, y by the length; the lamp end keeps `lampRadius` over the foot radius). */
export function makeBeam(footRadius: number): Mesh {
  const g = new CylinderGeometry(SEARCH.lampRadius / footRadius, 1, 1, 40, 6, true);
  g.translate(0, -0.5, 0);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  m.fog = false;
  m.userData.rpOwn = true;
  const toCam: N = cameraPosition.sub(positionWorld);
  const dist: N = length(toCam);
  // a cone seen side-on: the path through it is longest on its axis and nothing at its silhouette
  const facing: N = pow(abs(dot(normalize(normalWorld), toCam.div(dist))), 1.6);
  const v: N = uv().y; // 1 at the lamp, 0 at the foot
  const along: N = mix(float(SEARCH.foot), float(1), v.mul(v)).mul(smoothstep(0, 0.12, v));
  const lens: N = smoothstep(SEARCH.lensFade[0], SEARCH.lensFade[1], dist);
  const ground: N = smoothstep(beamU.floorY, beamU.floorY.add(SEARCH.floorFade), positionWorld.y);
  const k: N = facing.mul(along).mul(lens).mul(ground).mul(beamU.k).mul(mix(float(1), float(SEARCH.inside), beamU.inside)).mul(SEARCH.haze);
  m.colorNode = vec4(vec3(0.78, 0.85, 1.0).mul(k), 1);
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = "rp-searchbeam";
  return mesh;
}

/** The pool's light: in the scene from the start, never removed or hidden (intensity 0 when off). */
export function makeSearchLight(): SpotLight {
  const l = new SpotLight(SEARCH.color, 0, 0, 0.2, SEARCH.penumbra, 0);
  l.name = "rp-searchlight";
  l.castShadow = false;
  return l;
}

/** The light's distance window at `d` for a cutoff `c` (three's: (1 - (d / c)^4)^2). */
export function cutoffAt(d: number, c: number): number {
  const r = Math.min(1, d / c);
  const q = 1 - r * r * r * r;
  return q * q;
}

if (import.meta.env?.MODE !== "production" && typeof window !== "undefined") Object.assign(window, { __search: { beamU, poolFx, searchFx } }); // dev probe
