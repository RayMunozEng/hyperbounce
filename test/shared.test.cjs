const assert = require("assert");
const fs = require("fs");
const path = require("path");
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
    add(child) {
      this.children.push(child);
    },
  };
}

function makeFakeThree() {
  class Geometry {
    constructor(...args) {
      this.args = args;
      this.attributes = {};
      this.disposed = false;
    }

    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
      return this;
    }

    dispose() {
      this.disposed = true;
    }
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
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

  class Mesh {
    constructor(geometry, material) {
      Object.assign(this, makeObject3D());
      this.geometry = geometry;
      this.material = material;
    }
  }

  class Group {
    constructor() {
      Object.assign(this, makeObject3D());
    }
  }

  return {
    AdditiveBlending: "additive",
    DoubleSide: "double-side",
    BufferAttribute,
    BufferGeometry: Geometry,
    CylinderGeometry: Geometry,
    DodecahedronGeometry: Geometry,
    IcosahedronGeometry: Geometry,
    MeshBasicMaterial: Material,
    MeshStandardMaterial: Material,
    PointsMaterial: Material,
    RingGeometry: Geometry,
    SphereGeometry: Geometry,
    TorusGeometry: Geometry,
    TextureLoader,
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
    },
    Group,
    Mesh,
    Points: class {
      constructor(geometry, material) {
        Object.assign(this, makeObject3D());
        this.geometry = geometry;
        this.material = material;
      }
    },
  };
}

