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

    rate(value) {
      this.rateValue = value;
      log.calls.push(["rate", value]);
    }

    duration() {
      return 10;
    }

    seek() {
      return this.seekValue || 0;
    }
  };
}

test("the release soundtrack is compressed for web delivery", () => {
  const gameSource = fs.readFileSync("src/game.js", "utf8");
  const soundtrackPath = "src/sounds/neon-runner.mp3";

  assert.match(gameSource, /neon-runner\.mp3/);
  assert.doesNotMatch(gameSource, /neon-runner\.wav/);
  assert.ok(fs.existsSync(soundtrackPath), "compressed soundtrack is missing");
  assert.ok(fs.statSync(soundtrackPath).size < 6 * 1024 * 1024, "soundtrack exceeds the web size budget");
  assert.ok(!fs.existsSync("src/sounds/neon-runner.wav"), "uncompressed soundtrack should not ship");
});

function makeLoadingHowl(log) {
  return class LoadingHowl extends makeFakeHowl(log) {
    duration() {
      return 0;
    }
  };
}

function makeDeferredHowl(log) {
  return class DeferredHowl extends makeFakeHowl(log) {
    constructor(options) {
      super(options);
      this.durationValue = 0;
    }

    duration() {
      return this.durationValue;
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
    onset: segment(0.02, 0.12),
    body: segment(0.08, 0.24),
    pull: segment(0.48, 0.72),
    implode: segment(0.94, 1.14),
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

test("crossfade music subtracts elapsed playback after duration finishes loading", () => {
  const { CrossfadeMusic } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };
  const scheduled = [];
  const looper = new CrossfadeMusic({
    HowlClass: makeDeferredHowl(log),
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
  log.instances[0].durationValue = 10;
  log.instances[0].seekValue = 1;
  scheduled[0].fn();

  assert.equal(scheduled[1].delay, 7000);
});

test("crossfade music reschedules the handoff when playback rate changes", () => {
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
  log.instances[0].seekValue = 2;
  looper.setRate(2);

  assert.equal(scheduled[scheduled.length - 1].delay, 2000);
});

test("crossfade music can start quietly and fade up to run volume", () => {
  const { CrossfadeMusic } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };
  const looper = new CrossfadeMusic({
    HowlClass: makeFakeHowl(log),
    src: ["song.wav"],
    volume: 0.6,
    fadeSeconds: 2,
    setTimer() {},
    clearTimer() {},
  });

  looper.play(0.14);

  assert.deepEqual(log.calls.slice(0, 2), [["volume", 0.14], ["play", 0.14]]);

  looper.fadeTo(0.6, 1.25);

  assert.deepEqual(log.calls.slice(-1)[0], ["fade", 0.14, 0.6, 1250]);
  assert.equal(looper.volume, 0.6);
});

test("crossfade music retries playback after browser audio unlocks", () => {
  const { CrossfadeMusic } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };
  class UnlockHowl extends makeFakeHowl(log) {
    constructor(options) {
      super(options);
      this.unlockHandlers = [];
    }

    once(event, handler) {
      log.calls.push(["once", event]);
      this.unlockHandlers.push(handler);
    }
  }
  const looper = new CrossfadeMusic({
    HowlClass: UnlockHowl,
    src: ["song.wav"],
    volume: 0.6,
    fadeSeconds: 2,
    setTimer() {},
    clearTimer() {},
  });

  looper.play(0.22);
  log.instances[0].options.onplayerror.call(log.instances[0]);
  log.instances[0].unlockHandlers[0]();

  assert.deepEqual(log.calls.slice(-2), [["once", "unlock"], ["play", 0.22]]);
});

test("crossfade music can shift playback rate quickly for key changes", () => {
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

  looper.shiftRate(0.88, 0.4);

  assert.equal(scheduled[0].delay, 50);

  for (let i = 0; i < scheduled.length; i += 1) {
    scheduled[i].fn();
  }

  const rateCalls = log.calls.filter((call) => call[0] === "rate");
  assert.equal(rateCalls.length, 16);
  assert.equal(rateCalls[rateCalls.length - 1][1], 0.88);
  assert.equal(looper.rate, 0.88);
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

test("orb SFX helper maps collect and miss cues to distinct assets", () => {
  const { createOrbSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const orb = createOrbSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 2);
  assert.deepEqual(orb.collect.options.src, ["./src/sounds/orb-collect.wav"]);
  assert.deepEqual(orb.miss.options.src, ["./src/sounds/orb-miss.wav"]);
  assert.equal(orb.collect.options.volume > orb.miss.options.volume, true);
  assert.equal(orb.miss.options.volume >= 0.28, true);

  orb.mute(true);

  assert.deepEqual(log.calls.slice(-2), [["mute", true], ["mute", true]]);
});

test("intro SFX helper maps the title sequence to distinct assets", () => {
  const { createIntroSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const intro = createIntroSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 3);
  assert.deepEqual(intro.zoom.options.src, ["./src/sounds/intro-zoom.wav"]);
  assert.deepEqual(intro.wipe.options.src, ["./src/sounds/intro-wipe.wav"]);
  assert.deepEqual(intro.star.options.src, ["./src/sounds/intro-star.wav"]);
  assert.equal(intro.zoom.options.volume < intro.star.options.volume, true);
  assert.equal(intro.wipe.options.volume < intro.star.options.volume, true);

  intro.mute(true);

  assert.deepEqual(log.calls.slice(-3), [
    ["mute", true],
    ["mute", true],
    ["mute", true],
  ]);
});

test("UI SFX helper maps hover cues to a subtle space asset", () => {
  const { createUiSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const ui = createUiSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 1);
  assert.deepEqual(ui.hover.options.src, ["./src/sounds/ui-hover.wav"]);
  assert.equal(ui.hover.options.volume < 0.2, true);

  ui.mute(true);

  assert.deepEqual(log.calls.slice(-1), [["mute", true]]);
});

test("combo SFX helper maps multiplier milestones to an exciting cue", () => {
  const { createComboSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const combo = createComboSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 1);
  assert.deepEqual(combo.milestone.options.src, ["./src/sounds/combo-milestone.wav"]);
  assert.equal(combo.milestone.options.volume >= 0.3, true);

  combo.mute(true);

  assert.deepEqual(log.calls.slice(-1), [["mute", true]]);
});

test("launch SFX helper reuses one countdown pulse and a distinct start cue", () => {
  const { createLaunchSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const launch = createLaunchSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 2);
  assert.deepEqual(launch.countdown.options.src, ["./src/sounds/countdown-pulse.wav"]);
  assert.deepEqual(launch.start.options.src, ["./src/sounds/launch-start.wav"]);
  assert.equal(launch.countdown.options.volume, 0.38);
  assert.equal(launch.start.options.volume, 0.5);

  launch.mute(true);

  assert.deepEqual(log.calls.slice(-2), [["mute", true], ["mute", true]]);
});

test("death SFX helper preloads the full Gravity Rift cue", () => {
  const { createDeathSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const death = createDeathSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 1);
  assert.deepEqual(death.options.src, ["./src/sounds/gravity-rift-death.wav"]);
  assert.equal(death.options.volume >= 0.4, true);
  assert.equal(death.options.volume < 0.55, true);
});

test("high score SFX helper maps personal and all-time records to distinct cues", () => {
  const { createHighScoreSfx } = loadSourceModule("src/audio.js");
  const log = { calls: [], instances: [] };

  const highScore = createHighScoreSfx({ HowlClass: makeFakeHowl(log) });

  assert.equal(log.instances.length, 2);
  assert.deepEqual(highScore.fanfare.options.src, ["./src/sounds/high-score-fanfare.wav"]);
  assert.deepEqual(highScore.allTimeFanfare.options.src, ["./src/sounds/all-time-record-fanfare.wav"]);
  assert.equal(highScore.fanfare.options.volume >= 0.36, true);
  assert.equal(highScore.allTimeFanfare.options.volume > highScore.fanfare.options.volume, true);

  highScore.mute(true);

  assert.deepEqual(log.calls.slice(-2), [["mute", true], ["mute", true]]);
});

test("orb SFX assets are short and tonally distinct", () => {
  const collect = readWavStats("src/sounds/orb-collect.wav");
  const miss = readWavStats("src/sounds/orb-miss.wav");

  assert.ok(collect.duration <= 0.34, "collect cue should be quick");
  assert.ok(miss.duration <= 0.32, "miss cue should be quick");
  assert.ok(collect.body.zeroCrossHz > 900, "collect should read as an upbeat chime");
  assert.ok(collect.body.zeroCrossHz > miss.body.zeroCrossHz, "collect should read brighter than miss");
  assert.ok(collect.tail.rms < collect.body.rms * 0.5, "collect should fade cleanly");
  assert.ok(miss.tail.rms < miss.body.rms * 0.5, "miss should fade cleanly");
});

test("intro SFX assets are quick and staged from rush to sparkle", () => {
  const zoom = readWavStats("src/sounds/intro-zoom.wav");
  const wipe = readWavStats("src/sounds/intro-wipe.wav");
  const star = readWavStats("src/sounds/intro-star.wav");

  assert.ok(zoom.duration <= 1.1, "zoom cue should finish with the title rush");
  assert.ok(wipe.duration <= 0.9, "wipe cue should stay tied to the shine");
  assert.ok(star.duration <= 0.55, "star cue should be a short sparkle");
  assert.ok(zoom.body.zeroCrossHz < wipe.body.zeroCrossHz, "zoom should read deeper than the wipe");
  assert.ok(star.body.zeroCrossHz > wipe.body.zeroCrossHz, "star should read brightest");
  assert.ok(star.tail.rms < star.body.rms * 0.5, "star should fade cleanly");
});

test("UI hover SFX asset is short, soft, and spacey", () => {
  const hover = readWavStats("src/sounds/ui-hover.wav");

  assert.ok(hover.duration <= 0.22, "hover cue should stay subtle");
  assert.ok(hover.onset.peak < 0.7, "hover cue should avoid grabbing attention");
  assert.ok(hover.onset.zeroCrossHz > 500, "hover cue should have a light synth shimmer");
  assert.ok(hover.tail.rms < hover.onset.rms * 0.55, "hover cue should taper cleanly");
});

test("combo milestone SFX asset is bright, upbeat, and clean", () => {
  const combo = readWavStats("src/sounds/combo-milestone.wav");

  assert.ok(combo.duration <= 0.75, "combo cue should not cover gameplay");
  assert.ok(combo.body.zeroCrossHz > 850, "combo cue should read as a bright reward");
  assert.ok(combo.onset.peak < 0.95, "combo cue should avoid clipping");
  assert.ok(combo.tail.rms < combo.body.rms * 0.45, "combo cue should taper cleanly");
});

test("launch SFX assets rise from a compact pulse into a clean start chord", () => {
  const countdown = readWavStats("src/sounds/countdown-pulse.wav");
  const start = readWavStats("src/sounds/launch-start.wav");

  assert.ok(countdown.duration <= 0.3, "countdown pulse should stay tightly synced to each number");
  assert.ok(start.duration <= 0.85, "start cue should clear quickly for gameplay audio");
  assert.ok(start.body.zeroCrossHz > countdown.body.zeroCrossHz, "start cue should open brighter than the pulse");
  assert.ok(countdown.tail.rms < countdown.body.rms * 0.42, "countdown pulse should fade cleanly");
  assert.ok(start.tail.rms < start.body.rms * 0.42, "start cue should fade cleanly");
  assert.ok(start.body.peak < 0.95, "start cue should avoid clipping");
});

test("Gravity Rift death SFX follows the complete animation without clipping", () => {
  const death = readWavStats("src/sounds/gravity-rift-death.wav");

  assert.ok(Math.abs(death.duration - 1.26) < 0.015, "death cue should match the 1.26 second animation");
  assert.ok(death.pull.zeroCrossHz < death.body.zeroCrossHz, "rift pull should descend below the opening wobble");
  assert.ok(death.implode.peak > death.pull.peak, "implosion should land as the strongest transient");
  assert.ok(death.implode.peak < 0.95, "implosion should avoid clipping");
  assert.ok(death.tail.rms < death.implode.rms * 0.3, "death cue should end cleanly with the animation");
});

test("high score fanfare SFX asset is celebratory and compact", () => {
  const fanfare = readWavStats("src/sounds/high-score-fanfare.wav");

  assert.ok(fanfare.duration <= 1.35, "fanfare should be short enough for retry flow");
  assert.ok(fanfare.body.zeroCrossHz > 600, "fanfare should feel lifted");
  assert.ok(fanfare.body.peak < 0.95, "fanfare should avoid clipping");
  assert.ok(fanfare.tail.rms < fanfare.body.rms * 0.5, "fanfare should fade cleanly");
});

test("all-time record fanfare is larger than the personal fanfare without clipping", () => {
  const personal = readWavStats("src/sounds/high-score-fanfare.wav");
  const allTime = readWavStats("src/sounds/all-time-record-fanfare.wav");

  assert.ok(allTime.duration > personal.duration, "all-time fanfare should have a larger phrase");
  assert.ok(allTime.duration <= 2, "all-time fanfare should not stall retry flow");
  assert.ok(allTime.body.zeroCrossHz > 700, "all-time fanfare should feel bright and triumphant");
  assert.ok(allTime.body.peak < 0.95, "all-time fanfare should avoid clipping");
  assert.ok(allTime.tail.rms < allTime.body.rms * 0.45, "all-time fanfare should fade cleanly");
});

test("jump SFX asset has a deeper body and a gentle tail", () => {
  const stats = readWavStats("src/sounds/neon-jump.wav");

  assert.ok(stats.duration <= 0.42, "jump should stay snappy");
  assert.ok(stats.body.zeroCrossHz < 900, "body should read as low and weighty");
  assert.ok(stats.body.peak < 0.94, "body should avoid harsh clipping");
  assert.ok(stats.tail.rms < stats.body.rms * 0.35, "tail should fade below the body");
  assert.ok(stats.tail.zeroCrossHz < 900, "tail should not end with a high screech");
});
