const assert = require("assert");
const fs = require("fs");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function makeFakeHowl(log) {
  return class FakeHowl {
    constructor(options) {
      this.options = options;
      this.volumeValue = options.volume || 0;
      this.playing = false;
      log.instances.push(this);
    }

    play() {
      this.playing = true;
      log.calls.push(["play", this.volumeValue]);
    }

    stop() {
      this.playing = false;
      log.calls.push(["stop"]);
    }

    mute(isMuted) {
      this.muted = isMuted;
      log.calls.push(["mute", isMuted]);
    }

    fade(from, to, duration) {
      this.volumeValue = to;
      log.calls.push(["fade", from, to, duration]);
    }

    volume(value) {
      this.volumeValue = value;
      log.calls.push(["volume", value]);
    }

    duration() {
      return 10;
    }
  };
}

function makeLoadingHowl(log) {
  return class LoadingHowl extends makeFakeHowl(log) {
    duration() {
      return 0;
    }
  };
}

function readWavStats(filePath) {
  const wav = fs.readFileSync(filePath);
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);
  let offset = 12;
  let data = null;

  while (offset < wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      data = wav.subarray(offset + 8, offset + 8 + length);
      break;
    }
    offset += 8 + length + (length % 2);
  }

  assert.ok(data, `${filePath} has a data chunk`);

  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.floor(data.length / bytesPerSample / channels);

  function segment(startSeconds, endSeconds) {
    const start = Math.max(0, Math.floor(startSeconds * sampleRate));
    const end = Math.min(sampleCount, Math.floor(endSeconds * sampleRate));
    let sum = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let previous = 0;

    for (let sample = start; sample < end; sample += 1) {
      const value = data.readInt16LE(sample * channels * bytesPerSample) / 32768;
      const abs = Math.abs(value);
      sum += value * value;
      peak = Math.max(peak, abs);
      if (sample > start && Math.sign(value) !== Math.sign(previous)) zeroCrossings += 1;
      previous = value;
    }

    const duration = Math.max(0.001, (end - start) / sampleRate);
    return {
      rms: Math.sqrt(sum / Math.max(1, end - start)),
      peak,
      zeroCrossHz: zeroCrossings / duration / 2,
    };
  }

  const duration = sampleCount / sampleRate;

  return {
    duration,
    body: segment(0.08, 0.24),
    tail: segment(Math.max(0, duration - 0.1), duration),
  };
}

test("crossfade music looper fades from the ending track into a fresh start", () => {
  const { CrossfadeMusic } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };
  const scheduled = [];
  const looper = new CrossfadeMusic({
    HowlClass: makeFakeHowl(log),
    src: ["song.wav"],
    volume: 0.6,
    fadeSeconds: 2,
    setTimer(fn, delay) {
      scheduled.push({ fn, delay });
      return scheduled.length;
    },
    clearTimer() {},
  });

  looper.play();

  assert.equal(log.instances.length, 2);
  assert.deepEqual(log.calls.slice(0, 2), [["volume", 0.6], ["play", 0.6]]);
  assert.equal(scheduled[0].delay, 8000);

  scheduled[0].fn();

  assert.deepEqual(log.calls.slice(-4), [
    ["volume", 0],
    ["play", 0],
    ["fade", 0, 0.6, 2000],
    ["fade", 0.6, 0, 2000],
  ]);
});

test("crossfade music looper waits when duration is not loaded yet", () => {
  const { CrossfadeMusic } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };
  const scheduled = [];
  const looper = new CrossfadeMusic({
    HowlClass: makeLoadingHowl(log),
    src: ["song.wav"],
    volume: 0.6,
    fadeSeconds: 2,
    setTimer(fn, delay) {
      scheduled.push({ fn, delay });
      return scheduled.length;
    },
    clearTimer() {},
  });

  looper.play();

  assert.equal(scheduled[0].delay, 1000);
  assert.equal(log.calls.some((call) => call[0] === "fade"), false);
});

test("jump SFX helper uses the neon jump asset at gameplay volume", () => {
  const { createJumpSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const jump = createJumpSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 1);
  assert.deepEqual(jump.options.src, ["./src/sounds/neon-jump.wav"]);
  assert.equal(jump.options.volume, 0.34);
  assert.equal(jump.options.rate, 1);
});

test("jump SFX asset has a deeper body and a gentle tail", () => {
  const stats = readWavStats("src/sounds/neon-jump.wav");

  assert.ok(stats.duration <= 0.42, "jump should stay snappy");
  assert.ok(stats.body.zeroCrossHz < 900, "body should read as low and weighty");
  assert.ok(stats.body.peak < 0.94, "body should avoid harsh clipping");
  assert.ok(stats.tail.rms < stats.body.rms * 0.35, "tail should fade below the body");
  assert.ok(stats.tail.zeroCrossHz < 900, "tail should not end with a high screech");
});
