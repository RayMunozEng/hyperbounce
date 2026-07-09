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
