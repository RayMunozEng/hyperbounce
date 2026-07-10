import { COLORS, GAME_CONFIG } from "./config";
import { createSharedAssets } from "./materials";
import { resolveBounceHeight, resolveBounceSpeed } from "./tempo";

const DEATH_DESTABILIZE_SECONDS = 0.22;
const DEATH_PULL_SECONDS = 0.72;
const DEATH_IMPLODE_SECONDS = 0.32;
const DEATH_RIFT_DROP = 6.2;
const PLAYER_SEAM_ROTATIONS = [
    { x: Math.PI / 2, y: 0, z: 0 },
    { x: 0, y: Math.PI / 2, z: 0 },
    { x: Math.PI / 4, y: Math.PI / 4, z: Math.PI / 8 }
];

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
}

function easeInCubic(value) {
    return value * value * value;
}

function cloneMaterial(material) {
    return material && typeof material.clone === "function" ? material.clone() : material;
}

function setUniformScale(object, scale) {
    object.scale.set(scale, scale, scale);
}

export default class Player {
    constructor(options = {}) {
        const browserWindow = typeof window === "undefined" ? {} : window;
        const THREE = options.THREE || browserWindow.THREE;
        const scene = options.scene || (browserWindow.game && browserWindow.game.scene);
        const assets = options.assets || createSharedAssets(THREE);

        this.THREE = THREE;
        this.scene = scene;
        this.assets = assets;
        this.group = new THREE.Group();
        this.position = this.group.position;
        this.direction = 1;
        this.speed = resolveBounceSpeed(GAME_CONFIG.run.baseSpeed);
        this.deadState = false;
        this.landedThisFrame = false;
        this.wakePhase = 0;
        this.wakeDirection = -1;
        this.launchArrival = null;

        const seamGeometry = assets.geometries.playerSeam || assets.geometries.playerRing;
        const seamMaterial = assets.materials.player.seam || assets.materials.player.ring;
        const seamAltMaterial = assets.materials.player.seamAlt ||
            assets.materials.player.ringAlt || seamMaterial;
        const seamAccentMaterial = assets.materials.player.seamAccent || seamAltMaterial;

        this.visualAssembly = new THREE.Group();
        this.core = new THREE.Mesh(assets.geometries.playerCore, assets.materials.player.core);
        this.shell = new THREE.Mesh(assets.geometries.playerShell, assets.materials.player.shell);
        this.seamA = new THREE.Mesh(seamGeometry, seamMaterial);
        this.seamB = new THREE.Mesh(seamGeometry, seamAltMaterial);
        this.seamC = new THREE.Mesh(seamGeometry, seamAccentMaterial);
        this.seamMountA = new THREE.Group();
        this.seamMountB = new THREE.Group();
        this.seamMountC = new THREE.Group();
        this.seamMounts = [this.seamMountA, this.seamMountB, this.seamMountC];
        this.seamMeshes = [this.seamA, this.seamB, this.seamC];
        this.light = new THREE.PointLight(COLORS.gold, 0.24, 5.5);
        this.motionWake = this.createMotionWake();
        this.teleportEffect = this.createTeleportEffect();
        this.deathEffect = this.createDeathEffect();
        this.deathRift = this.createDeathRift();

        this.seamMountA.add(this.seamA);
        this.seamMountB.add(this.seamB);
        this.seamMountC.add(this.seamC);
        this.visualAssembly.add(this.shell);
        this.visualAssembly.add(this.seamMountA);
        this.visualAssembly.add(this.seamMountB);
        this.visualAssembly.add(this.seamMountC);

        this.group.add(this.teleportEffect);
        this.group.add(this.motionWake);
        this.group.add(this.deathEffect);
        this.group.add(this.core);
        this.group.add(this.visualAssembly);
        this.group.add(this.light);
        this.group.layers.set(0);
        this.sphere = this.group;

        if (scene) {
            scene.add(this.group);
            scene.add(this.deathRift);
        }
        this.reset();
    }

