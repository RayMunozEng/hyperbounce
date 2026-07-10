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

function makeMaterial(props = {}) {
  return {
    opacity: 1,
    emissiveIntensity: 0.018,
    transparent: false,
    userData: {},
    ...props,
    clone() {
      return makeMaterial({
        ...props,
        opacity: this.opacity,
        emissiveIntensity: this.emissiveIntensity,
        transparent: this.transparent,
        userData: { ...this.userData },
      });
    },
  };
}

function makeAssets() {
  const material = makeMaterial();
  const pickupCoreMaterial = { role: "pickup-core", opacity: 1 };
  const pickupRingMaterial = { role: "pickup-ring", opacity: 1 };
  const pickupGlintMaterial = { role: "pickup-glint", opacity: 1 };
  return {
    geometries: {
      playerCore: {},
      playerShell: {},
      playerSeam: { role: "player-seam" },
      playerRing: {},
      pickupCore: {},
      pickupRing: {},
      pickupGlint: {},
      platformPad: {},
      platformNarrowPad: {},
      platformOrbitBand: {},
      platformNarrowOrbitBand: {},
      platformOrbitBandHalo: {},
      platformNarrowOrbitBandHalo: {},
      platformTopRail: {},
      platformTopRailHalo: {},
      platformBeacon: {},
      hazardMarker: {},
      shockwave: {},
    },
    materials: {
      player: {
        core: material,
        shell: material,
        seam: material,
        seamAlt: material,
        seamAccent: material,
        ring: material,
        trail: material,
      },
      platform: {
        standard: material,
        multiplier: material,
        hazard: material,
        narrow: material,
        boost: material,
        orbitBand: material,
        orbitBandHalo: material,
        topRail: material,
        topRailHalo: material,
        beacon: material,
        pickup: material,
        pickupCore: pickupCoreMaterial,
        pickupRing: pickupRingMaterial,
        pickupGlint: pickupGlintMaterial,
        hazardMarker: material,
      },
    },
    createShockwaveMaterial() {
      return { opacity: 1, color: null };
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

test("player syncs bounce speed to the current run speed and target gap", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const { resolveBounceSpeed } = loadSourceModule("src/tempo.js");
  const THREE = makeFakeThree();
  const scene = makeObject3D();
  const player = new Player({ THREE, scene, assets: makeAssets() });
  const runSpeed = GAME_CONFIG.run.baseSpeed + GAME_CONFIG.run.speedGain * 40;
  const platformGap = Math.abs(GAME_CONFIG.platform.startZ) * 0.82;

  player.syncRunSpeed(runSpeed, platformGap);

  assert.equal(player.speed, resolveBounceSpeed(runSpeed, platformGap));
});

test("player seams stay attached while the faceted assembly rotates", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const scene = makeObject3D();
  const assets = makeAssets();
  const player = new Player({ THREE, scene, assets });
  const mountAStartY = player.seamMountA.rotation.y;
  const mountBStartX = player.seamMountB.rotation.x;
  const assemblyStartY = player.visualAssembly.rotation.y;

  player.update(1 / 60, 0, true);

  assert.equal(player.group.children.includes(player.visualAssembly), true);
  assert.equal(player.visualAssembly.children.includes(player.shell), true);
  assert.equal(player.seamMountA.children.includes(player.seamA), true);
  assert.equal(player.seamMountB.children.includes(player.seamB), true);
  assert.equal(player.seamMountC.children.includes(player.seamC), true);
  assert.equal(player.seamA.geometry, assets.geometries.playerSeam);
  assert.equal(player.seamA.position.x, 0);
  assert.equal(player.seamB.position.x, 0);
  assert.equal(player.seamMountA.rotation.y, mountAStartY);
  assert.equal(player.seamMountB.rotation.x, mountBStartX);
  assert.notEqual(player.visualAssembly.rotation.y, assemblyStartY);
});

test("player motion wake stays local to the player instead of storing world trail points", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const scene = makeObject3D();
  const player = new Player({ THREE, scene, assets: makeAssets() });

  player.position.x = 4;
  player.position.y = 1;
  player.update(1 / 60, 0, true);

  assert.equal(player.group.children.includes(player.motionWake), true);
  assert.equal(player.wakeRings.length >= 4, true);
  assert.equal(player.wakeRings.every((ring) => Math.abs(ring.position.x) < 0.001), true);
  assert.equal(player.wakeRings.every((ring) => Math.abs(ring.position.y) < 2), true);
  assert.equal(player.motionWake.geometry, undefined);
});

