// Player controller: run / strafe relative to the aim, jump over low cover, the shootdodge (dive ->
// prone -> get up, or roll straight into a run), all against the box world. Movement runs on the
// player's clock (0.5x real time in bullet time); the dive is authored in real time.
import type { Player } from "./actors.ts";
import type { InputFrame } from "./types.ts";
import type { World } from "./world.ts";
import { DODGE, DODGE_GRAVITY, GUARD, PLAYER, ZOOM } from "./tuning.ts";
import { isLongGun, isOneHand } from "../combat/weapons.ts";
import { PITCH_MAX, PITCH_MIN, SHOULDER, facingOfAim } from "./aim.ts";
import { COVER_MOVE, attachCover, coverSpot, edgeAt, hideRange, leaveCover, segLive, segPoint, tucked, vaultLanding, type CoverSeg } from "./cover.ts";

export const PM_JUMP = 1;
export const PM_DIVE = 2;
export const PM_LAND = 4;
export const PM_PRONE = 8;
export const PM_GETUP = 16;
export const PM_ROLL = 32;
export const PM_COVER_IN = 64;
export const PM_COVER_OUT = 128;
export const PM_POP = 256;
export const PM_DUCK = 512;
export const PM_VAULT = 1024;

const tmp = { x: 0, z: 0 };

/** One step. `dt` = real step, `pdt` = the player's clock; `segs`: the room's cover (sim/cover.ts).
 *  Returns PM_* bits. */