    createMotionWake() {
        const wake = new this.THREE.Group();
        const wakeRings = [];
        const baseMaterial = this.assets.materials.player.wake ||
            this.assets.materials.player.trail ||
            this.assets.materials.player.ring;

        for (let i = 0; i < 4; i++) {
            const material = cloneMaterial(baseMaterial);
            const ring = new this.THREE.Mesh(this.assets.geometries.playerRing, material);

            if (material) {
                material.transparent = true;
                material.depthWrite = false;
                material.opacity = 0.13 - (i * 0.018);
            }

            ring.rotation.x = Math.PI / 2;
            ring.rotation.z = (i % 2 === 0 ? 1 : -1) * (0.15 + i * 0.08);
            wake.add(ring);
            wakeRings.push(ring);
        }

        wake.rings = wakeRings;
        this.wakeRings = wakeRings;
        return wake;
    }

    createTeleportEffect() {
        const effect = new this.THREE.Group();
        const teleportRings = [];
        const baseMaterial = this.assets.materials.player.ring || this.assets.materials.player.trail;

        for (let i = 0; i < 4; i++) {
            const material = cloneMaterial(baseMaterial);
            const ring = new this.THREE.Mesh(this.assets.geometries.playerRing, material);

            if (material) {
                material.transparent = true;
                material.depthWrite = false;
                material.opacity = 0;
            }

            ring.rotation.x = Math.PI / 2;
            ring.rotation.z = i * Math.PI / 4;
            effect.add(ring);
            teleportRings.push(ring);
        }

        effect.visible = false;
        effect.rings = teleportRings;
        this.teleportRings = teleportRings;
        return effect;
    }

    createDeathEffect() {
        const effect = new this.THREE.Group();
        const ghosts = [];
        const sourceMaterial = this.assets.materials.player.wake ||
            this.assets.materials.player.ring;

        for (let index = 0; index < 4; index += 1) {
            const material = cloneMaterial(sourceMaterial);
            const ghost = new this.THREE.Mesh(this.assets.geometries.playerCore, material);

            if (material) {
                material.transparent = true;
                material.depthWrite = false;
                material.opacity = 0;
            }

            effect.add(ghost);
            ghosts.push(ghost);
        }

        effect.visible = false;
        effect.ghosts = ghosts;
        this.deathGhosts = ghosts;
        return effect;
    }

    createDeathRift() {
        const rift = new this.THREE.Group();
        const rings = [];
        const beams = [];

        for (let index = 0; index < 3; index += 1) {
            const sourceMaterial = index % 2 === 0 ?
                this.assets.materials.player.ring :
                (this.assets.materials.player.ringAlt || this.assets.materials.player.ring);
            const material = cloneMaterial(sourceMaterial);
            const ring = new this.THREE.Mesh(this.assets.geometries.playerRing, material);

            if (material) {
                material.transparent = true;
                material.depthWrite = false;
                material.opacity = 0;
            }

            ring.rotation.x = Math.PI / 2;
            ring.rotation.z = index * Math.PI / 3;
            rift.add(ring);
            rings.push(ring);
        }

        for (let index = 0; index < 4; index += 1) {
            const material = cloneMaterial(
                index % 2 === 0 ?
                    this.assets.materials.player.ring :
                    (this.assets.materials.player.ringAlt || this.assets.materials.player.ring)
            );
            const beam = new this.THREE.Mesh(this.assets.geometries.platformBeacon, material);
            const angle = (index / 4) * Math.PI * 2;

            if (material) {
                material.transparent = true;
                material.depthWrite = false;
                material.opacity = 0;
            }

            beam.position.x = Math.cos(angle) * 0.72;
            beam.position.y = 0.78;
            beam.position.z = Math.sin(angle) * 0.72;
            rift.add(beam);
            beams.push(beam);
        }

        const burstMaterial = cloneMaterial(this.assets.materials.player.ring);
        const burst = new this.THREE.Mesh(this.assets.geometries.playerRing, burstMaterial);

        if (burstMaterial) {
            burstMaterial.transparent = true;
            burstMaterial.depthWrite = false;
            burstMaterial.opacity = 0;
        }
        burst.rotation.x = Math.PI / 2;
        rift.add(burst);

        rift.visible = false;
        rift.rings = rings;
        rift.beams = beams;
        rift.burst = burst;
        this.riftRings = rings;
        this.riftBeams = beams;
        this.riftBurst = burst;
        return rift;
    }

