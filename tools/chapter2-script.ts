// Chapter 2's script (the single source): every cutscene's panels, who says what, each line's voice key,
// and the art note for each panel. Writes public/cutscenes/ch2a..ch2f.json and docs/chapter2-assets.md.
//   node tools/chapter2-script.ts
// A panel whose image is on disk (public/cutscenes/<id>/panel_<n>.webp) gets it; else it plays on its
// tone (a painted placeholder). A line whose voice file is missing plays as its caption alone.
import fs from "node:fs";
import path from "node:path";
import { readTime, FIRST, GAP } from "../src/ui/cutsceneTiming.ts";
import { CH2_BARKS, CH2_NARRATION, COUNTESS_LINES } from "../src/app/chapter2Lines.ts";

type Speaker = "narrator" | "countess" | "goon_a" | "goon_b";
type L = { who: Speaker; key: string; text: string };
type P = { tone: string; art: string; lines: L[] };
type Cut = { id: string; title: string; music: string; when: string; panels: P[] };

const T = "Chapter 2: Keeping Score";
const n = (key: string, text: string): L => ({ who: "narrator", key, text });
const c = (key: string, text: string): L => ({ who: "countess", key, text: `"${text}"` });
const a = (key: string, text: string): L => ({ who: "goon_a", key, text: `"${text}"` });
const b = (key: string, text: string): L => ({ who: "goon_b", key, text: `"${text}"` });

