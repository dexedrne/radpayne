// useFrame priorities. All negative: r3g internals keep priority 0 and negative priorities never
// take over rendering.
export const FRAME = {
  sim: -6, // SimDriver: input, fixed steps, events, interpolation
  actors: -5, // PlayerView / EnemiesView: root transforms, animation state
  animator: -4, // mixers
  bones: -3, // aim arms, spine twist, VRM update, guns on hands
  camera: -2, // CameraView
  fx: -1, // FxView (reads bones / final transforms)
} as const;

/** The room's render pass stands down while a full-screen card hides the canvas (a cutscene, the loading
 *  card): the last frame stays on the canvas and the frame's time goes to the room warm-up instead.
 *  PlayPage sets it; each room look's render callback reads it. */
export const renderGate = { skip: false };