export function stepPlayer(world: World, p: Player, inp: InputFrame, dt: number, pdt: number, segs: CoverSeg[] | null = null): number {
  let ev = 0;
  p.yaw = inp.yaw;
  p.pitch = inp.pitch < PITCH_MIN ? PITCH_MIN : inp.pitch > PITCH_MAX ? PITCH_MAX : inp.pitch;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let mx = -sy * inp.moveY + cy * inp.moveX;
  let mz = -cy * inp.moveY - sy * inp.moveX;
  const ml = Math.sqrt(mx * mx + mz * mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  p.moveWX = mx;
  p.moveWZ = mz;
  const moving = ml > 0.1;
  p.modeT += dt;
  if (p.dodgeCooldown > 0) p.dodgeCooldown -= dt;
  const aimFacing = facingOfAim(p.yaw);
  let height: number = PLAYER.height;
  let gravity: number = PLAYER.gravity;
  let stepDt = pdt;
  /** Cover this step: the segment he is in (after the move), placed on its line (no free movement). */
  let inCover: CoverSeg | null = null;
  let wantUp = -1;
  const wasPop = p.coverPop >= 0.5;
  if (p.mode !== "normal" && (p.cover >= 0 || p.dashSeg >= 0)) { leaveCover(p); ev |= PM_COVER_OUT; }

  switch (p.mode) {
    case "normal": {
      p.facing = aimFacing;
      if (inp.dodge && p.dodgeCooldown <= 0 && (p.cover >= 0 || p.dashSeg >= 0)) { leaveCover(p); ev |= PM_COVER_OUT; }
      if (inp.dodge && p.dodgeCooldown <= 0) {
        // dive along the move input, else straight ahead along the aim
        let dx = mx, dz = mz;
        if (!moving) { dx = -sy; dz = -cy; }
        const l = Math.sqrt(dx * dx + dz * dz) || 1;
        p.dirX = dx / l;
        p.dirZ = dz / l;
        p.mode = "dive";
        p.modeT = 0;
        p.vx = p.dirX * DODGE.speed;
        p.vz = p.dirZ * DODGE.speed;
        p.vy = DODGE.up;
        p.grounded = false;
        ev |= PM_DIVE;
        height = DODGE.height;
        gravity = DODGE_GRAVITY;
        stepDt = dt;
        break;
      }
      // the run to the marked cover: low and fast, straight at the spot; he is in it on arrival
      if (segs && p.dashSeg >= 0) {
        const s = segs[p.dashSeg];
        p.dashT += pdt;
        if (!s || !segLive(world, s) || p.dashT > COVER_MOVE.dashGiveUp) { leaveCover(p); ev |= PM_COVER_OUT; }
        else {
          const t = segPoint(s, p.dashU, tmp);
          const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
          if (d < 0.12) { attachCover(s, p, p.dashU); p.vx = p.vz = 0; ev |= PM_COVER_IN; }
          else {
            const sp = Math.min(COVER_MOVE.dash, d / Math.max(pdt, 1e-6));
            const a = PLAYER.accel * 1.6 * pdt;
            let dvx = (dx / d) * sp - p.vx, dvz = (dz / d) * sp - p.vz;
            const dl = Math.hypot(dvx, dvz);
            if (dl > a) { dvx *= a / dl; dvz *= a / dl; }
            p.vx += dvx;
            p.vz += dvz;
            height = 1.2;
            wantUp = 1.2;
            break;
          }
        }
      }
      if (segs && p.cover >= 0) {
        const s = segs[p.cover];
        if (!s || !segLive(world, s)) { leaveCover(p); ev |= PM_COVER_OUT; }
        else {
          // pushing away from it (camera-relative input, so "back" off a wall is the stick pulled back)
          const away = moving && (mx * s.nx + mz * s.nz) / ml > 0.6;
          p.coverAway = away ? p.coverAway + dt : 0;
          // the vault over low cover (Space / A)
          const land = inp.jump && p.grounded ? vaultLanding(world, s, p.x, p.z) : null;
          if (land) {
            p.vault.x0 = p.x; p.vault.y0 = p.y; p.vault.z0 = p.z;
            p.vault.x1 = land.x; p.vault.y1 = land.y; p.vault.z1 = land.z; p.vault.top = s.y + s.top;
            leaveCover(p);
            p.mode = "vault";
            p.modeT = 0;
            p.vx = p.vz = p.vy = 0;
            ev |= PM_VAULT | PM_COVER_OUT;
            height = 1.1;
            break;
          }
          if (p.coverAway >= COVER_MOVE.awayHold) { leaveCover(p); ev |= PM_COVER_OUT; }
          else {
            // slide along it (hidden, or up over low cover; out past a high edge he holds still)
            const along = moving ? mx * s.tx + mz * s.tz : 0;
            if (!s.high || p.coverPop < 0.05) {
              const [lo, hi] = hideRange(s);
              p.coverU = Math.max(lo, Math.min(hi, p.coverU + along * (p.coverPop > 0.5 ? COVER_MOVE.slidePop : COVER_MOVE.slide) * pdt));
            }
            if (p.coverPop < 0.05 || !s.high) p.coverEnd = edgeAt(s, p.coverU, p.yaw);
            // aim held: up over low cover, out past a high edge (mid-wall there is nowhere to go)
            const want = inp.aim && (!s.high || p.coverEnd !== 0) ? 1 : 0;
            const k = pdt / COVER_MOVE.popTime;
            p.coverPop = want > p.coverPop ? Math.min(1, p.coverPop + k) : want < p.coverPop ? Math.max(0, p.coverPop - k) : want;
            if (p.coverPop >= 0.5 && !wasPop) ev |= PM_POP;
            if (p.coverPop < 0.5 && wasPop) ev |= PM_DUCK;
            inCover = s;
            if (p.coverPop < 0.5) p.facing = Math.atan2(-s.nx, -s.nz);
            height = tucked(s, p) ? 1.15 : PLAYER.height;
            wantUp = tucked(s, p) ? Math.max(0.95, Math.min(SHOULDER.up, s.top + 0.22)) : SHOULDER.up;
            p.vx = p.vz = 0;
            break;
          }
        }
      }
      if (inp.jump && p.grounded) {
        p.vy = PLAYER.jumpSpeed;
        p.grounded = false;
        ev |= PM_JUMP;
      }
      // backpedal slower (move against the aim)
      const fwdDot = moving ? (mx * -sy + mz * -cy) / Math.max(ml, 1e-6) : 0;
      const speed = PLAYER.runSpeed * (fwdDot < -0.3 ? PLAYER.backSpeed : 1) * (p.zoom ? ZOOM.move : 1) * (p.guard ? GUARD.move : 1);
      let tvx = mx * speed, tvz = mz * speed;
      // a shotgun blast on his guard pushes him back (the move keys wait)
      if (p.shoveT > 0) { p.shoveT = Math.max(0, p.shoveT - pdt); tvx = p.shoveX; tvz = p.shoveZ; }
      const a = (p.grounded ? PLAYER.accel : PLAYER.airAccel) * pdt;
      let dvx = tvx - p.vx, dvz = tvz - p.vz;
      const dl = Math.sqrt(dvx * dvx + dvz * dvz);
      if (dl > a) { dvx *= a / dl; dvz *= a / dl; }
      p.vx += dvx;
      p.vz += dvz;
      break;
    }
    case "dive": {
      height = DODGE.height;
      gravity = DODGE_GRAVITY;
      stepDt = dt;
      p.facing = aimFacing;
      if (p.grounded && p.modeT > 0.2) {
        ev |= PM_LAND;
        p.rollOnLand = moving;
        if (moving) {
          p.mode = "roll";
          p.dirX = mx / ml;
          p.dirZ = mz / ml;
          ev |= PM_ROLL;
        } else {
          p.mode = "prone";
          ev |= PM_PRONE;
        }
        p.modeT = 0;
        p.vx = p.vz = 0;
      }
      break;
    }
    case "prone": {
      height = DODGE.height;
      p.facing = aimFacing;
      p.vx *= 0.8;
      p.vz *= 0.8;
      if (moving || inp.jump || inp.dodge) {
        p.mode = "getup";
        p.modeT = 0;
        ev |= PM_GETUP;
      }
      break;
    }
    case "getup": {
      height = DODGE.height + (PLAYER.height - DODGE.height) * Math.min(1, p.modeT / DODGE.getUp);
      p.facing = aimFacing;
      p.vx = p.vz = 0;
      if (p.modeT >= DODGE.getUp) {
        p.mode = "normal";
        p.modeT = 0;
        p.dodgeCooldown = DODGE.cooldown;
      }
      break;
    }
    case "roll": {
      height = 1.1;
      p.facing = aimFacing;
      stepDt = dt;
      p.vx = p.dirX * DODGE.rollSpeed;
      p.vz = p.dirZ * DODGE.rollSpeed;
      if (p.modeT >= DODGE.roll) {
        p.mode = "normal";
        p.modeT = 0;
        p.dodgeCooldown = DODGE.cooldown;
      }
      break;
    }
    case "vault": {
      // scripted, real time: along the line, over the top in an arc, onto the landing
      height = 1.1;
      p.facing = aimFacing;
      const v = p.vault, t = Math.min(1, p.modeT / COVER_MOVE.vaultTime);
      const e = t * t * (3 - 2 * t);
      const lift = Math.max(0, v.top + COVER_MOVE.vaultClear - Math.max(v.y0, v.y1));
      p.x = v.x0 + (v.x1 - v.x0) * e;
      p.z = v.z0 + (v.z1 - v.z0) * e;
      p.y = v.y0 + (v.y1 - v.y0) * e + 4 * t * (1 - t) * lift;
      p.vx = (v.x1 - v.x0) / COVER_MOVE.vaultTime;
      p.vz = (v.z1 - v.z0) / COVER_MOVE.vaultTime;
      p.vy = 0;
      p.grounded = false;
      if (t >= 1) {
        p.mode = "normal";
        p.modeT = 0;
        p.y = v.y1;
        p.grounded = true;
        p.vx *= 0.5;
        p.vz *= 0.5;
        p.dodgeCooldown = DODGE.cooldown;
      }
      break;
    }
    case "dead": {
      p.vx *= 0.9;
      p.vz *= 0.9;
      height = 0.6;
      break;
    }
  }

  if (inCover) {
    // on its line: the hide spot, or out past the edge (the spots were checked when the cover was derived)
    const x0 = p.x, z0 = p.z;
    coverSpot(inCover, p, tmp);
    p.x = tmp.x;
    p.z = tmp.z;
    integrate(world, p, stepDt, height, gravity);
    p.x = tmp.x;
    p.z = tmp.z;
    p.speed = Math.hypot(p.x - x0, p.z - z0) / Math.max(pdt, 1e-6);
  } else if (p.mode !== "vault") {
    integrate(world, p, stepDt, height, gravity);
    p.speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
  } else p.speed = Math.hypot(p.vx, p.vz);

  // the shoulder the pivot sits over: an open edge on his left (in cover) takes it left
  let sideWant = 1;
  if (inCover && p.coverEnd !== 0) sideWant = p.coverEnd * (inCover.tx * Math.cos(p.yaw) - inCover.tz * Math.sin(p.yaw)) >= 0 ? 1 : -1;
  p.shoulder += (sideWant - p.shoulder) * Math.min(1, 8 * dt);
  if (Math.abs(p.shoulder - sideWant) < 1e-3) p.shoulder = sideWant;

  // shoulder pivot height eases toward the stance (sim-side, so the aim ray is deterministic)
  const lying = p.mode === "dive" || p.mode === "prone" || p.mode === "dead";
  if (wantUp < 0) wantUp = lying ? SHOULDER.lyingUp : p.mode === "getup" ? SHOULDER.lyingUp + (SHOULDER.up - SHOULDER.lyingUp) * Math.min(1, p.modeT / DODGE.getUp) : p.mode === "roll" || p.mode === "vault" ? 1.1 : SHOULDER.up;
  p.pivotUp += (wantUp - p.pivotUp) * Math.min(1, 14 * dt);

  // hit pose
  const pose = p.hit.pose;
  pose.x = p.x; pose.y = p.y; pose.z = p.z;
  pose.lean = 0;
  if (p.mode === "dead") { pose.stance = "dead"; p.hit.hittable = false; }
  else if (p.mode === "dive") { pose.stance = "dive"; pose.lieH = 0.45; pose.yaw = Math.atan2(p.dirX, p.dirZ); }
  else if (p.mode === "prone") { pose.stance = "prone"; pose.lieH = 0.27; pose.yaw = Math.atan2(p.dirX, p.dirZ); }
  else if (p.mode === "roll" || p.mode === "vault" || p.dashSeg >= 0 || (p.mode === "getup" && p.modeT < DODGE.getUp * 0.5)) { pose.stance = "crouch"; pose.yaw = p.facing; }
  else if (inCover && tucked(inCover, p)) { pose.stance = "cover"; pose.yaw = p.facing; }
  else { pose.stance = "stand"; pose.yaw = p.facing; }
  return ev;
}

/** Gravity, horizontal push-out, ground and ceiling for a player-sized cylinder. */
function integrate(world: World, p: Player, dt: number, height: number, gravity: number): void {
  const r = PLAYER.radius;
  const wasGrounded = p.grounded;
  const y0 = p.y;
  if (!p.grounded || p.vy > 0) p.vy -= gravity * dt;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  const stepTop = wasGrounded ? p.y + PLAYER.stepUp : p.y + 0.05;
  if (world.pushOut(p.x, p.z, r, p.y, p.y + height, stepTop, tmp)) {
    const cx = tmp.x - p.x, cz = tmp.z - p.z;
    const cl = Math.sqrt(cx * cx + cz * cz);
    if (cl > 1e-6) {
      const nx = cx / cl, nz = cz / cl;
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) { p.vx -= vn * nx; p.vz -= vn * nz; }
    }
    p.x = tmp.x;
    p.z = tmp.z;
  }
  p.y += p.vy * dt;
  const probeTop = wasGrounded && p.vy <= 0 ? y0 + PLAYER.stepUp : Math.max(y0, p.y) + 0.05;
  const gy = world.groundBelow(p.x, p.z, r, probeTop);
  if (p.vy <= 0 && p.y <= gy + 1e-4) {
    p.y = gy;
    p.vy = 0;
    p.grounded = true;
  } else if (wasGrounded && p.vy <= 0 && p.y - gy <= PLAYER.stepUp + 0.05) {
    p.y = gy;
    p.vy = 0;
    p.grounded = true;
  } else p.grounded = false;
  const ceil = world.ceilingAbove(p.x, p.z, r, y0 + height - 1e-3);
  if (p.y + height > ceil) {
    p.y = ceil - height;
    if (p.vy > 0) p.vy = 0;
  }
}

