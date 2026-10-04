// The crowd's and the gang's bodies are culled when out of view, as three culls anything: the renderer
// tests each mesh against the camera's frustum and skips the draw (and, for a skinned one, the skinning of
// its vertices) of one that is not in it, in the scene pass and the goon mask pass alike. A skinned mesh's
// own sphere is taken off the pose of the moment and would be stale a stride later, so each gets its bind
// pose's sphere grown CULL_K times: no pose a girl takes leaves it (on her feet, dancing, fleeing or
// cowering about 1.3 times it, a dive or a death's fall about 1.9; the bodies were culled off before, every
// one drawn wherever the camera looked). The shader warm-up still compiles every one of them
// (look/compile.ts turns culling off while it runs), so none builds its shaders as she comes into view.
import { Frustum, Matrix4, type Camera, type Object3D, type SkinnedMesh } from "three";

/** A skinned body's culling sphere: its bind pose's, this many times as big. */
export const CULL_K = 2.5;

/** Cull a body's meshes when out of view (its skinned ones by their grown bind-pose sphere). */
export function cullBody(root: Object3D): void {
  root.traverse(o => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isMesh) return;
    if (mesh.isSkinnedMesh) {
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return;
      mesh.boundingSphere = g.boundingSphere.clone();
      mesh.boundingSphere.radius *= CULL_K;
    }
    mesh.frustumCulled = true;
  });
}

const m4 = new Matrix4();
/** The camera's frustum (as it was last drawn: its matrices are the last frame's until the camera moves). */
export function viewFrustum(camera: Camera, out = new Frustum()): Frustum {
  return out.setFromProjectionMatrix(m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
