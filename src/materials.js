import { COLORS } from "./config";

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

export function createSharedAssets(THREE) {
    const hitTexture = new THREE.TextureLoader().load("src/images/circleGradient.png");

    const geometries = {
        playerCore: new THREE.SphereBufferGeometry(0.72, 32, 32),
        playerShell: new THREE.IcosahedronBufferGeometry(0.98, 1),
        playerRing: new THREE.TorusBufferGeometry(1.1, 0.025, 8, 64),
        pickupCore: new THREE.IcosahedronBufferGeometry(0.34, 1),
        pickupRing: new THREE.TorusBufferGeometry(0.62, 0.018, 8, 40),
        platformPad: new THREE.CylinderBufferGeometry(2, 2, 0.36, 6),
        platformNarrowPad: new THREE.CylinderBufferGeometry(1.35, 1.35, 0.36, 6),
        platformEdge: new THREE.TorusBufferGeometry(2, 0.035, 8, 6),
        platformNarrowEdge: new THREE.TorusBufferGeometry(1.35, 0.035, 8, 6),
        hazardMarker: new THREE.DodecahedronBufferGeometry(0.24, 0),
        shockwave: new THREE.RingBufferGeometry(0.55, 1.55, 48)
    };

    const materials = {
        player: {
            core: standardMaterial(THREE, COLORS.cyan, COLORS.cyan, 1.2),
            shell: standardMaterial(THREE, COLORS.slate, COLORS.cyanDark, 0.45),
            ring: basicGlowMaterial(THREE, COLORS.magenta, 0.92),
            trail: new THREE.PointsMaterial({
                color: COLORS.cyan,
                size: 0.13,
                transparent: true,
                opacity: 0.65,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        },
        platform: {
            standard: standardMaterial(THREE, COLORS.cyanDark, COLORS.cyan, 0.55),
            multiplier: standardMaterial(THREE, COLORS.magenta, COLORS.magenta, 0.8),
            hazard: standardMaterial(THREE, COLORS.red, COLORS.red, 0.85),
            narrow: standardMaterial(THREE, COLORS.green, COLORS.green, 0.72),
            boost: standardMaterial(THREE, COLORS.gold, COLORS.gold, 0.8),
            edge: basicGlowMaterial(THREE, COLORS.white, 0.82),
            pickup: basicGlowMaterial(THREE, COLORS.white, 0.96),
            hazardMarker: basicGlowMaterial(THREE, COLORS.red, 0.9)
        },
        stars: new THREE.PointsMaterial({
            color: 0x99ddff,
            size: 0.16,
            transparent: true,
            opacity: 0.86,
            depthWrite: false
        })
    };

    return {
        geometries,
        materials,
        textures: { hit: hitTexture },
        createShockwaveMaterial(opacity = 0.9, color = COLORS.white) {
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