test("player motion wake eases through bounce direction changes", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const player = new Player({ THREE, scene: makeObject3D(), assets: makeAssets() });

  player.direction = 1;
  player.updateMotionWake(1, 1 / 60);
  const beforeFlipY = player.wakeRings[0].position.y;

  player.direction = -1;
  player.updateMotionWake(1, 1 / 60);
  const afterFlipY = player.wakeRings[0].position.y;

  assert.equal(Math.abs(afterFlipY - beforeFlipY) < 0.25, true);
  assert.equal(player.wakeRings.every((ring) => ring.material.opacity <= 0.18), true);
});

test("player visibility can be hidden for the title screen and restored for launch", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const player = new Player({ THREE, scene: makeObject3D(), assets: makeAssets() });

  player.setVisible(false);
  assert.equal(player.group.visible, false);

  player.setVisible(true);
  assert.equal(player.group.visible, true);
});

test("player teleport arrival uses reusable expanding effect rings", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const player = new Player({ THREE, scene: makeObject3D(), assets: makeAssets() });

  player.beginTeleportArrival();

  assert.equal(player.group.children.includes(player.teleportEffect), true);
  assert.equal(player.teleportRings.length >= 3, true);
  assert.equal(player.teleportEffect.visible, true);
  assert.equal(player.group.scale.x < 0.2, true);

  player.updateLaunchVisual(0.34);

  assert.equal(player.teleportRings.some((ring) => ring.scale.x > 1.3), true);
  assert.equal(player.teleportRings.every((ring) => Math.abs(ring.position.x) < 0.001), true);

  player.updateLaunchVisual(1);

  assert.equal(player.group.scale.x, 1);
  assert.equal(player.teleportEffect.visible, false);
});

test("player death opens a reusable gravity rift and corkscrews into it", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const scene = makeObject3D();
  const player = new Player({ THREE, scene, assets: makeAssets() });
  const effect = player.deathEffect;
  const rift = player.deathRift;
  const ghosts = player.deathGhosts.slice();
  const startY = player.position.y;

  player.beginDeath();

  assert.equal(effect.visible, true);
  assert.equal(rift.visible, true);
  assert.equal(scene.children.includes(rift), true);
  assert.equal(player.riftRings.length >= 3, true);
  assert.equal(ghosts.length >= 3, true);
  assert.equal(player.motionWake.visible, false);

  player.updateDeath(0.12);

  assert.equal(rift.scale.x > 0.2, true);
  assert.equal(player.seamMountA.scale.x > 1, true);
  assert.equal(player.seamMountC.scale.x > 1, true);
  assert.equal(player.position.y > startY - 0.5, true);

  for (let frame = 0; frame < 42; frame += 1) {
    player.updateDeath(1 / 60);
  }

  assert.equal(player.position.y < startY - 1.5, true);
  assert.notEqual(player.position.x, 0);
  assert.equal(player.core.scale.y > player.core.scale.x, true);
  assert.equal(player.deathGhosts.some((ghost) => ghost.material.opacity > 0.05), true);
  assert.strictEqual(player.deathEffect, effect);
  assert.deepEqual(player.deathGhosts, ghosts);

  let finished = false;
  for (let frame = 0; frame < 60 && !finished; frame += 1) {
    finished = player.updateDeath(1 / 60);
  }

  assert.equal(finished, true);
  assert.equal(player.riftBurst.scale.x > 2.5, true);
  assert.equal(player.core.scale.x > 0, true);
  assert.equal(player.core.scale.y > 0, true);
  assert.equal(player.shell.scale.x > 0, true);

  player.reset();

  assert.equal(player.deathEffect.visible, false);
  assert.equal(player.deathRift.visible, false);
  assert.equal(player.motionWake.visible, true);
  assert.equal(player.core.scale.x, 1);
  assert.equal(player.group.rotation.z, 0);
});

