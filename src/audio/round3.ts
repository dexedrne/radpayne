// Rooms 4-5 and cutscenes 3-4 (the elevator, the penthouse): their sound files. They are their own load
// group ("end", loadEndSamples() once the chapter gets there), so rooms 1-3 never download them; a
// cutscene's lines still load on demand when its panels come up.

const sfx = (...k: string[]) => k.map(n => `sfx/${n}`);
const voices = (who: string, ...k: string[]) => k.map(n => `voices/${who}/${n}`);

export const ROUND3_FILES = [
  // the elevator: the car, the shaft, the roof heavy, the cables
  ...sfx("elevator_hum_loop", "shaft_wind_loop", "elevator_start", "elevator_stop", "elevator_gate", "roof_thud", "hatch_kick",
    "cable_snap", "car_drop", "emergency_brake", "sparks", "doors_pry"),
  // the penthouse: her grenades, the chandelier, the add doors, the coat, the sweep tell, the window
  ...sfx("grenade_pin", "grenade_beep", "grenade_bounce", "grenade_explode", "grenade_explode_2", "grenade_pop", "chandelier_snap",
    "chandelier_crash", "add_doors_open", "coat_drop", "boss_sweep_tell", "glass_crack", "glass_crack_2", "penthouse_room_tone_loop"),
  "music/elevator_muzak", "music/elevator_muzak_warped", "music/boss_madame",
  ...voices("narrator", "r4_enter", "r4_stop1", "r4_heavy", "r4_reinforce", "r4_cables", "r4_stuck", "r4_clear",
    "r5_grenade", "r5_chandelier", "r5_laststand", "cs3_01", "cs3_02", "cs3_03", "cs3_04", "cs4_01", "cs4_02", "cs4_03"),
  ...voices("madame", "cs3_m1", "cs3_m2", "cs3_m3", "intro", "phase2", "phase3", "grenade_1", "grenade_2", "grenade_3",
    "taunt_1", "taunt_2", "hit_1", "hit_2", "stagger_1", "laugh_1", "reload_1", "last_stand", "down_1"),
  "voices/goon_a/doors_1", "voices/goon_b/doors_1", "voices/heavy/roof_1", "voices/radbro/brace",
];

const SET = new Set<string>(ROUND3_FILES);
export const isRound3 = (k: string): boolean => SET.has(k);
