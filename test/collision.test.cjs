const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

test("detects player landings within platform bounds", () => {
  const { didLand } = loadSourceModule("src/collision.js");

  assert.equal(didLand(0, 0, 2), true);
  assert.equal(didLand(1.99, 0, 2), true);
  assert.equal(didLand(-1.99, 0, 2), true);
  assert.equal(didLand(2.01, 0, 2), false);
  assert.equal(didLand(-2.01, 0, 2), false);
});

test("detects pickup collection within pickup bounds", () => {
  const { didCollect } = loadSourceModule("src/collision.js");

  assert.equal(didCollect(0.25, 0, 0.5), true);
  assert.equal(didCollect(-0.25, 0, 0.5), true);
  assert.equal(didCollect(0.75, 0, 0.5), false);
});
