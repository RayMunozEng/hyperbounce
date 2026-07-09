# Neon Skill-Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Hyperbounce into a polished neon arcade runner while keeping the code DRY, efficient, and portfolio-readable.

**Architecture:** Keep one runtime loop in `Game`, move reusable tuning into config, route DOM state through `Hud`, isolate input in `Input`, keep platform spawning in `PlatformManager`, and build procedural Three.js models through shared factories. Simulation decisions should use plain state and small helpers instead of scattering rules through mesh code.

**Tech Stack:** Vanilla JavaScript, Three.js 0.103, Howler.js, Webpack 4, DOM HUD, procedural Three.js geometry.

## Global Constraints

- Keep gameplay systems simple enough to understand in one pass.
- Prefer shared configuration and reusable factories over one-off constants or duplicated material/geometry setup.
- Build procedural models from Three.js primitives instead of relying on heavy external model assets.
- Make every visual effect serve gameplay readability: landing, danger, combo state, speed, and game over.
- Reuse geometries and materials where possible.
- Pool platform objects instead of constantly creating and disposing large object graphs during play.
- Use a single main animation loop for gameplay, platform movement, starfield motion, effects, and rendering.
- Avoid per-frame allocation in hot paths where simple reused vectors or scalar math works.
- Avoid importing new heavy libraries unless they replace meaningful complexity.

---

## File Structure

- Modify `index.html`: replace legacy overlay markup with compact HUD/start/retry controls.
- Modify `styling.css`: add neon theme variables, responsive HUD, low-chrome overlays.
- Modify `src/index.js`: keep dependency bootstrap and instantiate `Game`.
- Replace `src/game.js`: lifecycle, main loop, scoring, scene orchestration.
- Replace `src/player.js`: hover-core model, bounce movement, input application, trail/death updates.
- Replace `src/platform.js`: pooled procedural pad instance, type visuals, landing/pickup feedback.
- Replace `src/platform_generator.js`: platform pool, spawn rules, speed ramp, active platform movement.
- Create `src/config.js`: shared gameplay, colors, dimensions, platform type settings.
- Create `src/input.js`: pointer-lock and movement delta collection.
- Create `src/hud.js`: all DOM lookup and screen state updates.
- Create `src/collision.js`: pure collision and pickup helpers.
- Create `src/materials.js`: reusable material and geometry factories.
- Create `src/effects.js`: small reusable animation helpers and starfield.

---

### Task 1: Baseline And Tooling

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run build` for deterministic bundle builds.
- Produces: `npm run watch` for development watching.

- [ ] **Step 1: Record baseline state**

Run: `npm install`
Expected: dependencies install or report already up to date.

Run: `npm run build`
Expected before implementation: if missing, add the script below first.

- [ ] **Step 2: Add scripts**

Set package scripts to:

```json
"scripts": {
  "build": "webpack --mode=development",
  "watch": "webpack --watch --mode=development"
}
```

- [ ] **Step 3: Verify build command**

Run: `npm run build`
Expected: webpack emits `bundle.js` without syntax errors.

- [ ] **Step 4: Commit**

Run: `git add package.json package-lock.json && git commit -m "chore: add build script"`

---

### Task 2: Shared Configuration And Helpers

**Files:**
- Create: `src/config.js`
- Create: `src/collision.js`
- Create: `src/materials.js`
- Create: `src/effects.js`

**Interfaces:**
- Produces: `GAME_CONFIG`, `COLORS`, `PLATFORM_TYPES` constants.
- Produces: `didLand(playerX, platformX, radius)` and `didCollect(playerX, pickupX, radius)`.
- Produces: `createSharedAssets(THREE)` returning reusable `geometries`, `materials`, and `textures`.
- Produces: `Starfield` class with `update(delta, speed)`.

- [ ] **Step 1: Write pure collision helpers**

Create `src/collision.js` with exported functions using scalar bounds only:

```js
export function didLand(playerX, platformX, radius) {
  return playerX >= platformX - radius && playerX <= platformX + radius;
}

