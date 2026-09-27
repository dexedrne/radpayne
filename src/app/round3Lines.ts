// Rooms 4-5 (the elevator, the penthouse): the narrator's room lines and their HUD hints, Madame
// Pockit's subtitled lines and the rooms' HUD text. director.ts and ui/rooms.ts take these into their
// tables; the room builds cue them (subtitle == spoken line, as everywhere).

export const ROUND3_NARRATION: Record<string, string> = {
  r4_enter: "the service elevator. slow, and the music was worse.",
  r4_stop1: "the doors opened on company. they weren't expecting me either.",
  r4_heavy: "something heavy landed on the roof. it wasn't the rain.",
  r4_reinforce: "more came up the stairs. there were always more.",
  r4_cables: "then the cables went. for a second, so did my stomach.",
  r4_stuck: "the brakes caught. the doors didn't want to open. somebody opened them for me.",
  r4_clear: "the car was finished. the last stretch was stairs, and her.",
  r5_grenade: "she threw them like party favors. better in her hand than at my feet.",
  r5_chandelier: "the chandelier hung by one chain. so did her luck.",
  r5_laststand: "she went for my bag. old habits.",
};

export const ROUND3_HINTS: Record<string, string> = {
  r4_heavy: "watch the hatch",
  r5_grenade: "shoot the grenade",
  r5_chandelier: "shoot the chain",
};

/** The room lines that close a room (they drop the tutorial lines still waiting). */
export const ROUND3_CLEAR_LINES = ["r4_clear"];

/** Madame Pockit (voices/madame): her fight lines' subtitles (the non-verbal ones have none). */
export const MADAME: Record<string, string> = {
  intro: "the doors are locked, sweetie. it's just us now.",
  phase2: "girls? come and play.",
  phase3: "fine. no more manners.",
  grenade_1: "catch!",
  grenade_2: "a little present.",
  grenade_3: "heads up, cutie.",
  taunt_1: "you should have stayed out in the rain.",
  taunt_2: "everybody sells eventually.",
  hit_2: "rude.",
  stagger_1: "my coat!",
  reload_1: "one moment, darling.",
  last_stand: "no, no, no. that's mine.",
};

/** The new barks: a goon at a landing when the car doors open, the roof heavy dropping in. */
export const ROUND3_BARKS: Record<string, string> = {
  "goon_a/doors_1": "going up?",
  "goon_b/doors_1": "surprise.",
  "heavy/roof_1": "knock knock.",
};

/** HUD text for rooms 4 and 5 (ui/rooms.ts). */
export const ROUND3_ROOMS = {
  room4: {
    number: 4,
    of: 5,
    label: "THE ELEVATOR",
    objective: "ride it up. the bag is at the top.",
    objectiveClear: "the car is finished. the stairs.",
    killcamLine: "last one. the car went quiet.",
    clearLine: "the car was finished. the last stretch was stairs, and her.",
    pauseLine: "chapter 1: rugged. the service elevator. slow, and the music was worse.",
    next: "THE PENTHOUSE",
  },
  room5: {
    number: 5,
    of: 5,
    label: "THE PENTHOUSE",
    objective: "madame pockit. get the bag back.",
    objectiveClear: "the bag. it's over.",
    killcamLine: "last one. the coat came down.",
    clearLine: "the bag was back. somewhere above all of it, somebody was already counting.",
    pauseLine: "chapter 1: rugged. the penthouse. marble, glass, and her.",
    next: "CHAPTER 2",
  },
};
