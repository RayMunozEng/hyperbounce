import { GAME_CONFIG } from "./config";

export function resolveBounceSpeed(runSpeed, config = GAME_CONFIG) {
    const verticalTravel = (config.player.topY - config.player.startY) * 2;
    const platformGap = Math.abs(config.platform.startZ);

    return runSpeed * (verticalTravel / platformGap);
}
