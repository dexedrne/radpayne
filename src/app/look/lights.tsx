// Point lights from the level's "light" markers: Data {marker: "light", color, intensity, distance}.
import type { LevelData } from "../../world/level.ts";

export function MarkerLights({ level }: { level: LevelData }) {
  return (
    <>
      {level.markers.filter(m => m.kind === "light").map(m => (
        <pointLight
          key={m.id}
          position={[m.x, m.y, m.z]}
          color={(m.data.color as string) ?? "#ffb35c"}
          intensity={(m.data.intensity as number) ?? 20}
          distance={(m.data.distance as number) ?? 14}
          decay={2}
        />
      ))}
    </>
  );
}