export function didCollect(playerX, pickupX, radius) {
  return playerX >= pickupX - radius && playerX <= pickupX + radius;
}
```

- [ ] **Step 2: Add config constants**

Create `src/config.js` with colors, player tuning, platform tuning, spawn tuning, scoring, and UI state names.

- [ ] **Step 3: Add reusable assets**

Create `src/materials.js` so model classes receive shared geometry/material references instead of creating new copies per platform.

- [ ] **Step 4: Add starfield effect class**

Create `src/effects.js` with one `Starfield` class that owns geometry once and updates vertices in the main loop.

- [ ] **Step 5: Verify syntax**

Run: `npm run build`
Expected: build passes or only fails on imports that will be connected in later tasks.

- [ ] **Step 6: Commit**

Run: `git add src/config.js src/collision.js src/materials.js src/effects.js && git commit -m "refactor: add shared game helpers"`

---

### Task 3: Input And HUD Boundaries

**Files:**
- Create: `src/input.js`
- Create: `src/hud.js`
- Modify: `index.html`
- Modify: `styling.css`

**Interfaces:**
- Produces: `InputController` with `lock(canvas)`, `unlock()`, `start()`, `stop()`, and `consumeMovement()`.
- Produces: `Hud` with `showStart()`, `showPlaying(state)`, `showGameOver(state)`, `updateRun(state)`, and `onStart/onRetry/onSound` handlers.

- [ ] **Step 1: Create input controller**

Move pointer-lock and mouse movement handling into `src/input.js`. Store movement delta until consumed by the main loop.

- [ ] **Step 2: Create HUD controller**

Move DOM element lookup, labels, visibility, and event binding into `src/hud.js`.

- [ ] **Step 3: Replace overlay markup**

Update `index.html` to include a top HUD strip, center start/retry panel, short hint, and sound button.

- [ ] **Step 4: Replace CSS theme**

Update `styling.css` with neon CSS variables, responsive text sizes, compact HUD layout, and clear button states.

- [ ] **Step 5: Verify static UI**

Run: `npm run build`.
Open local page and confirm start screen has no overlapping text at desktop width.

- [ ] **Step 6: Commit**

Run: `git add src/input.js src/hud.js index.html styling.css && git commit -m "feat: add neon HUD shell"`

---

### Task 4: Procedural Player And Platform Models

**Files:**
- Replace: `src/player.js`
- Replace: `src/platform.js`

**Interfaces:**
- `Player` constructor accepts `{ scene, assets }`.
- `Player.update(delta, movement, running)` updates bounce, x movement, trail, and visual rotation.
- `Player.beginDeath()` and `Player.updateDeath(delta)` manage game-over fall.
- `Platform` constructor accepts `{ scene, assets }`.
- `Platform.activate(type, x, z, index)` configures pooled pad state.
- `Platform.update(delta, speed)` moves and animates the pad.
- `Platform.resolveLanding(result)` triggers standard, pickup, hazard, or boost feedback.

- [ ] **Step 1: Rebuild player model**

Create a hover-core group from shared sphere, shell, torus rings, point light, and trail particles.

- [ ] **Step 2: Rebuild platform model**

Create a pooled pad group using shared cylinder/torus/ring geometries, with type-specific materials and optional pickup/hazard visuals.

- [ ] **Step 3: Keep state separate from meshes**

Store `type`, `radius`, `pickupX`, `isActive`, and feedback timers as scalar properties on `Platform`.

- [ ] **Step 4: Verify build**

Run: `npm run build`.
Expected: player/platform modules compile.

- [ ] **Step 5: Commit**

Run: `git add src/player.js src/platform.js && git commit -m "feat: add procedural neon models"`

---

### Task 5: Platform Manager And Game Loop

**Files:**
- Replace: `src/platform_generator.js`
- Replace: `src/game.js`
- Modify: `src/index.js`

**Interfaces:**
- `PlatformManager` constructor accepts `{ scene, assets }`.
- `PlatformManager.reset()` returns the opening active platform set.
- `PlatformManager.update(delta, speed)` moves active platforms and recycles offscreen pads.
- `PlatformManager.spawnNext(score)` chooses platform type and position.
- `Game.animate(time)` is the only requestAnimationFrame loop.

- [ ] **Step 1: Implement pooled platform manager**

Create a fixed pool sized by config. Reuse inactive platforms for new spawns.

- [ ] **Step 2: Replace multiple animation loops**

Move player, platform, stars, scoring, feedback, and rendering into the single `Game.animate` loop.

- [ ] **Step 3: Implement scoring rules**

Standard/narrow pads add `multiplier`; multiplier cores increase multiplier before scoring; hazard pads reset multiplier; boost pads add bonus points.

- [ ] **Step 4: Implement state transitions**

Start hides menu and locks input. Missed landing starts death state. Death completion shows retry. Retry resets all pooled state.

- [ ] **Step 5: Verify play loop**

Run: `npm run build`.
Open local page, start, land on pads, miss, retry, and check console errors.

- [ ] **Step 6: Commit**

Run: `git add src/platform_generator.js src/game.js src/index.js bundle.js && git commit -m "feat: rebuild neon runner loop"`

---

### Task 6: Polish, Audit, And Documentation

**Files:**
- Modify: `README.md`
- Modify: `styling.css`
- Modify: any source file needing cleanup from playtest.

**Interfaces:**
- Produces: updated README describing the refreshed game, architecture, and local commands.

- [ ] **Step 1: Audit code for duplication**

Search for repeated colors, magic dimensions, and repeated material or geometry creation. Move repeats into `config.js` or `materials.js`.

- [ ] **Step 2: Playtest and tune**

Tune speed ramp, platform spacing, pickup frequency, hazard frequency, and HUD copy until the opening minute is readable.

- [ ] **Step 3: Update README**

Document the Neon Skill-Runner refresh, controls, architecture, and commands: `npm install`, `npm run build`, `npm run watch`.

- [ ] **Step 4: Final verification**

Run: `npm run build`.
Open local page and verify start, scoring, multiplier, hazard reset, boost score, game over, retry, and sound toggle.

- [ ] **Step 5: Commit**

Run: `git add README.md styling.css src bundle.js && git commit -m "docs: document neon refresh"`