test("player reflects leftover motion at bounce boundaries", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const THREE = makeFakeThree();
  const player = new Player({ THREE, scene: makeObject3D(), assets: makeAssets() });

  player.position.y = GAME_CONFIG.player.topY - 0.01;
  player.direction = 1;
  player.update(1 / 60, 0, true);

  assert.equal(player.direction, -1);
  assert.equal(player.position.y < GAME_CONFIG.player.topY, true);

  player.position.y = GAME_CONFIG.player.startY + 0.01;
  player.direction = -1;
  player.update(1 / 60, 0, true);

  assert.equal(player.direction, 1);
  assert.equal(player.landedThisFrame, true);
  assert.equal(player.position.y > GAME_CONFIG.player.startY, true);
});

test("player defaults to the primary game scene", () => {
  const { default: Player } = loadSourceModule("src/player.js");
  const THREE = makeFakeThree();
  const scene = makeObject3D();
  const previousWindow = global.window;

  global.window = { game: { scene }, THREE };
  const player = new Player({ THREE, assets: makeAssets() });
  global.window = previousWindow;

  assert.equal(scene.children.includes(player.group), true);
  assert.equal(scene.children.includes(player.deathRift), true);
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
  assert.equal(platform.isCleared, true);
});

test("platform combo pickup uses separate shape and color cues", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const THREE = makeFakeThree();
  const assets = makeAssets();
  const platform = new Platform({ THREE, scene: makeObject3D(), assets });

  assert.equal(platform.pickup.children.length >= 3, true);
  assert.equal(platform.pickup.core.material, assets.materials.platform.pickupCore);
  assert.equal(platform.pickup.ring.material, assets.materials.platform.pickupRing);
  assert.equal(platform.pickup.glint.material, assets.materials.platform.pickupGlint);
  assert.equal(platform.pickup.ring.rotation.x, 0);
  assert.equal(platform.pickup.ring.scale.x > platform.pickup.core.scale.x, true);
  assert.equal(platform.pickup.position.y >= 1.18, true);
  assert.equal(platform.pickup.glint.position.y > platform.pickup.core.position.y, true);
});

test("platform landing feedback reuses a prominent shockwave and softer afterglow", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const THREE = makeFakeThree();
  const platform = new Platform({ THREE, scene: makeObject3D(), assets: makeAssets() });
  const shockwave = platform.shockwave;
  const afterglow = platform.impactAfterglow;

  platform.activate("standard", 0, -12, 0);
  platform.resolveLanding({ hitPickup: false, resetMultiplier: false, boost: 0 });

  assert.equal(platform.impactAfterglow.visible, true);
  assert.equal(platform.impactAfterglow.material.opacity < platform.shockwave.material.opacity, true);
  assert.equal(platform.shockwave.material.opacity >= 0.28, true);
  assert.equal(platform.impactAfterglow.material.opacity >= 0.045, true);

  platform.update(0.25, 0);

  assert.equal(platform.shockwave.visible, true);
  assert.equal(platform.impactAfterglow.visible, true);
  assert.equal(platform.shockwave.scale.x > 1, true);
  assert.equal(platform.impactAfterglow.scale.x > platform.shockwave.scale.x, true);
  assert.equal(platform.impactAfterglow.material.opacity < platform.shockwave.material.opacity, true);

  platform.update(1, 0);
  platform.resolveLanding({ hitPickup: false, resetMultiplier: false, boost: 0 });

  assert.strictEqual(platform.shockwave, shockwave);
  assert.strictEqual(platform.impactAfterglow, afterglow);
});

