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

function makeObject3D() {
  return {
    children: [],
    position: makeVector(),
    rotation: makeVector(),
    scale: makeVector(),
    visible: true,
    layers: { set() {}, enable() {} },
    add(child) {
      this.children.push(child);
    },
  };
}

function makeFakeThree() {
  class Group {
    constructor() {
      Object.assign(this, makeObject3D());
    }
  }

  class Mesh {
    constructor(geometry, material) {
      Object.assign(this, makeObject3D());
      this.geometry = geometry;
      this.material = material;
    }
  }

  class Points extends Mesh {}
  class PointLight extends Mesh {}

  return {
    Group,
    Mesh,
    Points,
    PointLight,
    Geometry: class { constructor() { this.vertices = []; } },
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
    },
  };
}

function makeAssets() {
  const material = { opacity: 1, clone() { return { opacity: this.opacity }; } };
  return {
    geometries: {
      playerCore: {},
      playerShell: {},
      playerRing: {},
      pickupCore: {},
      pickupRing: {},
      platformPad: {},
      platformNarrowPad: {},
      platformEdge: {},
      platformNarrowEdge: {},
      hazardMarker: {},
      shockwave: {},
    },
    materials: {
      player: { core: material, shell: material, ring: material, trail: material },
      platform: {
        standard: material,
        multiplier: material,
        hazard: material,
        narrow: material,
        boost: material,
        edge: material,
        pickup: material,
        hazardMarker: material,
      },
    },
    createShockwaveMaterial() {
      return { opacity: 1 };
    },
  };
}

test("player reset and update keep movement bounded", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const scene = makeObject3D();
  const player = new Player({ THREE, scene, assets: makeAssets() });

  player.update(1, 1000, true);

  assert.equal(scene.children.includes(player.group), true);
  assert.equal(player.position.x <= 8.5, true);
  assert.equal(player.position.y > -2.5, true);

  player.reset();

  assert.equal(player.position.x, 0);
  assert.equal(player.position.y, -2.5);
});

test("platform activation configures type state and feedback", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const THREE = makeFakeThree();
  const scene = makeObject3D();
  const platform = new Platform({ THREE, scene, assets: makeAssets() });

  platform.activate("multiplier", 1.5, -12, 3);
  assert.equal(platform.pickup.visible, true);

  platform.resolveLanding({ hitPickup: true, resetMultiplier: false, boost: 0 });

  assert.equal(scene.children.includes(platform.group), true);
  assert.equal(platform.active, true);
  assert.equal(platform.type, "multiplier");
  assert.equal(platform.group.position.x, 1.5);
  assert.equal(platform.group.position.z, -12);
  assert.equal(platform.pickup.visible, false);
  assert.equal(platform.feedbackTimer > 0, true);
});
