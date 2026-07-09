const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function makeFakeHowl(log) {
  return class FakeHowl {
    constructor(options) {
      this.options = options;
      this.volumeValue = options.volume || 0;
      log.instances.push(this);
    }

    play() {
      log.calls.push(["play", this.volumeValue]);
    }

    fade(from, to, duration) {
      this.volumeValue = to;
      log.calls.push(["fade", from, to, duration]);
    }

    volume(value) {
      this.volumeValue = value;
      log.calls.push(["volume", value]);
    }

    mute(isMuted) {
      log.calls.push(["mute", isMuted]);
    }

    stop() {
      log.calls.push(["stop"]);
    }

    duration() {
      return 10;
    }
  };
}

function withBrowserTimers(fn) {
  const previousWindow = global.window;

  global.window = {
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
  };

  try {
    return fn();
  } finally {
    global.window = previousWindow;
  }
}

function makePlatform({
  type = "multiplier",
  pickupVisible = true,
  pickupX = 0,
} = {}) {
  return {
    type,
    radius: 2,
    pickup: { visible: pickupVisible },
    group: { position: { x: 0, z: 0 } },
    getPickupWorldX() {
      return pickupX;
    },
    resolveLanding(args) {
      this.lastLanding = args;
    },
  };
}

function makeGame(Game, platform) {
  const calls = [];
  const game = {
    score: 0,
    highScore: 10,
    multiplier: 1,
    speed: 0.255,
    player: { position: { x: 0 } },
    platformManager: {
      current() {
        return platform;
      },
      spawnNext(score) {
        calls.push(["spawnNext", score]);
      },
    },
    bounceSFX: {
      play() {
        calls.push(["jump"]);
      },
    },
    orbSFX: {
      collect: {
        play() {
          calls.push(["orb", "collect"]);
        },
      },
      miss: {
        play() {
          calls.push(["orb", "miss"]);
        },
      },
    },
    hud: {
      updateRun(args) {
        calls.push(["hud", args.score, args.multiplier]);
      },
      showMultiplierMilestone(args) {
        calls.push(["milestone", args.multiplier, args.side]);
      },
    },
    triggerDeath() {
      calls.push(["death"]);
    },
    comboSFX: {
      milestone: {
        play() {
          calls.push(["comboCue"]);
        },
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  return { game, calls };
}

test("game plays collect cue when the multiplier orb is collected", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const platform = makePlatform({ pickupX: 0 });
  const { game, calls } = makeGame(Game, platform);

  Game.prototype.resolveLanding.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "orb"), [["orb", "collect"]]);
  assert.equal(platform.lastLanding.hitPickup, true);
});

test("game plays miss cue when the multiplier orb is missed", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const platform = makePlatform({ pickupX: 8 });
  const { game, calls } = makeGame(Game, platform);

  Game.prototype.resolveLanding.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "orb"), [["orb", "miss"]]);
  assert.equal(platform.lastLanding.hitPickup, false);
});

test("game does not play orb cues on platforms without an available orb", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const platform = makePlatform({ type: "standard", pickupVisible: false });
  const { game, calls } = makeGame(Game, platform);

  Game.prototype.resolveLanding.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "orb"), []);
});

test("game shows x5 milestone on the opposite side of the player", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const platform = makePlatform({ pickupX: 2 });
  const { game, calls } = makeGame(Game, platform);
  game.multiplier = 4;
  game.player.position.x = 2;

  Game.prototype.resolveLanding.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "milestone"), [["milestone", 5, "left"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "comboCue"), [["comboCue"]]);
});

test("game shows x10 milestone on the right when the player is left", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const platform = makePlatform({ pickupX: -1.5 });
  const { game, calls } = makeGame(Game, platform);
  game.multiplier = 9;
  game.player.position.x = -1.5;

  Game.prototype.resolveLanding.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "milestone"), [["milestone", 10, "right"]]);
});

test("game does not play milestone cue for ordinary multiplier increases", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const platform = makePlatform({ pickupX: 0 });
  const { game, calls } = makeGame(Game, platform);
  game.multiplier = 2;

  Game.prototype.resolveLanding.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "milestone"), []);
  assert.deepEqual(calls.filter((call) => call[0] === "comboCue"), []);
});

test("game uses a gentler run speed ramp", () => {
  const { GAME_CONFIG } = loadSourceModule("src/config.js");

  assert.equal(GAME_CONFIG.run.speedGain < 0.0012, true);
  assert.equal(GAME_CONFIG.run.speedGain >= 0.0008, true);
});