test("platform pad starts dim and stays bright after landing", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const THREE = makeFakeThree();
  const assets = makeAssets();
  const platform = new Platform({ THREE, scene: makeObject3D(), assets });

  platform.activate("standard", 0, -12, 0);

  assert.notEqual(platform.pad.material, assets.materials.platform.standard);
  assert.equal(platform.pad.material.emissiveIntensity, GAME_CONFIG.platform.idleEmissiveIntensity);

  platform.resolveLanding({ hitPickup: false, resetMultiplier: false, boost: 0 });

  assert.equal(platform.pad.material.emissiveIntensity, GAME_CONFIG.platform.hitEmissiveIntensity);

  platform.update(0.12, 0);

  assert.equal(platform.pad.material.emissiveIntensity, GAME_CONFIG.platform.hitEmissiveIntensity);

  platform.update(1, 0);

  assert.equal(platform.pad.material.emissiveIntensity, GAME_CONFIG.platform.hitEmissiveIntensity);

  platform.activate("standard", 0, -12, 1);

  assert.equal(platform.pad.material.emissiveIntensity, GAME_CONFIG.platform.idleEmissiveIntensity);
});

test("platform pad and center accents color cycle once play begins", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const THREE = makeFakeThree();
  const assets = makeAssets();
  const colorCalls = [];
  const orbitBandColorCalls = [];
  const topRailColorCalls = [];

  assets.materials.platform.standard = makeMaterial({
    color: {
      setHex(value) {
        colorCalls.push(["hex", value]);
      },
      setHSL(hue, saturation, lightness) {
        colorCalls.push(["hsl", hue, saturation, lightness]);
      },
    },
    emissive: {
      setHex(value) {
        colorCalls.push(["emissiveHex", value]);
      },
      setHSL(hue, saturation, lightness) {
        colorCalls.push(["emissiveHsl", hue, saturation, lightness]);
      },
    },
  });
  assets.materials.platform.orbitBand = makeMaterial({
    color: {
      setHex(value) {
        orbitBandColorCalls.push(["hex", value]);
      },
      setHSL(hue, saturation, lightness) {
        orbitBandColorCalls.push(["hsl", hue, saturation, lightness]);
      },
    },
  });
  assets.materials.platform.orbitBandHalo = makeMaterial({
    color: {
      setHex(value) {
        orbitBandColorCalls.push(["haloHex", value]);
      },
      setHSL(hue, saturation, lightness) {
        orbitBandColorCalls.push(["haloHsl", hue, saturation, lightness]);
      },
    },
  });
  assets.materials.platform.topRail = makeMaterial({
    color: {
      setHex(value) {
        topRailColorCalls.push(["hex", value]);
      },
      setHSL(hue, saturation, lightness) {
        topRailColorCalls.push(["hsl", hue, saturation, lightness]);
      },
    },
  });
  assets.materials.platform.topRailHalo = makeMaterial();

  const platform = new Platform({ THREE, scene: makeObject3D(), assets });

  platform.activate("standard", 0, -12, 4);
  colorCalls.length = 0;
  orbitBandColorCalls.length = 0;
  topRailColorCalls.length = 0;

  platform.update(0.5, GAME_CONFIG.run.baseSpeed);

  assert.equal(colorCalls.some((call) => call[0] === "hsl"), false);
  assert.equal(orbitBandColorCalls.some((call) => call[0] === "hsl"), false);
  assert.equal(platform.colorCycle.phase, 4 * 0.37);

  platform.update(0.5, GAME_CONFIG.platform.colorCycleStartSpeed + 0.04);

  assert.equal(colorCalls.some((call) => call[0] === "hsl"), true);
  assert.equal(colorCalls.some((call) => call[0] === "emissiveHsl"), true);
  const orbitBandHsl = orbitBandColorCalls.find((call) => call[0] === "hsl");
  const orbitBandHaloHsl = orbitBandColorCalls.find((call) => call[0] === "haloHsl");
  const topRailHsl = topRailColorCalls.find((call) => call[0] === "hsl");
  assert.equal(Boolean(orbitBandHsl), true);
  assert.equal(orbitBandHsl[3] >= 0.7, true);
  assert.equal(Boolean(orbitBandHaloHsl), true);
  assert.equal(Boolean(topRailHsl), true);
  assert.equal(topRailHsl[3] < orbitBandHsl[3], true);
  assert.equal(platform.colorCycle.phase > 0, true);
});

