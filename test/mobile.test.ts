// The tablet / phone pass: which browsers are a phone or a tablet (an iPad asking for the desktop site
// among them), their Low start and their canvas cap; the crowd's and the gang's culling spheres; the
// scene's matrices walked once a frame, and not under a hidden actor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Bone, BoxGeometry, Float32BufferAttribute, Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import { mobileFrom, MOBILE_DPR } from "../src/ui/mobile.ts";
import { DEFAULT_MOBILE, DEFAULT_PRESET, PRESETS, dprFor, initialGfx } from "../src/app/look/gfx.ts";
import { CULL_K, cullBody, viewFrustum } from "../src/app/cull.ts";
import { renderFrame, walkWhenShown } from "../src/app/look/matrices.ts";

const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });

test("a phone or a tablet: iPads (their own UA, or a Mac's with touch points), iPhones, Android; desktops are not", () => {
  const ipadChrome = "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1";
  const asMac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
  const macChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  const linux = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  assert.equal(mobileFrom({ ua: ipadChrome, touch: 5, platform: "iPad" }).mobile, true);
  assert.deepEqual(mobileFrom({ ua: asMac, touch: 5, platform: "MacIntel" }), { mobile: true, why: "iPad (as a Mac)" });
  assert.equal(mobileFrom({ ua: macChrome, touch: 0, platform: "MacIntel" }).mobile, false, "a Mac has no touch points");
  assert.equal(mobileFrom({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", touch: 5, platform: "iPhone" }).mobile, true);
  assert.equal(mobileFrom({ ua: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", touch: 10, platform: "Linux armv8l" }).mobile, true, "an Android tablet (no 'Mobile')");
  assert.equal(mobileFrom({ ua: win, touch: 10, platform: "Win32" }).mobile, false, "a Windows touch laptop");
  assert.equal(mobileFrom({ ua: linux, touch: 0, platform: "Linux x86_64" }).mobile, false);
});

test("a phone or a tablet starts on Low (a saved choice wins) and its canvas stays at MOBILE_DPR a point at most", () => {
  assert.equal(DEFAULT_MOBILE, "low");
  assert.equal(initialGfx("", store({}), false, true).preset, "low");
  assert.equal(initialGfx("", store({}), true, true).preset, "low", "on the WebGL2 fallback too");
  assert.equal(initialGfx("", store({ "radpayne.gfx": JSON.stringify(PRESETS.high) }), false, true).preset, "high", "a choice made is kept");
  assert.equal(initialGfx("?gfx=medium", store({}), false, true).preset, "medium");
  assert.equal(initialGfx("", store({}), false, false).preset, DEFAULT_PRESET, "the desktop's default as it was");
  // an iPad's 2x screen: Low draws one pixel a point (it drew 1.31), 100 % MOBILE_DPR (it drew 1.75)
  assert.equal(dprFor(75, 2, true), 1);
  assert.equal(dprFor(100, 2, true), MOBILE_DPR);
  assert.equal(dprFor(50, 2, true), MOBILE_DPR / 2);
  assert.equal(dprFor(100, 3, true), MOBILE_DPR, "a phone's 3x too");
  assert.equal(dprFor(100, 1, true), 1, "never over the screen's own");
  // the desktop's as it was
  assert.equal(dprFor(100, 2, false), 1.75);
  assert.equal(dprFor(75, 2, false), 1.3125);
});

/** A two-bone skinned strip 1.6 m tall, its bind pose standing at the origin. */
function body(): { root: Group; mesh: SkinnedMesh; top: Bone } {
  const g = new BoxGeometry(0.4, 1.6, 0.3, 1, 4, 1).translate(0, 0.8, 0);
  const n = g.attributes.position.count;
  const idx: number[] = [], w: number[] = [];
  for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); idx.push(y > 0.8 ? 1 : 0, 0, 0, 0); w.push(1, 0, 0, 0); }
  g.setAttribute("skinIndex", new Uint16BufferAttribute(idx, 4));
  g.setAttribute("skinWeight", new Float32BufferAttribute(w, 4));
  const hips = new Bone(), top = new Bone();
  top.position.y = 0.8;
  hips.add(top);
  const mesh = new SkinnedMesh(g, new MeshBasicMaterial());
  mesh.frustumCulled = false;
  const root = new Group();
  root.add(hips, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([hips, top]));
  return { root, mesh, top };
}

test("culling: a skinned body gets its bind pose's sphere grown CULL_K times; the renderer culls it only out of view", () => {
  const { root, mesh, top } = body();
  cullBody(root);
  assert.equal(mesh.frustumCulled, true);
  assert.ok(mesh.boundingSphere, "its own sphere (not the pose of the moment's)");
  const bind = mesh.geometry.boundingSphere!;
  assert.ok(Math.abs(mesh.boundingSphere!.radius - bind.radius * CULL_K) < 1e-9);
  // a pose that swings the upper half far out still sits inside the grown sphere (a dive, a fall)
  top.rotation.z = Math.PI / 2;
  root.updateMatrixWorld(true);
  const tip = new Vector3(0, 1.6, 0).applyMatrix4(new Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0.8, 0).multiply(new Matrix4().makeTranslation(0, -0.8, 0)));
  assert.ok(mesh.boundingSphere!.containsPoint(tip), "the swung tip");
  // in front of a camera: drawn; behind it: culled
  const cam = new PerspectiveCamera(68, 4 / 3, 0.05, 600);
  cam.position.set(0, 1.5, 6);
  cam.updateMatrixWorld(true);
  const f = viewFrustum(cam, new Frustum());
  assert.equal(mesh.intersectsFrustum(f), true);
  root.position.set(0, 0, 20);
  root.updateMatrixWorld(true);
  assert.equal(mesh.intersectsFrustum(f), false, "behind the camera");
  // a plain mesh on the body is culled by its own sphere
  const glow = new Mesh(new BoxGeometry(0.05, 0.2, 0.05), new MeshBasicMaterial());
  glow.frustumCulled = false;
  top.add(glow);
  cullBody(root);
  assert.equal(glow.frustumCulled, true);
});

test("matrices: walked once for a frame of passes, and not under a hidden actor until she is shown", () => {
  const scene = new Scene();
  const girl = new Group();
  const bone = new Group();
  girl.add(bone);
  scene.add(girl);
  walkWhenShown(girl);
  let walks = 0;
  const walk = scene.updateMatrixWorld.bind(scene);
  scene.updateMatrixWorld = (force?: boolean) => { walks++; walk(force); };
  // a pass renders the way three's renderer does: the scene's matrices first when it walks them itself
  const pass = () => { if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld(); };
  renderFrame(scene, () => { pass(); pass(); pass(); });
  assert.equal(walks, 1, "three passes, one walk");
  assert.equal(scene.matrixWorldAutoUpdate, true, "put back after the frame");
  bone.position.x = 1;
  renderFrame(scene, () => pass());
  assert.equal(bone.matrixWorld.elements[12], 1);
  girl.visible = false;
  bone.position.x = 2;
  renderFrame(scene, () => pass());
  assert.equal(bone.matrixWorld.elements[12], 1, "hidden: her bones keep their matrices");
  girl.visible = true;
  renderFrame(scene, () => pass());
  assert.equal(bone.matrixWorld.elements[12], 2, "shown again: up to date before the draw");
  // a pass that throws still puts the scene back
  assert.throws(() => renderFrame(scene, () => { throw new Error("x"); }));
  assert.equal(scene.matrixWorldAutoUpdate, true);
});

test('launcher phone profile overrides saved and URL graphics', () => {
  const saved = store({ 'radpayne.gfx': JSON.stringify(PRESETS.high) });
  const g = initialGfx('?device=phone&gfx=cinematic', saved, false, false);
  assert.equal(g.preset, 'low');
  assert.equal(g.reflections, 'off');
  assert.equal(g.lite, true);
});