    resetSeamTransforms() {
        this.seamMounts.forEach((mount, index) => {
            const rotation = PLAYER_SEAM_ROTATIONS[index];

            mount.position.set(0, 0, 0);
            mount.rotation.set(rotation.x, rotation.y, rotation.z);
            setUniformScale(mount, 1);
            this.seamMeshes[index].visible = true;
        });
    }

    setSeamScale(scale) {
        this.seamMounts.forEach((mount) => setUniformScale(mount, scale));
    }

    reset() {
        this.position.set(0, GAME_CONFIG.player.startY, 0);
        this.group.scale.set(1, 1, 1);
        this.direction = 1;
        this.syncRunSpeed(GAME_CONFIG.run.baseSpeed);
        this.deadState = false;
        this.landedThisFrame = false;
        this.wakePhase = 0;
        this.wakeDirection = -1;
        this.launchArrival = null;
        this.deathElapsed = 0;
        this.deathOriginX = 0;
        this.deathOriginY = GAME_CONFIG.player.startY;
        this.deathOriginZ = 0;
        this.deathRiftY = GAME_CONFIG.player.startY - DEATH_RIFT_DROP;
        this.group.visible = true;
        this.group.rotation.set(0, 0, 0);
        this.visualAssembly.rotation.set(0, 0, 0);
        this.core.scale.set(1, 1, 1);
        this.shell.scale.set(1, 1, 1);
        this.shell.rotation.set(0, 0, 0);
        this.resetSeamTransforms();
        this.light.intensity = 0.24;
        this.motionWake.visible = true;
        this.resetMotionWake();
        this.resetTeleportEffect();
        this.resetDeathEffect();
        this.resetDeathRift();
    }

    syncRunSpeed(runSpeed, platformGap = Math.abs(GAME_CONFIG.platform.startZ)) {
        this.speed = resolveBounceSpeed(runSpeed, platformGap);
    }

    setVisible(isVisible) {
        this.group.visible = isVisible;
    }

    resetMotionWake() {
        if (!this.wakeRings) return;

        this.wakeDirection = -this.direction;
        this.wakeRings.forEach((ring, index) => {
            ring.position.set(0, this.wakeDirection * (0.1 + index * 0.055), 0.16 + index * 0.045);
            ring.rotation.x = Math.PI / 2;
            ring.rotation.z = (index % 2 === 0 ? 1 : -1) * (0.15 + index * 0.08);
            ring.scale.set(0.92 + index * 0.11, 0.5 + index * 0.035, 0.92 + index * 0.11);
            if (ring.material) ring.material.opacity = 0.12 - index * 0.018;
        });
    }

    resetTeleportEffect() {
        if (!this.teleportEffect || !this.teleportRings) return;

        this.teleportEffect.visible = false;
        this.teleportRings.forEach((ring, index) => {
            ring.position.set(0, 0, 0);
            ring.rotation.x = Math.PI / 2;
            ring.rotation.z = index * Math.PI / 4;
            ring.scale.set(0.32, 0.32, 0.32);
            if (ring.material) ring.material.opacity = 0;
        });
    }

