import { Box, Circle, RevoluteJoint, type Body, type RevoluteJointOpt, type World } from 'planck';
import { clamp, rotate, wrapAngle, type Vec } from '../core/math';

/**
 * Active ragdoll: a stick figure made of Planck bodies joined by revolute joints.
 * Coordinates are metres, y pointing down (same as the screen). A body at angle 0
 * "hangs": its long axis points down (+y), the joint to its parent is at the top.
 *
 * While standing, joint motors hold a pose and a corrective torque keeps the torso
 * upright. A hit makes it go limp (it flops and staggers physically), then it
 * stands back up with a little "puppet string" assist. Knocked out = limp for good.
 */
export type PartName = 'torso' | 'head' | 'uArmF' | 'lArmF' | 'uArmB' | 'lArmB' | 'thighF' | 'shinF' | 'thighB' | 'shinB';
export type Zone = 'head' | 'torso' | 'limb';

interface PartSpec {
  name: PartName;
  circle?: number;
  hw: number;
  hh: number;
  parent?: PartName;
  /** Joint point in the parent's local frame. */
  parentAnchor?: Vec;
  /** Joint point in this part's local frame. */
  anchor?: Vec;
  /** Joint limits for a figure facing right (+x); mirrored when facing left. */
  limits?: [number, number];
  density: number;
}

function specs(s: number): PartSpec[] {
  const t = 0.29 * s; // torso half height
  const ua = 0.155 * s;
  const la = 0.145 * s;
  const th = 0.225 * s;
  const sh = 0.225 * s;
  const lw = 0.05 * s;
  return [
    { name: 'torso', hw: 0.075 * s, hh: t, density: 3 },
    { name: 'head', circle: 0.2 * s, hw: 0.2 * s, hh: 0.2 * s, parent: 'torso', parentAnchor: { x: 0, y: -t }, anchor: { x: 0, y: 0.2 * s }, limits: [-0.45, 0.45], density: 1.6 },
    { name: 'uArmB', hw: lw, hh: ua, parent: 'torso', parentAnchor: { x: 0, y: -t + 0.06 * s }, anchor: { x: 0, y: -ua }, density: 1.5 },
    { name: 'lArmB', hw: lw * 0.9, hh: la, parent: 'uArmB', parentAnchor: { x: 0, y: ua }, anchor: { x: 0, y: -la }, limits: [-2.6, 0.05], density: 1.5 },
    { name: 'thighB', hw: lw * 1.1, hh: th, parent: 'torso', parentAnchor: { x: 0, y: t }, anchor: { x: 0, y: -th }, limits: [-1.9, 0.7], density: 2.2 },
    { name: 'shinB', hw: lw, hh: sh, parent: 'thighB', parentAnchor: { x: 0, y: th }, anchor: { x: 0, y: -sh }, limits: [-0.05, 2.4], density: 2.2 },
    { name: 'thighF', hw: lw * 1.1, hh: th, parent: 'torso', parentAnchor: { x: 0, y: t }, anchor: { x: 0, y: -th }, limits: [-1.9, 0.7], density: 2.2 },
    { name: 'shinF', hw: lw, hh: sh, parent: 'thighF', parentAnchor: { x: 0, y: th }, anchor: { x: 0, y: -sh }, limits: [-0.05, 2.4], density: 2.2 },
    { name: 'uArmF', hw: lw, hh: ua, parent: 'torso', parentAnchor: { x: 0, y: -t + 0.06 * s }, anchor: { x: 0, y: -ua }, density: 1.5 },
    { name: 'lArmF', hw: lw * 0.9, hh: la, parent: 'uArmF', parentAnchor: { x: 0, y: ua }, anchor: { x: 0, y: -la }, limits: [-2.6, 0.05], density: 1.5 },
  ];
}

export type Pose = Partial<Record<PartName, number>>;

/** Relaxed standing pose for a right-facing figure (joint angles, child - parent). */
export const STAND: Pose = { head: 0, uArmF: -0.35, lArmF: -0.5, uArmB: 0.25, lArmB: -0.4, thighF: -0.18, shinF: 0.12, thighB: 0.2, shinB: 0.1 };

export type RagdollState = 'stand' | 'limp' | 'recover' | 'ko';

export interface Part {
  name: PartName;
  body: Body;
  spec: PartSpec;
  joint?: RevoluteJoint;
}

/** Arm angles for pointing along a world direction (screen angle, y down). */
export function armAngleFor(dirAngle: number, torsoAngle: number): number {
  return wrapAngle(dirAngle - Math.PI / 2 - torsoAngle);
}