test("platform center beacon keeps a readable neon glow while the pad stays dim", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const THREE = makeFakeThree();
  const assets = makeAssets();

  assets.materials.platform.beacon = makeMaterial({ opacity: 0.16 });
  assets.materials.platform.orbitBand = makeMaterial({ opacity: 0.94 });
  assets.materials.platform.orbitBandHalo = makeMaterial({ opacity: 0.46 });
  const platform = new Platform({ THREE, scene: makeObject3D(), assets });

  platform.activate("standard", 0, -12, 0);
  platform.update(1 / 60, GAME_CONFIG.run.baseSpeed);

  assert.equal(platform.pad.material.emissiveIntensity, GAME_CONFIG.platform.idleEmissiveIntensity);
  assert.equal(platform.beaconMaterial.opacity >= 0.1, true);
  assert.equal(platform.orbitBand.material.opacity > platform.beaconMaterial.opacity, true);
});

test("platform orbit band carries the main neon accent without flooding the pad", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const { GAME_CONFIG, PLATFORM_TYPES } = loadSourceModule("src/config.js");
  const THREE = makeFakeThree();
  const assets = makeAssets();
  const orbitBandColorCalls = [];

  assets.materials.platform.orbitBand = makeMaterial({
    opacity: 0.72,
    color: {
      setHex(value) {
        orbitBandColorCalls.push(value);
      },
    },
  });
  assets.materials.platform.orbitBandHalo = makeMaterial({ opacity: 0.32 });
  assets.materials.platform.topRail = makeMaterial({ opacity: 0.34 });
  assets.materials.platform.topRailHalo = makeMaterial({ opacity: 0.2 });

  const platform = new Platform({ THREE, scene: makeObject3D(), assets });

  platform.activate("boost", 0, -12, 0);
  platform.update(1 / 60, GAME_CONFIG.run.baseSpeed);

  assert.equal(platform.edge, undefined);
  assert.equal(orbitBandColorCalls.includes(PLATFORM_TYPES.boost.color), true);
  assert.equal(platform.orbitBand.material.opacity >= 0.58, true);
  assert.equal(platform.orbitBand.material.opacity <= 0.74, true);
  assert.equal(platform.orbitBandHalo.material.opacity >= 0.2, true);
  assert.equal(platform.orbitBandHalo.material.opacity <= 0.36, true);
  assert.equal(platform.topRail.material.opacity < platform.orbitBand.material.opacity * 0.5, true);
  assert.equal(platform.topRailHalo.material.opacity < platform.orbitBandHalo.material.opacity, true);
  assert.equal(platform.orbitBand.rotation.x, Math.PI / 2);
  assert.notEqual(platform.orbitBand.material.depthTest, false);
  assert.notEqual(platform.orbitBandHalo.material.depthTest, false);
  assert.equal(platform.orbitBand.material.depthWrite, false);
  assert.equal(platform.orbitBandHalo.material.depthWrite, false);
  assert.equal(platform.orbitBand.renderOrder > platform.topRail.renderOrder, true);
  assert.equal(platform.orbitBandHalo.renderOrder > platform.pad.renderOrder, true);
  assert.equal(platform.orbitBand.position.y > platform.pad.position.y, true);
  assert.equal(platform.orbitBand.position.y < platform.topRail.position.y, true);
  assert.equal(platform.topRail.position.y > platform.pad.position.y, true);
  assert.equal(platform.pad.material.emissiveIntensity, GAME_CONFIG.platform.idleEmissiveIntensity);
});

