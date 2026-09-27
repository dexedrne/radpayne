// The long-gun hold (arsenal spec 1.2) on a synthetic upper body (no GLB): the gun leads and both hands
// follow it. The right hand stays exactly on the grip and the left palm on the rail through the aim
// turn, the low ready, the chest-relative fallback and a turned body.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bone, Euler, Group, Quaternion, Vector3 } from "three";
import { LONG_GUN_GEOM, LongGunHold, READY, type HoldIn } from "../src/anim/hold.ts";
import { solveTwoBone } from "../src/anim/ik.ts";

/** A chest with two clavicle -> arm -> forearm -> hand chains (0.3 + 0.28 m arms), a gun at the
 *  right hand's grip, the left hand put on the pump by IK: the reference hold. */
function body() {
  const root = new Group();
  const chest = new Bone();
  chest.position.set(0, 1.3, 0);
  root.add(chest);
  const chain = (side: 1 | -1) => {
    const clav = new Bone(), arm = new Bone(), fore = new Bone(), hand = new Bone();
    clav.position.set(0.06 * side, 0.12, 0);
    arm.position.set(0.1 * side, 0, 0);
    fore.position.set(0.3 * side, 0, 0);
    hand.position.set(0.28 * side, 0, 0);
    chest.add(clav);
    clav.add(arm);
    arm.add(fore);
    fore.add(hand);
    return { clav, arm, fore, hand };
  };
  const R = chain(-1), L = chain(1);
  root.updateMatrixWorld(true);
  // the right hand in front of the right shoulder, the gun along +Z from it
  solveTwoBone(R.arm, R.fore, R.hand, new Vector3(-0.06, 1.28, 0.2), new Vector3(-0.5, -1, 0), 1);
  const gun = new Group();
  R.hand.add(gun);
  root.updateMatrixWorld(true);
  // the gun's world pose: grip at the hand, barrel straight ahead, level; as a child of the hand
  const handQ = R.hand.getWorldQuaternion(new Quaternion());
  gun.quaternion.copy(handQ.invert());
  gun.position.set(0, 0, 0);
  gun.scale.set(1.5, 1.5, 0.72);
  gun.userData.grip = gun.quaternion.clone();
  gun.userData.gripPos = gun.position.clone();
  root.updateMatrixWorld(true);
  // the left palm on the pump: the wrist a few cm behind and under the palm point
  const palm = gun.localToWorld(new Vector3(0.012 / 1.5 * 0.72, 0.005 / 1.5 * 0.72, 0.37));
  solveTwoBone(L.arm, L.fore, L.hand, palm.clone().add(new Vector3(0, -0.03, -0.05)), new Vector3(0.4, -1, 0), 1);
  root.updateMatrixWorld(true);
  const hold = new LongGunHold({ chest, lArm: L.arm, lFore: L.fore, lHand: L.hand, rArm: R.arm, rFore: R.fore, rHand: R.hand, lClav: L.clav, rClav: R.clav });
  hold.sample(gun, 0.72);
  return { root, chest, R, L, gun, hold };
}

const input = (b: ReturnType<typeof body>, o: Partial<HoldIn> = {}): HoldIn => ({
  gun: b.gun, geom: LONG_GUN_GEOM.shotgun, longShare: 0, weight: 1, aim: null, aimW: 0, aimMax: 0.3, ready: 0,
  tiltDown: 0, tiltRoll: 0, cant: 0, recoil: 0, leftPath: null, ...o,
});

test("hold: the reference pose holds itself (grip exact, palm on the pump)", () => {
  const b = body();
  const out = b.hold.solve(input(b));
  assert.ok(out.gripErr < 1e-4, `grip ${out.gripErr}`);
  assert.ok(out.leftErr < 0.002, `left ${out.leftErr}`);
});