export class Ragdoll {
  readonly parts: Part[] = [];
  readonly byName = {} as Record<PartName, Part>;
  state: RagdollState = 'stand';
  /** 0..1: how strongly motors and balance act. */
  strength = 1;
  stateTime = 0;
  pose: Pose = { ...STAND };
  lean = 0;
  totalMass = 0;
  /** Horizontal spring towards the home spot (off on ice). */
  homeSpring = 1;
  /** Walking speed (m/s) while shuffling home, for the leg animation. */
  walking = 0;
  private readonly g: number;
  private readonly height: number;

  constructor(
    private readonly world: World,
    public homeX: number,
    public footY: number,
    public readonly facing: 1 | -1,
    public readonly scale: number,
    group: number,
    gravity = 10,
  ) {
    this.g = gravity;
    this.height = 2.05 * scale;
    for (const sp of specs(scale)) {
      const body = world.createBody({ type: 'dynamic', position: { x: 0, y: 0 }, angularDamping: 0.6, linearDamping: 0.05 });
      const shape = sp.circle ? new Circle(sp.circle) : new Box(sp.hw, sp.hh);
      body.createFixture({ shape, density: sp.density, friction: sp.name.startsWith('shin') ? 1.4 : 0.6, restitution: 0.05, filterGroupIndex: group });
      const part: Part = { name: sp.name, body, spec: sp };
      this.parts.push(part);
      this.byName[sp.name] = part;
    }
    this.placeAt(homeX, footY);
    for (const p of this.parts) {
      const sp = p.spec;
      if (!sp.parent || !sp.parentAnchor) continue;
      const parent = this.byName[sp.parent];
      const anchor = parent.body.getWorldPoint(sp.parentAnchor);
      const lim = sp.limits ? this.mirrorLimits(sp.limits) : undefined;
      const joint = new RevoluteJoint(
        {
          referenceAngle: 0,
          enableLimit: !!lim,
          lowerAngle: lim?.[0] ?? 0,
          upperAngle: lim?.[1] ?? 0,
          enableMotor: true,
          maxMotorTorque: 0,
          motorSpeed: 0,
        } as RevoluteJointOpt,
        parent.body,
        p.body,
        anchor,
      );
      world.createJoint(joint);
      p.joint = joint;
    }
    this.totalMass = this.parts.reduce((m, p) => m + p.body.getMass(), 0);
  }

  private mirrorLimits([a, b]: [number, number]): [number, number] {
    return this.facing === 1 ? [a, b] : [-b, -a];
  }

  /** Joint angle as seen by a right-facing figure. */
  private mirror(a: number): number {
    return this.facing === 1 ? a : -a;
  }

  /** Forward kinematics: puts every part in the current pose with its feet at (x, y). */
  placeAt(x: number, footY: number): void {
    const torso = this.byName.torso;
    const angles = new Map<PartName, number>();
    const pos = new Map<PartName, Vec>();
    angles.set('torso', 0);
    pos.set('torso', { x: 0, y: 0 });
    for (const p of this.parts) {
      const sp = p.spec;
      if (!sp.parent || !sp.parentAnchor || !sp.anchor) continue;
      const pa = angles.get(sp.parent) ?? 0;
      const pp = pos.get(sp.parent) ?? { x: 0, y: 0 };
      const a = pa + this.mirror(this.pose[sp.name] ?? 0);
      const jw = rotate(sp.parentAnchor, pa);
      const ja = rotate(sp.anchor, a);
      angles.set(sp.name, a);
      pos.set(sp.name, { x: pp.x + jw.x - ja.x, y: pp.y + jw.y - ja.y });
    }
    // lowest foot point
    let maxY = -Infinity;
    for (const n of ['shinF', 'shinB'] as const) {
      const sp = this.byName[n].spec;
      const p = pos.get(n) ?? { x: 0, y: 0 };
      const tip = rotate({ x: 0, y: sp.hh + sp.hw }, angles.get(n) ?? 0);
      maxY = Math.max(maxY, p.y + tip.y);
    }
    for (const p of this.parts) {
      const lp = pos.get(p.name) ?? { x: 0, y: 0 };
      p.body.setTransform({ x: x + lp.x, y: footY - maxY + lp.y - 0.01 }, angles.get(p.name) ?? 0);
      p.body.setLinearVelocity({ x: 0, y: 0 });
      p.body.setAngularVelocity(0);
      p.body.setAwake(true);
    }
    void torso;
  }

  get torso(): Body {
    return this.byName.torso.body;
  }
  get head(): Body {
    return this.byName.head.body;
  }