    resetDeathEffect() {
        if (!this.deathEffect || !this.deathGhosts) return;

        this.deathEffect.visible = false;
        this.deathEffect.position.set(0, 0, 0);
        this.deathEffect.rotation.set(0, 0, 0);
        this.deathGhosts.forEach((ghost) => {
            ghost.position.set(0, 0, 0);
            ghost.rotation.set(0, 0, 0);
            ghost.scale.set(0.5, 0.5, 0.5);
            if (ghost.material) ghost.material.opacity = 0;
        });
    }

    resetDeathRift() {
        if (!this.deathRift) return;

        this.deathRift.visible = false;
        this.deathRift.position.set(0, 0, 0);
        this.deathRift.rotation.set(0, 0, 0);
        this.deathRift.scale.set(0.02, 0.02, 0.02);

        this.riftRings.forEach((ring, index) => {
            ring.position.set(0, index * 0.035, 0);
            ring.rotation.x = Math.PI / 2;
            ring.rotation.y = 0;
            ring.rotation.z = index * Math.PI / 3;
            ring.scale.set(0.8 + index * 0.28, 0.8 + index * 0.28, 0.8 + index * 0.28);
            if (ring.material) ring.material.opacity = 0;
        });

        this.riftBeams.forEach((beam, index) => {
            const angle = (index / this.riftBeams.length) * Math.PI * 2;

            beam.position.x = Math.cos(angle) * 0.72;
            beam.position.y = 0.78;
            beam.position.z = Math.sin(angle) * 0.72;
            beam.rotation.set(0, 0, 0);
            beam.scale.set(1, 0.12, 1);
            if (beam.material) beam.material.opacity = 0;
        });

        this.riftBurst.position.set(0, 0.08, 0);
        this.riftBurst.rotation.x = Math.PI / 2;
        this.riftBurst.scale.set(0.45, 0.45, 0.45);
        if (this.riftBurst.material) this.riftBurst.material.opacity = 0;
    }

    update(delta, movement, running, bouncePhase = null) {
        this.landedThisFrame = false;
        if (!running || this.deadState) return;

        const frameScale = Math.min(delta * 60, 2);
        this.position.x = clamp(
            this.position.x + movement * GAME_CONFIG.player.inputSensitivity,
            -GAME_CONFIG.player.maxX,
            GAME_CONFIG.player.maxX
        );

        if (bouncePhase !== null && bouncePhase !== undefined && Number.isFinite(Number(bouncePhase))) {
            this.syncBouncePhase(Number(bouncePhase));
            this.landedThisFrame = bouncePhase >= 1;
        } else {
            this.updateLegacyBounce(frameScale);
        }

        this.updateEnergyVisuals(frameScale, delta);
    }

    syncBouncePhase(phase) {
        const cycle = ((Number(phase) % 1) + 1) % 1;

        this.position.y = resolveBounceHeight(phase);
        this.direction = cycle < 0.5 ? 1 : -1;
    }

    updateLegacyBounce(frameScale) {
        this.position.y += this.direction * this.speed * frameScale;

        if (this.position.y >= GAME_CONFIG.player.topY) {
            const overshoot = this.position.y - GAME_CONFIG.player.topY;
            this.position.y = GAME_CONFIG.player.topY - overshoot;
            this.direction = -1;
        } else if (this.position.y <= GAME_CONFIG.player.startY) {
            const overshoot = GAME_CONFIG.player.startY - this.position.y;
            this.position.y = GAME_CONFIG.player.startY + overshoot;
            this.direction = 1;
            this.landedThisFrame = true;
        }
    }

    updateEnergyVisuals(frameScale, delta) {
        this.visualAssembly.rotation.x += 0.006 * frameScale;
        this.visualAssembly.rotation.y += 0.022 * frameScale;
        this.visualAssembly.rotation.z += 0.004 * frameScale;
        this.updateMotionWake(frameScale, delta);
    }

