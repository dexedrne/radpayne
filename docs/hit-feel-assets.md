# Hit feel: sounds that would be better as new samples

The hit confirms (`src/audio/hitSounds.ts`) are built in the browser: filtered noise from the engine's
shared buffer, short pitched sines, and trimmed, filtered slices of files already in `public/audio/sfx`
(`impact_metal`, `impact_metal_2`, `impact_body`, `impact_body_heavy`, `pistol_bt_boom`). They work and
cut through the guns, but three dedicated samples would sound more finished. If they are made, drop them
in `public/audio/sfx/`, add them to `FILES` in `src/audio/sfx.ts`, and play them from `hitSound()` in
place of (or layered over) the synthesized layers. Keep 3 variants of each (`_1` .. `_3`), mono, 44.1 kHz,
peak about -3 dBFS, trimmed tight (no silence before the transient).

| file | length | description |
|---|---|---|
| `hit_tick_1..3` | 40-60 ms | Body-hit confirm. A dry, crisp, slightly metallic "tk": a small hard click with a short papery top, centred around 2.5-4 kHz, almost no low end, no tail. Should read as "that landed" over a pistol shot without sounding like a UI beep. Variants differ by a few semitones and texture. |
| `hit_head_1..3` | 150-220 ms | Headshot confirm. A sharp crack followed by a bright, short metallic "tink" (a small bell struck with a rivet): inharmonic partials around 3 and 4.6 kHz, a fast decay, no reverb. Distinctly higher and more "ringing" than the tick. |
| `hit_kill_1..3` | 250-400 ms | Kill confirm. A meaty, muffled thump: a punch into a heavy bag with a sub drop (140 Hz falling to ~45 Hz), a soft click on top for definition, low-passed above ~2 kHz so it never fights the guns. Not gory, no squelch. |
| `hit_kill_final` | 500-700 ms | The last kill of a wave: the kill thump with a deeper, longer boom and a short noir "stinger" tail (a low brushed-cymbal swell cut off), still dry enough to sit under the kill cam whoosh. |

Mix notes for whoever makes them: they are played centre-panned on the SFX volume at about -9 dB (tick),
-7 dB (headshot), -5 dB (kill) under the pistols' dry shot; in bullet time they are pitched down by up to
18 % and low-passed to ~6 kHz, so avoid content that only lives above 8 kHz.
