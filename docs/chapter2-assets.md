# Chapter 2: art and voice reference

The cutscene panels and listed voices are recorded. Regenerate the cutscene JSONs with
`node tools/chapter2-script.ts` after changing a panel or line. It picks up panel images and
sets panel holds from the recorded clips. Voices live in `public/audio/voices/<speaker>/<key>.mp3`
and are preloaded through `CH2_VOICED` in `src/audio/chapter2.ts`.

Style: the chapter 1 comic panels (ink noir, heavy blacks, rain and neon, a cream caption box in a top corner,
3:2). The narrator (the Radbro) is low, tired and serious; the Miladys are high and cute; the Countess is a
Milady too: sweet, precise and cold, never loud.

## Cutscene panels

### ch2a: the start of chapter 2 (before room 6, the roof)

1. `public/cutscenes/ch2a/panel_1.webp` (fallback tone `phone`): Madame Pockit's phone face up on the black marble of the penthouse, the screen lit, a caller ID that reads only a small gold crown. The Radbro's hand reaching for it, bag strap over his wrist. Rain-streaked glass behind.
2. `public/cutscenes/ch2a/panel_2.webp` (fallback tone `storm`): A narrow concrete stairwell climbing up past the penthouse floor, a bare bulb every landing, rain hammering the steel door at the top, light leaking under it.
3. `public/cutscenes/ch2a/panel_3.webp` (fallback tone `storm`): The tower roof in a downpour: a black helicopter hovering off the edge, its searchlight a hard white cone on the roof door. Two Pockit Miladys in raincoats with pistols, backlit by the beam, one pointing at the door.
4. `public/cutscenes/ch2a/panel_4.webp` (fallback tone `guns`): Close on the Radbro in the doorway, soaked, guns low, the searchlight flaring behind him into a halo; the whole city a long way below, out of focus.

### ch2b: after room 6 (the roof), before room 7 (the sky garden)

1. `public/cutscenes/ch2b/panel_1.webp` (fallback tone `storm`): The helicopter banking away into the storm clouds, its searchlight swinging off the roof; the Radbro small on the helipad below, looking up.
2. `public/cutscenes/ch2b/panel_2.webp` (fallback tone `sky`): A glass skybridge between two towers, lit from underneath, rain running down it; sixty floors of city lights straight down through the floor. The Radbro halfway across, a silhouette.
3. `public/cutscenes/ch2b/panel_3.webp` (fallback tone `garden`): A greenhouse on top of the next tower: palms and ferns under a glass roof, a koi pond, warm lamps, clouds pressed against the glass. Two Miladys in garden-party dresses with pistols, one pointing at his wet footprints on the lawn.

### ch2c: after room 7 (the sky garden), before room 8 (the airship)

1. `public/cutscenes/ch2c/panel_1.webp` (fallback tone `sky`): Above the greenhouse, a private airship straining at a mooring mast in the blue hour, its gondola windows lit, mooring ropes slipping off their cleats.
2. `public/cutscenes/ch2c/panel_2.webp` (fallback tone `sky`): The Radbro jumping for the gangway as the last rope snaps loose, one hand on the rail, the city dropping away beneath his shoes.
3. `public/cutscenes/ch2c/panel_3.webp` (fallback tone `airship`): The airship's promenade deck: long curved windows full of cloud tops, velvet banquettes, brass rails, a bar. Two Miladys in stewardess uniforms, pistols out, smiling.

### ch2d: after room 8 (the airship), before room 9 (the counting floor)

1. `public/cutscenes/ch2d/panel_1.webp` (fallback tone `sky`): The airship nosing in to dock on the crown of the tallest tower, far above a sea of cloud; no city visible at all, only cloud and the first grey of morning.
2. `public/cutscenes/ch2d/panel_2.webp` (fallback tone `phone`): A trading floor: rows of desks and monitors, and one wall-sized board of names and numbers scrolling in green and red, girls at the desks looking up.
3. `public/cutscenes/ch2d/panel_3.webp` (fallback tone `phone`): Close on the board: a line near the bottom in red with a small Radbro icon, and beside it the word PENDING. His reflection faint in the glass.

### ch2e: after room 9 (the counting floor), before room 10 (the vault: the Countess)

1. `public/cutscenes/ch2e/panel_1.webp` (fallback tone `vault`): A round vault door, a foot thick, standing wide open at the end of a steel corridor, gold light spilling out of it.
2. `public/cutscenes/ch2e/panel_2.webp` (fallback tone `vault`): Inside the vault under a glass dome: shelves of stolen bags and stacks of gold bars rising in rings; on the top stack sits the Countess, a Pockit Milady in a white fur stole and a thin gold crown, a long gold rifle across her knees, a ledger open beside her.
3. `public/cutscenes/ch2e/panel_3.webp` (fallback tone `dawn`): Sunrise breaking through the dome behind her, the gold blazing; she raises the rifle and a thin white laser line lands on the Radbro's chest.

