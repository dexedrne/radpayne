// Room looks. The level's Data {room: {look}} picks one: "street" is room 1's rainy Manhattan night
// (street.tsx: puddle reflections, bloom, rain, neon), "club" the rave inside (club.tsx), "backrooms" the
// back of the house (backrooms.tsx: fluorescent tubes, exit lights, desk lamps); GreyboxLook is the plain stand-in (night fog, a
// cool moon, sodium street lamps and the level's "light" markers).
import type { LevelData } from "../../world/level.ts";
import type { Session } from "../session.ts";
import { MarkerLights } from "./lights.tsx";
import { StreetLook } from "./street.tsx";
import { ClubLook } from "./club.tsx";
import { BackroomsLook } from "./backrooms.tsx";

export const FOG = "#0b0f1c";

export type LookProps = { level: LevelData; s?: Session; lowQuality?: boolean };

export function GreyboxLook({ level }: LookProps) {
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

export const LOOKS: Record<string, (p: LookProps) => React.ReactNode> = {
  greybox: GreyboxLook,
  street: StreetLook,
  club: ClubLook,
  backrooms: BackroomsLook,
};

export function RoomLook(p: LookProps) {
  const L = LOOKS[(p.level.room.look as string) ?? "greybox"] ?? GreyboxLook;
  return <L {...p} />;
}
