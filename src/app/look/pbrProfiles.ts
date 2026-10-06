// Explicit surface allowlist: no posters, signs, screens, window masks or character maps.
export type PbrProfile = { kind: string; relief: 'seams' | 'grooves' | 'grain'; strength: number; roughness: number; variation: number; wet: number; scale: number };
const kinds: Record<string, Omit<PbrProfile, 'kind' | 'wet'>> = {
 brick: {relief:'seams',strength:14,roughness:0.9,variation:0.055,scale:0.65},
 concrete: {relief:'grain',strength:5,roughness:0.88,variation:0.06,scale:0.5},
 block: {relief:'seams',strength:14,roughness:0.92,variation:0.045,scale:0.65},
 stone: {relief:'seams',strength:10,roughness:0.86,variation:0.05,scale:0.5},
 tile: {relief:'seams',strength:8,roughness:0.58,variation:0.09,scale:0.5},
 marble: {relief:'grain',strength:1.5,roughness:0.34,variation:0.07,scale:0.3},
 metal: {relief:'grooves',strength:10,roughness:0.65,variation:0.10,scale:0.5},
 wood: {relief:'grooves',strength:9,roughness:0.62,variation:0.08,scale:0.55},
 padded: {relief:'seams',strength:9,roughness:0.88,variation:0.045,scale:0.5},
 leather: {relief:'grain',strength:3,roughness:0.58,variation:0.08,scale:0.4},
 fabric: {relief:'grain',strength:1.8,roughness:0.95,variation:0.025,scale:0.35},
 cardboard: {relief:'grain',strength:2.5,roughness:0.91,variation:0.03,scale:0.4},
 asphalt: {relief:'grain',strength:4,roughness:0.82,variation:0.08,scale:0.5},
};
const surfaces: Record<string, string> = {
 'asphalt':'asphalt','sidewalk':'stone','facade-brick':'brick','facade-brownstone':'stone','facade-club':'brick','shutter':'metal',
 'club/floor_polished_concrete':'concrete','club/club_wall_padded':'padded','club/curtain_velvet':'fabric','club/bar_front':'wood','club/bar_top_marble':'marble','club/booth_leather':'leather','club/carpet_vip':'fabric',
 'backrooms/wall_cinderblock':'block','backrooms/wall_wood_panel':'wood','backrooms/ceiling_tiles':'tile','backrooms/floor_vinyl':'tile','backrooms/carpet_office':'fabric','backrooms/boxes_cardboard':'cardboard','backrooms/steel_panel':'metal','backrooms/wood_desk':'wood',
 'elevator/concrete_bare':'concrete','elevator/shaft_concrete':'concrete','elevator/car_floor_diamond':'metal','elevator/car_wall_steel':'metal','elevator/marble_grey':'marble','elevator/hazard_sill':'metal',
 'penthouse/wall_damask':'fabric','penthouse/wall_ebony_slats':'wood','penthouse/floor_marble_black':'marble','penthouse/ceiling_coffered':'wood','penthouse/bar_onyx':'marble','penthouse/rug_fur_white':'fabric',
};
export const PBR_SURFACES = Object.keys(surfaces).sort();
export function pbrProfile(set: string): PbrProfile | null {
 const kind = surfaces[set]; if (!kind) return null;
 return {kind,...kinds[kind],...(set==='club/floor_polished_concrete'?{roughness:0.48,strength:3}:{}),wet:set==='asphalt'?0.35:set==='sidewalk'?0.25:0};
}