### ch2f: after room 10 (the Countess), before TO BE CONTINUED and the chapter's results

1. `public/cutscenes/ch2f/panel_1.webp` (fallback tone `dawn`): The Countess fallen on the vault floor among spilled gold bars, her crown rolled away, the rifle out of reach; morning light across everything.
2. `public/cutscenes/ch2f/panel_2.webp` (fallback tone `vault`): The Radbro taking his own bag down from a shelf of a thousand bags, each tagged with a name card; he leaves the rest.
3. `public/cutscenes/ch2f/panel_3.webp` (fallback tone `phone`): Her ledger open on the desk: page after page in her neat gold hand, and the last page in a different, heavier handwriting with her own name at the top.

## Voice lines

### Cutscenes

| file | speaker | line |
|---|---|---|
| `voices/narrator/ch2a_01` | narrator | her phone kept buzzing on the marble floor. i picked it up. i should have let it ring some more. |
| `voices/countess/ch2a_c1` | countess | "one bag back? how cute. i keep a few thousand more. come up to the roof, little one. let's settle the score." |
| `voices/narrator/ch2a_02` | narrator | the stairs went on past where the building should end. the storm was waiting at the top, like an old friend. |
| `voices/narrator/ch2a_03` | narrator | a helicopter hung in the rain with its light on the door. it didn't blink. it had seen men like me before. |
| `voices/goon_a/ch2a_g1` | goon_a | "he really came! the countess said he would." |
| `voices/goon_b/ch2a_g2` | goon_b | "i said he'd come. i never said he was good." |
| `voices/narrator/ch2a_04` | narrator | nothing above me now but the weather and the fall. i'd come up here for one bag. now i wanted it all. |
| `voices/narrator/ch2b_01` | narrator | the helicopter turned tail and took its light home. it would tell her everything. let it. i'd come alone. |
| `voices/narrator/ch2b_02` | narrator | a glass bridge hung across to the tower next door. sixty floors of nothing underneath. i'd walked worse before. |
| `voices/narrator/ch2b_03` | narrator | on top she kept a garden, green behind the glass. palms in the clouds. money grows things. it doesn't make them last. |
| `voices/goon_b/ch2b_g1` | goon_b | "shoes off on the lawn, cutie. you're dripping on the floor." |
| `voices/goon_a/ch2b_g2` | goon_a | "let him drip. he won't be dripping anymore." |
| `voices/narrator/ch2c_01` | narrator | above the garden an airship pulled against the mast. somebody up there was leaving, and leaving fast. |
| `voices/narrator/ch2c_02` | narrator | i caught the gangway as the last rope let go. the city fell away. i didn't look below. |
| `voices/narrator/ch2c_03` | narrator | inside it was velvet and brass, and quiet, the expensive kind. the city was a mile down. up here, nobody minds. |
| `voices/goon_a/ch2c_g1` | goon_a | "no ticket, no seat, and nowhere to run." |
| `voices/goon_b/ch2c_g2` | goon_b | "it's a long way down, cutie. that's half the fun." |
| `voices/narrator/ch2d_01` | narrator | the ship came down on a tower above the clouds. no street, no rain, no sirens, no crowds. |
| `voices/narrator/ch2d_02` | narrator | the top floor was a trading floor, screens from wall to wall. every name in the city was up there. she had them all. |
| `voices/narrator/ch2d_03` | narrator | mine was near the bottom, in red. the column next to it said pending. pending what, it never said. |
| `voices/narrator/ch2e_01` | narrator | the vault door was a foot thick, round, and open wide. like she'd been waiting. like she wanted me inside. |
| `voices/narrator/ch2e_02` | narrator | every bag they'd ever taken, stacked in rows up to the dome. and on top of it all, counting, the woman who called it home. |
| `voices/countess/ch2e_c1` | countess | "three hundred and four came up here with a gun. you're three hundred and five, little one. make it fun." |
| `voices/narrator/ch2e_03` | narrator | the sun came up behind her and it hit the gold like a bell. i'd been counted before. i'd been rugged as well. |
| `voices/countess/ch2e_c2` | countess | "everyone gets counted. that's just how it's done. let's count you down together. ten to none." |
| `voices/narrator/ch2f_01` | narrator | she went down still counting. she never got to one. the sun came up regardless. it doesn't care who won. |
| `voices/narrator/ch2f_02` | narrator | my bag was on a shelf, one of a thousand in a row. i took mine. the others had owners. i thought they ought to know. |
| `voices/narrator/ch2f_03` | narrator | her ledger lay open, every name and every fall. the last page was in another hand. somebody was counting her, after all. |

