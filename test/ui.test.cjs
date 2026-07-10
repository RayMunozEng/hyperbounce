const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function makeClassList(initial = []) {
  const values = new Set(initial);

  return {
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function makeElement(initialClasses = []) {
  return {
    classList: makeClassList(initialClasses),
    children: [],
    className: "",
    disabled: false,
    value: "",
    textContent: "",
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    remove() {
      if (!this.parentNode) return;

      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

function makeDocument(ids) {
  const elements = ids.reduce((acc, id) => {
    acc[id] = makeElement(["hidden"]);
    return acc;
  }, {});
  const listeners = {};
  const timers = [];

  return {
    elements,
    listeners,
    timers,
    clearedTimers: [],
    defaultView: {
      setTimeout(fn, delay) {
        timers.push({ fn, delay });
        return timers.length;
      },
      clearTimeout(id) {
        this.clearedTimers = this.clearedTimers || [];
        this.clearedTimers.push(id);
      },
    },
    body: makeElement([]),
    exitPointerLockCalled: false,
    getElementById(id) {
      return this.elements[id];
    },
    createElement() {
      return makeElement([]);
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    removeEventListener(type, handler) {
      if (listeners[type] === handler) delete listeners[type];
    },
    exitPointerLock() {
      this.exitPointerLockCalled = true;
    },
  };
}

test("input controller accumulates movement and consumes it once", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  const input = new InputController(doc);

  input.start();
  doc.listeners.mousemove({ movementX: 7, preventDefault() {} });
  doc.listeners.mousemove({ movementX: -2, preventDefault() {} });

  assert.equal(input.consumeMovement(), 5);
  assert.equal(input.consumeMovement(), 0);
});

test("input controller enters and exits play control mode", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  const canvas = {
    locked: false,
    requestPointerLock() {
      this.locked = true;
    },
  };
  const input = new InputController(doc);

  input.start(canvas);

  assert.equal(canvas.locked, true);
  assert.equal(doc.body.classList.contains("is-playing"), true);
  assert.equal(Boolean(doc.listeners.mousemove), true);
  assert.equal(Boolean(doc.listeners.pointerdown), true);
  assert.equal(Boolean(doc.listeners.pointerlockchange), true);

  input.stop();

  assert.equal(doc.exitPointerLockCalled, true);
  assert.equal(doc.body.classList.contains("is-playing"), false);
  assert.equal(Boolean(doc.listeners.mousemove), false);
  assert.equal(Boolean(doc.listeners.pointerdown), false);
  assert.equal(Boolean(doc.listeners.pointerlockchange), false);
});

test("input controller recaptures pointer control during play", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  let lockCount = 0;
  const canvas = {
    requestPointerLock() {
      lockCount += 1;
      doc.pointerLockElement = canvas;
    },
  };
  const input = new InputController(doc);

  input.start(canvas);
  doc.pointerLockElement = null;

  assert.equal(Boolean(doc.listeners.pointerdown), true);
  doc.listeners.pointerdown({ button: 0, preventDefault() {} });

  assert.equal(lockCount, 2);
  assert.equal(doc.pointerLockElement, canvas);
});

test("input controller recaptures when pointer lock is lost during play", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  let lockCount = 0;
  const canvas = {
    requestPointerLock() {
      lockCount += 1;
      doc.pointerLockElement = canvas;
    },
  };
  const input = new InputController(doc);

  input.start(canvas);
  doc.pointerLockElement = null;

  assert.equal(Boolean(doc.listeners.pointerlockchange), true);
  doc.listeners.pointerlockchange();

  assert.equal(lockCount, 2);
  assert.equal(doc.pointerLockElement, canvas);
});

test("input controller falls back to the document body when canvas pointer lock is unavailable", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  const canvas = {};
  let lockTarget = null;

  doc.body.requestPointerLock = function requestPointerLock() {
    lockTarget = this;
    doc.pointerLockElement = this;
  };

  const input = new InputController(doc);

  input.start(canvas);

  assert.equal(lockTarget, doc.body);
  assert.equal(input.isPointerLocked(), true);
  assert.equal(input.pointerLockUnavailable, false);
});

test("input controller records when native pointer lock is unavailable", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  const input = new InputController(doc);

  input.start({});

  assert.equal(input.pointerLockUnavailable, true);
  assert.equal(input.pointerLockError.name, "PointerLockUnavailable");
  assert.equal(doc.body.classList.contains("is-playing"), true);
});

