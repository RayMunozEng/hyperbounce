const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

test("player bounce timing stays locked to platform travel timing", () => {
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const { resolveBounceSpeed } = loadSourceModule("src/tempo.js");
  const runSpeed = GAME_CONFIG.run.baseSpeed + GAME_CONFIG.run.speedGain * 30;
  const verticalTravel = (GAME_CONFIG.player.topY - GAME_CONFIG.player.startY) * 2;
  const bounceFrames = verticalTravel / resolveBounceSpeed(runSpeed);
  const platformFrames = Math.abs(GAME_CONFIG.platform.startZ) / runSpeed;

  assert.equal(Number(bounceFrames.toFixed(6)), Number(platformFrames.toFixed(6)));
});

test("player bounce timing stays locked to a variable platform gap", () => {
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const { resolveBounceSpeed } = loadSourceModule("src/tempo.js");
  const runSpeed = GAME_CONFIG.run.baseSpeed + GAME_CONFIG.run.speedGain * 48;
  const platformGap = Math.abs(GAME_CONFIG.platform.startZ) * 1.22;
  const verticalTravel = (GAME_CONFIG.player.topY - GAME_CONFIG.player.startY) * 2;
  const bounceFrames = verticalTravel / resolveBounceSpeed(runSpeed, platformGap);
  const platformFrames = platformGap / runSpeed;

  assert.equal(Number(bounceFrames.toFixed(6)), Number(platformFrames.toFixed(6)));
});

test("platform progress is the single source of truth for bounce height", () => {
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const {
    resolvePlatformBouncePhase,
    resolveBounceHeight,
  } = loadSourceModule("src/tempo.js");
  const gap = 10;

  assert.equal(resolvePlatformBouncePhase(-gap, gap), 0);
  assert.equal(resolvePlatformBouncePhase(-gap / 2, gap), 0.5);
  assert.equal(resolvePlatformBouncePhase(0, gap), 1);
  assert.equal(
    resolveBounceHeight(0, GAME_CONFIG),
    GAME_CONFIG.player.startY
  );
  assert.equal(
    resolveBounceHeight(0.5, GAME_CONFIG),
    GAME_CONFIG.player.topY
  );
  assert.equal(
    resolveBounceHeight(1, GAME_CONFIG),
    GAME_CONFIG.player.startY
  );
});

test("platform-driven bounce does not drift across variable gaps and irregular frames", () => {
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const {
    resolvePlatformBouncePhase,
    resolveBounceHeight,
  } = loadSourceModule("src/tempo.js");
  const frameDeltas = [1 / 60, 1 / 48, 1 / 75, 0.028, 1 / 90, 0.022];
  const gapScales = [0.78, 1.18, 0.91, 1.24, 0.84, 1.07];
  let gapIndex = 0;
  let frameIndex = 0;
  let speed = GAME_CONFIG.run.baseSpeed;
  let gap = Math.abs(GAME_CONFIG.platform.startZ) * gapScales[gapIndex];
  let platformZ = -gap;
  let landings = 0;

  while (landings < 250) {
    const delta = frameDeltas[frameIndex % frameDeltas.length];
    const frameScale = Math.min(delta * 60, 2);

    platformZ += speed * frameScale;
    const phase = resolvePlatformBouncePhase(platformZ, gap);
    const playerY = resolveBounceHeight(phase, GAME_CONFIG);

    assert.equal(playerY >= GAME_CONFIG.player.startY - 1e-9, true);
    assert.equal(playerY <= GAME_CONFIG.player.topY + 1e-9, true);

    if (phase >= 1) {
      const overshoot = platformZ;

      assert.equal(
        Math.abs(playerY - resolveBounceHeight(phase, GAME_CONFIG)) < 1e-9,
        true
      );
      landings += 1;
      gapIndex = (gapIndex + 1) % gapScales.length;
      gap = Math.abs(GAME_CONFIG.platform.startZ) * gapScales[gapIndex];
      platformZ = overshoot - gap;
      speed = Math.min(
        GAME_CONFIG.run.maxSpeed,
        speed + GAME_CONFIG.run.speedGain
      );

      const nextPhase = resolvePlatformBouncePhase(platformZ, gap);
      assert.equal(nextPhase >= 0, true);
      assert.equal(nextPhase < 1, true);
    }

    frameIndex += 1;
    assert.equal(frameIndex < 20000, true);
  }

  assert.equal(landings, 250);
});