export const CUTS: Cut[] = [
  {
    id: "ch2a", title: T, music: "street", when: "the start of chapter 2 (before room 6, the roof)",
    panels: [
      { tone: "phone", art: "Madame Pockit's phone face up on the black marble of the penthouse, the screen lit, a caller ID that reads only a small gold crown. The Radbro's hand reaching for it, bag strap over his wrist. Rain-streaked glass behind.",
        lines: [n("ch2a_01", "her phone kept buzzing on the marble floor. i picked it up. i should have let it ring some more."), c("ch2a_c1", "one bag back? how cute. i keep a few thousand more. come up to the roof, little one. let's settle the score.")] },
      { tone: "storm", art: "A narrow concrete stairwell climbing up past the penthouse floor, a bare bulb every landing, rain hammering the steel door at the top, light leaking under it.",
        lines: [n("ch2a_02", "the stairs went on past where the building should end. the storm was waiting at the top, like an old friend.")] },
      { tone: "storm", art: "The tower roof in a downpour: a black helicopter hovering off the edge, its searchlight a hard white cone on the roof door. Two Pockit Miladys in raincoats with pistols, backlit by the beam, one pointing at the door.",
        lines: [n("ch2a_03", "a helicopter hung in the rain with its light on the door. it didn't blink. it had seen men like me before."), a("ch2a_g1", "he really came! the countess said he would."), b("ch2a_g2", "i said he'd come. i never said he was good.")] },
      { tone: "guns", art: "Close on the Radbro in the doorway, soaked, guns low, the searchlight flaring behind him into a halo; the whole city a long way below, out of focus.",
        lines: [n("ch2a_04", "nothing above me now but the weather and the fall. i'd come up here for one bag. now i wanted it all.")] },
    ],
  },
  {
    id: "ch2b", title: T, music: "garden", when: "after room 6 (the roof), before room 7 (the sky garden)",
    panels: [
      { tone: "storm", art: "The helicopter banking away into the storm clouds, its searchlight swinging off the roof; the Radbro small on the helipad below, looking up.",
        lines: [n("ch2b_01", "the helicopter turned tail and took its light home. it would tell her everything. let it. i'd come alone.")] },
      { tone: "sky", art: "A glass skybridge between two towers, lit from underneath, rain running down it; sixty floors of city lights straight down through the floor. The Radbro halfway across, a silhouette.",
        lines: [n("ch2b_02", "a glass bridge hung across to the tower next door. sixty floors of nothing underneath. i'd walked worse before.")] },
      { tone: "garden", art: "A greenhouse on top of the next tower: palms and ferns under a glass roof, a koi pond, warm lamps, clouds pressed against the glass. Two Miladys in garden-party dresses with pistols, one pointing at his wet footprints on the lawn.",
        lines: [n("ch2b_03", "on top she kept a garden, green behind the glass. palms in the clouds. money grows things. it doesn't make them last."), b("ch2b_g1", "shoes off on the lawn, cutie. you're dripping on the floor."), a("ch2b_g2", "let him drip. he won't be dripping anymore.")] },
    ],
  },
  {
    id: "ch2c", title: T, music: "airship", when: "after room 7 (the sky garden), before room 8 (the airship)",
    panels: [
      { tone: "sky", art: "Above the greenhouse, a private airship straining at a mooring mast in the blue hour, its gondola windows lit, mooring ropes slipping off their cleats.",
        lines: [n("ch2c_01", "above the garden an airship pulled against the mast. somebody up there was leaving, and leaving fast.")] },
      { tone: "sky", art: "The Radbro jumping for the gangway as the last rope snaps loose, one hand on the rail, the city dropping away beneath his shoes.",
        lines: [n("ch2c_02", "i caught the gangway as the last rope let go. the city fell away. i didn't look below.")] },
      { tone: "airship", art: "The airship's promenade deck: long curved windows full of cloud tops, velvet banquettes, brass rails, a bar. Two Miladys in stewardess uniforms, pistols out, smiling.",
        lines: [n("ch2c_03", "inside it was velvet and brass, and quiet, the expensive kind. the city was a mile down. up here, nobody minds."), a("ch2c_g1", "no ticket, no seat, and nowhere to run."), b("ch2c_g2", "it's a long way down, cutie. that's half the fun.")] },
    ],
  },
  {
    id: "ch2d", title: T, music: "counting", when: "after room 8 (the airship), before room 9 (the counting floor)",
    panels: [
      { tone: "sky", art: "The airship nosing in to dock on the crown of the tallest tower, far above a sea of cloud; no city visible at all, only cloud and the first grey of morning.",
        lines: [n("ch2d_01", "the ship came down on a tower above the clouds. no street, no rain, no sirens, no crowds.")] },
      { tone: "phone", art: "A trading floor: rows of desks and monitors, and one wall-sized board of names and numbers scrolling in green and red, girls at the desks looking up.",
        lines: [n("ch2d_02", "the top floor was a trading floor, screens from wall to wall. every name in the city was up there. she had them all.")] },
      { tone: "phone", art: "Close on the board: a line near the bottom in red with a small Radbro icon, and beside it the word PENDING. His reflection faint in the glass.",
        lines: [n("ch2d_03", "mine was near the bottom, in red. the column next to it said pending. pending what, it never said.")] },
    ],
  },
  {
    id: "ch2e", title: T, music: "vault", when: "after room 9 (the counting floor), before room 10 (the vault: the Countess)",
    panels: [
      { tone: "vault", art: "A round vault door, a foot thick, standing wide open at the end of a steel corridor, gold light spilling out of it.",
        lines: [n("ch2e_01", "the vault door was a foot thick, round, and open wide. like she'd been waiting. like she wanted me inside.")] },
      { tone: "vault", art: "Inside the vault under a glass dome: shelves of stolen bags and stacks of gold bars rising in rings; on the top stack sits the Countess, a Pockit Milady in a white fur stole and a thin gold crown, a long gold rifle across her knees, a ledger open beside her.",
        lines: [n("ch2e_02", "every bag they'd ever taken, stacked in rows up to the dome. and on top of it all, counting, the woman who called it home."), c("ch2e_c1", "three hundred and four came up here with a gun. you're three hundred and five, little one. make it fun.")] },
      { tone: "dawn", art: "Sunrise breaking through the dome behind her, the gold blazing; she raises the rifle and a thin white laser line lands on the Radbro's chest.",
        lines: [n("ch2e_03", "the sun came up behind her and it hit the gold like a bell. i'd been counted before. i'd been rugged as well."), c("ch2e_c2", "everyone gets counted. that's just how it's done. let's count you down together. ten to none.")] },
    ],
  },
  {
    id: "ch2f", title: T, music: "street", when: "after room 10 (the Countess), before TO BE CONTINUED and the chapter's results",
    panels: [
      { tone: "dawn", art: "The Countess fallen on the vault floor among spilled gold bars, her crown rolled away, the rifle out of reach; morning light across everything.",
        lines: [n("ch2f_01", "she went down still counting. she never got to one. the sun came up regardless. it doesn't care who won.")] },
      { tone: "vault", art: "The Radbro taking his own bag down from a shelf of a thousand bags, each tagged with a name card; he leaves the rest.",
        lines: [n("ch2f_02", "my bag was on a shelf, one of a thousand in a row. i took mine. the others had owners. i thought they ought to know.")] },
      { tone: "phone", art: "Her ledger open on the desk: page after page in her neat gold hand, and the last page in a different, heavier handwriting with her own name at the top.",
        lines: [n("ch2f_03", "her ledger lay open, every name and every fall. the last page was in another hand. somebody was counting her, after all.")] },
    ],
  },
];