test("input controller lets Escape release mouse control until the next click", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  let lockCount = 0;
  let prevented = false;
  const canvas = {
    requestPointerLock() {
      lockCount += 1;
      doc.pointerLockElement = canvas;
    },
  };
  const input = new InputController(doc);

  input.start(canvas);

  assert.equal(lockCount, 1);
  assert.equal(Boolean(doc.listeners.keydown), true);
  assert.equal(doc.body.classList.contains("is-playing"), true);

  doc.listeners.keydown({
    key: "Escape",
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(doc.exitPointerLockCalled, true);
  assert.equal(doc.body.classList.contains("is-playing"), false);

  doc.pointerLockElement = null;
  doc.listeners.pointerlockchange();

  assert.equal(lockCount, 1);

  doc.listeners.pointerdown({ button: 0, preventDefault() {} });

  assert.equal(lockCount, 2);
  assert.equal(doc.pointerLockElement, canvas);
  assert.equal(doc.body.classList.contains("is-playing"), true);
});

test("input controller locks and unlocks pointer control", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  const canvas = {
    locked: false,
    requestPointerLock() {
      this.locked = true;
    },
  };
  const input = new InputController(doc);

  input.lock(canvas);
  input.unlock();

  assert.equal(canvas.locked, true);
  assert.equal(doc.exitPointerLockCalled, true);
});

test("input controller ignores pointer-lock failures", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  const input = new InputController(doc);

  assert.doesNotThrow(() => {
    input.lock({
      requestPointerLock() {
        throw new Error("pointer lock unavailable");
      },
    });
  });
});

test("input controller catches async pointer-lock rejection", () => {
  const { InputController } = loadSourceModule("src/input.js");
  const doc = makeDocument([]);
  const input = new InputController(doc);
  let catchCalled = false;

  input.lock({
    requestPointerLock() {
      return {
        catch(handler) {
          catchCalled = true;
          handler(new Error("pointer lock rejected"));
        },
      };
    },
  });

  assert.equal(catchCalled, true);
  assert.equal(input.pointerLockError.message, "pointer lock rejected");
});

test("HUD updates run stats and toggles screens", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "overall-highscore",
    "multiplier",
    "leaderboard-list",
    "leaderboard-empty",
    "leaderboard-form",
    "leaderboard-name",
    "leaderboard-submit",
    "leaderboard-message",
    "auth-panel",
    "auth-email",
    "auth-email-btn",
    "auth-google-btn",
    "auth-signout-btn",
    "auth-user",
    "auth-message",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  hud.showPlaying({ score: 12, highScore: 20, overallHighScore: 44, multiplier: 3 });

  assert.equal(doc.elements.score.textContent, "12");
  assert.equal(doc.elements.highscore.textContent, "20");
  assert.equal(doc.elements["overall-highscore"].textContent, "44");
  assert.equal(doc.elements.multiplier.textContent, "x3");
  assert.equal(doc.elements["start-panel"].classList.contains("hidden"), true);
  assert.equal(doc.elements["status-chip"].classList.contains("hidden"), false);

  hud.showGameOver({
    score: 15,
    highScore: 22,
    overallHighScore: 44,
    isNewHighScore: true,
    qualifiesForLeaderboard: true
  });

  assert.equal(doc.elements["game-over"].textContent, "NEW HIGH SCORE");
  assert.equal(doc.elements["game-over"].classList.contains("high-score-title"), true);
  assert.equal(doc.elements["retry-btn"].classList.contains("hidden"), false);
  assert.equal(doc.elements["leaderboard-form"].classList.contains("hidden"), false);
});

test("HUD renders top ten leaderboard entries", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "overall-highscore",
    "multiplier",
    "leaderboard-list",
    "leaderboard-empty",
    "leaderboard-form",
    "leaderboard-name",
    "leaderboard-submit",
    "leaderboard-message",
    "auth-panel",
    "auth-email",
    "auth-email-btn",
    "auth-google-btn",
    "auth-signout-btn",
    "auth-user",
    "auth-message",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  hud.setLeaderboard({
    entries: [
      { name: "Ray", score: 42 },
      { name: "Ada", score: 36 },
    ],
    overallHighScore: 42,
  });

  assert.equal(doc.elements["overall-highscore"].textContent, "42");
  assert.equal(doc.elements["leaderboard-list"].children.length, 2);
  assert.equal(doc.elements["leaderboard-empty"].classList.contains("hidden"), true);
  assert.equal(doc.elements["leaderboard-list"].children[0].children[1].textContent, "Ray");
  assert.equal(doc.elements["leaderboard-list"].children[0].className.includes("leaderboard-champion"), true);
  assert.equal(doc.elements["leaderboard-list"].children[1].className.includes("leaderboard-podium"), true);
});

