const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function makeFakeThree() {
  class Geometry {
    constructor(...args) {
      this.args = args;
      this.vertices = [];
      this.disposed = false;
    }

    dispose() {
      this.disposed = true;
    }
  }

  class Material {
    constructor(options = {}) {
      this.options = options;
      this.opacity = options.opacity === undefined ? 1 : options.opacity;
      this.transparent = Boolean(options.transparent);
    }

    clone() {
      return new this.constructor(this.options);
    }
  }

  class TextureLoader {
    load(url) {
      return { url };
    }
  }

  return {
    AdditiveBlending: "additive",
    DoubleSide: "double-side",
    CylinderBufferGeometry: Geometry,
    DodecahedronBufferGeometry: Geometry,
    IcosahedronBufferGeometry: Geometry,
    MeshBasicMaterial: Material,
    MeshStandardMaterial: Material,
    PointsMaterial: Material,
    RingBufferGeometry: Geometry,
    SphereBufferGeometry: Geometry,
    TextureLoader,
    TorusBufferGeometry: Geometry,
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
    },
    Geometry,
    Points: class {
      constructor(geometry, material) {
        this.geometry = geometry;
        this.material = material;
      }
    },
  };
}

test("config defines the focused neon platform types", () => {
  const { PLATFORM_TYPES } = loadSourceModule("src/config.js");

  assert.deepEqual(Object.keys(PLATFORM_TYPES), [
    "standard",
    "multiplier",
    "hazard",
    "narrow",
    "boost",
  ]);
  assert.equal(PLATFORM_TYPES.hazard.resetsMultiplier, true);
  assert.equal(PLATFORM_TYPES.boost.bonus > 0, true);
});

test("shared assets factory centralizes reusable geometries and materials", () => {
  const { createSharedAssets } = loadSourceModule("src/materials.js");
  const assets = createSharedAssets(makeFakeThree());

  assert.equal(Boolean(assets.geometries.playerCore), true);
  assert.equal(Boolean(assets.geometries.platformPad), true);
  assert.equal(Boolean(assets.materials.platform.standard), true);
  assert.equal(Boolean(assets.materials.platform.hazard), true);
  assert.equal(typeof assets.createShockwaveMaterial, "function");
});

test("starfield moves forward and wraps past the camera", () => {
  const { Starfield } = loadSourceModule("src/effects.js");
  const scene = { added: [], add(object) { this.added.push(object); } };
  const stars = new Starfield({
    THREE: makeFakeThree(),
    scene,
    count: 1,
    spread: 10,
    depth: 10,
    speedScale: 1,
  });
  stars.geometry.vertices[0].z = 6;

  stars.update(1, 1);

  assert.equal(scene.added.length, 1);
  assert.equal(stars.geometry.vertices[0].z < 0, true);
});
