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

        for (let i = 0; i < GAME_CONFIG.platform.poolSize; i++) {
            this.pool.push(new PlatformClass({ THREE, scene, assets }));
        }
    }

    reset() {
        this.pool.forEach((platform) => platform.deactivate());
        this.active.length = 0;
        this.spawnIndex = 0;
        this.lastX = 0;
        this.activatePlatform("standard", 0, 0);
        this.activatePlatform("standard", 0, GAME_CONFIG.platform.startZ);
    }

    current() {
        return this.active.find((platform) => !platform.isCleared);
    }

    spawnNext(score) {
        const farthestZ = this.active.reduce((minZ, platform) => {
            return Math.min(minZ, platform.group.position.z);
        }, 0);
        const z = Math.min(GAME_CONFIG.platform.spawnZ, farthestZ - 10);
        const x = this.nextX(score);
        const type = this.chooseType(score);

        return this.activatePlatform(type, x, z);
    }

    activatePlatform(type, x, z) {
        const platform = this.pool.find((candidate) => !candidate.active);

        if (!platform) return null;

        platform.activate(type, x, z, this.spawnIndex);
        platform.isCleared = false;
        this.active.push(platform);
        this.spawnIndex += 1;
        this.lastX = x;
        return platform;
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

    nextX(score) {
        const spread = score < 4 ? 4.8 : 6.8;
        const drift = (this.random() - 0.5) * spread;
        return clamp(this.lastX + drift, -6.5, 6.5);
    }

    update(delta, speed) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const platform = this.active[i];
            platform.update(delta, speed);

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
