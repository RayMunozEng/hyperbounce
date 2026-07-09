export const COLORS = {
    background: 0x040712,
    cyan: 0x00f5ff,
    cyanDark: 0x005d7a,
    magenta: 0xff3df2,
    gold: 0xffc857,
    red: 0xff355e,
    green: 0x52ff9f,
    star: 0x99ddff,
    white: 0xffffff,
    slate: 0x15233f
};

export const GAME_CONFIG = {
    camera: {
        fov: 78,
        start: { x: 0, y: 2.2, z: 10 },
        tilt: -0.35,
        followLerp: 0.055
    },
    player: {
        startY: -2.5,
        topY: 2.55,
        radius: 0.9,
        bounceSpeed: 0.3,
        maxX: 8.5,
        inputSensitivity: 0.026,
        deathFloor: -18
    },
    platform: {
        startY: -3.55,
        startZ: -8.6,
        spawnZ: -18,
        removeZ: 10,
        poolSize: 12,
        openingCount: 3,
        landingZ: 0,
        baseRadius: 2,
        narrowRadius: 1.35,
        pickupRadius: 0.58
    },
    run: {
        baseSpeed: 0.255,
        speedGain: 0.0012,
        maxSpeed: 0.72,
        baseScore: 1,
        boostBonus: 5
    },
    stars: {
        count: 900,
        spread: 120,
        depth: 110,
        size: 0.16,
        speedScale: 22
    }
};

export const PLATFORM_TYPES = {
    standard: {
        label: "Standard",
        radius: GAME_CONFIG.platform.baseRadius,
        color: COLORS.cyan,
        emissive: COLORS.cyanDark,
        pickup: false,
        resetsMultiplier: false,
        bonus: 0
    },
    multiplier: {
        label: "Multiplier",
        radius: GAME_CONFIG.platform.baseRadius,
        color: COLORS.magenta,
        emissive: COLORS.magenta,
        pickup: true,
        resetsMultiplier: false,
        bonus: 0
    },
    hazard: {
        label: "Hazard",
        radius: GAME_CONFIG.platform.baseRadius,
        color: COLORS.red,
        emissive: COLORS.red,
        pickup: false,
        resetsMultiplier: true,
        bonus: 0
    },
    narrow: {
        label: "Narrow",
        radius: GAME_CONFIG.platform.narrowRadius,
        color: COLORS.green,
        emissive: COLORS.green,
        pickup: false,
        resetsMultiplier: false,
        bonus: 0
    },
    boost: {
        label: "Boost",
        radius: GAME_CONFIG.platform.baseRadius,
        color: COLORS.gold,
        emissive: COLORS.gold,
        pickup: false,
        resetsMultiplier: false,
        bonus: GAME_CONFIG.run.boostBonus
    }
};

export const UI_STATES = {
    start: "start",
    playing: "playing",
    gameOver: "game-over"
};
