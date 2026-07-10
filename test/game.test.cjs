const assert = require("assert");
const fs = require("fs");
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
  const target = {
    travelGap: Math.abs(GAME_CONFIG.platform.startZ) * 1.18,
    group: { position: { z: 0 } },
  };
  const game = {
    speed: GAME_CONFIG.run.baseSpeed,
    targetPlatformGap: target.travelGap,
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
      syncRunSpeed(speed, platformGap) {
        calls.push(["syncRunSpeed", speed, platformGap]);
      },
      update(delta, movement, canMove, bouncePhase) {
        calls.push(["playerUpdate", delta, movement, canMove, bouncePhase]);
      },
    },
    platformManager: {
      update(delta, speed, pulse) {
        calls.push(["platformUpdate", delta, speed, pulse]);
        target.group.position.z = -target.travelGap / 2;
      },
      current() {
        return target;
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.updatePlaying.call(game, 0.25);

  const platformCall = calls.find((call) => call[0] === "platformUpdate");
  const playerCall = calls.find((call) => call[0] === "playerUpdate");
  const syncCall = calls.find((call) => call[0] === "syncRunSpeed");
  assert.deepEqual(syncCall, ["syncRunSpeed", GAME_CONFIG.run.baseSpeed, game.targetPlatformGap]);
  assert.equal(Boolean(platformCall), true);
  assert.equal(calls.indexOf(platformCall) < calls.indexOf(playerCall), true);
  assert.equal(playerCall[4], 0.5);
  assert.equal(platformCall[2], GAME_CONFIG.run.baseSpeed);
  assert.equal(platformCall[3].intensity >= 0, true);
  assert.equal(platformCall[3].intensity <= 1, true);
  assert.equal(platformCall[3].tempo > 1.25, true);
  assert.equal(game.musicPulsePhase > 0, true);
});

test("game hands frame overshoot directly to the next platform bounce", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const { GAME_CONFIG } = loadSourceModule("src/config.js");
  const calls = [];
  const first = {
    travelGap: 8,
    group: { position: { z: -0.1 } },
  };
  const next = {
    travelGap: 10,
    group: { position: { z: -9.8 } },
  };
  let target = first;
  const game = {
    speed: GAME_CONFIG.run.baseSpeed,
    targetPlatformGap: first.travelGap,
    musicPulsePhase: 0,
    bgm: { rate: 1 },
    input: { consumeMovement() { return 0; } },
    player: {
      landedThisFrame: false,
      syncRunSpeed() {},
      update(delta, movement, running, phase) {
        this.landedThisFrame = phase >= 1;
      },
      syncBouncePhase(phase) {
        calls.push(["handoff", phase]);
      },
    },
    platformManager: {
      update() {
        first.group.position.z = 0.2;
      },
      current() {
        return target;
      },
    },
    resolveLanding() {
      calls.push(["landing"]);
      target = next;
      this.targetPlatformGap = next.travelGap;
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.updatePlaying.call(game, 1 / 60);

  assert.deepEqual(calls[0], ["landing"]);
  assert.equal(Math.abs(calls[1][1] - 0.02) < 1e-9, true);
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
    deathSFX: { mute(isMuted) { calls.push(["deathMute", isMuted]); } },
  };

  Game.prototype.playUiHoverSfx.call(game);
  Game.prototype.toggleSound.call(game);

  assert.deepEqual(calls, [
    ["hover"],
    ["musicMute", true],
    ["jumpMute", true],
    ["deathMute", true],
    ["orbMute", true],
    ["introMute", true],
    ["uiMute", true],
    ["comboMute", true],
    ["highScoreMute", true],
    ["hudMute", true],
  ]);
});

