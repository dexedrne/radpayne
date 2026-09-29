// Chapter 2's looks (rooms 6-10), on the tower look's recipe (tower.tsx: no reflector, a light haze, a
// subtle bloom on the hottest emitters, every hostile keeps the pink-red rim and the outline), tinted per
// room: "roof" the storm at night (rain streaks that slow with bullet time, lightning now and then),
// "garden" the blue hour under glass, "airship" moonlight over the cloud sea, "counting" cold screens
// (the blackout drops the room's fill while the screens and the rims stay), "vault" the sunrise on gold.
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Color, LineSegments, type HemisphereLight, type Light } from "three";
import { LineBasicNodeMaterial } from "three/webgpu";
import { float, materialColor, materialOpacity, positionWorld } from "three/tsl";
import { SEARCH, inBeam, poolLight } from "./searchlight.ts";
import type { LevelData } from "../../world/level.ts";
import type { Session } from "../session.ts";
import { TowerLook, type LookNumbers } from "./tower.tsx";
import { useGfx } from "./gfx.ts";

const base = (o: Partial<LookNumbers> & { fog: LookNumbers["fog"]; background: string; hemi: LookNumbers["hemi"]; exposure: number }): LookNumbers => ({
  bloom: { subtle: { strength: 0.28, radius: 0.22, threshold: 0.86 }, original: { strength: 0.52, radius: 0.36, threshold: 0.75 } },
  key: 0.95, hostileLift: 0.32, vignette: 0.18, ...o,
});

/** Readability numbers per chapter 2 look. */
export const SKY: Record<"roof" | "garden" | "airship" | "counting" | "vault", LookNumbers> = {
  roof: base({ exposure: 1.3, fog: { color: "#10141f", density: 0.012 }, background: "#070a12", hemi: { sky: "#6f7fa6", ground: "#1c1a22", intensity: 1.0 } }),
  garden: base({ exposure: 1.28, fog: { color: "#0f1a1c", density: 0.006 }, background: "#0b1624", hemi: { sky: "#86a8b8", ground: "#1e2a1e", intensity: 1.1 } }),
  airship: base({ exposure: 1.3, fog: { color: "#141824", density: 0.004 }, background: "#0c1020", hemi: { sky: "#8a92b8", ground: "#2a2020", intensity: 1.05 } }),
  counting: base({ exposure: 1.25, fog: { color: "#0c1016", density: 0.004 }, background: "#05070a", hemi: { sky: "#7a8aa0", ground: "#1a1c22", intensity: 1.0 } }),
  vault: base({ exposure: 1.32, fog: { color: "#1c140c", density: 0.003 }, background: "#2a1810", hemi: { sky: "#e0b890", ground: "#2a1c14", intensity: 1.15 } }),
};

/** The storm's rain: streaks round the camera, falling at world speed (bullet time slows them); the
 *  streaks that fall through the searchlight's beam light up (look/searchlight.ts). */
