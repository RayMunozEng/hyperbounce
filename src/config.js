export const COLORS = {
    background: 0x040712,
    cyan: 0x00f5ff,
    cyanDark: 0x005d7a,
    cyanPad: 0x063447,
    magenta: 0xff3df2,
    magentaPad: 0x511a56,
    gold: 0xffc857,
    goldPad: 0x61441e,
    red: 0xff355e,
    redPad: 0x5b1f2d,
    green: 0x52ff9f,
    greenPad: 0x1f5944,
    star: 0x99ddff,
    starDim: 0x3f6f91,
    starGlint: 0xdaf8ff,
    playerCore: 0xff9a58,
    pickupCore: 0x120718,
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
        maxX: 8.5,
        inputSensitivity: 0.026,
        deathFloor: -18
    },
    platform: {
        startY: -3.55,
        startZ: -9.6,
        spawnZ: -43,
        removeZ: 10,
        poolSize: 12,
        openingCount: 3,
        landingZ: 0,
        fadeInStartZ: -62,
        fadeInEndZ: -10,
        baseRadius: 2,
        narrowRadius: 1.35,
        pickupRadius: 0.58,
        idleEmissiveIntensity: 0.012,
        hitEmissiveIntensity: 0.045,
        colorCycleStartSpeed: 0.34,
        gapVarianceStartScore: 0,
        gapVarianceFullScore: 22,
        gapVarianceMax: 0.28,
        gapVarianceMaxStep: 0.1,
        motionStartScore: 18,
        motionFullScore: 46,
        motionMaxChance: 0.62,
        motionMinAmplitude: 0.42,
        motionMaxAmplitude: 1.05,
        motionMinSpeed: 0.34,
        motionMaxSpeed: 0.72
    },
    run: {
        baseSpeed: 0.255,
        speedGain: 0.0009,
        maxSpeed: 0.72,
        baseScore: 1,
        boostBonus: 5
    },
    launch: {
        platformRevealSeconds: 0.72,
        platformRevealStagger: 0.055,
        teleportSeconds: 0.68,
        introSeconds: 1.25,
        countdownSeconds: 3
    },
    stars: {
        count: 1550,
        spread: 120,
        depth: 110,
        size: 0.16,
        speedScale: 22
    },
    spaceTraffic: {
        count: 8,
        depth: 120,
        frontZ: 20,
        minSideX: 22,
        sideSpread: 20,
        verticalSpread: 24
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
        resetsMultiplier: false,
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
    launching: "launching",
    playing: "playing",
    gameOver: "game-over"
};
