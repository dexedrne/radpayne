// Room looks. The level's Data {room: {look}} picks one; the scene agent adds the real rainy-Manhattan
// look here (planar puddle reflector, bloom, rain, neon lights, fog, colour grade) as its own
// component and registers it in LOOKS. GreyboxLook is the stand-in: night fog, a cool moon, sodium
// street lamps and neon-coloured point lights from "light" markers.
import type { LevelData } from "../../world/level.ts";

export const FOG = "#0b0f1c";

/** Lights from "light" markers: Data {marker: "light", color, intensity, distance}. */
function MarkerLights({ level }: { level: LevelData }) {
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

export function GreyboxLook({ level }: { level: LevelData }) {
  const exit = level.markers.find(m => m.kind === "exit");
  return (
    <>
      <color attach="background" args={[FOG]} />
      <fog attach="fog" args={[FOG, 14, 75]} />
      <hemisphereLight args={["#2a3a66", "#120c16", 0.9]} />
      <directionalLight position={[-30, 40, 20]} intensity={0.55} color="#8fa8ff" />
      {/* sodium street lamps along both curbs */}
      {[[-12, -7.5], [4, 7.5]].map(([x, z]) => <pointLight key={`l${x}`} position={[x, 5.5, z]} color="#ffae52" intensity={70} distance={22} decay={2} />)}
      {/* the club's neon spills onto the street */}
      {exit && <pointLight position={[exit.x, 4.2, exit.z + 1.2]} color="#ff3fa8" intensity={60} distance={18} decay={2} />}
      <MarkerLights level={level} />
    </>
  );
}

export const LOOKS: Record<string, (p: { level: LevelData }) => React.ReactNode> = {
  greybox: GreyboxLook,
};

export function RoomLook({ level }: { level: LevelData }) {
  const L = LOOKS[(level.room.look as string) ?? "greybox"] ?? GreyboxLook;
  return <L level={level} />;
}
