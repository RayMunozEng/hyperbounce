# Hyperbounce Neon Skill-Runner Design

## Goal
Refresh Hyperbounce into a polished arcade portfolio piece while preserving the original bounce-and-land identity. The remake should feel faster, richer, and more modern, but the code should stay small, readable, and efficient.

## Design Principles
- Keep gameplay systems simple enough to understand in one pass.
- Prefer shared configuration and reusable factories over one-off constants or duplicated material/geometry setup.
- Build procedural models from Three.js primitives instead of relying on heavy external model assets.
- Make every visual effect serve gameplay readability: landing, danger, combo state, speed, and game over.
- Avoid large rewrites that do not improve player experience or code clarity.

## Gameplay
The player still controls a bouncing object horizontally with mouse or trackpad movement. Platforms move toward the player, and a missed landing ends the run.

The remake adds a few focused platform and pickup types:
- Standard pads: reliable landing targets.
- Multiplier cores: reward accurate landings and build combo value.
- Hazard pads: visually distinct pads that are still landable, but reset the multiplier to 1 and trigger danger feedback.
- Narrow pads: smaller high-risk targets that appear after the opening phase.
- Boost pads: rare pads that add a short visual and scoring burst.

The game should ramp up by increasing forward speed, adding trickier platform placement, and introducing special platform types after the player has learned the base loop.

## Visual Direction
The look is a neon space-runner style: dark background, cyan/magenta/gold highlights, sharp silhouettes, and readable glow. The original bloom/starfield identity remains, but gets upgraded with stronger depth and motion.

Procedural model replacements:
- Player becomes a hover core: glowing inner sphere, faceted outer shell, orbit rings, and a small trail.
- Platforms become floating energy pads: hex or beveled pad forms with edge lights and animated landing shockwaves.
- Pickups become compact cores above pads with pulsing rings.
- Hazards use angular warning geometry and a distinct color family.

## UI And Feedback
The HUD should look like part of the game, not plain text over canvas. It should show score, high score, multiplier, and run state. Start, retry, and sound controls should remain simple and fast.

Feedback moments:
- Landing pulse and platform glow.
- Combo pickup pulse and multiplier update.
- Hazard warning color and impact feedback.
- Game over camera/player fall with a clean retry state.

## Architecture
Keep the code organized into small modules with clear responsibilities:
- `Game`: owns lifecycle, state transitions, and frame loop orchestration.
- `SceneManager`: renderer, camera, lighting, bloom, resize handling.
- `Input`: pointer-lock and horizontal movement input.
- `Player`: player model, movement, reset, death animation, trail state.
- `PlatformManager`: platform pooling, spawning, speed ramp, cleanup.
- `Platform`: one platform instance and its visual state.
- `Collision`: small pure helpers for landing and pickup checks.
- `Hud`: DOM updates and screen state toggles.
- `config`: shared tuning, colors, geometry sizes, spawn rules.
- `materials` / `modelFactory`: reusable geometry and material creation.

This keeps gameplay code DRY and makes the project read like a portfolio sample rather than a collection of scripts.

## Efficiency Plan
- Reuse geometries and materials where possible.
- Pool platform objects instead of constantly creating and disposing large object graphs during play.
- Use a single main animation loop for gameplay, platform movement, starfield motion, effects, and rendering.
- Avoid per-frame allocation in hot paths where simple reused vectors or scalar math works.
- Keep effect lifetimes explicit and lightweight.
- Avoid importing new heavy libraries unless they replace meaningful complexity.

## Modernization Scope
The first implementation pass should prioritize structure and visuals without making dependency upgrades the risky center of the work. If package upgrades are straightforward, update scripts and dependencies enough to make local development clean. If a full Three.js upgrade creates large API churn, defer it behind the game refresh rather than letting tooling consume the project.

## Testing And Verification
Because this is a browser game, verification should combine code checks and play checks:
- Build the bundle successfully.
- Open the game locally and confirm the start screen renders.
- Start a run and verify input, landing, scoring, multiplier, speed ramp, and game over.
- Restart and confirm state resets cleanly.
- Check for console errors.
- Inspect desktop and narrower viewport layouts for overlapping HUD text.

## Out Of Scope For This Pass
- Networked leaderboards.
- Imported GLB asset pipeline.
- Mobile touch controls.
- A full physics engine.
- Complex audio-reactive gameplay.

## Acceptance Criteria
- The game feels visibly upgraded within the first few seconds.
- The original bounce-platform loop is still recognizable.
- New platform/pickup types add skill expression without clutter.
- Code is DRY, efficient, and split into small readable modules.
- Reusable constants, factories, and helpers replace duplicated setup code.
- The project can be built and played locally without manual hacks.

