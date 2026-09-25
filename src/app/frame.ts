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
