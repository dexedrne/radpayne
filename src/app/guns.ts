// Low-poly pistols built from primitives (spec section 8 "Guns"). The barrel points down +Z and the
// muzzle sits at MUZZLE_Z, so a gun that lookAt()s its target fires along its own axis.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";

export const MUZZLE_Z = 0.19;

const slideGeo = new BoxGeometry(0.034, 0.042, 0.2);
const gripGeo = new BoxGeometry(0.03, 0.1, 0.045);
const guardGeo = new BoxGeometry(0.008, 0.028, 0.05);
const metal = new MeshStandardMaterial({ color: "#1b1c20", roughness: 0.35, metalness: 0.8 });
const grip = new MeshStandardMaterial({ color: "#2a2320", roughness: 0.8, metalness: 0.1 });
const chrome = new MeshStandardMaterial({ color: "#9aa0ab", roughness: 0.25, metalness: 1 });

export function makePistol(shiny = false): Group {
  const g = new Group();
  const slide = new Mesh(slideGeo, shiny ? chrome : metal);
  slide.position.set(0, 0.02, 0.07);
  const gr = new Mesh(gripGeo, grip);
  gr.position.set(0, -0.035, 0);
  gr.rotation.x = 0.25;
  const guard = new Mesh(guardGeo, metal);
  guard.position.set(0, -0.012, 0.045);
  g.add(slide, gr, guard);
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

/** Muzzle world position of a gun group (after its matrix is up to date). */
export function muzzleWorld(gun: Group, out: Vector3): Vector3 {
  return gun.localToWorld(out.set(0, 0.02, MUZZLE_Z));
}
