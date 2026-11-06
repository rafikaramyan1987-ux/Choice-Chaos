import { describe, expect, it } from 'vitest';
import { World, Box } from 'planck';
import { Ragdoll } from '../../src/game/ragdoll';

function setup() {
  const world = new World({ gravity: { x: 0, y: 10 } });
  const ground = world.createBody({ type: 'static', position: { x: 0, y: 0.5 } });
  ground.createFixture({ shape: new Box(10, 0.5), friction: 0.8 });
  const r = new Ragdoll(world, 0, 0, 1, 1, -1);
  return { world, r };
}
function run(world: World, r: Ragdoll, seconds: number) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    r.update(dt);
    world.step(dt, 8, 3);
  }
}

describe('ragdoll', () => {
  it('stands still on a platform', () => {
    const { world, r } = setup();
    run(world, r, 3);
    expect(r.isUpright()).toBe(true);
    expect(Math.abs(r.torso.getPosition().x)).toBeLessThan(0.3);
  });
  it('flops when hit and stands back up', () => {
    const { world, r } = setup();
    run(world, r, 1);
    r.hit(0.8);
    r.head.applyLinearImpulse({ x: 1.0, y: -0.2 }, r.head.getPosition(), true);
    run(world, r, 0.6);
    expect(r.isUpright()).toBe(false);
    run(world, r, 4);
    expect(r.isUpright()).toBe(true);
  });
  it('stays down when knocked out', () => {
    const { world, r } = setup();
    run(world, r, 1);
    r.knockOut();
    r.torso.applyLinearImpulse({ x: 0.8, y: -0.1 }, r.head.getPosition(), true);
    run(world, r, 3);
    expect(r.isUpright()).toBe(false);
  });
});
