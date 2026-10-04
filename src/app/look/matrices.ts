// The scene's matrices, walked once a frame. three's renderer walks the whole scene graph
// (scene.updateMatrixWorld: every object's local matrix composed, its world matrix multiplied) at the start
// of every render call, and a room's frame makes two or three of them (the scene pass, the goon mask pass,
// room 1's puddle mirror): in the rave some 4,500 objects, most of them the crowd's and the gang's bones,
// walked each time, a sixth of a frame's main-thread time on a slow CPU. Nothing moves between the passes
// of one frame (the views move what they move in their useFrame callbacks, all of them before the look's
// render callback), so the frame walks it once and the passes render with that.
// And an actor that is not drawn (a hidden crowd girl: Low shows every other one; a goon still waiting for
// her trigger) keeps her matrices as they were: nothing reads them until she is shown again, and the walk
// on the frame she is shown brings them up to date before anything is drawn.
import { Object3D, type Scene } from "three";

/** Render the frame's passes (`render`) with the scene's matrices walked once, first. */
export function renderFrame(scene: Scene, render: () => void): void {
  scene.updateMatrixWorld();
  const auto = scene.matrixWorldAutoUpdate;
  scene.matrixWorldAutoUpdate = false;
  try {
    render();
  } finally {
    scene.matrixWorldAutoUpdate = auto;
  }
}

const walk = Object3D.prototype.updateMatrixWorld;

/** An actor's root: its subtree's matrices are walked only while it is shown. */
export function walkWhenShown(root: Object3D): void {
  root.updateMatrixWorld = function (this: Object3D, force?: boolean) {
    if (this.visible) walk.call(this, force);
  };
}
