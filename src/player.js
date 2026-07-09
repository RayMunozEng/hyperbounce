import { COLORS, GAME_CONFIG } from "./config";
import { createSharedAssets } from "./materials";
import { resolveBounceSpeed } from "./tempo";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
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

        this.core = new THREE.Mesh(assets.geometries.playerCore, assets.materials.player.core);
        this.shell = new THREE.Mesh(assets.geometries.playerShell, assets.materials.player.shell);
        this.ringA = new THREE.Mesh(assets.geometries.playerRing, assets.materials.player.ring);
        this.ringB = new THREE.Mesh(
            assets.geometries.playerRing,
            assets.materials.player.ringAlt || assets.materials.player.ring
        );
        this.ringOrbitA = new THREE.Group();
        this.ringOrbitB = new THREE.Group();
        this.light = new THREE.PointLight(COLORS.gold, 0.24, 5.5);
        this.motionWake = this.createMotionWake();
        this.teleportEffect = this.createTeleportEffect();

        this.ringA.rotation.x = Math.PI / 2;
        this.ringB.rotation.y = Math.PI / 2;
        this.ringA.position.x = 0.16;
        this.ringB.position.x = -0.16;
        this.ringOrbitA.add(this.ringA);
        this.ringOrbitB.add(this.ringB);

        this.group.add(this.teleportEffect);
        this.group.add(this.motionWake);
        this.group.add(this.core);
        this.group.add(this.shell);
        this.group.add(this.ringOrbitA);
        this.group.add(this.ringOrbitB);
        this.group.add(this.light);
        this.group.layers.set(0);
        this.sphere = this.group;

        if (scene) scene.add(this.group);
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
        this.group.visible = true;
        this.resetMotionWake();
        this.resetTeleportEffect();
    }

    syncRunSpeed(runSpeed) {
        this.speed = resolveBounceSpeed(runSpeed);
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

    update(delta, movement, running) {
        this.landedThisFrame = false;
        if (!running || this.deadState) return;

        const frameScale = Math.min(delta * 60, 2);
        this.position.x = clamp(
            this.position.x + movement * GAME_CONFIG.player.inputSensitivity,
            -GAME_CONFIG.player.maxX,
            GAME_CONFIG.player.maxX
        );
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

        this.updateEnergyVisuals(frameScale, delta);
    }

    updateEnergyVisuals(frameScale, delta) {
        this.shell.rotation.y += 0.025 * frameScale;
        this.ringOrbitA.rotation.y += 0.026 * frameScale;
        this.ringOrbitA.rotation.z += 0.009 * frameScale;
        this.ringOrbitB.rotation.x += 0.024 * frameScale;
        this.ringOrbitB.rotation.z -= 0.012 * frameScale;
        this.ringA.rotation.z += 0.04 * frameScale;
        this.ringB.rotation.z -= 0.036 * frameScale;
        this.updateMotionWake(frameScale, delta);
    }

    updateMotionWake(frameScale, delta) {
        if (!this.wakeRings) return;

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
    }

    updateDeath(delta) {
        const frameScale = Math.min(delta * 60, 2);
        this.position.y -= this.speed * frameScale;
        this.shell.rotation.x += 0.05 * frameScale;
        this.shell.rotation.z += 0.04 * frameScale;
        this.updateEnergyVisuals(frameScale, delta);
        return this.position.y <= GAME_CONFIG.player.deathFloor;
    }

    move() {
        this.legacyMoving = true;
    }

    dead() {
        this.beginDeath();
    }
}