    updateMotionWake(frameScale, delta) {
        if (!this.wakeRings || !this.motionWake.visible) return;

        const targetDirection = -this.direction;
        const directionBlend = Math.min(1, 0.08 * frameScale);

        this.wakeDirection += (targetDirection - this.wakeDirection) * directionBlend;
        this.wakePhase += delta * 3.2;
        this.wakeRings.forEach((ring, index) => {
            const stagger = index * 0.58;
            const pulse = (Math.sin(this.wakePhase + stagger) + 1) * 0.5;
            const drift = this.wakeDirection * (0.1 + index * 0.055);
            const spread = 0.94 + index * 0.11 + pulse * 0.045;
            const squash = 0.5 + index * 0.035 + pulse * 0.018;
            const opacity = 0.055 + (1 - index / this.wakeRings.length) * 0.11 * (0.72 + pulse * 0.28);

            ring.position.x = 0;
            ring.position.y = drift;
            ring.position.z = 0.16 + index * 0.045;
            ring.rotation.z += (0.006 + index * 0.002) * frameScale;
            ring.scale.set(spread, squash, spread);
            if (ring.material) ring.material.opacity = opacity;
        });
    }

    beginTeleportArrival() {
        this.position.set(0, GAME_CONFIG.player.startY, 0);
        this.setVisible(true);
        setUniformScale(this.group, 0.08);
        this.launchArrival = {
            elapsed: 0,
            duration: GAME_CONFIG.launch.teleportSeconds
        };
        this.teleportEffect.visible = true;
        this.resetMotionWake();
        this.updateTeleportEffect(0, 1);
    }

    updateLaunchVisual(delta) {
        const frameScale = Math.min(delta * 60, 2);

        if (!this.launchArrival) {
            this.updateEnergyVisuals(frameScale, delta);
            return;
        }

        this.launchArrival.elapsed = Math.min(
            this.launchArrival.duration,
            this.launchArrival.elapsed + delta
        );

        const progress = this.launchArrival.elapsed / this.launchArrival.duration;
        const eased = easeOutCubic(progress);
        const scale = 0.08 + eased * 0.92;
        const flicker = Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.12;

        setUniformScale(this.group, Math.max(0.08, scale + flicker));
        this.updateTeleportEffect(progress, frameScale);
        this.updateEnergyVisuals(frameScale, delta);

        if (progress >= 1) {
            setUniformScale(this.group, 1);
            this.resetTeleportEffect();
            this.launchArrival = null;
        }
    }

    updateTeleportEffect(progress, frameScale) {
        if (!this.teleportRings) return;

        this.teleportRings.forEach((ring, index) => {
            const localProgress = clamp(progress - index * 0.08, 0, 1);
            const burst = easeOutCubic(localProgress);
            const scale = 0.44 + burst * (2.55 + index * 0.28);
            const lift = Math.sin(localProgress * Math.PI) * (0.18 + index * 0.04);

            ring.position.x = 0;
            ring.position.y = lift - 0.08 + index * 0.04;
            ring.position.z = 0.08 + index * 0.045;
            ring.rotation.z += (0.045 + index * 0.012) * frameScale;
            ring.scale.set(scale, scale, scale);
            if (ring.material) {
                ring.material.opacity = Math.max(0, Math.sin(localProgress * Math.PI) * (0.62 - index * 0.08));
            }
        });
    }

    beginDeath() {
        this.deadState = true;
        this.deathElapsed = 0;
        this.deathOriginX = this.position.x;
        this.deathOriginY = this.position.y;
        this.deathOriginZ = this.position.z;
        this.deathRiftY = Math.max(
            GAME_CONFIG.player.deathFloor + 2,
            this.deathOriginY - DEATH_RIFT_DROP
        );
        this.deathEffect.visible = true;
        this.deathRift.position.set(this.deathOriginX, this.deathRiftY, this.deathOriginZ);
        this.deathRift.visible = true;
        this.motionWake.visible = false;
    }

