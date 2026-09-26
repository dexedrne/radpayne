// Where the pistols sit in the hands: the gun's transform in hand-bone local space (the gun is a child
// of the hand bone). Gun frame: +Z = barrel, +Y = top of the slide, origin = middle of the grip.
// Measured on each Radbro's Aim_Idle first frame (arms level, grips canted 10 deg inward); the Milady
// grip is for VRM1 normalized hands on a 0.217 m forearm (scale by the model's own forearm).
import type { RadbroId } from "../ui/store.ts";

export type Grip = { p: [number, number, number]; q: [number, number, number, number] };
export type HandGrips = { right: Grip; left: Grip };

export const RADBRO_GRIPS: Record<RadbroId, HandGrips> = {
  "652": {
    right: { p: [0.0074, 0.0641, 0.0128], q: [-0.6938, -0.18709, -0.20937, 0.66317] },
    left: { p: [-0.0059, 0.064, 0.0114], q: [-0.69979, 0.19135, 0.1905, 0.66136] },
  },
  "723": {
    right: { p: [-0.0032, 0.0635, 0.0181], q: [-0.62562, -0.29789, -0.26924, 0.66885] },
    left: { p: [0.0036, 0.0645, 0.0176], q: [-0.62981, 0.29629, 0.25727, 0.67035] },
  },
  "2564": {
    right: { p: [0.0052, 0.0545, 0.0122], q: [-0.6922, -0.22132, -0.22986, 0.64734] },
    left: { p: [0.0002, 0.0564, 0.0063], q: [-0.71838, 0.24813, 0.1592, 0.63009] },
  },
  "4764": {
    right: { p: [0.0036, 0.0598, 0.02], q: [-0.64543, -0.20661, -0.21927, 0.70189] },
    left: { p: [-0.0032, 0.0604, 0.0197], q: [-0.64715, 0.20687, 0.21108, 0.70274] },
  },
  "3171": {
    right: { p: [0.007, 0.0584, 0.0213], q: [-0.6471, -0.15724, -0.19067, 0.72124] },
    left: { p: [-0.0056, 0.0606, 0.0221], q: [-0.64284, 0.15385, 0.16594, 0.73181] },
  },
  "250": {
    right: { p: [-0.0031, 0.0657, 0.0168], q: [-0.652, -0.2489, -0.18213, 0.69266] },
    left: { p: [0.0021, 0.0642, 0.0169], q: [-0.65307, 0.24427, 0.18762, 0.69183] },
  },
};

export const MILADY_GRIP: HandGrips & { forearm: number } = {
  right: { p: [-0.0643, -0.0119, -0.0102], q: [0.50321, -0.49676, -0.50321, 0.49676] },
  left: { p: [0.0651, -0.0119, -0.0101], q: [0.50295, 0.49703, 0.50295, 0.49703] },
  forearm: 0.217,
};

/** The shotgun's attach scale per Radbro (round-2 clip manifest grips.shotgun.RightHand.scale): the
 *  shouldered pump gun at the reach of each chibi's arms. The right-hand grip is the pistol's. */
export const SHOTGUN_SCALE: Record<RadbroId, number> = { "652": 0.72, "723": 0.72, "2564": 0.64, "4764": 0.72, "3171": 0.7, "250": 0.72 };
