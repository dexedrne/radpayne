// The one canvas: <GameCanvas> + PrefabRoot mounting a play prefab composed in code (a camera node,
// then the room's own prefab as a child, so the scene renders exactly the JSON the sim read) with the
// runtime systems as children. Mounted once per room; restarts never remount it.
import { useEffect, useMemo, useRef } from "react";
import { GameCanvas, PrefabRoot, useScenePendingLoads, type GameObject, type Prefab } from "react-three-game";
import type { Session } from "./session.ts";
import { useUi } from "../ui/store.ts";
import { SimDriver } from "./SimDriver.tsx";
import { PlayerView } from "./PlayerView.tsx";
import { EnemiesView } from "./EnemiesView.tsx";
import { HeavyView } from "./HeavyView.tsx";
import { CrowdView } from "./CrowdView.tsx";
import { PropsView } from "./PropsView.tsx";
import { CameraView, CAMERA_NODE, FOV } from "./CameraView.tsx";
import { FxView } from "./FxView.tsx";
import { PickupsView } from "./PickupsView.tsx";
import { ArsenalFx } from "./ArsenalFx.tsx";
import { EggsView } from "./EggsView.tsx";
import { SecretsView } from "./SecretsView.tsx";
import { AssetsBridge } from "./characters.ts";
import { RoomLook } from "./look/index.tsx";
import { DebugView } from "./DebugView.tsx";
import { HudFrame } from "../ui/hud/HudFrame.tsx";
import { backendIs, dprFor, useGfx } from "./look/gfx.ts";
import { shareShaders } from "./look/shaderShare.ts";
import type { WebGPURenderer } from "three/webgpu";

const FORCE_WEBGL = new URLSearchParams(location.search).has("webgl2");
/** ?noshare: every object its own shaders again (look/shaderShare.ts off: the A/B check). */
const NO_SHARE = new URLSearchParams(location.search).has("noshare");


/** The scene's pending asset loads (the level's textures, the models): the shader warm-up waits for
 *  them (a texture arriving changes its material's shader). */
export const scenePending = { n: 0 };
function LoadBridge() {
  const pending = useScenePendingLoads();
  useEffect(() => { scenePending.n = pending; }, [pending]);
  return null;
}

export function playPrefab(level: Prefab): Prefab {
  const camera: GameObject = {
    id: CAMERA_NODE,
    components: {
      transform: { type: "Transform", properties: { position: [0, 3, 8] } },
      camera: { type: "Camera", properties: { fov: FOV, near: 0.05, far: 600 } },
    },
  };
  return {
    id: "rp-play",
    name: "RadPayne play",
    materials: level.materials,
    root: { id: "rp-root", children: [camera, level.root] },
  };
}

export function Scene({ s, onPhase, bootRef }: { s: Session; onPhase: (p: string) => void; bootRef?: (ready: boolean) => void }) {
  const prefab = useMemo(() => playPrefab(s.prefab as Prefab), [s]);
  // the canvas is made once: its own antialiasing does nothing for a post-processed frame (the scene
  // pass has its own MSAA per graphics preset), so it never changes with the settings
  const glConfig = useMemo(() => ({ antialias: false, ...(FORCE_WEBGL ? { forceWebGL: true } : {}) }), []);
  const res = useGfx(g => g.res);
  const booted = useRef(false);
  return (
    <GameCanvas
      flat
      dpr={dprFor(res, typeof devicePixelRatio === "number" ? devicePixelRatio : 1)}
      glConfig={glConfig}
      onCreated={st => {
        const be = (st.gl as unknown as { backend?: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean } }).backend;
        const name = be?.isWebGPUBackend ? "WebGPU" : be?.isWebGLBackend ? "WebGL2" : "unknown";
        useUi.setState({ backend: name });
        backendIs(name === "WebGL2");
        if (!NO_SHARE) shareShaders(st.gl as unknown as WebGPURenderer); // one program per material + buffer layout, not per object
        if (import.meta.env.MODE !== "production") Object.assign(window, { __gl: st.gl, __scene: st.scene }); // dev probe
        console.info("[radpayne] renderer:", name);
        if (!booted.current) { booted.current = true; bootRef?.(true); }
      }}
    >
      <RoomLook level={s.level} s={s} />
      <PrefabRoot data={prefab}>
        <AssetsBridge />
        <LoadBridge />
        <SimDriver s={s} onPhase={onPhase} />
        <PlayerView s={s} />
        <EnemiesView s={s} />
        <HeavyView s={s} />
        <CrowdView s={s} />
        <PropsView s={s} />
        <FxView s={s} />
        <PickupsView s={s} />
        <ArsenalFx s={s} />
        <EggsView s={s} />
        <SecretsView s={s} />
        <CameraView s={s} />
        <DebugView s={s} />
        <HudFrame s={s} />
      </PrefabRoot>
    </GameCanvas>
  );
}
