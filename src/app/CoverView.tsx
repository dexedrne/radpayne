// The marked cover (sim/cover.ts, Game.coverTarget): where a cover press takes him, or in cover where the
// dash would run to. A thin gold ring on the floor with a short bar along the cover's face (gold: the
// player's colour code), breathing, shown while the gang is awake, while he is in cover and while he
// runs to it (outside a fight a ring at every wall he walks past would be noise). Below the bloom cap.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BoxGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";
import type { Session } from "./session.ts";
import { FRAME } from "./frame.ts";

const GOLD = "#ffc46b";

export function CoverView({ s }: { s: Session }) {
  const v = useMemo(() => {
    const mat = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    mat.userData.rpOwn = true;
    const ring = new Mesh(new RingGeometry(0.26, 0.32, 28), mat);
    ring.rotation.x = -Math.PI / 2;
    const bar = new Mesh(new BoxGeometry(1.1, 0.012, 0.05), mat);
    const g = new Group();
    g.name = "cover-marker";
    g.add(ring, bar);
    g.visible = false;
    return { g, mat, bar, k: 0, t: 0 };
  }, []);
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const g = s.game, p = g.player;
    v.t += dt;
    const dashing = p.dashSeg >= 0;
    const tg = dashing ? { seg: p.dashSeg, u: p.dashU } : g.coverTarget;
    const awake = g.enemies.some(e => e.state !== "idle" && e.state !== "inactive" && e.state !== "dead" && !e.fled);
    const show = !!tg && g.phase === "play" && p.mode === "normal" && (awake || p.cover >= 0 || dashing);
    v.k += ((show ? 1 : 0) - v.k) * Math.min(1, 10 * dt);
    v.g.visible = v.k > 0.02;
    if (!tg || !v.g.visible) return;
    const c = g.cover[tg.seg];
    if (!c) return;
    const x = c.ax + c.tx * tg.u, z = c.az + c.tz * tg.u;
    v.g.position.set(x, c.y + 0.02, z);
    // the bar lies along the face, between the ring and the obstacle
    v.bar.position.set(-c.nx * 0.36, 0, -c.nz * 0.36);
    v.bar.rotation.y = Math.atan2(-c.tz, c.tx);
    v.mat.opacity = v.k * (0.28 + 0.12 * Math.sin(v.t * 2 * Math.PI * 1.2));
  }, FRAME.actors);
  return <primitive object={v.g} />;
}
