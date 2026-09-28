// Chapter 2 (rooms 6-10: the roof, the sky garden, the airship, the counting floor, the vault): the
// narrator's room lines and their HUD hints, the Countess's subtitled lines, the new barks and the rooms'
// HUD text. director.ts and ui/rooms.ts take these into their tables (subtitle == spoken line). None of
// these lines is voiced yet (docs/chapter2-assets.md): a line without its file shows its subtitle alone.

export const CH2_NARRATION: Record<string, string> = {
  r6_enter: "the roof. the storm had the whole sky to itself, and it still wanted mine.",
  r6_light: "the light found me. in this town, getting seen is how it starts.",
  r6_sniper: "a thin white line found my chest. up on the water tower, somebody had patience.",
  r6_drop: "they came down on ropes. slow time makes a long way down even longer.",
  r6_lightout: "the light went out. the pilot took the hint.",
  r6_clear: "the helicopter left without me. the bridge didn't.",
  r7_enter: "a garden in the clouds. palms, koi, and girls with guns under the ferns.",
  r7_crack: "the glass under me started talking. it didn't have much to say.",
  r7_fall: "the floor gave up. so did everybody standing on it.",
  r7_clear: "the garden went quiet. above it, a ship pulled at its ropes.",
  r8_enter: "an airship. the city a mile down, and velvet on the walls.",
  r8_klaxon: "somebody hit the cargo door. the whole sky wanted in.",
  r8_wind: "the sky took them one by one. it didn't care whose side they were on.",
  r8_clear: "the ship turned for the last tower. she was expecting me.",
  r9_enter: "the counting floor. every screen had a name on it, and a number next to the name.",
  r9_shutters: "the shutters came down. she liked her rooms divided.",
  r9_dark: "the lights went out. the screens stayed on. it's always the screens that stay on.",
  r9_clear: "past the screens, a round door, a foot thick, standing open.",
  r10_rifle: "her rifle drew a white line to my heart before it did anything else.",
  r10_beam: "red lines on the floor, sweeping. the high ones you go under. the low ones you go over.",
  r10_laststand: "she ran for the door. she'd never been on this end of a count.",
};

export const CH2_HINTS: Record<string, string> = {
  r6_light: "stay out of the searchlight",
  r6_sniper: "white line: move or dive",
  r6_drop: "shoot them on the ropes",
  r7_crack: "get off the glass",
  r8_klaxon: "run against the wind",
  r9_shutters: "the catwalk goes around",
  r10_rifle: "white line: move or dive",
  r10_beam: "high beam: dive · low beam: jump",
};

/** The room lines that close a room; the story beats (every time); the commentary (Normal, once ever). */
export const CH2_CLEAR_LINES = ["r6_clear", "r7_clear", "r8_clear", "r9_clear"];
export const CH2_STORY = ["r6_enter", "r7_enter", "r8_enter", "r9_enter", "r10_laststand"];
export const CH2_FILLER = ["r6_lightout", "r7_fall", "r8_wind", "r9_dark"];

/** The Countess (voices/countess): her fight lines' subtitles (the non-verbal ones have none). */
export const COUNTESS_LINES: Record<string, string> = {
  intro: "you're late, little one. i counted every step.",
  phase2: "lights on the floor, girls. let's count him down.",
  phase3: "no more counting. let's just finish.",
  beam_1: "hop, little one.",
  beam_2: "down you go.",
  shot_1: "hold still.",
  taunt_1: "you're worth less every minute.",
  taunt_2: "everybody ends up in my book.",
  hit_2: "that's going on your bill.",
  reload_1: "one moment. counting.",
  last_stand: "no. no. that's not the number.",
  hit_1: "",
  down_1: "",
};
/** Her big lines (every setting); the rest are combat lines under the talk budget. */
export const COUNTESS_KEY = new Set(["intro", "phase2", "phase3", "last_stand", "down_1"]);

/** The new barks (a girl on a rope, a girl at the klaxon). */
export const CH2_BARKS: Record<string, string> = {
  "goon_a/rope_1": "coming down!",
  "goon_b/wind_1": "hold on to something!",
};

const CH = "chapter 2: keeping score";
/** HUD text for rooms 6-10 (ui/rooms.ts): chapter 2 numbers its own rooms 1-5. */
export const CH2_ROOMS = {
  room6: {
    number: 1, of: 5, chapter: CH, label: "THE ROOF",
    objective: "the roof. the snipers, the helicopter, and the bridge past them.",
    objectiveClear: "the bridge to the next tower.",
    killcamLine: "last one. the rain didn't stop for her either.",
    clearLine: "the helicopter left without me. the bridge didn't.",
    pauseLine: "chapter 2: keeping score. the roof, in the storm.",
    next: "THE SKY GARDEN",
  },
  room7: {
    number: 2, of: 5, chapter: CH, label: "THE SKY GARDEN",
    objective: "the garden. the airship is moored above it.",
    objectiveClear: "the mast. the airship.",
    killcamLine: "last one. the koi didn't look up.",
    clearLine: "the garden went quiet. above it, a ship pulled at its ropes.",
    pauseLine: "chapter 2: keeping score. a garden in the clouds.",
    next: "THE AIRSHIP",
  },
  room8: {
    number: 3, of: 5, chapter: CH, label: "THE AIRSHIP",
    objective: "clear the ship. it's going where she is.",
    objectiveClear: "the aft stair. she was docking.",
    killcamLine: "last one. a long way down.",
    clearLine: "the ship turned for the last tower. she was expecting me.",
    pauseLine: "chapter 2: keeping score. the airship, a mile up.",
    next: "THE COUNTING FLOOR",
  },
  room9: {
    number: 4, of: 5, chapter: CH, label: "THE COUNTING FLOOR",
    objective: "the counting floor. the vault is past it.",
    objectiveClear: "the vault door.",
    killcamLine: "last one. the numbers kept moving.",
    clearLine: "past the screens, a round door, a foot thick, standing open.",
    pauseLine: "chapter 2: keeping score. the counting floor, above the clouds.",
    next: "THE VAULT",
  },
  room10: {
    number: 5, of: 5, chapter: CH, label: "THE VAULT",
    objective: "the countess. end the count.",
    objectiveClear: "the bag.",
    killcamLine: "last one. the count stopped.",
    clearLine: "my bag was back. her book wasn't finished.",
    pauseLine: "chapter 2: keeping score. the vault, at sunrise.",
    next: "CHAPTER 3",
  },
};
