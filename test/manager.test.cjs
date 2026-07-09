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

  activate(type, x, z, index) {
    this.type = type;
    this.index = index;
    this.active = true;
    this.isCleared = false;
    this.group.visible = true;
    this.group.position.set(x, -3.55, z);
  }

  deactivate() {
    this.active = false;
    this.group.visible = false;
  }

  update(delta, speed) {
    this.group.position.z += speed * delta * 60;
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

  assert.equal(manager.active.length, GAME_CONFIG.platform.openingCount);
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
