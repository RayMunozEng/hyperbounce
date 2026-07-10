const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function sampleFor(controller, fps, seconds, isActive = true) {
  const frameSeconds = 1 / fps;
  const frameCount = Math.ceil(fps * seconds);
  let change = null;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const nextScale = controller.update(frameSeconds, isActive);

    if (nextScale !== null) change = nextScale;
  }

  return change;
}

test("adaptive render quality lowers resolution after sustained slow frames", () => {
  const { AdaptiveRenderQuality } = loadSourceModule("src/render_quality.js");
  const quality = new AdaptiveRenderQuality();

  assert.equal(sampleFor(quality, 45, 1.6), 0.82);
  assert.equal(quality.scale, 0.82);
});

test("adaptive render quality recovers only after sustained smooth frames", () => {
  const { AdaptiveRenderQuality } = loadSourceModule("src/render_quality.js");
  const quality = new AdaptiveRenderQuality();

  sampleFor(quality, 45, 1.6);
  quality.update(0, false);

  assert.equal(sampleFor(quality, 60, 5.2), null);
  assert.equal(quality.scale, 0.82);
  assert.equal(sampleFor(quality, 60, 1), 1);
  assert.equal(quality.scale, 1);
});

test("adaptive render quality ignores isolated long gaps", () => {
  const { AdaptiveRenderQuality } = loadSourceModule("src/render_quality.js");
  const quality = new AdaptiveRenderQuality();

  assert.equal(quality.update(0.3, true), null);
  assert.equal(sampleFor(quality, 60, 1), null);
  assert.equal(quality.scale, 1);
});

test("adaptive render quality downshifts after repeated catastrophic frames", () => {
  const { AdaptiveRenderQuality } = loadSourceModule("src/render_quality.js");
  const quality = new AdaptiveRenderQuality();
  let change = null;

  for (let frame = 0; frame < 12; frame += 1) {
    const nextScale = quality.update(0.4, true);
    if (nextScale !== null) change = nextScale;
  }

  assert.equal(change, 0.82);
  assert.equal(quality.scale, 0.82);
});

test("adaptive render quality includes emergency software-rendering tiers", () => {
  const { RENDER_QUALITY_SCALES } = loadSourceModule("src/render_quality.js");

  assert.deepEqual(RENDER_QUALITY_SCALES, [1, 0.82, 0.68, 0.5, 0.4]);
});

test("adaptive render quality clears partial samples while inactive", () => {
  const { AdaptiveRenderQuality } = loadSourceModule("src/render_quality.js");
  const quality = new AdaptiveRenderQuality();

  sampleFor(quality, 45, 0.7);
  quality.update(1 / 45, false);

  assert.equal(sampleFor(quality, 45, 0.8), null);
  assert.equal(quality.scale, 1);
});
