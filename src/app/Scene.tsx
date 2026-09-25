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
import { AssetsBridge } from "./characters.ts";
import { RoomLook } from "./look/index.tsx";
import { DebugView } from "./DebugView.tsx";

const FORCE_WEBGL = new URLSearchParams(location.search).has("webgl2");

/** Pending asset loads -> the UI store. */
function LoadBridge() {
  const pending = useScenePendingLoads();
  useEffect(() => { useUi.setState({ load: { ...useUi.getState().load, progress: pending ? 0.5 : 1 } }); }, [pending]);
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

export function Scene({ s, onPhase, lowQuality, bootRef }: { s: Session; onPhase: (p: string) => void; lowQuality: boolean; bootRef?: (ready: boolean) => void }) {
  const prefab = useMemo(() => playPrefab(s.prefab as Prefab), [s]);
  const glConfig = useMemo(() => ({ antialias: !lowQuality, ...(FORCE_WEBGL ? { forceWebGL: true } : {}) }), [lowQuality]);
  const booted = useRef(false);
  return (
    <GameCanvas
      flat
      dpr={lowQuality ? 1 : [1, 1.75]}
      glConfig={glConfig}
      onCreated={st => {
        const be = (st.gl as unknown as { backend?: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean } }).backend;
        const name = be?.isWebGPUBackend ? "WebGPU" : be?.isWebGLBackend ? "WebGL2" : "unknown";
        useUi.setState({ backend: name });
        console.info("[radpayne] renderer:", name);
        if (!booted.current) { booted.current = true; bootRef?.(true); }
      }}
    >
      <RoomLook level={s.level} s={s} lowQuality={lowQuality} />
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
        <CameraView s={s} />
        <DebugView s={s} />
      </PrefabRoot>
    </GameCanvas>
  );
}