test("HUD renders auth state and binds login controls", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "overall-highscore",
    "multiplier",
    "leaderboard-list",
    "leaderboard-empty",
    "leaderboard-form",
    "leaderboard-name",
    "leaderboard-submit",
    "leaderboard-message",
    "auth-panel",
    "auth-email",
    "auth-email-btn",
    "auth-google-btn",
    "auth-signout-btn",
    "auth-user",
    "auth-message",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const calls = [];
  const hud = new Hud(doc);

  hud.bindControls({
    signInGoogle() { calls.push("google"); },
    sendEmailLink() { calls.push("email"); },
    signOut() { calls.push("out"); },
  });
  hud.setAuthState({
    isConfigured: true,
    isSignedIn: true,
    email: "ray@example.com",
    message: "Signed in",
  });

  doc.elements["auth-google-btn"].listeners.click();
  doc.elements["auth-email-btn"].listeners.click();
  doc.elements["auth-signout-btn"].listeners.click();

  assert.deepEqual(calls, ["google", "email", "out"]);
  assert.equal(doc.elements["auth-user"].textContent, "ray@example.com");
  assert.equal(doc.elements["auth-signout-btn"].classList.contains("hidden"), false);
  assert.equal(doc.elements["auth-message"].textContent, "Signed in");
});

test("HUD hides online services until production configuration is available", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "leaderboard-panel",
    "leaderboard-list",
    "leaderboard-empty",
    "leaderboard-form",
    "leaderboard-name",
    "leaderboard-submit",
    "leaderboard-message",
    "overall-stat",
    "overall-highscore",
    "auth-panel",
    "auth-email",
    "auth-email-btn",
    "auth-google-btn",
    "auth-signout-btn",
    "auth-user",
    "auth-message",
  ]);
  const hud = new Hud(doc);

  hud.setLeaderboardAvailability(false);
  hud.setAuthState({ isConfigured: false });

  assert.equal(doc.elements["leaderboard-panel"].classList.contains("hidden"), true);
  assert.equal(doc.elements["overall-stat"].classList.contains("hidden"), true);
  assert.equal(doc.elements["auth-panel"].classList.contains("hidden"), true);

  hud.setLeaderboardAvailability(true);
  hud.setAuthState({ isConfigured: true });

  assert.equal(doc.elements["leaderboard-panel"].classList.contains("hidden"), false);
  assert.equal(doc.elements["overall-stat"].classList.contains("hidden"), false);
  assert.equal(doc.elements["auth-panel"].classList.contains("hidden"), false);
});

test("release markup starts optional online panels hidden without deployment placeholders", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /id="leaderboard-panel" class="leaderboard-panel hidden"/);
  assert.match(html, /id="auth-panel" class="auth-panel hidden"/);
  assert.match(html, /id="overall-stat" class="hud-stat hidden"[\s\S]*?<span class="hud-label">Overall<\/span>[\s\S]*?id="overall-highscore"/);
  assert.doesNotMatch(html, /id="overall-stat"[\s\S]*?<span class="hud-label">Score<\/span>/);
  assert.doesNotMatch(html, /connect(?:s)? after deployment/i);
});

test("HUD never reuses the intro panel reveal for game over", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  doc.elements["start-panel"].classList.add("intro-panel");
  const hud = new Hud(doc);

  hud.showGameOver({ score: 4, highScore: 10, isNewHighScore: false });

  assert.equal(doc.elements["start-panel"].classList.contains("intro-panel"), false);
  assert.equal(doc.elements["start-panel"].classList.contains("panel-ready"), true);
});

test("HUD binds a hover cue to every menu button", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const calls = [];
  const hud = new Hud(doc);

  hud.bindControls({
    hover() {
      calls.push("hover");
    },
  });

  doc.elements["start-btn"].listeners.mouseenter();
  doc.elements["retry-btn"].listeners.focus();
  doc.elements["sound-btn"].listeners.mouseenter();

  assert.deepEqual(calls, ["hover", "hover", "hover"]);
});

