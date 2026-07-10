import { GAME_CONFIG } from "./config";
import Platform from "./platform";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export default class PlatformManager {
    constructor({
        THREE = typeof window === "undefined" ? undefined : window.THREE,
        scene,
        assets,
        PlatformClass = Platform,
        random = Math.random
    } = {}) {
        this.THREE = THREE;
        this.scene = scene;
        this.assets = assets;
        this.PlatformClass = PlatformClass;
        this.random = random;
        this.pool = [];
        this.active = [];
        this.platformArr = this.active;
        this.spawnIndex = 0;
        this.lastX = 0;
        this.lastGapOffset = 0;

        for (let i = 0; i < GAME_CONFIG.platform.poolSize; i++) {
            this.pool.push(new PlatformClass({ THREE, scene, assets }));
        }
    }

    reset() {
        this.pool.forEach((platform) => platform.deactivate());
        this.active.length = 0;
        this.spawnIndex = 0;
        this.lastX = 0;
        this.lastGapOffset = 0;

        let z = GAME_CONFIG.platform.landingZ;
        while (this.shouldSeedOpeningRunway()) {
            if (!this.activatePlatform("standard", 0, z)) break;
            z += GAME_CONFIG.platform.startZ;
        }
    }

    shouldSeedOpeningRunway() {
        const farthestZ = this.active.reduce((minZ, platform) => {
            return Math.min(minZ, platform.group.position.z);
        }, GAME_CONFIG.platform.landingZ);

        return this.active.length < GAME_CONFIG.platform.openingCount ||
            farthestZ > GAME_CONFIG.platform.spawnZ;
    }

    current() {
        return this.active
            .filter((platform) => !platform.isCleared)
            .sort((left, right) => {
                const leftDistance = Math.abs(left.group.position.z - GAME_CONFIG.platform.landingZ);
                const rightDistance = Math.abs(right.group.position.z - GAME_CONFIG.platform.landingZ);
                return leftDistance - rightDistance;
            })[0];
    }

    releaseLaunchPad() {
        const launchPad = this.active.find((platform) => {
            return Math.abs(platform.group.position.z - GAME_CONFIG.platform.landingZ) < 0.001;
        });

        if (!launchPad) return null;

        launchPad.isCleared = true;
        return launchPad;
    }

    setVisible(isVisible) {
        this.active.forEach((platform) => {
            if (typeof platform.setVisible === "function") {
                platform.setVisible(isVisible);
            } else {
                platform.group.visible = isVisible;
            }
        });
    }

    startLaunchReveal() {
        this.active
            .slice()
            .sort((left, right) => right.group.position.z - left.group.position.z)
            .forEach((platform, index) => {
                if (typeof platform.startLaunchReveal === "function") {
                    platform.startLaunchReveal(index * GAME_CONFIG.launch.platformRevealStagger);
                }
            });
    }

    updateLaunchReveal(delta) {
        this.active.forEach((platform) => {
            if (typeof platform.updateLaunchReveal === "function") {
                platform.updateLaunchReveal(delta);
            }
        });
    }

    spawnNext(score) {
        const farthestZ = this.active.reduce((minZ, platform) => {
            return Math.min(minZ, platform.group.position.z);
        }, 0);
        const travelGap = this.resolveTravelGap(score);
        const z = farthestZ - travelGap;
        const x = this.nextX(score);
        const type = this.chooseType(score);
        const motion = this.resolveMotion(score);

        return this.activatePlatform(type, x, z, motion, travelGap);
    }

    activatePlatform(
        type,
        x,
        z,
        motion = { enabled: false },
        travelGap = Math.abs(GAME_CONFIG.platform.startZ)
    ) {
        const platform = this.pool.find((candidate) => !candidate.active);

        if (!platform) return null;

        platform.activate(type, x, z, this.spawnIndex, motion);
        platform.travelGap = Math.max(0.001, Math.abs(travelGap));
        platform.isCleared = false;
        this.active.push(platform);
        this.spawnIndex += 1;
        this.lastX = x;
        return platform;
    }

    resolveTravelGap(score) {
        const config = GAME_CONFIG.platform;
        const baseGap = Math.abs(config.startZ);
        const progress = clamp(
            (score - config.gapVarianceStartScore) /
                Math.max(1, config.gapVarianceFullScore - config.gapVarianceStartScore),
            0,
            1
        );

        if (progress === 0) return baseGap;

        const variance = progress * config.gapVarianceMax;
        const targetOffset = (this.random() * 2 - 1) * variance;
        const maxStep = Math.min(config.gapVarianceMaxStep, variance);
        this.lastGapOffset += clamp(
            targetOffset - this.lastGapOffset,
            -maxStep,
            maxStep
        );
        this.lastGapOffset = clamp(this.lastGapOffset, -variance, variance);
        return baseGap * (1 + this.lastGapOffset);
    }

    chooseType(score) {
        const roll = this.random();

        if (score < 3) {
            return roll < 0.24 ? "multiplier" : "standard";
        }

        if (score >= 8 && roll < 0.1) return "boost";
        if (score >= 6 && roll < 0.28) return "hazard";
        if (score >= 5 && roll < 0.48) return "narrow";
        if (roll < 0.72) return "multiplier";
        return "standard";
    }

    resolveMotion(score) {
        const start = GAME_CONFIG.platform.motionStartScore;
        const full = GAME_CONFIG.platform.motionFullScore;

        if (score < start) return { enabled: false };

        const progress = clamp((score - start) / Math.max(1, full - start), 0, 1);
        const chance = progress * GAME_CONFIG.platform.motionMaxChance;

        if (this.random() > chance) return { enabled: false };

        return {
            enabled: true,
            amplitude: GAME_CONFIG.platform.motionMinAmplitude +
                ((GAME_CONFIG.platform.motionMaxAmplitude - GAME_CONFIG.platform.motionMinAmplitude) * progress),
            speed: GAME_CONFIG.platform.motionMinSpeed +
                ((GAME_CONFIG.platform.motionMaxSpeed - GAME_CONFIG.platform.motionMinSpeed) * progress),
            phase: this.random() * Math.PI * 2
        };
    }

    nextX(score) {
        const progress = clamp((score - 4) / 42, 0, 1);
        const spread = 4.8 + progress * 3;
        const drift = (this.random() - 0.5) * spread;
        return clamp(this.lastX + drift, -6.5, 6.5);
    }

    update(delta, speed, beatPulse) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const platform = this.active[i];
            platform.update(delta, speed, beatPulse);

            if (platform.group.position.z > GAME_CONFIG.platform.removeZ) {
                platform.deactivate();
                this.active.splice(i, 1);
            }
        }
    }

    generateFirstPlatforms() {
        this.reset();
    }

    generatePlatform(score = 0) {
        return this.spawnNext(score);
    }
}
