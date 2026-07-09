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
  const manager = new PlatformManager({
    PlatformClass: FakePlatform,
    random: () => 0.05,
  });

  manager.reset();

  assert.equal(manager.active.length, 2);
  assert.equal(manager.current().type, "standard");
  assert.equal(manager.current().group.position.z, 0);

  manager.current().isCleared = true;
  assert.equal(manager.current().group.position.z, -10);

  const spawned = manager.spawnNext(10);

  assert.equal(spawned.type, "boost");
  assert.equal(spawned.active, true);

  spawned.group.position.z = 12;
  manager.update(1, 1);

  assert.equal(manager.active.includes(spawned), false);
  assert.equal(spawned.active, false);
});
