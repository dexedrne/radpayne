// Chapter 2 voices are preloaded with the end game audio group.
export const CH2_VOICED: string[] = [
  ...[
    "ch2a_01", "ch2a_02", "ch2a_03", "ch2a_04", "ch2b_01",
    "ch2b_02", "ch2b_03", "ch2c_01", "ch2c_02", "ch2c_03",
    "ch2d_01", "ch2d_02", "ch2d_03", "ch2e_01", "ch2e_02",
    "ch2e_03", "ch2f_01", "ch2f_02", "ch2f_03", "r6_enter",
    "r6_light", "r6_sniper", "r6_drop", "r6_lightout", "r6_clear",
    "r7_enter", "r7_crack", "r7_fall", "r7_clear", "r8_enter",
    "r8_klaxon", "r8_wind", "r8_clear", "r9_enter", "r9_shutters",
    "r9_dark", "r9_clear", "r10_rifle", "r10_beam", "r10_laststand",
  ].map(key => `voices/narrator/${key}`),
  ...[
    "ch2a_c1", "ch2e_c1", "ch2e_c2", "intro", "phase2",
    "phase3", "beam_1", "beam_2", "shot_1", "taunt_1",
    "taunt_2", "hit_2", "reload_1", "last_stand", "hit_1",
    "down_1",
  ].map(key => `voices/countess/${key}`),
  ...[
    "ch2a_g1", "ch2b_g2", "ch2c_g1", "rope_1",
  ].map(key => `voices/goon_a/${key}`),
  ...[
    "ch2a_g2", "ch2b_g1", "ch2c_g2", "wind_1",
  ].map(key => `voices/goon_b/${key}`),
];
