const assert = require("assert");
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
    disabled: false,
    textContent: "",
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

function makeDocument(ids) {
  const elements = ids.reduce((acc, id) => {
    acc[id] = makeElement(["hidden"]);
    return acc;
  }, {});
  const listeners = {};

  return {
    elements,
    listeners,
    exitPointerLockCalled: false,
    getElementById(id) {
      return this.elements[id];
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
    "multiplier",
    "status-chip",
    "game-over",
  ]);
  const hud = new Hud(doc);

  hud.showPlaying({ score: 12, highScore: 20, multiplier: 3 });

  assert.equal(doc.elements.score.textContent, "12");
  assert.equal(doc.elements.highscore.textContent, "20");
  assert.equal(doc.elements.multiplier.textContent, "x3");
  assert.equal(doc.elements["start-panel"].classList.contains("hidden"), true);
  assert.equal(doc.elements["status-chip"].classList.contains("hidden"), false);

  hud.showGameOver({ score: 15, highScore: 22, isNewHighScore: true });

  assert.equal(doc.elements["game-over"].textContent, "NEW HIGH SCORE");
  assert.equal(doc.elements["retry-btn"].classList.contains("hidden"), false);
});
