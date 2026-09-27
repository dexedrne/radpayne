// useFrame priorities. All negative: r3g internals keep priority 0 and negative priorities never
// take over rendering.
export const FRAME = {
  sim: -6, // SimDriver: input, fixed steps, events, interpolation
  actors: -5, // PlayerView / EnemiesView: root transforms, animation state
  animator: -4, // mixers
  bones: -3, // aim arms, spine twist, VRM update, guns on hands
  camera: -2, // CameraView
  fx: -1, // FxView (reads bones / final transforms)
} as const;

/** The room's render pass stands down while a full-screen card hides the canvas (a cutscene, the loading
 *  card: `card`, set by PlayPage) or while its shaders are being compiled off the critical frame
 *  (`warming`, look/compile.ts): the last frame stays on the canvas and the frame's time goes to the
 *  room warm-up instead. Each room look's render callback reads `skip`. */
export const renderGate = {
  card: false,
  warming: 0,
  get skip(): boolean { return this.card || this.warming > 0; },
  set skip(v: boolean) { this.card = v; },
};

/** A still of the room's next rendered frame, taken right after the look draws it (Scene.tsx FrameGrab,
 *  in the same task, while the canvas still holds the frame): room 3's open elevator becomes the panel
 *  room 4 gets ready under (PlayPage). */
export const frameGrab: { want: ((canvas: HTMLCanvasElement) => void) | null } = { want: null };

/** The next rendered frame as an image URL (a JPEG blob, at most `maxW` wide; the caller revokes it), or
 *  null when no frame is drawn in `timeoutMs` or the still comes back empty. */
export function grabFrame(maxW = 1600, timeoutMs = 700): Promise<string | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => { frameGrab.want = null; resolve(null); }, timeoutMs);
    frameGrab.want = src => {
      frameGrab.want = null;
      clearTimeout(timer);
      try {
        const k = Math.min(1, maxW / Math.max(1, src.width));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(src.width * k));
        c.height = Math.max(1, Math.round(src.height * k));
        const ctx = c.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(src, 0, 0, c.width, c.height);
        // a canvas read after its frame was handed off comes back black: no panel then
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        let lit = 0;
        for (let i = 0; i < px.length; i += 4 * 97) lit += px[i] + px[i + 1] + px[i + 2];
        if (lit === 0) { resolve(null); return; }
        c.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), "image/jpeg", 0.9);
      } catch {
        resolve(null);
      }
    };
  });
}