test("hold: a turned, bent chest carries the gun and both hands stay on it (chest-relative fallback)", () => {
  const b = body();
  b.chest.quaternion.setFromEuler(new Euler(0.25, -0.6, 0.1));
  // an arbitrary clip pose on the arms and the clavicles (as a jump or a roll leaves them)
  b.L.clav.quaternion.setFromEuler(new Euler(0, 0.3, 0.4));
  b.L.arm.quaternion.setFromEuler(new Euler(0.2, -0.4, -1.2));
  b.R.arm.quaternion.setFromEuler(new Euler(-0.3, 0.2, 1.0));
  b.root.updateMatrixWorld(true);
  const out = b.hold.solve(input(b));
  assert.ok(out.gripErr < 0.002, `grip ${out.gripErr}`);
  assert.ok(out.leftErr < 0.015, `left ${out.leftErr}`);
  // the gun turned with the chest
  const fwd = new Vector3(0, 0, 1).applyQuaternion(b.gun.getWorldQuaternion(new Quaternion()));
  const chestFwd = new Vector3(0, 0, 1).applyQuaternion(b.chest.quaternion);
  assert.ok(fwd.dot(chestFwd) > 0.9);
});

test("hold: the aim turns the barrel onto the point (within the clamp) and the hands follow", () => {
  const b = body();
  const muzzleLocal = new Vector3(...LONG_GUN_GEOM.shotgun.muzzle);
  const target = new Vector3(3, 3.5, 20);
  const out = b.hold.solve(input(b, { aim: target, aimW: 1, aimMax: 0.5 }));
  assert.ok(out.gripErr < 0.002, `grip ${out.gripErr}`);
  assert.ok(out.leftErr < 0.015, `left ${out.leftErr}`);
  const q = b.gun.getWorldQuaternion(new Quaternion());
  const m = b.gun.localToWorld(muzzleLocal.clone());
  const dir = new Vector3(0, 0, 1).applyQuaternion(q);
  const want = target.clone().sub(m).normalize();
  assert.ok(dir.angleTo(want) < 0.02, `barrel off by ${dir.angleTo(want)}`);
  // clamped: a point far off to the side turns it at most aimMax
  const b2 = body();
  const before = new Vector3(0, 0, 1).applyQuaternion(b2.gun.getWorldQuaternion(new Quaternion()));
  b2.hold.solve(input(b2, { aim: new Vector3(20, 1.3, 0.5), aimW: 1, aimMax: 0.2 }));
  const after = new Vector3(0, 0, 1).applyQuaternion(b2.gun.getWorldQuaternion(new Quaternion()));
  assert.ok(before.angleTo(after) < 0.2 + 0.01 && before.angleTo(after) > 0.15);
});

test("hold: the low ready lowers the muzzle about the butt, the stock stays at the shoulder", () => {
  const b = body();
  const butt = new Vector3(...LONG_GUN_GEOM.shotgun.butt);
  b.hold.solve(input(b));
  const butt0 = b.gun.localToWorld(butt.clone());
  const dir0 = new Vector3(0, 0, 1).applyQuaternion(b.gun.getWorldQuaternion(new Quaternion()));
  const out = b.hold.solve(input(b, { ready: 1 }));
  const butt1 = b.gun.localToWorld(butt.clone());
  const dir1 = new Vector3(0, 0, 1).applyQuaternion(b.gun.getWorldQuaternion(new Quaternion()));
  assert.ok(butt1.distanceTo(butt0) < READY.drop + 0.005, `butt moved ${butt1.distanceTo(butt0)}`);
  assert.ok(dir1.y < dir0.y - 0.2, "muzzle down");
  assert.ok(out.gripErr < 0.002 && out.leftErr < 0.015, `grip ${out.gripErr} left ${out.leftErr}`);
});

test("hold: a left target past the arm's reach slides back along the rail before letting go", () => {
  const b = body();
  // push the gun forward so the pump is out of the left arm's reach
  const out = b.hold.solve(input(b, { aim: new Vector3(-6, 1.3, 8), aimW: 1, aimMax: 0.5 }));
  assert.ok(out.slide >= 0 && out.shift >= 0);
  assert.ok(out.gripErr < 0.002, `grip ${out.gripErr}`);
  // on the gun (the rail runs back to the receiver's front)
  assert.ok(out.leftErr < 0.02, `left ${out.leftErr}`);
});

test("hold: weight 0 leaves the clip's arms and the gun at its grip", () => {
  const b = body();
  const q0 = b.L.arm.quaternion.clone();
  b.gun.quaternion.set(0, 0, 0, 1);
  b.hold.solve(input(b, { weight: 0 }));
  assert.ok(b.L.arm.quaternion.equals(q0));
  assert.ok(b.gun.quaternion.equals(b.gun.userData.grip as Quaternion));
});