test("HUD clears the intro-only panel reveal state", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  doc.elements["start-panel"].classList.add("intro-panel");
  const hud = new Hud(doc);

  hud.finishIntro();

  assert.equal(doc.elements["start-panel"].classList.contains("intro-panel"), true);
  assert.equal(doc.elements["start-panel"].classList.contains("intro-handoff"), true);
  assert.equal(doc.elements["start-panel"].classList.contains("panel-ready"), true);

  const cleanup = doc.timers.find((timer) => timer.delay >= 2300 && timer.delay <= 2600);
  assert.equal(Boolean(cleanup), true);

  cleanup.fn();

  assert.equal(doc.elements["start-panel"].classList.contains("intro-panel"), false);
  assert.equal(doc.elements["start-panel"].classList.contains("intro-handoff"), false);
  assert.equal(doc.elements["start-panel"].classList.contains("panel-ready"), true);
}
);

test("HUD shows multiplier milestone callouts opposite the player", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  const leftCallout = hud.showMultiplierMilestone({ multiplier: 5, side: "left" });
  const rightCallout = hud.showMultiplierMilestone({ multiplier: 10, side: "right" });

  assert.equal(leftCallout.textContent, "x5");
  assert.equal(leftCallout.className.includes("combo-callout-left"), true);
  assert.equal(rightCallout.textContent, "x10");
  assert.equal(rightCallout.className.includes("combo-callout-right"), true);
  assert.equal(doc.elements["combo-callouts"].children.length, 2);

  leftCallout.listeners.animationend();

  assert.equal(doc.elements["combo-callouts"].children.length, 1);
});

test("HUD shows and clears the launch countdown without showing the start panel", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "launch-countdown",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  hud.showLaunchSequence({
    score: 0,
    highScore: 20,
    multiplier: 1,
    countdown: "3",
  });

  assert.equal(doc.elements["launch-countdown"].textContent, "3");
  assert.equal(doc.elements["launch-countdown"].classList.contains("hidden"), false);
  assert.equal(doc.elements["start-panel"].classList.contains("hidden"), true);
  assert.equal(doc.elements["status-chip"].classList.contains("hidden"), true);

  hud.updateLaunchCountdown("2");

  assert.equal(doc.elements["launch-countdown"].textContent, "2");

  hud.hideLaunchCountdown();

  assert.equal(doc.elements["launch-countdown"].classList.contains("hidden"), true);
});

test("launch countdown has a contrast shield over bright platform glows", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");
  const countdownRule = css.match(/\.launch-countdown\s*\{[\s\S]*?\n\}/)[0];
  const countdownBeforeRule = css.match(/\.launch-countdown::before\s*\{[\s\S]*?\n\}/)[0];
  const countdownAfterRule = css.match(/\.launch-countdown::after\s*\{[\s\S]*?\n\}/)[0];

  assert.match(countdownRule, /-webkit-text-stroke:\s*2px rgba\(2,\s*6,\s*18,\s*0\.72\)/);
  assert.match(countdownRule, /text-stroke:\s*2px rgba\(2,\s*6,\s*18,\s*0\.72\)/);
  assert.match(countdownBeforeRule, /radial-gradient\(circle/);
  assert.match(countdownBeforeRule, /rgba\(2,\s*6,\s*18,\s*0\.76\)/);
  assert.match(countdownBeforeRule, /z-index:\s*-1/);
  assert.match(countdownAfterRule, /border:\s*1px solid rgba\(218,\s*248,\s*255,\s*0\.42\)/);
});

test("HUD schedules fallback cleanup for transient effects", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  const callout = hud.showMultiplierMilestone({ multiplier: 5, side: "left" });
  const fireworks = hud.showHighScoreCelebration();

  assert.equal(doc.timers.some((timer) => timer.delay >= 2400), true);
  assert.equal(doc.timers.some((timer) => timer.delay >= 1800 && timer.delay < 2400), true);

  doc.timers[0].fn();

  assert.equal(doc.elements["combo-callouts"].children.includes(callout), false);

  fireworks[0].listeners.animationend();

  assert.equal(doc.elements["combo-callouts"].children.includes(fireworks[0]), false);
});