const root = path.resolve(import.meta.dirname, "..");
const r1 = (v: number) => Math.round(v * 10) / 10;
/** A panel's hold: its lines read in turn (no voice yet: reading time) + about a second. */
function dur(p: P): number {
  let t = FIRST;
  for (const l of p.lines) t += readTime(l.text) + GAP;
  return r1(t + 0.8);
}

if (import.meta.main) {
  for (const cut of CUTS) {
    const panels = cut.panels.map((p, i) => {
      const img = `/cutscenes/${cut.id}/panel_${i + 1}.webp`;
      const has = fs.existsSync(path.join(root, "public", img.slice(1)));
      return {
        image: has ? img : "",
        tone: p.tone,
        box: [0.02, 0.03, 0.2, 0.08],
        lines: p.lines.map(l => ({ audio: l.key, ...(l.who !== "narrator" ? { speaker: l.who } : {}), text: l.text })),
        dur: dur(p),
        ...(p.lines.length > 1 ? { size: 0.86, maxW: 0.52 } : {}),
      };
    });
    const out = { id: cut.id, title: cut.title, music: cut.music, panels };
    fs.writeFileSync(path.join(root, "public", "cutscenes", `${cut.id}.json`), JSON.stringify(out, null, 2) + "\n");
    console.log(`wrote public/cutscenes/${cut.id}.json (${panels.length} panels, ${panels.filter(p => p.image).length} with art)`);
  }
}