/** How far the shoulder pivot sits to his right: SHOULDER.right, less when a wall is closer (the aim
 *  ray must never start on the far side of a thin wall: the club's curtain partition is 0.25 m). */
export function shoulderRight(world: World | null, p: Player): number {
  // (signed: over his left shoulder in cover at an open edge on his left, p.shoulder < 0)
  const side = p.shoulder >= 0 ? 1 : -1, want = SHOULDER.right * Math.abs(p.shoulder);
  if (!world) return side * want;
  const c = Math.cos(p.yaw) * side, s = Math.sin(p.yaw) * side;
  const h = world.raycast(p.x, p.y + p.pivotUp, p.z, c, 0, -s, SHOULDER.right + 0.3, false);
  return side * (h ? Math.max(0, Math.min(want, h.t - 0.3)) : want);
}

/** Shoulder pivot (the aim ray and the camera start here): above the feet, to the camera's right
 *  (`world`: pulled in by a wall at his right, as the camera is). */
export function pivotOf(p: Player, out: { x: number; y: number; z: number }, world: World | null = null): { x: number; y: number; z: number } {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const right = shoulderRight(world, p);
  // camera right for yaw (looking down -Z at 0) = (cos yaw, 0, -sin yaw)
  out.x = p.x + c * right;
  out.y = p.y + p.pivotUp;
  out.z = p.z - s * right;
  return out;
}

/** Muzzle of hand 0 (right) / 1 (left) for the current stance. */
export function muzzleOf(p: Player, hand: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  // the long guns (shotgun, AK) are carried on the right: one muzzle, farther out
  const long = isLongGun(p.weapon.id);
  // the one-handed guns (hand cannon, sawed-off) use the right pistol's numbers; the sniper reaches further
  const side = long ? 0.14 : hand === 0 || isOneHand(p.weapon.id) ? 0.22 : -0.22;
  const lying = p.mode === "dive" || p.mode === "prone";
  const up = lying ? (p.mode === "dive" ? 0.7 : 0.5) : p.mode === "roll" || p.mode === "getup" ? 0.9 : long ? 1.3 : 1.22;
  const fwd = (lying ? 0.35 : 0.55) + (p.weapon.id === "sniper" ? 0.3 : long ? 0.2 : 0);
  out.x = p.x + c * side - s * fwd;
  out.y = p.y + up;
  out.z = p.z - s * side - c * fwd;
  return out;
}