test("release build uses a production Webpack 5 stack without legacy Three APIs", () => {
  const root = path.join(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const indexSource = fs.readFileSync(path.join(root, "src", "index.js"), "utf8");
  const renderSources = ["effects.js", "materials.js", "record_celebration.js", "game.js"]
    .map((file) => fs.readFileSync(path.join(root, "src", file), "utf8"))
    .join("\n");

  assert.equal(packageJson.scripts.build, "webpack --mode=production");
  assert.match(packageJson.devDependencies.webpack, /^\^5\./);
  assert.match(packageJson.dependencies.three, /^\^0\.185\./);
  assert.equal(packageJson.dependencies.postprocessing, undefined);
  assert.equal(packageJson.dependencies["@babel/core"], undefined);
  assert.match(indexSource, /three\/examples\/jsm\/postprocessing\/EffectComposer\.js/);
  assert.match(indexSource, /three\/examples\/jsm\/postprocessing\/OutputPass\.js/);
  assert.match(renderSources, /outputColorSpace = this\.THREE\.LinearSRGBColorSpace/);
  assert.doesNotMatch(indexSource, /three\/examples\/js\//);
  assert.doesNotMatch(renderSources, /(?:Sphere|Cylinder|Dodecahedron|Icosahedron|Torus|Ring)BufferGeometry|new THREE\.Geometry\(|THREE\.VertexColors|THREE\.Clock|gammaInput|gammaOutput/);
});

test("release repository excludes internal plans, prototypes, and unused legacy assets", () => {
  const root = path.join(__dirname, "..");
  const removedPaths = [
    "docs/superpowers",
    "index.1.html",
    "js/three.js",
    "src/images/angellist.svg",
    "src/images/circleGradientLarge.png",
    "src/images/github.svg",
    "src/images/hyperbounce_wireframe.png",
    "src/sounds/bounce_test.wav",
    "src/sounds/bounce_test02.wav",
    "src/sounds/space_love_attack.mp3",
  ];

  removedPaths.forEach((relativePath) => {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} should not ship`);
  });
});

test("config defines the focused neon platform types", () => {
  const { GAME_CONFIG, PLATFORM_TYPES } = loadSourceModule("src/config.js");

  assert.deepEqual(Object.keys(PLATFORM_TYPES), [
    "standard",
    "multiplier",
    "hazard",
    "narrow",
    "boost",
  ]);
  assert.equal(PLATFORM_TYPES.hazard.resetsMultiplier, false);
  assert.equal(PLATFORM_TYPES.boost.bonus > 0, true);
  assert.equal(GAME_CONFIG.platform.fadeInStartZ <= GAME_CONFIG.platform.spawnZ - 10, true);
  assert.equal(GAME_CONFIG.platform.fadeInEndZ >= GAME_CONFIG.platform.startZ - 4, true);
  assert.equal(GAME_CONFIG.platform.colorCycleStartSpeed > GAME_CONFIG.run.baseSpeed, true);
});

test("shared assets factory centralizes reusable geometries and materials", () => {
  const { createSharedAssets } = loadSourceModule("src/materials.js");
  const assets = createSharedAssets(makeFakeThree());

  assert.equal(Boolean(assets.geometries.playerCore), true);
  assert.deepEqual(assets.geometries.playerShell.args, [0.98, 2]);
  assert.deepEqual(assets.geometries.playerSeam.args, [0.965, 0.026, 8, 72]);
  assert.equal(Boolean(assets.geometries.platformPad), true);
  assert.equal(Boolean(assets.geometries.platformOrbitBand), true);
  assert.equal(Boolean(assets.geometries.platformOrbitBandHalo), true);
  assert.equal(Boolean(assets.geometries.platformTopRail), true);
  assert.equal(Boolean(assets.geometries.platformTopRailHalo), true);
  assert.equal(Boolean(assets.materials.platform.standard), true);
  assert.equal(Boolean(assets.materials.platform.hazard), true);
  assert.equal(typeof assets.createShockwaveMaterial, "function");
});

test("shared materials keep platforms below the player brightness", () => {
  const { createSharedAssets } = loadSourceModule("src/materials.js");
  const { COLORS } = loadSourceModule("src/config.js");
  const assets = createSharedAssets(makeFakeThree());
  const platformPadTypes = ["standard", "multiplier", "hazard", "narrow", "boost"];

  assert.notEqual(assets.materials.player.core.options.color, COLORS.white);
  const playerColor = assets.materials.player.core.options.color;
  const playerBrightness = (
    ((playerColor >> 16) & 255) * 0.2126 +
    ((playerColor >> 8) & 255) * 0.7152 +
    (playerColor & 255) * 0.0722
  ) / 255;
  assert.equal(playerBrightness >= 0.62, true);
  assert.equal(assets.materials.player.core.options.emissiveIntensity >= 0.11, true);
  assert.equal(assets.materials.player.core.options.emissiveIntensity <= 0.12, true);
  assert.equal(assets.materials.player.core.options.metalness <= 0.22, true);
  assert.equal(assets.materials.player.core.options.roughness >= 0.36, true);
  assert.equal(assets.materials.player.shell.options.color, COLORS.playerCore);
  assert.equal(assets.materials.player.shell.options.emissive, COLORS.playerCore);
  assert.equal(assets.materials.player.shell.options.emissiveIntensity >= 0.52, true);
  assert.equal(assets.materials.player.shell.options.emissiveIntensity <= 0.6, true);
  assert.equal(Boolean(assets.materials.player.shell.options.transparent), false);
  assert.notEqual(assets.materials.player.ring.options.color, assets.materials.player.core.options.color);
  assert.notEqual(assets.materials.player.ringAlt.options.color, assets.materials.player.ring.options.color);
  assert.equal(assets.materials.player.ring.options.opacity >= 0.86, true);
  assert.equal(assets.materials.player.ringAlt.options.opacity >= 0.82, true);
  platformPadTypes.forEach((type) => {
    assert.equal(assets.materials.platform[type].options.emissiveIntensity <= 0.08, true);
  });
  assert.equal(assets.materials.platform.orbitBand.opacity >= 0.66, true);
  assert.equal(assets.materials.platform.orbitBand.opacity <= 0.78, true);
  assert.equal(assets.materials.platform.orbitBandHalo.opacity >= 0.26, true);
  assert.equal(assets.materials.platform.orbitBandHalo.opacity <= 0.38, true);
  assert.equal(assets.materials.platform.topRail.opacity >= 0.3, true);
  assert.equal(assets.materials.platform.topRail.opacity <= 0.38, true);
  assert.equal(assets.materials.platform.topRailHalo.opacity >= 0.18, true);
  assert.equal(assets.materials.platform.topRailHalo.opacity <= 0.24, true);
  assert.equal(assets.materials.platform.topRail.opacity < assets.materials.platform.orbitBand.opacity * 0.55, true);
  assert.equal(assets.materials.platform.topRailHalo.opacity < assets.materials.platform.orbitBandHalo.opacity * 0.82, true);
  assert.equal(assets.materials.platform.beacon.opacity >= 0.14, true);
  assert.equal(assets.materials.platform.beacon.opacity <= 0.22, true);
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
  const firstChunk = stars.layers[0].chunks[0];
  firstChunk.points.position.z = 6;

  stars.update(1, 1);

  assert.equal(scene.added.length, 6);
  assert.equal(firstChunk.points.position.z < 0, true);
  assert.equal(firstChunk.geometry.verticesNeedUpdate, undefined);
});

test("starfield builds layered depth with rare glints", () => {
  const { Starfield } = loadSourceModule("src/effects.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const scene = { added: [], add(object) { this.added.push(object); } };
  const stars = new Starfield({
    THREE: makeFakeThree(),
    scene,
    count: 12,
    spread: 10,
    depth: 10,
    speedScale: 1,
  });

  assert.equal(stars.layers.length, 3);
  assert.equal(GAME_CONFIG.stars.count > 1250, true);
  assert.equal(scene.added.length, 6);
  assert.equal(stars.layers[0].chunks.length, 2);
  assert.equal(stars.layers[0].geometry.attributes.position.count, 6);
  assert.equal(stars.layers[1].geometry.attributes.position.count, 3);
  assert.equal(stars.layers[2].geometry.attributes.position.count, 1);
  assert.equal(stars.layers[2].material.options.size > stars.layers[0].material.options.size, true);
  assert.equal(stars.layers[0].material.options.opacity >= 0.4, true);
  assert.equal(stars.layers[2].material.options.size >= 0.34, true);
});

test("space traffic creates richer side planets and asteroids that drift by", () => {
  const { SpaceTraffic } = loadSourceModule("src/effects.js");
  const scene = { added: [], add(object) { this.added.push(object); } };
  const rolls = [
    0.2, 0.15, 0.5, 0.4, 0.35, 0.3, 0.2,
    0.82, 0.9, 0.2, 0.65, 0.55, 0.7,
  ];
  const traffic = new SpaceTraffic({
    THREE: makeFakeThree(),
    scene,
    count: 2,
    depth: 18,
    random: () => rolls.shift() ?? 0.6,
  });
  const first = traffic.bodies[0];
  const startZ = first.mesh.position.z;

  assert.equal(scene.added.length, 2);
  assert.equal(traffic.bodies.every((body) => Math.abs(body.mesh.position.x) >= 18), true);
  assert.equal(traffic.bodies.some((body) => body.kind === "planet"), true);
  assert.equal(traffic.bodies.some((body) => body.kind === "asteroid"), true);
  assert.equal(first.mesh.children.length >= 4, true);
  assert.equal(Boolean(first.atmosphere), true);
  assert.equal(first.surfaceBands.length >= 2, true);
  assert.equal(first.ring.visible, true);

  traffic.update(1, 1);

  assert.equal(first.mesh.position.z > startZ, true);

  first.mesh.position.z = 99;
  traffic.update(1 / 60, 1);

  assert.equal(first.mesh.position.z < 0, true);
});