/** docs/chapter2-assets.md: what needs real art and real voices. */
function assetsDoc(): string {
  const o: string[] = [];
  o.push("# Chapter 2: the art and voices it still needs", "");
  o.push("Chapter 2 plays start to finish on placeholders: every panel below shows its tone (a painted gradient) or,");
  o.push("where the file exists, the image; every line below shows its caption, and plays its voice once the file is");
  o.push("there. Regenerate the cutscene JSONs after adding panel art with `node tools/chapter2-script.ts` (it picks up");
  o.push("`public/cutscenes/<id>/panel_<n>.webp` by itself, then set each panel's `box` over the painted caption box).");
  o.push("Voices go in `public/audio/voices/<speaker>/<key>.mp3`; add each new key to `CH2_VOICED` in");
  o.push("`src/audio/chapter2.ts` so it preloads (an unlisted file is never fetched: the caption plays alone).", "");
  o.push("Style: the chapter 1 comic panels (ink noir, heavy blacks, rain and neon, a cream caption box in a top corner,");
  o.push("3:2). The narrator (the Radbro) is low, tired and serious; the Miladys are high and cute; the Countess is a");
  o.push("Milady too: sweet, precise and cold, never loud.", "");
  o.push("## Cutscene panels", "");
  for (const cut of CUTS) {
    o.push(`### ${cut.id}: ${cut.when}`, "");
    cut.panels.forEach((p, i) => {
      o.push(`${i + 1}. \`public/cutscenes/${cut.id}/panel_${i + 1}.webp\` (placeholder tone \`${p.tone}\`): ${p.art}`);
    });
    o.push("");
  }
  o.push("## Voice lines", "", "### Cutscenes", "", "| file | speaker | line |", "|---|---|---|");
  for (const cut of CUTS) for (const p of cut.panels) for (const l of p.lines) o.push(`| \`voices/${l.who}/${l.key}\` | ${l.who} | ${l.text.replace(/\|/g, "/")} |`);
  o.push("", "### In the rooms: the narrator", "", "| file | line |", "|---|---|");
  for (const [k, t] of Object.entries(CH2_NARRATION)) o.push(`| \`voices/narrator/${k}\` | ${t} |`);
  o.push("", "### In the rooms: the Countess (room 10)", "", "| file | line |", "|---|---|");
  for (const [k, t] of Object.entries(COUNTESS_LINES)) o.push(`| \`voices/countess/${k}\` | ${t || "(no words: a gasp, a sigh)"} |`);
  o.push("", "### In the rooms: the gang", "", "| file | line |", "|---|---|");
  for (const [k, t] of Object.entries(CH2_BARKS)) o.push(`| \`voices/${k}\` | ${t} |`);
  o.push("", "## Sound and music (placeholders in use)", "");
  o.push("- Music: the roof plays the street's calm loop and the fight loop; the garden and the counting floor the back");
  o.push("  rooms' calm loop; the airship the elevator muzak (a lounge on a ship); the vault the penthouse set (the");
  o.push("  Countess fights to Madame Pockit's loop). Wanted: a storm-roof loop, a sky-garden loop, an airship lounge loop,");
  o.push("  a trading-floor loop and the Countess's own boss loop (`src/audio/chapter2.ts`, `CH2_MUSIC`).");
  o.push("- The helicopter's rotor is procedural (filtered noise, pulsed). Wanted: a real rotor loop and a searchlight");
  o.push("  hum; the cargo door's blow-out and wind loop (now the elevator shaft's wind and the breach door); a glass");
  o.push("  floor's crack and collapse (now the penthouse's glass cracks and the club's glass wall); the counting floor's");
  o.push("  shutters and the power going out; the vault's laser hum and the lift chime.");
  o.push("", "## Models and textures", "");
  o.push("- The Countess is Pockit #" + "COUNTESS_POCKIT" + " at 1.3x with the sniper rifle and a procedural gold crown; a model of her own (white fur");
  o.push("  stole, gold crown, gold rifle) would replace it.");
  o.push("- The rooms reuse chapter 1's textures (the street, the back rooms, the elevator, the penthouse), tinted and lit");
  o.push("  for the storm, the garden, the ship, the trading floor and the sunrise. Wanted: roof gravel and HVAC panels, a");
  o.push("  helipad marking, greenhouse glass and planted beds, the airship's cabin panelling and a cloud-sea sky, the");
  o.push("  scoreboard's ticker, the vault's gold and the sunrise dome.");
  return o.join("\n") + "\n";
}
if (import.meta.main) {
  const { COUNTESS } = await import("../src/sim/tuning2.ts") as unknown as { COUNTESS?: { pockit: number } };
  fs.writeFileSync(path.join(root, "docs", "chapter2-assets.md"), assetsDoc().replace("COUNTESS_POCKIT", String(COUNTESS?.pockit ?? "?")));
  console.log("wrote docs/chapter2-assets.md");
}