test("platform top rails form a shared rotating X with beat-pulsed glow", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const THREE = makeFakeThree();
  const assets = makeAssets();

  assets.materials.platform.topRail = makeMaterial({ opacity: 0.34 });
  assets.materials.platform.topRailHalo = makeMaterial({ opacity: 0.2 });
  const platform = new Platform({ THREE, scene: makeObject3D(), assets });

  platform.activate("standard", 0, -12, 0);
  const pulseState = platform.topRailPulse;

  assert.equal(Boolean(platform.topRailCross), true);
  assert.equal(Boolean(platform.topRailCrossHalo), true);
  assert.equal(platform.topRailGroup.children.includes(platform.topRail), true);
  assert.equal(platform.topRailGroup.children.includes(platform.topRailCross), true);
  assert.equal(platform.topRail.rotation.z, Math.PI / 2);
  assert.equal(platform.topRailCross.rotation.x, Math.PI / 2);

  platform.update(1 / 60, GAME_CONFIG.run.baseSpeed, { intensity: 0, tempo: 1 });
  const slowRotation = platform.topRailGroup.rotation.y;
  const dimRailOpacity = platform.topRail.material.opacity;
  const dimHaloOpacity = platform.topRailHalo.material.opacity;
  const dimCrossOpacity = platform.topRailCross.material.opacity;

  platform.update(1 / 60, GAME_CONFIG.run.baseSpeed, { intensity: 1, tempo: 2.4 });
  const beatRailOpacity = platform.topRail.material.opacity;

  assert.strictEqual(platform.topRailPulse, pulseState);
  assert.equal(platform.topRailGroup.rotation.y > slowRotation, true);
  assert.equal(platform.topRail.material.opacity >= dimRailOpacity * 1.75, true);
  assert.equal(platform.topRailHalo.material.opacity >= dimHaloOpacity * 2.4, true);
  assert.equal(platform.topRailCross.material.opacity >= dimCrossOpacity * 1.75, true);
  assert.equal(platform.topRailCross.material.opacity, platform.topRail.material.opacity);
  assert.equal(platform.topRailCrossHalo.material.opacity, platform.topRailHalo.material.opacity);

  platform.resolveLanding({ hitPickup: false, resetMultiplier: false, boost: 0 });

  assert.equal(platform.topRail.material.opacity > beatRailOpacity, true);
  assert.equal(platform.topRailCross.material.opacity, platform.topRail.material.opacity);
  assert.equal(platform.topRailCrossHalo.material.opacity, platform.topRailHalo.material.opacity);
});

test("landing contrast keeps the X crisp while surrounding platform glow dips", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const THREE = makeFakeThree();
  const assets = makeAssets();

  assets.materials.platform.orbitBand = makeMaterial({ opacity: 0.72 });
  assets.materials.platform.orbitBandHalo = makeMaterial({ opacity: 0.32 });
  assets.materials.platform.topRail = makeMaterial({ opacity: 0.34 });
  assets.materials.platform.topRailHalo = makeMaterial({ opacity: 0.2 });
  assets.materials.platform.beacon = makeMaterial({ opacity: 0.18 });
  const platform = new Platform({ THREE, scene: makeObject3D(), assets });

  platform.activate("standard", 0, -12, 0);
  platform.update(1 / 60, 0, { intensity: 0, tempo: 1 });
  const idleOrbitOpacity = platform.orbitBand.material.opacity;
  const idleBeaconOpacity = platform.beacon.material.opacity;

  platform.resolveLanding({ hitPickup: false, resetMultiplier: false, boost: 0 });

  assert.equal(platform.topRail.material.opacity > platform.orbitBand.material.opacity, true);
  assert.equal(platform.topRailHalo.material.opacity <= platform.topRail.material.opacity * 0.38, true);
  assert.equal(platform.orbitBand.material.opacity < idleOrbitOpacity * 0.72, true);
  assert.equal(platform.beacon.material.opacity < idleBeaconOpacity * 0.65, true);
  assert.equal(platform.shockwave.material.opacity <= 0.3, true);
  assert.equal(platform.impactAfterglow.material.opacity <= 0.06, true);
});