test("HUD celebrates new high scores with golden copy and neon fireworks", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  hud.showGameOver({ score: 24, highScore: 24, isNewHighScore: true });

  const fireworks = doc.elements["combo-callouts"].children.filter((child) => {
    return child.className.includes("neon-firework");
  });

  assert.equal(doc.elements["game-over"].classList.contains("high-score-title"), true);
  assert.equal(fireworks.length >= 4, true);
  assert.equal(fireworks.every((firework) => firework.listeners.animationend), true);
});

test("HUD keeps all-time record DOM effects limited to the trophy", () => {
  const { Hud } = loadSourceModule("src/hud.js");
  const doc = makeDocument([
    "app-shell",
    "start-panel",
    "start-btn",
    "retry-btn",
    "sound-btn",
    "score",
    "highscore",
    "multiplier",
    "combo-callouts",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  hud.showGameOver({
    score: 60,
    highScore: 60,
    overallHighScore: 50,
    isNewHighScore: true,
    isAllTimeHighScore: true,
  });

  const effects = doc.elements["combo-callouts"].children;
  const fireworks = effects.filter((child) => child.className.includes("neon-firework"));
  const trophies = effects.filter((child) => child.className.includes("record-trophy-stage"));
  const shockwaves = effects.filter((child) => child.className.includes("record-shockwave"));

  assert.equal(doc.elements["game-over"].textContent, "ALL-TIME RECORD");
  assert.equal(doc.elements["game-over"].classList.contains("all-time-score-title"), true);
  assert.equal(fireworks.length, 0);
  assert.equal(trophies.length, 1);
  assert.equal(trophies[0].children.some((child) => child.className === "record-trophy"), true);
  assert.equal(shockwaves.length, 0);

  hud.clearCelebration();

  assert.equal(doc.elements["combo-callouts"].children.length, 0);
  assert.equal(doc.elements["game-over"].classList.contains("all-time-score-title"), false);
});

test("combo HUD stat has a dedicated contrast treatment", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");
  const accentRule = css.match(/\.hud-stat\.accent\s*\{[^}]+\}/);

  assert.equal(Boolean(accentRule), true);
  assert.match(accentRule[0], /border:/);
  assert.match(accentRule[0], /background:/);
  assert.match(accentRule[0], /box-shadow:/);
});

test("profile links use the current GitHub account and omit AngelList", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(html, /https:\/\/github\.com\/RayMunozEng/);
  assert.doesNotMatch(html, /AngelList/);
  assert.doesNotMatch(html, /angel\.co/);
});

test("Google sign-in uses a local branded icon without changing its accessible name", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");
  const iconPath = path.join(__dirname, "..", "src", "images", "google-g.svg");

  assert.match(html, /id="auth-google-btn"[\s\S]*src="src\/images\/google-g\.svg"/);
  assert.match(html, /<span>Continue with Google<\/span>/);
  assert.match(css, /\.google-provider-icon\s*\{/);
  assert.equal(fs.existsSync(iconPath), true);
});

test("start copy omits the old Neon Skill-Runner subtitle", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.doesNotMatch(html, /Neon Skill-Runner/);
  assert.doesNotMatch(html, /class="tagline"/);
});

