// The two-bone arm IK behind the long-gun hold (arsenal spec 1.2), on synthetic bone chains (no GLB):
// it reaches, clamps, bends toward the pole, sets the hand's world rotation exactly and splits the twist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bone, Euler, Group, Quaternion, Vector3 } from "three";
import { REACH_MAX, limbLengths, setWorldQuaternion, solveTwoBone, splitTwist } from "../src/anim/ik.ts";

/** A left arm like the Radbros': shoulder at (0.2, 1.3, 0), upper 0.21 m and forearm 0.2 m along +X, a
 *  hand 0.08 m on. The chain sits under a turned, offset parent (the spine) to catch frame mistakes. */
function arm() {
  const root = new Group();
  root.position.set(0.3, 0.1, -0.2);
  root.quaternion.setFromEuler(new Euler(0.2, 0.7, -0.1));
  const upper = new Bone(), lower = new Bone(), hand = new Bone(), tip = new Bone();
  upper.position.set(0.2, 1.3, 0);
  upper.quaternion.setFromEuler(new Euler(0.1, 0.3, 0.2));
  lower.position.set(0.21, 0, 0);
  lower.quaternion.setFromEuler(new Euler(0, 0.2, 0));
  hand.position.set(0.2, 0, 0);
  tip.position.set(0.08, 0, 0);
  root.add(upper);
  upper.add(lower);
  lower.add(hand);
  hand.add(tip);
  root.updateMatrixWorld(true);
  return { root, upper, lower, hand };
}

const wp = (o: { getWorldPosition(v: Vector3): Vector3 }) => o.getWorldPosition(new Vector3());

test("two-bone solve: reaches a target inside its reach to within 1 mm, from any start", () => {
  const { upper, lower, hand } = arm();
  const [l1, l2] = limbLengths(upper, lower, hand);
  const sh = wp(upper);
  const pole = new Vector3(0, -1, 0);
  for (const [dx, dy, dz, f] of [[1, 0, 0, 0.6], [0.3, -0.5, 0.8, 0.9], [-0.2, 0.7, 0.5, 0.75], [0, 0, 1, 0.98], [0.5, 0.5, -0.5, 0.4]] as const) {
    const t = new Vector3(dx, dy, dz).normalize().multiplyScalar(f * (l1 + l2)).add(sh);
    const r = solveTwoBone(upper, lower, hand, t, pole, 1);
    assert.ok(r.reachError < 0.001, `error ${r.reachError} at ${dx},${dy},${dz} x${f}`);
    assert.ok(wp(hand).distanceTo(t) < 0.001);
    assert.equal(r.clamped, false);
    // the bones keep their lengths
    assert.ok(Math.abs(wp(upper).distanceTo(wp(lower)) - l1) < 1e-6 && Math.abs(wp(lower).distanceTo(wp(hand)) - l2) < 1e-6);
  }
});

test("two-bone solve: a target out of reach clamps the arm at 99.5 % along the line to it", () => {
  const { upper, lower, hand } = arm();
  const [l1, l2] = limbLengths(upper, lower, hand);
  const sh = wp(upper);
  const t = new Vector3(0.2, -0.3, 1).normalize().multiplyScalar(1.5 * (l1 + l2)).add(sh);
  const r = solveTwoBone(upper, lower, hand, t, new Vector3(0, -1, 0), 1);
  assert.ok(r.clamped);
  const reach = wp(hand).distanceTo(sh);
  assert.ok(Math.abs(reach - REACH_MAX * (l1 + l2)) < 1e-4, `reach ${reach}`);
  const dir = wp(hand).sub(sh).normalize(), want = t.clone().sub(sh).normalize();
  assert.ok(dir.dot(want) > 0.99999);
  assert.ok(Math.abs(r.reachError - (t.distanceTo(sh) - reach)) < 1e-4);
});

test("two-bone solve: the elbow bends toward the pole's side, for either pole", () => {
  for (const pole of [new Vector3(0, -1, 0), new Vector3(0, 1, 0), new Vector3(0.3, -0.6, 0.7)]) {
    const { upper, lower, hand } = arm();
    const sh = wp(upper);
    const t = sh.clone().add(new Vector3(0.05, -0.1, 0.25));
    solveTwoBone(upper, lower, hand, t, pole, 1);
    const n = t.clone().sub(sh).normalize();
    const e = wp(lower).sub(sh);
    const across = e.clone().addScaledVector(n, -e.dot(n));
    const p = pole.clone().addScaledVector(n, -pole.dot(n));
    assert.ok(across.length() > 0.05, "the elbow is bent");
    assert.ok(across.normalize().dot(p.normalize()) > 0.999, `elbow off the pole plane for pole ${pole.toArray()}`);
  }
});

test("two-bone solve: weight 0 leaves the clip pose, weight blends toward the solve", () => {
  const { upper, lower, hand } = arm();
  const start = wp(hand);
  const t = wp(upper).add(new Vector3(0, -0.2, 0.2));
  solveTwoBone(upper, lower, hand, t, new Vector3(0, -1, 0), 0);
  assert.ok(wp(hand).distanceTo(start) < 1e-9);
  solveTwoBone(upper, lower, hand, t, new Vector3(0, -1, 0), 0.5);
  const half = wp(hand);
  assert.ok(half.distanceTo(start) > 0.01 && half.distanceTo(t) > 0.01);
});

test("setWorldQuaternion sets the hand's world rotation exactly under any parent", () => {
  const { hand } = arm();
  const want = new Quaternion().setFromEuler(new Euler(-1.1, 0.4, 2.2));
  setWorldQuaternion(hand, want, 1);
  const got = hand.getWorldQuaternion(new Quaternion());
  assert.ok(Math.abs(Math.abs(got.dot(want)) - 1) < 1e-9);
});

test("splitTwist moves half the hand's twist to the forearm and keeps the hand where it was", () => {
  const { upper, lower, hand } = arm();
  const t = wp(upper).add(new Vector3(0.1, -0.15, 0.25));
  solveTwoBone(upper, lower, hand, t, new Vector3(0, -1, 0), 1);
  // twist the hand 1.2 rad about the forearm axis, as a hold might ask
  const axis = hand.position.clone().normalize();
  hand.quaternion.multiply(new Quaternion().setFromAxisAngle(axis, 1.2));
  hand.updateMatrixWorld(true);
  const q = hand.getWorldQuaternion(new Quaternion());
  const p = wp(hand);
  const fore0 = lower.quaternion.clone();
  splitTwist(lower, hand, 0.5);
  assert.ok(Math.abs(Math.abs(hand.getWorldQuaternion(new Quaternion()).dot(q)) - 1) < 1e-9, "hand rotation kept");
  assert.ok(wp(hand).distanceTo(p) < 1e-9, "wrist kept");
  // the forearm took about half of it
  const moved = 2 * Math.acos(Math.min(1, Math.abs(fore0.clone().invert().multiply(lower.quaternion).w)));
  assert.ok(Math.abs(moved - 0.6) < 0.05, `forearm twist ${moved}`);
});
