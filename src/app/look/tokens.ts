// Shared by every room look (street.tsx, club.tsx, the back rooms to come): the level materials' name
// tokens, the world-space UV rule for repeat textures, which objects are characters, and the camera key.
//
// Material name tokens (the first word picks the rule, the number is its gain):
//   "wet <k>"        the street's ground: puddle-masked reflections x k (street only)
//   "lit <g>"        textured facades: bright texels (lit windows) glow x g
//   "glow <g>"       unlit colour x g (neon, lamps, screens): bloom takes it
//   "party <g>"      glow that goes dark when the fight starts (the club's party neon)
//   "worklight <g>"  a fixture that is dark at the party and lights up for the fight
//   "ledfloor <g>"   the LED dance floor (cells tinted on the beat; dim red in the fight)
//   "ledwall <g>"    the LED wall (an atlas of frames through a dot mask)
// with the flags "pulse" (the club's kick), "flicker" (a dying tube), "blink" (a flasher).
// Repeat textures (wrapS = RepeatWrapping) are sampled in world space (metres x repeatCount).
import { Fragment, createElement, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { DirectionalLight, Vector3, type Object3D } from "three";
import { abs, dot, float, materialColor, normalView, normalWorld, positionViewDirection, positionWorld, pow, replaceDefaultUV, saturate, select, sign, uniform, vec2, vec3 } from "three/tsl";
import type { MeshStandardNodeMaterial } from "three/webgpu";
import { FRAME } from "../frame.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export type TokenKind = "" | "wet" | "lit" | "glow" | "party" | "worklight" | "ledfloor" | "ledwall";
export type Tokens = { kind: TokenKind; k: number; pulse: boolean; flicker: boolean; blink: boolean };
const KINDS = new Set<string>(["wet", "lit", "glow", "party", "worklight", "ledfloor", "ledwall"]);

export function readTokens(name: string): Tokens {
  const t = name.trim().toLowerCase().split(/\s+/);
  const kind = (KINDS.has(t[0]) ? t[0] : "") as TokenKind;
  return { kind, k: Number(t[1]) || 1, pulse: t.includes("pulse"), flicker: t.includes("flicker"), blink: t.includes("blink") };
}

/** World-space UV: walls along x use (-+z, y), walls along z use (x, y), floors / ceilings (x, z). */
export const worldUV = (): N => {
  const n = normalWorld, p = positionWorld;
  const wallX = vec2(p.z.mul(sign(n.x)).negate(), p.y);
  const wallZ = vec2(p.x.mul(sign(n.z)), p.y);
  const top = vec2(p.x, p.z);
  return select(abs(n.y).greaterThan(0.5), top, select(abs(n.x).greaterThan(abs(n.z)), wallX, wallZ));
};
export const WORLD_UV = replaceDefaultUV(() => worldUV());

/** Characters (skinned rigs, the Milady / Radbro / crowd roots) are not level geometry: their textures
 *  keep their own UVs and the looks give them the actor lift instead of the level rules. */
export const isActor = (o: Object3D) =>
  (o as { isSkinnedMesh?: boolean }).isSkinnedMesh === true || /^(milady|goon|radbro|crowd|skip)-/.test(o.name) || o.userData.rpActor === true;

const KEY_FWD = new Vector3(), KEY_POS = new Vector3(), KEY_UP = new Vector3(0, 1, 0);

/** A directional key that rides with the camera: from just above and behind the lens, down the view.
 *  Whatever faces the camera (the player's back, the gang, their cover) is lit at any distance. */
export function CameraKey({ color, intensity }: { color: string; intensity: number | { value: number } }) {
  const key = useMemo(() => new DirectionalLight(color, typeof intensity === "number" ? intensity : intensity.value), [color, intensity]);
  useFrame(({ camera }) => {
    if (typeof intensity !== "number") key.intensity = intensity.value;
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(KEY_POS);
    camera.getWorldDirection(KEY_FWD);
    key.position.copy(KEY_POS).addScaledVector(KEY_UP, 3).addScaledVector(KEY_FWD, -4);
    key.target.position.copy(KEY_POS).addScaledVector(KEY_FWD, 12);
    key.target.updateMatrixWorld();
  }, FRAME.fx);
  return createElement(Fragment, null, createElement("primitive", { object: key }), createElement("primitive", { object: key.target }));
}

/** Sets the hostile rim strength (0..1) on every material under `o` that has one. */
export function setHostileRim(o: Object3D, k: number): void {
  o.traverse(c => {
    const mm = (c as { material?: unknown }).material as { userData?: { rpRimK?: { value: number } } } | Array<{ userData?: { rpRimK?: { value: number } } }> | undefined;
    if (!mm) return;
    for (const m of Array.isArray(mm) ? mm : [mm]) if (m.userData?.rpRimK) m.userData.rpRimK.value = k;
  });
}

/** The hostile rim (round-2 plan section 8): pink-red #ff4d6d, strength 0.35, as a thin fresnel. */
export const HOSTILE_RIM = { color: [1.0, 0.075, 0.15] as const, strength: 0.35, power: 3 };

/** A hostile's emissive: her own colour lifted by `lift` (the Miladys: texture x lift) or a flat
 *  `flat` lift (the heavies: their near-black texture would add nothing), plus the pink-red rim.
 *  Applied once per material (userData.rpRim). The rim reads the facing both ways (double-sided hair
 *  seen from behind is not a solid pink cap), and its strength is the material's userData.rpRimK
 *  uniform: the views take it to 0 when she is down (a body is not a threat: no rim). */
export function hostileEmissive(m: MeshStandardNodeMaterial, lift: number, flat = 0): void {
  if (m.userData.rpRim === `${lift}|${flat}`) return;
  m.userData.rpRim = `${lift}|${flat}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const k: any = (m.userData.rpRimK ??= uniform(1));
  const fres = pow(float(1).sub(saturate(abs(dot(normalView, positionViewDirection)))), HOSTILE_RIM.power);
  const rim = vec3(...HOSTILE_RIM.color).mul(fres.mul(HOSTILE_RIM.strength * 2.2)).mul(k);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const own: any = flat > 0 ? vec3(flat, flat, flat * 1.08) : (materialColor as N).rgb.mul(lift);
  m.emissiveNode = own.add(rim);
  m.needsUpdate = true;
}
