import { COLORS, GAME_CONFIG } from "./config";

function standardMaterial(THREE, color, emissive = color, intensity = 0.7) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: intensity,
        metalness: 0.35,
        roughness: 0.28
    });
}

function basicGlowMaterial(THREE, color, opacity = 1) {
    return new THREE.MeshBasicMaterial({
        color,
        opacity,
        transparent: opacity < 1,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
    });
}

function solidMaterial(THREE, color, opacity = 1) {
    return new THREE.MeshBasicMaterial({
        color,
        opacity,
        transparent: opacity < 1,
        side: THREE.DoubleSide,
        depthWrite: true
    });
}

function pickupCoreMaterial(THREE) {
    return solidMaterial(THREE, COLORS.pickupCore);
}

function drawStarStreak(context, size, rotation, length, thickness, color) {
    const center = size / 2;

    context.save();
    context.translate(center, center);
    context.rotate(rotation);
    context.fillStyle = color;
    context.fillRect(-length / 2, -thickness / 2, length, thickness);
    context.restore();
}

export function createStarSpriteTexture(THREE) {
    const doc = typeof document === "undefined" ? null : document;

    if (!doc || typeof doc.createElement !== "function") return null;

    const size = 64;
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext && canvas.getContext("2d");

    if (!context) return null;

    canvas.width = size;
    canvas.height = size;
    context.clearRect(0, 0, size, size);
    context.globalCompositeOperation = "lighter";

    drawStarStreak(context, size, 0, 58, 2.2, "rgba(255, 255, 255, 0.82)");
    drawStarStreak(context, size, Math.PI / 2, 58, 2.2, "rgba(255, 255, 255, 0.74)");
    drawStarStreak(context, size, Math.PI / 4, 34, 1.4, "rgba(0, 245, 255, 0.38)");
    drawStarStreak(context, size, -Math.PI / 4, 34, 1.4, "rgba(255, 61, 242, 0.28)");

    const core = context.createRadialGradient(32, 32, 0, 32, 32, 31);
    core.addColorStop(0, "rgba(255, 255, 255, 1)");
    core.addColorStop(0.18, "rgba(218, 248, 255, 0.95)");
    core.addColorStop(0.38, "rgba(0, 245, 255, 0.48)");
    core.addColorStop(0.64, "rgba(255, 61, 242, 0.18)");
    core.addColorStop(1, "rgba(255, 61, 242, 0)");
    context.fillStyle = core;
    context.beginPath();
    context.arc(32, 32, 31, 0, Math.PI * 2);
    context.fill();

    const TextureClass = THREE.CanvasTexture || THREE.Texture;
    if (!TextureClass) return null;

    const texture = new TextureClass(canvas);
    texture.needsUpdate = true;
    texture.userData = Object.assign({}, texture.userData, {
        style: "intro-star-glint"
    });
    return texture;
}

function starMaterial(THREE, color, size, opacity, spriteTexture) {
    const material = new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity,
        map: spriteTexture || undefined,
        alphaTest: spriteTexture ? 0.02 : 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    material.userData = Object.assign({}, material.userData, {
        style: "intro-star-glint"
    });
    return material;
}

