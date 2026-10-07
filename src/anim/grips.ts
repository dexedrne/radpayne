// Where the pistols sit in the hands: the gun's transform in hand-bone local space (the gun is a child
// of the hand bone). Gun frame: +Z = barrel, +Y = top of the slide, origin = middle of the grip.
// Measured on each Radbro's Aim_Idle first frame (arms level, grips canted 10 deg inward); the Milady
// grip is for VRM1 normalized hands on a 0.217 m forearm (scale by the model's own forearm).
import type { HeroId } from "../ui/store.ts";

export type Grip = { p: [number, number, number]; q: [number, number, number, number] };
export type HandGrips = { right: Grip; left: Grip };

export const RADBRO_GRIPS: Record<HeroId, HandGrips> = {
  // #723's gun frame through each new hand's bind offset, at its own measured palm.
  "3704": {
    right: { p: [-0.0018, 0.053, -0.0168], q: [0.02603, -0.70095, -0.65221, -0.28743] },
    left: { p: [0.0017, 0.0517, -0.0165], q: [-0.02752, -0.70649, -0.64206, 0.29643] },
  },
  "3710": {
    right: { p: [-0.0019, 0.0545, -0.017], q: [0.02657, -0.69698, -0.6605, -0.27796] },
    left: { p: [0.0042, 0.0545, -0.0072], q: [-0.03156, -0.62497, -0.72381, 0.29073] },
  },
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
  // The Retardios (#555, #85): their hand bones are rolled ~150-160 deg about the hand against #723's,
  // and that offset is the same in every clip (their clips are #723's, retargeted through the bind
  // poses). The grip turns by that offset, so the gun sits in the same world frame #723's does in every
  // clip (Shotgun_Aim_Idle: barrel straight ahead, the left hand on the pump); the grip point is their
  // own palm (measured on their hands). Never a Radbro's numbers as they are.
  retardio555: {
    right: { p: [-0.0048, 0.0502, -0.019], q: [0.02614, -0.77441, -0.6097, -0.16694] },
    left: { p: [0.009, 0.0515, -0.0198], q: [-0.02715, -0.79997, -0.58345, 0.13749] },
  },
  retardio85: {
    right: { p: [-0.0024, 0.0572, -0.0159], q: [0.0243, -0.77062, -0.59348, -0.23095] },
    left: { p: [0.0041, 0.055, -0.0173], q: [-0.03001, -0.71975, -0.66336, 0.20252] },
  },
};

export const MILADY_GRIP: HandGrips & { forearm: number } = {
  right: { p: [-0.0643, -0.0119, -0.0102], q: [0.50321, -0.49676, -0.50321, 0.49676] },
  left: { p: [0.0651, -0.0119, -0.0101], q: [0.50295, 0.49703, 0.50295, 0.49703] },
  forearm: 0.217,
};

/** The shotgun's attach scale per Radbro (round-2 clip manifest grips.shotgun.RightHand.scale): the
 *  shouldered pump gun at the reach of each chibi's arms. The right-hand grip is the pistol's. */
export const SHOTGUN_SCALE: Record<HeroId, number> = { "652": 0.72, "723": 0.72, "3704": 0.72, "3710": 0.72, "2564": 0.64, "4764": 0.72, "3171": 0.7, "250": 0.72, retardio555: 0.72, retardio85: 0.72 };
