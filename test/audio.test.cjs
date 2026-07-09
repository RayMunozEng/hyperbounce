const assert = require("assert");
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