export function createSharedAssets(THREE) {
    const hitTexture = new THREE.TextureLoader().load("src/images/circleGradient.png");
    const starTexture = createStarSpriteTexture(THREE);

    const geometries = {
        playerCore: new THREE.SphereBufferGeometry(0.72, 32, 32),
        playerShell: new THREE.IcosahedronBufferGeometry(0.98, 1),
        playerRing: new THREE.TorusBufferGeometry(1.1, 0.04, 8, 64),
        pickupCore: new THREE.IcosahedronBufferGeometry(0.34, 1),
        pickupRing: new THREE.TorusBufferGeometry(0.66, 0.026, 8, 48),
        pickupGlint: new THREE.CylinderBufferGeometry(0.028, 0.028, 1.22, 8, 1, true),
        platformPad: new THREE.CylinderBufferGeometry(2, 2, 0.36, 6),
        platformNarrowPad: new THREE.CylinderBufferGeometry(1.35, 1.35, 0.36, 6),
        platformOrbitBand: new THREE.TorusBufferGeometry(2, 0.065, 10, 6),
        platformNarrowOrbitBand: new THREE.TorusBufferGeometry(1.35, 0.06, 10, 6),
        platformOrbitBandHalo: new THREE.TorusBufferGeometry(2, 0.13, 10, 6),
        platformNarrowOrbitBandHalo: new THREE.TorusBufferGeometry(1.35, 0.11, 10, 6),
        platformTopRail: new THREE.CylinderBufferGeometry(0.044, 0.044, 3.18, 12, 1, true),
        platformTopRailHalo: new THREE.CylinderBufferGeometry(0.09, 0.09, 3.28, 12, 1, true),
        platformBeacon: new THREE.CylinderBufferGeometry(0.045, 0.045, 3.2, 10, 1, true),
        hazardMarker: new THREE.DodecahedronBufferGeometry(0.24, 0),
        shockwave: new THREE.RingBufferGeometry(0.55, 1.55, 48)
    };

    const materials = {
        player: {
            core: standardMaterial(THREE, COLORS.playerCore, COLORS.gold, 0.08),
            shell: standardMaterial(THREE, COLORS.playerCore, COLORS.gold, 0.06),
            ring: basicGlowMaterial(THREE, COLORS.cyan, 0.9),
            ringAlt: basicGlowMaterial(THREE, COLORS.magenta, 0.86),
            wake: basicGlowMaterial(THREE, COLORS.starGlint, 0.12),
            trail: new THREE.PointsMaterial({
                color: COLORS.cyan,
                size: 0.1,
                transparent: true,
                opacity: 0.32,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        },
        platform: {
            standard: standardMaterial(THREE, COLORS.slate, COLORS.cyanDark, GAME_CONFIG.platform.idleEmissiveIntensity),
            multiplier: standardMaterial(THREE, COLORS.magentaPad, COLORS.magenta, GAME_CONFIG.platform.idleEmissiveIntensity),
            hazard: standardMaterial(THREE, COLORS.redPad, COLORS.red, GAME_CONFIG.platform.idleEmissiveIntensity),
            narrow: standardMaterial(THREE, COLORS.greenPad, COLORS.green, GAME_CONFIG.platform.idleEmissiveIntensity),
            boost: standardMaterial(THREE, COLORS.goldPad, COLORS.gold, GAME_CONFIG.platform.idleEmissiveIntensity),
            orbitBand: basicGlowMaterial(THREE, COLORS.cyan, 0.72),
            orbitBandHalo: basicGlowMaterial(THREE, COLORS.cyan, 0.32),
            topRail: basicGlowMaterial(THREE, COLORS.cyan, 0.34),
            topRailHalo: basicGlowMaterial(THREE, COLORS.cyan, 0.2),
            beacon: basicGlowMaterial(THREE, COLORS.cyan, 0.18),
            pickup: basicGlowMaterial(THREE, COLORS.white, 0.82),
            pickupCore: pickupCoreMaterial(THREE),
            pickupRing: solidMaterial(THREE, COLORS.gold),
            pickupGlint: basicGlowMaterial(THREE, COLORS.cyan, 0.42),
            hazardMarker: basicGlowMaterial(THREE, COLORS.red, 0.68)
        },
        stars: {
            far: starMaterial(THREE, COLORS.starDim, 0.13, 0.46, starTexture),
            near: starMaterial(THREE, COLORS.star, 0.22, 0.72, starTexture),
            glint: starMaterial(THREE, COLORS.starGlint, 0.42, 0.95, starTexture)
        }
    };

    return {
        geometries,
        materials,
        textures: { hit: hitTexture, star: starTexture },
        createShockwaveMaterial(opacity = 0.28, color = COLORS.cyan) {
            return new THREE.MeshBasicMaterial({
                color,
                map: hitTexture,
                opacity,
                transparent: true,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false
            });
        }
    };
}
