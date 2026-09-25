// The stand-in girl: what a Milady (a goon or a dancer) looks like while her Pockit model is not there
// (still building, or a download that never came). A silhouette that reads as a girl, not a pill: a bob
// of hair over a head, a flared skirt, thin legs and arms on hip and shoulder pivots. It is never still
// while its body moves: the legs stride with the ground speed (no sliding), a dancer bobs and waves on
// the club's beat, a seated girl folds her legs, a cowering one hugs her knees.
import { CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Material } from "three";

export type StandIn = {
  root: Group;
  /** Hip-height group (everything above the legs): bobs and crouches. */
  body: Group;
  legs: [Group, Group];
  arms: [Group, Group];
  /** Stride phase (radians) and the clock for the idle moves. */
  phase: number;
  t: number;
};

export type StandInMode = "idle" | "walk" | "dance" | "sit" | "cower" | "dead";

const legGeo = new CapsuleGeometry(0.06, 0.6, 4, 8);
legGeo.translate(0, -0.36, 0);
const armGeo = new CapsuleGeometry(0.045, 0.42, 4, 8);
armGeo.translate(0, -0.25, 0);
const torsoGeo = new CapsuleGeometry(0.14, 0.3, 4, 10);
const skirtGeo = new CylinderGeometry(0.13, 0.29, 0.3, 14, 1, true);
const headGeo = new SphereGeometry(0.17, 16, 12);
const hairCapGeo = new SphereGeometry(0.195, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
const hairBobGeo = new CylinderGeometry(0.2, 0.215, 0.2, 16, 1, true);

export type StandInLook = { cloth: Material; skin: Material; hair: Material };

export const GOON_LOOK: StandInLook = {
  cloth: new MeshStandardMaterial({ color: "#1c1a24", roughness: 0.8 }),
  skin: new MeshStandardMaterial({ color: "#f3d9cc", roughness: 0.7 }),
  hair: new MeshStandardMaterial({ color: "#ff5fae", roughness: 0.6 }),
};
/** The crowd's: muted, no pink (the gang's colour), never read as a threat. */
export const CROWD_LOOK: StandInLook = {
  cloth: new MeshStandardMaterial({ color: "#4d4857", roughness: 0.85 }),
  skin: new MeshStandardMaterial({ color: "#cdbcb4", roughness: 0.75 }),
  hair: new MeshStandardMaterial({ color: "#2a2530", roughness: 0.7 }),
};
for (const l of [GOON_LOOK, CROWD_LOOK]) for (const m of [l.cloth, l.skin, l.hair]) m.userData.rpOwn = true;

export function makeStandIn(look: StandInLook): StandIn {
  const root = new Group();
  const body = new Group();
  body.position.y = 0.8;
  const mesh = (geo: CapsuleGeometry | CylinderGeometry | SphereGeometry, mat: Material, x: number, y: number, z = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const legs: [Group, Group] = [new Group(), new Group()];
  legs[0].position.set(0.085, 0.8, 0);
  legs[1].position.set(-0.085, 0.8, 0);
  legs[0].add(mesh(legGeo, look.skin, 0, 0));
  legs[1].add(mesh(legGeo, look.skin, 0, 0));
  const arms: [Group, Group] = [new Group(), new Group()];
  arms[0].position.set(0.2, 0.55, 0);
  arms[1].position.set(-0.2, 0.55, 0);
  arms[0].rotation.z = 0.12;
  arms[1].rotation.z = -0.12;
  arms[0].add(mesh(armGeo, look.cloth, 0, 0));
  arms[1].add(mesh(armGeo, look.cloth, 0, 0));
  const head = mesh(headGeo, look.skin, 0, 0.83);
  head.name = "head";
  body.add(
    mesh(skirtGeo, look.cloth, 0, 0.02),
    mesh(torsoGeo, look.cloth, 0, 0.36),
    head,
    mesh(hairCapGeo, look.hair, 0, 0.85),
    mesh(hairBobGeo, look.hair, 0, 0.78),
    ...arms,
  );
  root.add(body, ...legs);
  root.traverse(o => { o.frustumCulled = false; });
  return { root, body, legs, arms, phase: 0, t: Math.random() * 10 };
}

/**
 * One frame of the stand-in's own motion. `dt` is world time (bullet time slows her), `speed` the ground
 * speed (m/s); `beat` the club's beat phase 0..1 for a dancer.
 */
export function animateStandIn(si: StandIn, mode: StandInMode, dt: number, speed = 0, beat = -1): void {
  si.t += dt;
  const b = si.body;
  let leg = 0, arm = 0, bob = 0, lean = 0, fold = 0;
  let armsUp = 0;
  if (mode === "walk" || (mode === "idle" && speed > 0.2)) {
    // a stride every ~1.25 m: the feet keep pace with the ground
    si.phase += dt * speed * 5;
    const k = Math.min(1, speed / 1.2);
    leg = Math.sin(si.phase) * 0.55 * k;
    arm = -leg * 0.8;
    bob = Math.abs(Math.cos(si.phase)) * 0.03 * k;
    lean = 0.12 * Math.min(1, speed / 4);
  } else if (mode === "dance") {
    const ph = beat >= 0 ? beat * Math.PI * 2 : si.t * Math.PI * 2 * (128 / 60);
    bob = Math.abs(Math.sin(ph / 2)) * 0.05;
    leg = Math.sin(ph / 2) * 0.12;
    armsUp = 0.5 + 0.5 * Math.sin(ph / 2);
  } else if (mode === "sit") {
    fold = 1;
  } else if (mode === "cower") {
    fold = 0.6;
  } else if (mode === "idle") {
    bob = Math.sin(si.t * 1.7) * 0.006;
  }
  si.legs[0].rotation.x = mode === "sit" ? -1.45 : leg - fold * 0.9;
  si.legs[1].rotation.x = mode === "sit" ? -1.45 : -leg - fold * 0.9;
  si.arms[0].rotation.x = arm - armsUp * 2.6 - fold * 0.9;
  si.arms[1].rotation.x = -arm - (1 - armsUp) * 0.3 * (mode === "dance" ? 1 : 0) - fold * 0.9;
  si.arms[0].rotation.z = 0.12 + armsUp * 0.3;
  const drop = mode === "sit" ? 0.38 : fold * 0.35;
  b.position.y = 0.8 + bob - drop;
  for (const l of si.legs) l.position.y = 0.8 - drop;
  b.rotation.x = lean + fold * 0.5;
}
