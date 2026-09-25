// Aim geometry shared by the sim (where shots go) and the camera (what the crosshair shows).
// The camera sits on the line pivot - dir * arm, so the crosshair ray is pivot + dir * t whatever the
// arm length after wall collision: the sim only needs the pivot.

/** Over-the-right-shoulder pivot: height above the feet, offset to the camera's right (0.72: his big
 *  chibi head and hair stay clear of the crosshair; PlayerView also thins him out if they overlap). */
export const SHOULDER = { up: 1.55, right: 0.72, arm: 2.7, lyingUp: 0.85, minArm: 0.5 } as const;

/** Unit aim direction for yaw / pitch (yaw 0 looks down -Z, positive pitch up). */
export function aimDir(yaw: number, pitch: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

/** Model yaw (three.js rotation.y of a +Z-facing model) that faces along the aim yaw. */
export const facingOfAim = (yaw: number): number => yaw + Math.PI;

export const PITCH_MIN = -1.2;
export const PITCH_MAX = 1.1;

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