test("game sends a music-tempo pulse to platforms during play", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const calls = [];
  const game = {
    speed: GAME_CONFIG.run.baseSpeed,
    musicPulsePhase: 0,
    bgm: { rate: 1.25 },
    input: {
      consumeMovement() {
        calls.push(["consumeMovement"]);
        return 0;
      },
    },
    player: {
      landedThisFrame: false,
      syncRunSpeed(speed) {
        calls.push(["syncRunSpeed", speed]);
      },
      update(delta, movement, canMove) {
        calls.push(["playerUpdate", delta, movement, canMove]);
      },
    },
    platformManager: {
      update(delta, speed, pulse) {
        calls.push(["platformUpdate", delta, speed, pulse]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.updatePlaying.call(game, 0.25);

  const platformCall = calls.find((call) => call[0] === "platformUpdate");
  assert.equal(Boolean(platformCall), true);
  assert.equal(platformCall[2], GAME_CONFIG.run.baseSpeed);
  assert.equal(platformCall[3].intensity >= 0, true);
  assert.equal(platformCall[3].intensity <= 1, true);
  assert.equal(platformCall[3].tempo > 1.25, true);
  assert.equal(game.musicPulsePhase > 0, true);
});

test("game music pulse has sharp readable beats", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const game = {
    speed: GAME_CONFIG.run.baseSpeed,
    musicPulsePhase: 0,
    bgm: { rate: 1 },
    musicNormalRate: 1,
  };

  Object.setPrototypeOf(game, Game.prototype);

  const beatPeak = Game.prototype.resolveMusicPulse.call(game, 0).intensity;
  game.musicPulsePhase = Math.PI;
  const offBeat = Game.prototype.resolveMusicPulse.call(game, 0).intensity;

  assert.equal(beatPeak >= 0.9, true);
  assert.equal(offBeat <= 0.18, true);
});

test("game starts music quietly during the menu", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const log = { calls: [], instances: [] };
  const game = { HowlClass: makeFakeHowl(log) };

  withBrowserTimers(() => Game.prototype.setupAudio.call(game));

  assert.equal(game.musicMenuVolume < game.musicRunVolume, true);
  assert.equal(game.musicMenuVolume >= 0.2, true);
  assert.deepEqual(log.calls.slice(0, 2), [
    ["volume", game.musicMenuVolume],
    ["play", game.musicMenuVolume],
  ]);
});

test("game plays and mutes the UI hover cue", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    uiSFX: {
      hover: {
        play() {
          calls.push(["hover"]);
        },
      },
      mute(isMuted) {
        calls.push(["uiMute", isMuted]);
      },
    },
    isMuted: false,
    bgm: { mute(isMuted) { calls.push(["musicMute", isMuted]); } },
    bounceSFX: { mute(isMuted) { calls.push(["jumpMute", isMuted]); } },
    orbSFX: { mute(isMuted) { calls.push(["orbMute", isMuted]); } },
    introSFX: { mute(isMuted) { calls.push(["introMute", isMuted]); } },
    hud: { setSoundMuted(isMuted) { calls.push(["hudMute", isMuted]); } },
    comboSFX: { mute(isMuted) { calls.push(["comboMute", isMuted]); } },
    highScoreSFX: { mute(isMuted) { calls.push(["highScoreMute", isMuted]); } },
  };

  Game.prototype.playUiHoverSfx.call(game);
  Game.prototype.toggleSound.call(game);

  assert.deepEqual(calls, [
    ["hover"],
    ["musicMute", true],
    ["jumpMute", true],
    ["orbMute", true],
    ["introMute", true],
    ["uiMute", true],
    ["comboMute", true],
    ["highScoreMute", true],
    ["hudMute", true],
  ]);
});