test("start logo has a streaked zoom and shine entrance", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");
  const titleRule = css.match(/(?:^|\n)#title\s*\{[\s\S]*?\n\}/)[0];
  const titleDepthRule = css.match(/\.title-depth\s*\{[\s\S]*?\n\}/)[0];
  const titleBeforeRule = css.match(/#title::before\s*\{[\s\S]*?\n\}/)[0];
  const introTitleRule = css.match(/\.start-panel\.intro-panel #title\s*\{[\s\S]*?\n\}/)[0];
  const panelOrbitRule = css.match(/\.panel-orbit\s*\{[\s\S]*?\n\}/)[0];
  const panelOrbitReadyRule = css.match(/\.start-panel\.panel-ready \.panel-orbit::after\s*\{[\s\S]*?\n\}/)[0];
  const panelOrbitIntroRule = css.match(/\.start-panel\.intro-panel \.panel-orbit::before\s*\{[\s\S]*?\n\}/)[0];
  const panelOrbitHandoffRule = css.match(/\.start-panel\.panel-ready \.panel-orbit::before\s*\{[\s\S]*?\n\}/)[0];
  const panelOrbitKeyframes = css.match(/@keyframes panelBorderOrbit\s*\{[\s\S]*?\n\}/)[0];
  const startPanelReadyRule = css.match(/\.start-panel\.panel-ready::before\s*\{[\s\S]*?\n\}/)[0];
  const startPanelIntroRule = css.match(/\.start-panel\.intro-panel\s*\{[\s\S]*?\n\}/)[0];
  const startPanelHandoffRule = css.match(/\.start-panel\.intro-panel\.panel-ready\s*\{[\s\S]*?\n\}/)[0];
  const startPanelHandoffChromeRule = css.match(/\.start-panel\.intro-panel\.panel-ready::before\s*\{[\s\S]*?\n\}/)[0];

  assert.match(html, /<section id="start-panel" class="start-panel intro-panel">/);
  assert.match(html, /<span class="panel-orbit" aria-hidden="true"><\/span>/);
  assert.match(html, /<span class="title-depth" aria-hidden="true"><\/span>/);
  assert.match(html, /<span class="title-text">HYPERBOUNCE<\/span>/);
  assert.match(html, /<span class="title-star" aria-hidden="true"><\/span>/);
  assert.match(css, /#title::before/);
  assert.match(css, /#title::after/);
  assert.match(css, /\.title-depth/);
  assert.match(css, /@keyframes logoZoomIn/);
  assert.match(css, /@keyframes titleTextExtrude/);
  assert.match(css, /@keyframes titleDepthRush/);
  assert.match(css, /@keyframes logoShine/);
  assert.match(css, /@keyframes titleStarGlitter/);
  assert.match(css, /@keyframes titleIdlePulse/);
  assert.match(css, /@keyframes panelBorderDraw/);
  assert.match(css, /@keyframes panelBorderOrbit/);
  assert.match(css, /@keyframes panelBorderOrbitEaseIn/);
  assert.match(css, /@keyframes panelBorderHandoffFade/);
  assert.match(css, /@keyframes panelBorderReadyGlow/);
  assert.match(css, /@keyframes panelChromeHandoff/);
  assert.match(css, /@keyframes panelChromeGlow/);
  assert.match(css, /@keyframes panelCopyReveal/);
  assert.match(panelOrbitRule, /position:\s*absolute;/);
  assert.match(css, /\.panel-orbit::before,[\s\S]+\.panel-orbit::after/);
  assert.match(panelOrbitIntroRule, /panelBorderDraw 860ms ease-out 3040ms both/);
  assert.match(panelOrbitReadyRule, /panelBorderOrbit 6200ms linear infinite,\s*panelBorderOrbitEaseIn 1400ms ease-out both/);
  assert.match(panelOrbitHandoffRule, /panelBorderHandoffFade 2400ms ease-out both/);
  assert.match(startPanelReadyRule, /panelBorderReadyGlow 1000ms ease-out both/);
  assert.match(introTitleRule, /animation:\s*logoZoomIn 1900ms[^;]+1000ms both/);
  assert.doesNotMatch(titleRule, /logoZoomIn/);
  assert.match(css, /titleIdlePulse 3200ms ease-in-out 4300ms infinite/);
  assert.doesNotMatch(css, /hideIntroLayer 1ms linear 3000ms forwards/);
  assert.match(css, /titleStarGlitter 1150ms ease-out 3060ms both/);
  assert.match(startPanelIntroRule, /border-color:\s*transparent;/);
  assert.match(startPanelIntroRule, /background:\s*transparent;/);
  assert.match(startPanelIntroRule, /box-shadow:\s*none;/);
  assert.match(startPanelHandoffRule, /background:\s*var\(--panel-strong\);/);
  assert.match(startPanelHandoffRule, /pointer-events:\s*auto;/);
  assert.match(startPanelHandoffChromeRule, /panelChromeHandoff 900ms ease-out both/);
  assert.match(css, /panelBorderDraw 860ms ease-out 3040ms both/);
  assert.match(css, /panelBorderHandoffFade 2400ms ease-out both/);
  assert.match(css, /@keyframes panelBorderHandoffFade[\s\S]+100%\s*\{[\s\S]+opacity:\s*0\.42;/);
  assert.doesNotMatch(panelOrbitKeyframes, /opacity:/);
  assert.match(css, /@keyframes panelBorderOrbitEaseIn[\s\S]+0%\s*\{[\s\S]+opacity:\s*0\.28;/);
  assert.match(css, /@keyframes panelBorderReadyGlow[\s\S]+0%\s*\{[\s\S]+opacity:\s*0\.72;/);
  assert.match(css, /panelChromeGlow 860ms ease-out 3040ms both/);
  assert.match(css, /panelCopyReveal 700ms ease-out 3920ms both/);
  assert.match(css, /\.start-panel\.intro-panel > :not\(#title\):not\(\.panel-orbit\)/);
  assert.doesNotMatch(css, /\.start-panel\.intro-panel > :not\(#title\)\s*\{/);
  assert.match(css, /clip-path:\s*polygon\(5% 0,\s*95% 0,\s*50% 100%\)/);
  assert.doesNotMatch(css, /clip-path:\s*polygon\(5% 0,\s*95% 0,\s*53% 100%,\s*47% 100%\)/);
  assert.match(css, /radial-gradient\(circle at 50% 100%/);
  assert.match(titleDepthRule, /rgba\(0, 245, 255/);
  assert.match(titleDepthRule, /rgba\(255, 61, 242/);
  assert.match(titleBeforeRule, /rgba\(0, 245, 255/);
  assert.match(titleBeforeRule, /rgba\(255, 61, 242/);
  assert.doesNotMatch(titleDepthRule, /rgba\(255, (87|89|122|130|200|210|226|238),/);
  assert.match(css, /@keyframes logoShine[\s\S]+0%\s*\{[\s\S]+background-position:\s*160% 0;/);
  assert.match(css, /@keyframes logoShine[\s\S]+100%\s*\{[\s\S]+background-position:\s*-140% 0;/);
  assert.match(css, /@keyframes titleTextExtrude[\s\S]+100%\s*\{[\s\S]+opacity:\s*0;[\s\S]+visibility:\s*hidden;/);
  assert.match(css, /@keyframes titleDepthRush[\s\S]+100%\s*\{[\s\S]+opacity:\s*0;[\s\S]+visibility:\s*hidden;/);
  assert.doesNotMatch(css, /logoStreaks/);
  assert.match(css, /prefers-reduced-motion/);
});

test("multiplier callout layer is present and playfield-safe", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");
  const calloutRule = css.match(/\.combo-callout\s*\{[\s\S]*?\n\}/)[0];

  assert.match(html, /id="combo-callouts"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /\.combo-callouts\s*\{/);
  assert.match(css, /\.combo-callout-left/);
  assert.match(css, /\.combo-callout-right/);
  assert.match(css, /@keyframes comboMilestonePop/);
  assert.match(calloutRule, /font-size:\s*44px;/);
  assert.match(calloutRule, /comboMilestonePop 2200ms ease-out forwards/);
});

test("new high score styling has golden shine, twinkles, and neon fireworks", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");
  const titleRule = css.match(/\.high-score-title\s*\{[\s\S]*?\n\}/)[0];

  assert.match(titleRule, /color:\s*#fff0bc;/);
  assert.match(titleRule, /highScoreGoldShine/);
  assert.match(css, /\.high-score-title::before/);
  assert.match(css, /\.high-score-title::after/);
  assert.match(css, /\.neon-firework/);
  assert.match(css, /\.neon-firework::before/);
  assert.match(css, /\.neon-firework::after/);
  assert.match(css, /@keyframes highScoreGoldShine/);
  assert.match(css, /@keyframes highScoreTwinkle/);
  assert.match(css, /@keyframes neonFireworkBurst/);
});

test("all-time record styling keeps a responsive reduced-motion 3D trophy", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");

  assert.match(css, /\.all-time-score-title/);
  assert.match(css, /\.record-trophy-stage/);
  assert.match(css, /\.record-trophy\s*\{/);
  assert.match(css, /transform-style:\s*preserve-3d/);
  assert.match(css, /@keyframes recordTrophySpin/);
  assert.doesNotMatch(css, /\.record-shockwave/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]+\.record-trophy-stage/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]+\.record-trophy/);
});

test("mobile all-time trophy stays compact and inside the record-title edge", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styling.css"), "utf8");
  const mobileBlock = css.match(/@media \(max-width:\s*640px\)\s*\{[\s\S]*?\n\}/)[0];
  const trophyRule = mobileBlock.match(/\.record-trophy-stage\s*\{[\s\S]*?\n\s*\}/)[0];

  assert.match(trophyRule, /top:\s*14%;/);
  assert.match(trophyRule, /right:\s*4px;/);
  assert.match(trophyRule, /transform:\s*scale\(0\.28\);/);
});