function Rain({ s }: { s?: Session }) {
  const gfx = useGfx();
  const n = gfx.rain === "off" ? 0 : gfx.rain === "light" ? 900 : 600;
  const obj = useMemo(() => {
    const pos = new Float32Array(n * 6);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    const m = new LineBasicNodeMaterial({ color: new Color("#9fb4d8"), transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false });
    m.userData.rpOwn = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lit: any = inBeam(positionWorld);
    m.colorNode = materialColor.mul(float(1).add(lit.mul(SEARCH.rainLift)));
    m.opacityNode = materialOpacity.mul(float(1).add(lit.mul(1.2)));
    const l = new LineSegments(g, m);
    l.frustumCulled = false;
    l.name = "rp-rain";
    const seed = Array.from({ length: n }, () => [Math.random() * 30 - 15, Math.random() * 16, Math.random() * 30 - 15]);
    return { l, pos, seed };
  }, [n]);
  useFrame(({ camera }, dt) => {
    const ts = s?.game.timeScale ?? 1;
    const fall = 16 * Math.min(dt, 0.1) * ts;
    const { pos, seed } = obj;
    for (let i = 0; i < seed.length; i++) {
      const q = seed[i];
      q[1] -= fall;
      if (q[1] < -2) { q[1] += 18; q[0] = Math.random() * 30 - 15; q[2] = Math.random() * 30 - 15; }
      const x = camera.position.x + q[0], y = camera.position.y - 6 + q[1], z = camera.position.z + q[2];
      pos.set([x, y, z, x + 0.05, y + 0.55 * Math.max(0.3, ts), z + 0.02], i * 6);
    }
    (obj.l.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  });
  return n ? <primitive object={obj.l} /> : null;
}

/** Lightning: a cold flash over the roof now and then (a hemisphere light that spikes and decays). */
function Lightning({ s }: { s?: Session }) {
  const ref = useRef<HemisphereLight>(null);
  const st = useRef({ next: 6, v: 0 });
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1) * (s?.game.timeScale ?? 1);
    const t = st.current;
    t.next -= d;
    if (t.next <= 0) { t.v = 2.4; t.next = 7 + Math.random() * 9; }
    t.v = Math.max(0, t.v - d * 6 + (t.v > 1.8 && Math.random() < 0.1 ? 0.8 : 0));
    if (ref.current) ref.current.intensity = t.v;
  });
  return <hemisphereLight ref={ref} args={["#cfd8ff", "#202030", 0]} />;
}

/** The counting floor's blackout: while the stage says dark its lamps go out (the "light" markers with
 *  `dim`, userData.rpDim), the look's fill drops (userData.rpFill) and the camera key dims; the screens
 *  (glow materials) and every girl's rim and outline stay. The lights stay in the scene and only their
 *  intensity moves (no shader rebuilds); it eases over about a third of a second, both ways. */
export const BLACKOUT = { lamps: 0.1, fill: 0.22, key: 0.55, rate: 7 } as const;
const blackoutKey = { value: SKY.counting.key as number };
function Blackout({ s }: { s?: Session }) {
  const scene = useThree(st => st.scene);
  const k = useRef(0);
  const lights = useRef<Light[]>([]);
  const n = useRef(0);
  useFrame((_, dt) => {
    const dark = (s?.game.stage as { dark?: number } | null)?.dark === 1;
    k.current += ((dark ? 1 : 0) - k.current) * Math.min(1, Math.min(dt, 0.1) * BLACKOUT.rate);
    if (n.current++ % 30 === 0) { // the lights mount with the room; look again now and then
      const out: Light[] = [];
      scene.traverse(o => { if ((o as Light).isLight && (o.userData.rpDim || o.userData.rpFill)) out.push(o as Light); });
      lights.current = out;
    }
    for (const l of lights.current) {
      if (typeof l.userData.rpBase !== "number") l.userData.rpBase = l.intensity;
      const to = l.userData.rpDim ? BLACKOUT.lamps : BLACKOUT.fill;
      l.intensity = (l.userData.rpBase as number) * (1 + (to - 1) * k.current);
    }
    blackoutKey.value = SKY.counting.key * (1 + (BLACKOUT.key - 1) * k.current);
  });
  return null;
}

function make(which: keyof typeof SKY) {
  return function SkyLook(p: { level: LevelData; s?: Session; lowQuality?: boolean }) {
    return (
      <TowerLook level={p.level} s={p.s} which="penthouse" numbers={SKY[which]} lit={which === "roof" ? poolLight() : null} keyK={which === "counting" ? blackoutKey : undefined}>
        {which === "roof" && <Rain s={p.s} />}
        {which === "roof" && <Lightning s={p.s} />}
        {which === "counting" && <Blackout s={p.s} />}
      </TowerLook>
    );
  };
}

export const RoofLook = make("roof");
export const GardenLook = make("garden");
export const AirshipLook = make("airship");
export const CountingLook = make("counting");
export const VaultLook = make("vault");