    updateDeath(delta) {
        const step = clamp(Number(delta) || 0, 0, 0.05);
        const frameScale = step * 60;
        const pullStart = DEATH_DESTABILIZE_SECONDS;
        const implodeStart = pullStart + DEATH_PULL_SECONDS;
        const totalDuration = implodeStart + DEATH_IMPLODE_SECONDS;

        this.deathElapsed += step;

        if (this.deathElapsed < pullStart) {
            const progress = this.deathElapsed / pullStart;
            const pulse = Math.sin(progress * Math.PI * 3);
            const flare = 1 + easeOutCubic(progress) * 0.54;

            this.position.x = this.deathOriginX + pulse * 0.055 * (1 - progress);
            this.position.y = this.deathOriginY - progress * 0.12;
            this.core.scale.set(1 + pulse * 0.08, 1 - pulse * 0.06, 1 + pulse * 0.08);
            setUniformScale(this.shell, 1 + Math.abs(pulse) * 0.1);
            this.setSeamScale(flare);
            this.seamMountA.position.x = progress * 0.34;
            this.seamMountB.position.x = -progress * 0.34;
            this.seamMountC.position.y = progress * 0.3;
            this.seamMountA.rotation.z += 0.12 * frameScale;
            this.seamMountB.rotation.z -= 0.14 * frameScale;
            this.seamMountC.rotation.y += 0.1 * frameScale;
            this.light.intensity = 0.35 + Math.abs(pulse) * 1.5;
            this.updateGravityRift(progress, 0, 0, frameScale);
            return false;
        }

        if (this.deathElapsed < implodeStart) {
            const progress = clamp((this.deathElapsed - pullStart) / DEATH_PULL_SECONDS, 0, 1);
            const fall = easeInCubic(progress);
            const spiral = progress * Math.PI * 4.5;
            const orbitRadius = (1 - progress) * (0.62 + progress * 0.48);
            const width = Math.max(0.36, 1 - fall * 0.62);
            const stretch = Math.max(0.28, 1 + Math.sin(progress * Math.PI) * 1.35 - fall * 0.82);
            const ringSpread = 1.48 + progress * 2.35;

            this.position.x = this.deathOriginX + Math.sin(spiral) * orbitRadius;
            this.position.y = this.deathOriginY + (this.deathRiftY - this.deathOriginY) * fall;
            this.position.z = this.deathOriginZ + Math.cos(spiral) * orbitRadius * 0.4;
            this.core.scale.set(width, stretch, width);
            this.shell.scale.set(width * 1.04, stretch * 1.06, width * 1.04);
            this.setSeamScale(ringSpread);
            this.seamMountA.position.set(progress * 0.62, progress * 0.72, 0);
            this.seamMountB.position.set(-progress * 0.62, -progress * 0.56, 0);
            this.seamMountC.position.set(0, progress * 0.82, progress * 0.2);
            this.seamMountA.rotation.x += 0.075 * frameScale;
            this.seamMountA.rotation.z += 0.13 * frameScale;
            this.seamMountB.rotation.y -= 0.08 * frameScale;
            this.seamMountB.rotation.z -= 0.14 * frameScale;
            this.seamMountC.rotation.x -= 0.09 * frameScale;
            this.seamMountC.rotation.y += 0.11 * frameScale;
            this.group.rotation.x += (0.026 + progress * 0.045) * frameScale;
            this.group.rotation.z += (0.038 + progress * 0.075) * frameScale;
            this.shell.rotation.y += 0.11 * frameScale;
            this.light.intensity = 0.9 + Math.sin(spiral) * 0.35;
            this.updateDeathGhosts(progress, frameScale);
            this.updateGravityRift(1, progress, 0, frameScale);
            return false;
        }

        const progress = clamp((this.deathElapsed - implodeStart) / DEATH_IMPLODE_SECONDS, 0, 1);
        const collapse = 1 - easeOutCubic(progress);
        const visibleCollapse = Math.max(0.02, collapse);
        const jitter = Math.sin(progress * Math.PI * 12) * collapse * 0.08;

        this.position.set(
            this.deathOriginX + jitter,
            this.deathRiftY + 0.1 + jitter,
            this.deathOriginZ
        );
        this.core.scale.set(0.36 * visibleCollapse, 0.28 * visibleCollapse, 0.36 * visibleCollapse);
        this.shell.scale.set(0.4 * visibleCollapse, 0.32 * visibleCollapse, 0.4 * visibleCollapse);
        this.setSeamScale(Math.max(0.02, 3.8 * collapse));
        this.light.intensity = collapse * 2.2;
        this.updateDeathGhosts(1, frameScale, collapse);
        this.updateGravityRift(1, 1, progress, frameScale);
        return this.deathElapsed >= totalDuration;
    }

