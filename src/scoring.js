import { GAME_CONFIG, PLATFORM_TYPES } from "./config";

export function resolveLandingScore({ score, multiplier, platformType, hitPickup }) {
    const config = PLATFORM_TYPES[platformType] || PLATFORM_TYPES.standard;
    let nextMultiplier = multiplier;
    let resetMultiplier = false;

    if (config.pickup) {
        if (hitPickup) {
            nextMultiplier += 1;
        } else {
            nextMultiplier = 1;
            resetMultiplier = true;
        }
    }

    if (config.resetsMultiplier) {
        nextMultiplier = 1;
        resetMultiplier = true;
    }

    const bonus = config.bonus || 0;

    return {
        score: score + (config.resetsMultiplier ? GAME_CONFIG.run.baseScore : nextMultiplier) + bonus,
        multiplier: nextMultiplier,
        resetMultiplier,
        bonus
    };
}