test("game schedules title intro cues and unlocks the menu after the reveal", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const scheduled = [];
  const calls = [];
  const game = {
    document: {
      defaultView: {
        setTimeout(fn, delay) {
          scheduled.push({ fn, delay });
          return scheduled.length;
        },
      },
    },
    introSFX: {
      zoom: { play() { calls.push("zoom"); } },
      wipe: { play() { calls.push("wipe"); } },
      star: { play() { calls.push("star"); } },
    },
    hud: {
      finishIntro() {
        calls.push("finishIntro");
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.scheduleIntroSequence.call(game);

  assert.deepEqual(scheduled.map((timer) => timer.delay), [1000, 2920, 3060, 4700]);

  scheduled.forEach(({ fn }) => fn());

  assert.deepEqual(calls, ["zoom", "wipe", "star", "finishIntro"]);
});

test("game fades menu music to run volume when a run starts", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    state: "start",
    hasPlayedLaunchSequence: true,
    score: 0,
    highScore: 12,
    multiplier: 1,
    musicRunVolume: 0.55,
    musicFadeSeconds: 1.35,
    musicNormalRate: 1,
    musicShiftSeconds: 0.45,
    canvas: {},
    resetRun() {
      calls.push(["reset"]);
    },
    platformManager: {
      releaseLaunchPad() {
        calls.push(["releaseLaunchPad"]);
      },
    },
    input: {
      start(canvas) {
        calls.push(["inputStart", canvas]);
      },
    },
    hud: {
      showPlaying(args) {
        calls.push(["showPlaying", args.score, args.highScore, args.multiplier]);
      },
    },
    bgm: {
      fadeTo(volume, seconds) {
        calls.push(["fadeTo", volume, seconds]);
      },
      shiftRate(rate, seconds) {
        calls.push(["shiftRate", rate, seconds]);
      },
      play() {
        calls.push(["play"]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.start.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "fadeTo"), [["fadeTo", 0.55, 1.35]]);
  assert.deepEqual(calls.filter((call) => call[0] === "shiftRate"), [["shiftRate", 1, 0.45]]);
  assert.equal(calls.some((call) => call[0] === "play"), false);
});

test("game can seed the initial menu scene with gameplay objects hidden", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    score: 7,
    highScore: 12,
    multiplier: 4,
    camera: {
      position: {
        set(x, y, z) {
          calls.push(["camera", x, y, z]);
        },
      },
    },
    player: {
      reset() {
        calls.push(["playerReset"]);
      },
      setVisible(isVisible) {
        calls.push(["playerVisible", isVisible]);
      },
    },
    platformManager: {
      reset() {
        calls.push(["platformReset"]);
      },
      setVisible(isVisible) {
        calls.push(["platformVisible", isVisible]);
      },
    },
    hud: {
      updateRun(args) {
        calls.push(["hud", args.score, args.highScore, args.multiplier]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.resetRun.call(game, { showGameplayObjects: false });

  assert.deepEqual(calls.filter((call) => call[0] === "playerVisible"), [["playerVisible", false]]);
  assert.deepEqual(calls.filter((call) => call[0] === "platformVisible"), [["platformVisible", false]]);
  assert.deepEqual(calls.filter((call) => call[0] === "hud"), [["hud", 0, 12, 1]]);
});

test("game first start launches the arrival sequence before enabling control", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    state: "start",
    hasPlayedLaunchSequence: false,
    score: 0,
    highScore: 12,
    multiplier: 1,
    musicRunVolume: 0.55,
    musicFadeSeconds: 1.35,
    musicNormalRate: 1,
    musicShiftSeconds: 0.45,
    canvas: {},
    resetRun() {
      calls.push(["reset"]);
    },
    platformManager: {
      startLaunchReveal() {
        calls.push(["startLaunchReveal"]);
      },
      releaseLaunchPad() {
        calls.push(["releaseLaunchPad"]);
      },
    },
    player: {
      beginTeleportArrival() {
        calls.push(["teleport"]);
      },
    },
    input: {
      start(canvas) {
        calls.push(["inputStart", canvas]);
      },
    },
    hud: {
      showLaunchSequence(args) {
        calls.push(["showLaunchSequence", args.countdown]);
      },
      showPlaying() {
        calls.push(["showPlaying"]);
      },
    },
    bgm: {
      fadeTo(volume, seconds) {
        calls.push(["fadeTo", volume, seconds]);
      },
      shiftRate(rate, seconds) {
        calls.push(["shiftRate", rate, seconds]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.start.call(game);

  assert.equal(game.state, "launching");
  assert.equal(game.hasPlayedLaunchSequence, true);
  assert.deepEqual(calls.filter((call) => call[0] === "reset"), [["reset"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "startLaunchReveal"), [["startLaunchReveal"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "teleport"), [["teleport"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "inputStart"), [["inputStart", game.canvas]]);
  assert.deepEqual(calls.filter((call) => call[0] === "releaseLaunchPad"), []);
  assert.deepEqual(calls.filter((call) => call[0] === "showPlaying"), []);
});

test("game countdown starts play after the launch arrival completes", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    state: "launching",
    launchElapsed: 0,
    launchIntroSeconds: 1,
    launchCountdownSeconds: 3,
    launchLastCountdown: null,
    score: 0,
    highScore: 12,
    multiplier: 1,
    canvas: {},
    platformManager: {
      updateLaunchReveal(delta) {
        calls.push(["updateReveal", delta]);
      },
      releaseLaunchPad() {
        calls.push(["releaseLaunchPad"]);
      },
    },
    player: {
      updateLaunchVisual(delta) {
        calls.push(["updatePlayerLaunch", delta]);
      },
    },
    input: {
      start(canvas) {
        calls.push(["inputStart", canvas]);
      },
      consumeMovement() {
        calls.push(["consumeMovement"]);
        return 0;
      },
      capturePointer() {
        calls.push(["capturePointer"]);
      },
    },
    hud: {
      updateLaunchCountdown(value) {
        calls.push(["countdown", value]);
      },
      hideLaunchCountdown() {
        calls.push(["hideCountdown"]);
      },
      showPlaying(args) {
        calls.push(["showPlaying", args.score, args.highScore, args.multiplier]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.updateLaunchSequence.call(game, 1);
  Game.prototype.updateLaunchSequence.call(game, 1);
  Game.prototype.updateLaunchSequence.call(game, 1);
  Game.prototype.updateLaunchSequence.call(game, 1);

  assert.deepEqual(calls.filter((call) => call[0] === "countdown"), [
    ["countdown", "3"],
    ["countdown", "2"],
    ["countdown", "1"],
  ]);
  assert.equal(game.state, "playing");
  assert.deepEqual(calls.filter((call) => call[0] === "releaseLaunchPad"), [["releaseLaunchPad"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "consumeMovement"), [["consumeMovement"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "capturePointer"), [["capturePointer"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "inputStart"), []);
  assert.deepEqual(calls.filter((call) => call[0] === "hideCountdown"), [["hideCountdown"]]);
});

test("game shifts music darker on game over", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    score: 8,
    highScore: 10,
    musicDarkRate: 0.88,
    musicShiftSeconds: 0.45,
    storage: {
      setItem() {
        calls.push(["store"]);
      },
    },
    bgm: {
      shiftRate(rate, seconds) {
        calls.push(["shiftRate", rate, seconds]);
      },
    },
    hud: {
      showGameOver(args) {
        calls.push(["showGameOver", args.score, args.highScore, args.isNewHighScore]);
      },
    },
  };

  Game.prototype.end.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "shiftRate"), [["shiftRate", 0.88, 0.45]]);
  assert.deepEqual(calls.filter((call) => call[0] === "showGameOver"), [["showGameOver", 8, 10, false]]);
});

test("game shifts music upward and plays fanfare on a new high score", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    score: 14,
    highScore: 10,
    localStorageName: "hyperbouncescore",
    musicHighScoreRate: 1.12,
    musicShiftSeconds: 0.45,
    storage: {
      setItem(key, value) {
        calls.push(["store", key, value]);
      },
    },
    bgm: {
      shiftRate(rate, seconds) {
        calls.push(["shiftRate", rate, seconds]);
      },
    },
    highScoreSFX: {
      fanfare: {
        play() {
          calls.push(["fanfare"]);
        },
      },
    },
    hud: {
      showGameOver(args) {
        calls.push(["showGameOver", args.score, args.highScore, args.isNewHighScore]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.end.call(game);

  assert.equal(game.highScore, 10);
  assert.deepEqual(calls.filter((call) => call[0] === "store"), []);
  assert.deepEqual(calls.filter((call) => call[0] === "shiftRate"), [["shiftRate", 1.12, 0.45]]);
  assert.deepEqual(calls.filter((call) => call[0] === "fanfare"), [["fanfare"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "showGameOver"), [["showGameOver", 14, 10, true]]);
});

test("game temporarily forces the best score to ten for high-score testing", () => {
  const { TEMP_TEST_HIGH_SCORE, resolveInitialHighScore } = loadSourceModule("src/game.js");
  const storage = {
    getItem() {
      return "99";
    },
  };

  assert.equal(TEMP_TEST_HIGH_SCORE, 10);
  assert.equal(resolveInitialHighScore({ storage, key: "hyperbouncescore" }), 10);
});

test("game renderer options prefer the high-performance GPU path", () => {
  const { createBloomSettings, createRendererOptions, resolveRendererPixelRatio } = loadSourceModule("src/game.js");

  assert.deepEqual(createRendererOptions(), {
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  assert.equal(resolveRendererPixelRatio(1), 1);
  assert.equal(resolveRendererPixelRatio(3), 1.6);
  assert.equal(createBloomSettings().strength <= 1.35, true);
  assert.equal(createBloomSettings().threshold >= 0.35, true);
});

test("game clears the saved best score when the resetBest flag is present", () => {
  const { resetSavedHighScoreIfRequested } = loadSourceModule("src/game.js");
  const calls = [];
  const storage = {
    removeItem(key) {
      calls.push(["remove", key]);
    },
  };
  const history = {
    replaceState(state, title, url) {
      calls.push(["replace", state, title, url]);
    },
  };
  const location = {
    href: "http://127.0.0.1:8765/?resetBest=1&focus=menu#intro",
  };

  const didReset = resetSavedHighScoreIfRequested({
    storage,
    location,
    history,
    key: "hyperbouncescore",
  });

  assert.equal(didReset, true);
  assert.deepEqual(calls, [
    ["remove", "hyperbouncescore"],
    ["replace", null, "", "/?focus=menu#intro"],
  ]);
});
