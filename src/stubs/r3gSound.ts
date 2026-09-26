// react-three-game's helpers/SoundManager creates an AudioContext the moment it is imported (its
// `sound` singleton). The game has its own audio engine (src/audio) and never uses it, so vite.config.ts
// points the import here: the same surface, no AudioContext.
const noop = () => undefined;
export const sound = {
  resume: noop,
  load: () => Promise.resolve(),
  playSync: noop,
  play: noop,
  hasBuffer: () => false,
  setBuffer: noop,
  setMasterVolume: noop,
  setSfxVolume: noop,
  setMusicVolume: noop,
};
export default sound;