    updateDeathGhosts(progress, frameScale, fade = 1) {
        for (let index = 0; index < this.deathGhosts.length; index += 1) {
            const ghost = this.deathGhosts[index];
            const distance = 0.28 + index * 0.34;
            const scale = Math.max(0.16, 0.76 - index * 0.11 - progress * 0.28);

            ghost.position.x = Math.sin((progress * Math.PI * 4) - index * 0.7) * 0.16;
            ghost.position.y = distance * (0.7 + progress * 1.2);
            ghost.position.z = 0.12 + index * 0.08;
            ghost.rotation.y -= (0.035 + index * 0.008) * frameScale;
            ghost.scale.set(scale, scale * (1.25 + progress * 0.8), scale);
            if (ghost.material) {
                ghost.material.opacity = fade * (0.28 - index * 0.045) * (0.75 + progress * 0.25);
            }
        }
    }

    updateGravityRift(openProgress, pullProgress, implodeProgress, frameScale) {
        const opening = easeOutCubic(clamp(openProgress, 0, 1));
        const closing = 1 - clamp(implodeProgress, 0, 1) * 0.64;
        const pulse = 1 + Math.sin((this.deathElapsed * 14) + pullProgress * Math.PI * 2) * 0.08;
        const riftScale = Math.max(0.02, opening * closing * pulse);

        this.deathRift.scale.set(riftScale, riftScale, riftScale);
        this.deathRift.rotation.y += 0.018 * frameScale;

        for (let index = 0; index < this.riftRings.length; index += 1) {
            const ring = this.riftRings[index];
            const scale = (0.78 + index * 0.3) * (1 - implodeProgress * 0.72);

            ring.rotation.z += (index % 2 === 0 ? 1 : -1) * (0.075 + index * 0.022) * frameScale;
            ring.scale.set(scale, scale, scale);
            if (ring.material) {
                ring.material.opacity = opening * (0.72 - index * 0.12) * (1 - implodeProgress);
            }
        }

        for (let index = 0; index < this.riftBeams.length; index += 1) {
            const beam = this.riftBeams[index];
            const beamPulse = 0.72 + Math.sin((this.deathElapsed * 18) + index * 1.4) * 0.22;
            const height = 0.16 + pullProgress * (1.2 + index * 0.12);

            beam.scale.set(1, height, 1);
            beam.rotation.y += (0.03 + index * 0.007) * frameScale;
            if (beam.material) {
                beam.material.opacity = opening * beamPulse * (0.22 + pullProgress * 0.3) * (1 - implodeProgress);
            }
        }

        const burstScale = 0.45 + easeOutCubic(implodeProgress) * 5.2;

        this.riftBurst.scale.set(burstScale, burstScale, burstScale);
        if (this.riftBurst.material) {
            this.riftBurst.material.opacity = Math.sin(implodeProgress * Math.PI) * 0.92;
        }
    }

    move() {
        this.legacyMoving = true;
    }

    dead() {
        this.beginDeath();
    }
}