test("game plays the Gravity Rift cue once when death begins", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const { UI_STATES } = loadSourceModule("src/config.js");
  const calls = [];
  const game = {
    state: UI_STATES.playing,
    input: { stop() { calls.push(["inputStop"]); } },
    player: { beginDeath() { calls.push(["beginDeath"]); } },
    deathSFX: { play() { calls.push(["deathCue"]); } },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.triggerDeath.call(game);
  Game.prototype.triggerDeath.call(game);

  assert.equal(game.state, "dying");
  assert.deepEqual(calls, [["inputStop"], ["beginDeath"], ["deathCue"]]);
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
    launchSFX: {
      countdown: {
        rate(value) {
          calls.push(["countdownRate", value]);
        },
        play() {
          calls.push(["countdownSound"]);
        },
      },
      start: {
        play() {
          calls.push(["startSound"]);
        },
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
  assert.deepEqual(calls.filter((call) => call[0] === "countdownRate"), [
    ["countdownRate", 0.9],
    ["countdownRate", 1],
    ["countdownRate", 1.12],
  ]);
  assert.equal(calls.filter((call) => call[0] === "countdownSound").length, 3);
  assert.deepEqual(calls.filter((call) => call[0] === "startSound"), [["startSound"]]);
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

  assert.equal(game.highScore, 14);
  assert.deepEqual(calls.filter((call) => call[0] === "store"), [["store", "hyperbouncescore", "14"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "shiftRate"), [["shiftRate", 1.12, 0.45]]);
  assert.deepEqual(calls.filter((call) => call[0] === "fanfare"), [["fanfare"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "showGameOver"), [["showGameOver", 14, 14, true]]);
});

test("game only awards all-time records against a loaded online leaderboard", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const game = {
    overallHighScore: 10,
    leaderboardClient: {
      isEnabled() {
        return true;
      },
      qualifies() {
        return false;
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);

  assert.equal(game.isAllTimeRecord(11), true);
  assert.equal(game.isAllTimeRecord(10), false);

  game.leaderboardClient.isEnabled = () => false;
  assert.equal(game.isAllTimeRecord(99), false);

  game.leaderboardClient.isEnabled = () => true;
  game.overallHighScore = 0;
  assert.equal(game.isAllTimeRecord(1), false);
});

test("game uses the exclusive all-time fanfare when the online record falls", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    score: 55,
    highScore: 10,
    overallHighScore: 50,
    localStorageName: "hyperbouncescore",
    musicHighScoreRate: 1.12,
    musicShiftSeconds: 0.45,
    storage: { setItem() {} },
    leaderboardClient: {
      isEnabled() {
        return true;
      },
      qualifies() {
        return true;
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
          calls.push(["personalFanfare"]);
        },
      },
      allTimeFanfare: {
        play() {
          calls.push(["allTimeFanfare"]);
        },
      },
    },
    recordCelebration: {
      start() {
        calls.push(["recordCelebrationStart"]);
      },
      stop() {
        calls.push(["recordCelebrationStop"]);
      },
    },
    hud: {
      showGameOver(args) {
        calls.push(["showGameOver", args.isNewHighScore, args.isAllTimeHighScore]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.end.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "allTimeFanfare"), [["allTimeFanfare"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "personalFanfare"), []);
  assert.deepEqual(calls.filter((call) => call[0] === "recordCelebrationStart"), [["recordCelebrationStart"]]);
  assert.deepEqual(calls.filter((call) => call[0] === "recordCelebrationStop"), []);
  assert.deepEqual(calls.filter((call) => call[0] === "showGameOver"), [["showGameOver", true, true]]);
});

test("game prompts for a leaderboard name when the score qualifies", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    score: 14,
    highScore: 10,
    overallHighScore: 12,
    leaderboardEntries: [{ name: "Ada", score: 12 }],
    localStorageName: "hyperbouncescore",
    musicHighScoreRate: 1.12,
    musicShiftSeconds: 0.45,
    storage: { setItem() {} },
    leaderboardClient: {
      isEnabled() {
        return true;
      },
      qualifies(score, entries) {
        calls.push(["qualifies", score, entries.length]);
        return true;
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
        calls.push(["showGameOver", args.score, args.highScore, args.overallHighScore, args.qualifiesForLeaderboard]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  Game.prototype.end.call(game);

  assert.deepEqual(calls.filter((call) => call[0] === "qualifies"), [["qualifies", 14, 1]]);
  assert.deepEqual(calls.filter((call) => call[0] === "showGameOver"), [["showGameOver", 14, 14, 12, true]]);
});

test("game submits leaderboard names and refreshes overall best", async () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    score: 33,
    leaderboardEntries: [],
    overallHighScore: 10,
    hud: {
      readLeaderboardName() {
        return "Ray";
      },
      setLeaderboardSubmitState(state) {
        calls.push(["state", state.status, state.message]);
      },
      setLeaderboard(payload) {
        calls.push(["leaderboard", payload.overallHighScore, payload.entries.length]);
      },
      showLeaderboardPrompt(isVisible) {
        calls.push(["prompt", isVisible]);
      },
    },
    authClient: {
      getAccessToken() {
        return "token-123";
      },
    },
    leaderboardClient: {
      isEnabled() {
        return true;
      },
      async submit(payload) {
        calls.push(["submit", payload.name, payload.score]);
        return {
          accepted: true,
          rank: 1,
          overallHighScore: 33,
          entries: [{ name: "Ray", score: 33 }],
        };
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  await Game.prototype.submitLeaderboardScore.call(game, { preventDefault() {} });

  assert.deepEqual(calls, [
    ["state", "saving", "Saving score..."],
    ["submit", "Ray", 33],
    ["leaderboard", 33, 1],
    ["prompt", false],
    ["state", "success", "Leaderboard updated"],
  ]);
});

test("game asks players to sign in before saving leaderboard scores", async () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    score: 33,
    authClient: {
      getAccessToken() {
        return "";
      },
    },
    hud: {
      readLeaderboardName() {
        return "Ray";
      },
      setLeaderboardSubmitState(state) {
        calls.push(["state", state.status, state.message]);
      },
    },
    leaderboardClient: {
      isEnabled() {
        return true;
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  await Game.prototype.submitLeaderboardScore.call(game, { preventDefault() {} });

  assert.deepEqual(calls, [["state", "error", "Sign in first"]]);
});

test("game resolves personal and overall best scores from production state", () => {
  const {
    resolveInitialHighScore,
    resolveOverallHighScore,
  } = loadSourceModule("src/game.js");
  const storage = {
    getItem() {
      return "99";
    },
  };

  assert.equal(resolveInitialHighScore({ storage, key: "hyperbouncescore" }), 99);
  assert.equal(resolveOverallHighScore(42), 42);
  assert.equal(resolveOverallHighScore("invalid"), 0);
});

test("game hides the leaderboard when its production endpoint is unavailable", async () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    leaderboardEntries: [],
    overallHighScore: 0,
    leaderboardClient: {
      isEnabled() {
        return false;
      },
    },
    hud: {
      setLeaderboardAvailability(isAvailable) {
        calls.push(["availability", isAvailable]);
      },
      setLeaderboard(payload) {
        calls.push(["leaderboard", payload]);
      },
    },
  };

  Object.setPrototypeOf(game, Game.prototype);
  await Game.prototype.loadLeaderboard.call(game);

  assert.deepEqual(game.leaderboardEntries, []);
  assert.equal(game.overallHighScore, 0);
  assert.deepEqual(calls, [["availability", false]]);
});

test("game renderer options prefer the high-performance GPU path", () => {
  const { createBloomSettings, createRendererOptions, resolveRendererPixelRatio } = loadSourceModule("src/game.js");

  assert.deepEqual(createRendererOptions(), {
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  assert.equal(resolveRendererPixelRatio(1, 1280, 720), 1);
  assert.equal(resolveRendererPixelRatio(3, 1280, 720), 1.25);

  const largeDisplayRatio = resolveRendererPixelRatio(2, 2560, 1440);
  assert.equal(largeDisplayRatio < 0.7, true);
  assert.equal(2560 * 1440 * largeDisplayRatio * largeDisplayRatio <= 1600001, true);
  assert.equal(createBloomSettings().strength <= 1.35, true);
  assert.equal(createBloomSettings().threshold >= 0.35, true);
});

test("game applies one shared pixel ratio to renderer and composer logical dimensions", () => {
  const { default: Game, resolveRendererPixelRatio } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    windowObj: {
      innerWidth: 2560,
      innerHeight: 1440,
      devicePixelRatio: 2,
    },
    renderScale: 0.82,
    renderer: {
      setPixelRatio(value) {
        calls.push(["pixelRatio", value]);
      },
      setSize(width, height) {
        calls.push(["rendererSize", width, height]);
      },
    },
    composer: {
      setPixelRatio(value) {
        calls.push(["composerPixelRatio", value]);
      },
      setSize(width, height) {
        calls.push(["composerSize", width, height]);
      },
    },
  };

  Game.prototype.resizeRenderer.call(game, 2560, 1440);

  const pixelRatio = resolveRendererPixelRatio(2, 2560, 1440) * 0.82;
  assert.deepEqual(calls, [
    ["pixelRatio", pixelRatio],
    ["rendererSize", 2560, 1440],
    ["composerPixelRatio", pixelRatio],
    ["composerSize", 2560, 1440],
  ]);
});

test("game resize updates its camera and delegates render sizing", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    windowObj: { innerWidth: 1440, innerHeight: 900 },
    camera: {
      aspect: 0,
      updateProjectionMatrix() {
        calls.push(["projection"]);
      },
    },
    resizeRenderer(width, height) {
      calls.push(["resizeRenderer", width, height]);
    },
  };

  Game.prototype.onResize.call(game);

  assert.equal(game.camera.aspect, 1440 / 900);
  assert.deepEqual(calls, [
    ["projection"],
    ["resizeRenderer", 1440, 900],
  ]);
});

test("game applies adaptive quality changes only during active gameplay", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const calls = [];
  const game = {
    state: "start",
    document: { hidden: false },
    windowObj: { innerWidth: 1440, innerHeight: 900 },
    renderScale: 1,
    renderQuality: {
      update(delta, isActive) {
        calls.push(["sample", delta, isActive]);
        return isActive ? 0.82 : null;
      },
    },
    resizeRenderer(width, height) {
      calls.push(["resize", width, height]);
    },
  };

  Game.prototype.updateRenderQuality.call(game, 1 / 45);
  game.state = "playing";
  Game.prototype.updateRenderQuality.call(game, 1 / 45);

  assert.equal(game.renderScale, 0.82);
  assert.deepEqual(calls, [
    ["sample", 1 / 45, false],
    ["sample", 1 / 45, true],
    ["resize", 1440, 900],
  ]);
});

test("music pulse reuses one frame-state object", () => {
  const { default: Game } = loadSourceModule("src/game.js");
  const game = {
    bgm: { rate: 1 },
    musicNormalRate: 1,
    speed: 0.255,
    musicPulsePhase: 0,
  };

  const firstPulse = Game.prototype.resolveMusicPulse.call(game, 1 / 60);
  const secondPulse = Game.prototype.resolveMusicPulse.call(game, 1 / 60);

  assert.strictEqual(secondPulse, firstPulse);
});

test("release source contains no score-reset or forced-score switches", () => {
  const source = fs.readFileSync("src/game.js", "utf8");

  assert.doesNotMatch(source, /TEMP_TEST_/);
  assert.doesNotMatch(source, /resetBest/);
});