test("platforms fade in from the distant runway without disabling pickups", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const THREE = makeFakeThree();
  const platform = new Platform({ THREE, scene: makeObject3D(), assets: makeAssets() });

  platform.activate("multiplier", 0, GAME_CONFIG.platform.fadeInStartZ, 0);

  assert.equal(platform.group.visible, true);
  assert.equal(platform.pickup.visible, true);
  assert.equal(platform.pad.material.opacity, 0);
  assert.equal(platform.pickup.core.material.opacity, 0);

  platform.group.position.z = GAME_CONFIG.platform.spawnZ;
  platform.update(0, 0);

  assert.equal(platform.pad.material.opacity < 0.32, true);
  assert.equal(platform.pickup.core.material.opacity < 0.32, true);

  platform.group.position.z = GAME_CONFIG.platform.fadeInEndZ;
  platform.update(0, 0);

  assert.equal(platform.pad.material.opacity, 1);
  assert.equal(platform.pickup.core.material.opacity, 1);
  assert.equal(platform.orbitBand.material.opacity, platform.orbitBand.material.userData.baseOpacity);
});

test("platform launch reveal fades and scales visuals without changing collision z", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const THREE = makeFakeThree();
  const platform = new Platform({ THREE, scene: makeObject3D(), assets: makeAssets() });

  platform.activate("standard", 0, -12, 0);
  const startZ = platform.group.position.z;
  platform.group.visible = false;

  platform.startLaunchReveal(0);

  assert.equal(platform.group.visible, true);
  assert.equal(platform.group.position.z, startZ);
  assert.equal(platform.pad.material.opacity, 0);
  assert.equal(platform.group.scale.x < 1, true);

  platform.updateLaunchReveal(1);

  assert.equal(platform.group.position.z, startZ);
  assert.equal(platform.pad.material.opacity > 0.9, true);
  assert.equal(platform.group.scale.x, 1);
});

test("moving platforms drift gently around their spawn center", () => {
  const { default: Platform } = loadSourceModule("src/platform.js");
  const THREE = makeFakeThree();
  const platform = new Platform({ THREE, scene: makeObject3D(), assets: makeAssets() });

  platform.activate("standard", 1.25, -12, 0, {
    enabled: true,
    amplitude: 0.8,
    speed: Math.PI,
    phase: 0,
  });

  platform.update(0.5, 0);

  assert.equal(platform.motion.enabled, true);
  assert.equal(platform.motion.originX, 1.25);
  assert.equal(platform.group.position.x > 1.9, true);
  assert.equal(platform.group.position.x <= 2.05, true);

  platform.resolveLanding({ hitPickup: false, resetMultiplier: false, boost: 0 });
  platform.update(0.5, 0);

  assert.equal(platform.group.position.x <= 2.05, true);
});

test("star sprite texture draws an intro-style glint", () => {
  const { createStarSpriteTexture } = loadSourceModule("src/materials.js");
  const previousDocument = global.document;
  const calls = [];
  const context = {
    globalCompositeOperation: "source-over",
    clearRect(...args) { calls.push(["clearRect", ...args]); },
    createRadialGradient(...args) {
      calls.push(["createRadialGradient", ...args]);
      return {
        addColorStop(...stopArgs) {
          calls.push(["addColorStop", ...stopArgs]);
        },
      };
    },
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    translate(...args) { calls.push(["translate", ...args]); },
    rotate(...args) { calls.push(["rotate", ...args]); },
    fillRect(...args) { calls.push(["fillRect", ...args]); },
    beginPath() { calls.push(["beginPath"]); },
    arc(...args) { calls.push(["arc", ...args]); },
    fill() { calls.push(["fill"]); },
    set fillStyle(value) { calls.push(["fillStyle", value]); },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext(type) {
      assert.equal(type, "2d");
      return context;
    },
  };
  const THREE = {
    CanvasTexture: class {
      constructor(image) {
        this.image = image;
        this.userData = {};
      }
    },
  };

  global.document = {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      return canvas;
    },
  };

  const texture = createStarSpriteTexture(THREE);
  global.document = previousDocument;

  assert.equal(texture.image, canvas);
  assert.equal(canvas.width, 64);
  assert.equal(canvas.height, 64);
  assert.equal(texture.userData.style, "intro-star-glint");
  assert.equal(calls.some((call) => call[0] === "createRadialGradient"), true);
  assert.equal(calls.filter((call) => call[0] === "fillRect").length >= 4, true);
});