  /** Point of the hand at the end of a forearm. */
  hand(front: boolean): Vec {
    const p = this.byName[front ? 'lArmF' : 'lArmB'];
    const w = p.body.getWorldPoint({ x: 0, y: p.spec.hh });
    return { x: w.x, y: w.y };
  }
  shoulder(): Vec {
    const t = this.byName.torso;
    const w = t.body.getWorldPoint({ x: 0, y: -t.spec.hh + 0.06 * this.scale });
    return { x: w.x, y: w.y };
  }

  /** Is the figure up (torso roughly upright and at standing height)? */
  isUpright(): boolean {
    const a = Math.abs(wrapAngle(this.torso.getAngle()));
    const footRef = this.footY - this.height * 0.5;
    return a < 0.35 && this.torso.getPosition().y < footRef + 0.25 * this.scale;
  }

  hit(limpSeconds = 0.75): void {
    if (this.state === 'ko') return;
    this.state = 'limp';
    this.stateTime = limpSeconds;
  }

  knockOut(): void {
    this.state = 'ko';
    this.stateTime = 0;
  }

  revive(): void {
    this.state = 'recover';
    this.stateTime = 1.4;
  }

  respawn(): void {
    this.pose = { ...STAND };
    this.placeAt(this.homeX, this.footY);
    if (this.state !== 'ko') {
      this.state = 'stand';
      this.strength = 1;
    }
  }

  update(dt: number): void {
    this.stateTime -= dt;
    switch (this.state) {
      case 'limp':
        this.strength = 0.03;
        if (this.stateTime <= 0) {
          this.state = 'recover';
          this.stateTime = 1.6;
        }
        break;
      case 'recover':
        this.strength = Math.min(1, this.strength + dt * 1.8);
        if (this.stateTime <= 0 || (this.stateTime < 1.2 && this.isUpright())) this.state = 'stand';
        break;
      case 'ko':
        this.strength = Math.max(0.0, this.strength - dt * 3);
        break;
      default:
        this.strength = Math.min(1, this.strength + dt * 2);
    }
    this.drive(dt);
  }

  private drive(dt: number): void {
    const st = this.strength;
    const ko = this.state === 'ko';
    for (const p of this.parts) {
      const j = p.joint;
      if (!j) continue;
      const target = this.mirror(this.pose[p.name] ?? 0);
      const err = wrapAngle(target - j.getJointAngle());
      const limb = p.name.startsWith('thigh') || p.name.startsWith('shin');
      const base = limb ? 220 : p.name === 'head' ? 25 : 45;
      j.setMaxMotorTorque(ko ? 0.4 : base * this.scale * this.scale * Math.max(st, 0.02));
      j.setMotorSpeed(clamp(err * 18, -20, 20));
    }
    if (ko || st < 0.1) return;
    // keep the torso upright (whole body acts as a stiff statue while standing)
    const torso = this.torso;
    const a = wrapAngle(torso.getAngle() - this.lean * this.facing);
    const w = torso.getAngularVelocity();
    const inertia = this.totalMass * this.height * this.height * 0.35;
    torso.applyTorque((-a * 60 - w * 11) * inertia * st, true);
    // stand-up assist: lift the torso back to standing height (puppet string)
    const tp = torso.getPosition();
    const tv = torso.getLinearVelocity();
    const standY = this.footY - 1.2 * this.scale;
    if (this.state === 'recover') {
      const below = tp.y - standY;
      if (below > 0) {
        const lift = this.totalMass * this.g * clamp(0.85 + below * 1.2, 0, 1.5) * st;
        torso.applyForceToCenter({ x: 0, y: -lift - tv.y * this.totalMass * 3 }, true);
        this.head.applyForceToCenter({ x: 0, y: -lift * 0.08 }, true);
      } else if (tv.y < 0) {
        torso.applyForceToCenter({ x: 0, y: -tv.y * this.totalMass * 6 }, true);
      }
    }
    // walk back to the home spot after a stagger
    this.walking = 0;
    const dx = this.homeX - tp.x;
    if (this.state === 'stand' && this.homeSpring > 0 && Math.abs(dx) > 0.12 && this.isUpright()) {
      const target = clamp(dx * 2.5, -1.6, 1.6) * this.homeSpring;
      this.walking = target;
      const k = clamp(dt * 10, 0, 1);
      for (const p of this.parts) {
        const lv = p.body.getLinearVelocity();
        p.body.setLinearVelocity({ x: lv.x + (target - lv.x) * k, y: lv.y });
      }
    }
    void dt;
  }

  /** Which body zone a part belongs to. */
  static zoneOf(name: PartName): Zone {
    if (name === 'head') return 'head';
    if (name === 'torso') return 'torso';
    return 'limb';
  }

  destroy(): void {
    for (const p of this.parts) this.world.destroyBody(p.body);
  }
}
