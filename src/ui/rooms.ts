// Per-room HUD text: the room tag, Radbro's objective captions, the kill-cam and results lines.
// A level can override any of these from its Data {room: {...}} settings (label, objective,
// objectiveClear, killcamLine, clearLine, number); unknown rooms fall back to the level's name.

export type RoomText = {
  /** Room number in the chapter (the tag reads "ROOM n · LABEL"). */
  number: number;
  label: string;
  /** Top-left caption when the room starts. */
  objective: string;
  /** ... and once it is clear (the exit is open). */
  objectiveClear: string;
  /** The caption over the final-kill cam. */
  killcamLine: string;
  /** Radbro's closing line on the results screen (room clear). */
  clearLine: string;
  /** The pause card's one-liner. */
  pauseLine: string;
  /** "chapter 1: rugged". */
  chapter: string;
  /** Rooms in the chapter so far ("room 1 of 1"). */
  of: number;
};

export const RUGGED_LINE = "the street took this one. get up. the bag is still in there.";

const ROOMS: Record<string, Partial<RoomText>> = {
  room1: {
    number: 1,
    label: "OUTSIDE CLUB MILADY",
    objective: "clear the street. my bag is inside the club.",
    objectiveClear: "the bag is inside. get to the door.",
    killcamLine: "last one. the street went quiet. the rain didn't.",
    clearLine: "the door was open. the bass was louder. my bag was in there somewhere.",
    pauseLine: "chapter 1: rugged. the street outside club milady. the rain didn't stop for me either.",
  },
};

const DEFAULTS: RoomText = {
  number: 1,
  label: "",
  objective: "clear the room.",
  objectiveClear: "that's all of them. find the way out.",
  killcamLine: "last one.",
  clearLine: "the door was open. the bass was louder. my bag was in there somewhere.",
  pauseLine: "chapter 1: rugged. the rain didn't stop for me either.",
  chapter: "chapter 1: rugged",
  of: 1,
};

/** The HUD text for a room id, with the level's own room settings (Data {room}) on top. */
export function roomText(id: string, settings?: { name?: string; [k: string]: unknown }): RoomText {
  const fromLevel: Partial<RoomText> = {};
  if (settings) {
    for (const k of ["label", "objective", "objectiveClear", "killcamLine", "clearLine", "pauseLine", "chapter"] as const) {
      const v = settings[k];
      if (typeof v === "string" && v) fromLevel[k] = v;
    }
    if (typeof settings.number === "number") fromLevel.number = settings.number;
  }
  const t: RoomText = { ...DEFAULTS, ...ROOMS[id], ...fromLevel };
  if (!t.label) t.label = (settings?.name ?? id).toUpperCase();
  return t;
}

/** "ROOM 1 · OUTSIDE CLUB MILADY". */
export const roomLabel = (t: RoomText): string => `ROOM ${t.number} · ${t.label}`;
