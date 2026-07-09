const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function makeVector() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
}

class FakePlatform {
  constructor() {
    this.group = { position: makeVector(), visible: false };
    this.active = false;
    this.isCleared = false;
    this.type = "standard";
  }

  activate(type, x, z, index, motion) {
    this.type = type;
    this.index = index;
    this.motion = motion;
    this.active = true;
    this.isCleared = false;
    this.group.visible = true;
    this.group.position.set(x, -3.55, z);
  }

  deactivate() {
    this.active = false;
    this.group.visible = false;
  }

  update(delta, speed, beatPulse) {
    this.lastBeatPulse = beatPulse;
    this.group.position.z += speed * delta * 60;
  }

  setVisible(isVisible) {
    this.group.visible = isVisible;
  }

  startLaunchReveal(delay) {
    this.revealDelay = delay;
  }

  updateLaunchReveal(delta) {
    this.revealDelta = delta;
  }
}

test("platform manager seeds, advances, and recycles pooled platforms", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.05,
  });

  manager.reset();

  assert.equal(manager.active.length >= GAME_CONFIG.platform.openingCount, true);
  assert.equal(manager.current().type, "standard");
  assert.equal(manager.current().group.position.z, 0);

  manager.current().isCleared = true;
  assert.equal(manager.current().group.position.z, GAME_CONFIG.platform.startZ);

  const spawned = manager.spawnNext(10);

  assert.equal(spawned.type, "boost");
  assert.equal(spawned.active, true);

  spawned.group.position.z = 12;
  manager.update(1, 1);

  assert.equal(manager.active.includes(spawned), false);
  assert.equal(spawned.active, false);
});

test("platform manager seeds an opening runway that reaches the far fade depth", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });

  manager.reset();

  const farthestZ = manager.active.reduce((minZ, platform) => {
    return Math.min(minZ, platform.group.position.z);
  }, 0);

  assert.equal(farthestZ <= GAME_CONFIG.platform.spawnZ, true);
  assert.equal(farthestZ <= GAME_CONFIG.platform.fadeInEndZ, true);
});

test("platform manager keeps new pads one playable gap behind the farthest active pad", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });

  manager.reset();
  const farthestZ = manager.active.reduce((minZ, platform) => {
    return Math.min(minZ, platform.group.position.z);
  }, 0);
  const spawned = manager.spawnNext(1);

  assert.equal(spawned.group.position.z, farthestZ + GAME_CONFIG.platform.startZ);
});

test("platform manager keeps late spawned pads on the tempo gap", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });

  manager.reset();
  const farthestZ = manager.active.reduce((minZ, platform) => {
    return Math.min(minZ, platform.group.position.z);
  }, 0);
  const spawned = manager.spawnNext(GAME_CONFIG.platform.motionFullScore + 20);
  const gap = spawned.group.position.z - farthestZ;

  assert.equal(Math.abs(gap - GAME_CONFIG.platform.startZ) < 0.000001, true);
});

test("platform manager keeps early spawned pads stationary", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.4,
  });

  manager.reset();
  const spawned = manager.spawnNext(GAME_CONFIG.platform.motionStartScore - 1);

  assert.equal(spawned.motion.enabled, false);
});

test("platform manager unlocks gentle motion later in the run", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const rolls = [0.5, 0.9, 0.1, 0.25];
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => rolls.shift() ?? 0.1,
  });

  manager.reset();
  const spawned = manager.spawnNext(GAME_CONFIG.platform.motionFullScore);

  assert.equal(spawned.motion.enabled, true);
  assert.equal(spawned.motion.amplitude <= GAME_CONFIG.platform.motionMaxAmplitude, true);
  assert.equal(spawned.motion.speed <= GAME_CONFIG.platform.motionMaxSpeed, true);
  assert.equal(spawned.motion.phase > 0, true);
});

test("platform manager releases the start-screen launch pad before play", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });

  manager.reset();
  const launchPad = manager.current();

  manager.releaseLaunchPad();

  assert.equal(launchPad.active, false);
  assert.equal(manager.active.includes(launchPad), false);
  assert.equal(manager.current().group.position.z, GAME_CONFIG.platform.startZ);
});

test("platform manager can hide and restore all seeded gameplay platforms", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });

  manager.reset();
  manager.setVisible(false);

  assert.equal(manager.active.every((platform) => platform.group.visible === false), true);

  manager.setVisible(true);

  assert.equal(manager.active.every((platform) => platform.group.visible === true), true);
});

test("platform manager cascades the opening reveal without moving platform z", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });

  manager.reset();
  const startPositions = manager.active.map((platform) => platform.group.position.z);

  manager.startLaunchReveal();
  manager.updateLaunchReveal(0.25);

  assert.equal(manager.active.every((platform, index) => platform.group.position.z === startPositions[index]), true);
  assert.equal(manager.active[0].revealDelay, 0);
  assert.equal(manager.active[1].revealDelay > manager.active[0].revealDelay, true);
  assert.equal(manager.active.every((platform) => platform.revealDelta === 0.25), true);
});

test("platform manager passes music pulse data to active platforms", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });
  const beatPulse = { intensity: 0.75, tempo: 1.8 };

  manager.reset();
  manager.update(0.25, 0.5, beatPulse);

  assert.equal(manager.active.every((platform) => platform.lastBeatPulse === beatPulse), true);
});

test("platform manager targets the uncleared pad nearest the landing line", () => {
  const { default: PlatformManager } = loadSourceModule("src/platform_generator.js");
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.9,
  });

  manager.reset();
  manager.active[0].group.position.z = 8.5;
  manager.active[1].group.position.z = 0.2;
  manager.active[2].group.position.z = -8.4;

  assert.equal(manager.current(), manager.active[1]);
});
