const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

test("scoring helper resolves pickup, hazard, and boost outcomes", () => {
  const { resolveLandingScore } = loadSourceModule("src/scoring.js");

  assert.deepEqual(
    resolveLandingScore({ score: 0, multiplier: 1, platformType: "multiplier", hitPickup: true }),
    { score: 2, multiplier: 2, resetMultiplier: false, bonus: 0 }
  );

  assert.deepEqual(
    resolveLandingScore({ score: 10, multiplier: 4, platformType: "multiplier", hitPickup: false }),
    { score: 11, multiplier: 1, resetMultiplier: true, bonus: 0 }
  );

  assert.deepEqual(
    resolveLandingScore({ score: 10, multiplier: 3, platformType: "hazard", hitPickup: false }),
    { score: 11, multiplier: 1, resetMultiplier: true, bonus: 0 }
  );

  assert.deepEqual(
    resolveLandingScore({ score: 10, multiplier: 2, platformType: "boost", hitPickup: false }),
    { score: 17, multiplier: 2, resetMultiplier: false, bonus: 5 }
  );
});