### In the rooms: the narrator

| file | line |
|---|---|
| `voices/narrator/r6_enter` | the roof. the storm had the whole sky to itself, and it still wanted mine. |
| `voices/narrator/r6_light` | the light found me. in this town, getting seen is how it starts. |
| `voices/narrator/r6_sniper` | a thin white line found my chest. up on the water tower, somebody had patience. |
| `voices/narrator/r6_drop` | they came down on ropes. slow time makes a long way down even longer. |
| `voices/narrator/r6_lightout` | the light went out. the pilot took the hint. |
| `voices/narrator/r6_clear` | the helicopter left without me. the bridge didn't. |
| `voices/narrator/r7_enter` | a garden in the clouds. palms, koi, and girls with guns under the ferns. |
| `voices/narrator/r7_crack` | the glass under me started talking. it didn't have much to say. |
| `voices/narrator/r7_fall` | the floor gave up. so did everybody standing on it. |
| `voices/narrator/r7_clear` | the garden went quiet. above it, a ship pulled at its ropes. |
| `voices/narrator/r8_enter` | an airship. the city a mile down, and velvet on the walls. |
| `voices/narrator/r8_klaxon` | somebody hit the cargo door. the whole sky wanted in. |
| `voices/narrator/r8_wind` | the sky took them one by one. it didn't care whose side they were on. |
| `voices/narrator/r8_clear` | the ship turned for the last tower. she was expecting me. |
| `voices/narrator/r9_enter` | the counting floor. every screen had a name on it, and a number next to the name. |
| `voices/narrator/r9_shutters` | the shutters came down. she liked her rooms divided. |
| `voices/narrator/r9_dark` | the lights went out. the screens stayed on. it's always the screens that stay on. |
| `voices/narrator/r9_clear` | past the screens, a round door, a foot thick, standing open. |
| `voices/narrator/r10_rifle` | her rifle drew a white line to my heart before it did anything else. |
| `voices/narrator/r10_beam` | red lines on the floor, sweeping. the high ones you go under. the low ones you go over. |
| `voices/narrator/r10_laststand` | she ran for the door. she'd never been on this end of a count. |

### In the rooms: the Countess (room 10)

| file | line |
|---|---|
| `voices/countess/intro` | you're late, little one. i counted every step. |
| `voices/countess/phase2` | lights on the floor, girls. let's count him down. |
| `voices/countess/phase3` | no more counting. let's just finish. |
| `voices/countess/beam_1` | hop, little one. |
| `voices/countess/beam_2` | down you go. |
| `voices/countess/shot_1` | hold still. |
| `voices/countess/taunt_1` | you're worth less every minute. |
| `voices/countess/taunt_2` | everybody ends up in my book. |
| `voices/countess/hit_2` | that's going on your bill. |
| `voices/countess/reload_1` | one moment. counting. |
| `voices/countess/last_stand` | no. no. that's not the number. |
| `voices/countess/hit_1` | (no words: a gasp, a sigh) |
| `voices/countess/down_1` | (no words: a gasp, a sigh) |

### In the rooms: the gang

| file | line |
|---|---|
| `voices/goon_a/rope_1` | coming down! |
| `voices/goon_b/wind_1` | hold on to something! |

## Sound and music (placeholders in use)

- Music: the roof plays the street's calm loop and the fight loop; the garden and the counting floor the back
  rooms' calm loop; the airship the elevator muzak (a lounge on a ship); the vault the penthouse set (the
  Countess fights to Madame Pockit's loop). Wanted: a storm-roof loop, a sky-garden loop, an airship lounge loop,
  a trading-floor loop and the Countess's own boss loop (`src/audio/chapter2.ts`, `CH2_MUSIC`).
- The helicopter's rotor is procedural (filtered noise, pulsed). Wanted: a real rotor loop and a searchlight
  hum; the cargo door's blow-out and wind loop (now the elevator shaft's wind and the breach door); a glass
  floor's crack and collapse (now the penthouse's glass cracks and the club's glass wall); the counting floor's
  shutters and the power going out; the vault's laser hum and the lift chime.

## Models and textures

- The Countess is Pockit #1847 at 1.3x with the sniper rifle and a procedural gold crown; a model of her own (white fur
  stole, gold crown, gold rifle) would replace it.
- The rooms reuse chapter 1's textures (the street, the back rooms, the elevator, the penthouse), tinted and lit
  for the storm, the garden, the ship, the trading floor and the sunrise. Wanted: roof gravel and HVAC panels, a
  helipad marking, greenhouse glass and planted beds, the airship's cabin panelling and a cloud-sea sky, the
  scoreboard's ticker, the vault's gold and the sunrise dome.
