# HYPERBOUNCE

Hyperbounce is a neon 3D arcade runner built with vanilla JavaScript and Three.js. The player controls a bouncing hover core, lands on incoming energy pads, chains multiplier pickups, and survives as the run gets faster.

[HYPERBOUNCE LIVE LINK](https://www.raymondmunoz.net/Hyperbounce/)

## How To Play

Click **Start Run**, then move left or right with your mouse or trackpad. Land on each platform as it reaches the bounce point.

- Standard pads keep the run going.
- Multiplier pads contain a pickup core; hitting it increases combo value.
- Missing a multiplier pickup resets combo to `x1`.
- Hazard pads are landable, but reset combo.
- Narrow pads are smaller skill checks.
- Boost pads add bonus score.

Missing a platform ends the run. Click **Retry** to reset immediately.

## Local Development

```bash
npm install
npm run build
npm test
npm run watch
```

The built game is emitted to `bundle.js` and loaded by `index.html`.

## Architecture

The refresh keeps the project intentionally small and portfolio-readable:

- `src/game.js`: lifecycle, state transitions, one animation loop, scoring orchestration.
- `src/config.js`: shared colors, tuning values, and platform type definitions.
- `src/player.js`: procedural hover-core player model and bounce/death movement.
- `src/platform.js`: pooled procedural platform visual and landing feedback.
- `src/platform_generator.js`: platform pool, spawn rules, current target selection, cleanup.
- `src/scoring.js`: pure score, combo, hazard, and boost rules.
- `src/collision.js`: pure landing and pickup bounds checks.
- `src/materials.js`: reusable Three.js geometry and material factory.
- `src/effects.js`: starfield effect updated from the main loop.
- `src/input.js`: pointer-lock and mouse movement collection.
- `src/hud.js`: DOM HUD state and control binding.

## Tech

- Vanilla JavaScript
- Three.js
- Howler.js
- Webpack
- Node test runner for pure gameplay helpers

## Design Notes

The project favors procedural models over imported assets so the code stays light and easy to inspect. Geometry and materials are shared where practical, platforms are pooled, and gameplay state is kept separate from rendering details.
