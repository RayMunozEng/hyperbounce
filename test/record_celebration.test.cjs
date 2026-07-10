const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function makeThree() {
  class Object3D {
    constructor() {
      this.visible = true;
      this.position = { x: 0, y: 0, z: 0 };
      this.scale = {
        x: 1,
        y: 1,
        z: 1,
        set: (x, y, z) => {
          this.scale.x = x;
          this.scale.y = y;
          this.scale.z = z;
        },
      };
    }
  }

  class Scene {
    constructor() {
      this.children = [];
    }

    add(child) {
      this.children.push(child);
    }
  }

  class OrthographicCamera extends Object3D {
    constructor(left, right, top, bottom, near, far) {
      super();
      Object.assign(this, { left, right, top, bottom, near, far });
      this.projectionUpdates = 0;
    }

    updateProjectionMatrix() {
      this.projectionUpdates += 1;
    }
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.needsUpdate = false;
    }
  }

  class BufferGeometry {
    constructor() {
      this.attributes = {};
    }

    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
    }
  }

  class PointsMaterial {
    constructor(options) {
      Object.assign(this, options);
    }
  }

  class MeshBasicMaterial extends PointsMaterial {}

  class Points extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.kind = "points";
    }
  }

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.kind = "mesh";
    }
  }

  class RingGeometry {
    constructor(innerRadius, outerRadius, segments) {
      Object.assign(this, { innerRadius, outerRadius, segments });
    }
  }

  return {
    Scene,
    OrthographicCamera,
    BufferAttribute,
    BufferGeometry,
    PointsMaterial,
    MeshBasicMaterial,
    Points,
    Mesh,
    RingGeometry,
    AdditiveBlending: "additive",
    DoubleSide: "double-side",
  };
}

test("record celebration reuses one particle field and three ring meshes", () => {
  const { RecordCelebration } = loadSourceModule("src/record_celebration.js");
  const THREE = makeThree();
  const effect = new RecordCelebration({ THREE, texture: {}, random: () => 0.5 });
  const positionArray = effect.points.geometry.attributes.position.array;
  const points = effect.points;
  const rings = effect.rings.slice();

  assert.equal(effect.scene.children.filter((child) => child.kind === "points").length, 1);
  assert.equal(positionArray.length, 160 * 3);
  assert.equal(effect.rings.length, 3);

  effect.start();
  effect.update(0.35);

  assert.equal(effect.points, points);
  assert.equal(effect.points.geometry.attributes.position.array, positionArray);
  assert.deepEqual(effect.rings, rings);
  assert.equal(positionArray.some((value) => value !== 0), true);
  assert.equal(effect.points.geometry.attributes.position.needsUpdate, true);
});

test("record celebration resizes, renders as an overlay, and stops cleanly", () => {
  const { RecordCelebration } = loadSourceModule("src/record_celebration.js");
  const effect = new RecordCelebration({
    THREE: makeThree(),
    texture: {},
    random: () => 0.5,
  });
  const calls = [];
  const renderer = {
    clearDepth() {
      calls.push("clearDepth");
    },
    render(scene, camera) {
      calls.push(["render", scene, camera]);
    },
  };

  effect.resize(1920, 1080);
  assert.equal(effect.camera.left, -(1920 / 1080));
  assert.equal(effect.camera.right, 1920 / 1080);
  assert.equal(effect.camera.projectionUpdates, 1);

  effect.start();
  effect.render(renderer);
  assert.equal(calls[0], "clearDepth");
  assert.deepEqual(calls[1], ["render", effect.scene, effect.camera]);

  effect.update(3);
  assert.equal(effect.active, false);
  assert.equal(effect.points.visible, false);
  assert.equal(effect.rings.every((ring) => ring.visible === false), true);

  calls.length = 0;
  effect.render(renderer);
  assert.deepEqual(calls, []);
});
