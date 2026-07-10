import { GAME_CONFIG } from "./config";

function positiveNumber(value, fallback) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function resolveBounceSpeed(
    runSpeed,
    platformGap = Math.abs(GAME_CONFIG.platform.startZ),
    config = GAME_CONFIG
) {
    const verticalTravel = (config.player.topY - config.player.startY) * 2;
    const resolvedGap = Number(platformGap) > 0 ?
        Number(platformGap) :
        Math.abs(config.platform.startZ);

    return runSpeed * (verticalTravel / resolvedGap);
}

export function resolvePlatformBouncePhase(
    platformZ,
    platformGap = Math.abs(GAME_CONFIG.platform.startZ),
    landingZ = GAME_CONFIG.platform.landingZ
) {
    const gap = positiveNumber(platformGap, Math.abs(GAME_CONFIG.platform.startZ));
    const z = Number.isFinite(Number(platformZ)) ? Number(platformZ) : landingZ - gap;

    return 1 + ((z - landingZ) / gap);
}

export function resolveBounceHeight(phase, config = GAME_CONFIG) {
    const startY = config.player.startY;
    const height = config.player.topY - startY;
    const cycle = ((Number(phase) % 1) + 1) % 1;
    const triangle = cycle <= 0.5 ? cycle * 2 : (1 - cycle) * 2;

    return startY + (height * triangle);
}
