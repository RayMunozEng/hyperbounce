import { COLORS, GAME_CONFIG, PLATFORM_TYPES } from "./config";
import { createSharedAssets } from "./materials";

const IMPACT_FEEDBACK_SECONDS = 0.38;
const IMPACT_SHOCKWAVE_OPACITY = 0.12;
const IMPACT_AFTERGLOW_OPACITY = 0.028;
const DANGER_SHOCKWAVE_OPACITY = 0.17;
const DANGER_AFTERGLOW_OPACITY = 0.045;
const PICKUP_BASE_Y = 1.2;
const PICKUP_CORE_SCALE = 0.92;
const PICKUP_RING_BASE_SCALE = 1.12;
const PICKUP_GLINT_BASE_SCALE = 1;
const TOP_RAIL_BEAT_OPACITY_BOOST = 1.22;
const TOP_RAIL_BEAT_HALO_BOOST = 2.15;
const TOP_RAIL_LANDING_OPACITY_BOOST = 1.1;
const TOP_RAIL_LANDING_HALO_BOOST = 2.35;
const PLATFORM_COLOR_HUES = {
    standard: 0.53,
    multiplier: 0.84,
    hazard: 0.96,
    narrow: 0.39,
    boost: 0.12
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
}

function smoothStep(value) {
    return value * value * (3 - (2 * value));
}

export function resolvePlatformFade(z) {
    const startZ = GAME_CONFIG.platform.fadeInStartZ;
    const endZ = GAME_CONFIG.platform.fadeInEndZ;

    if (startZ === undefined || endZ === undefined || startZ === endZ) return 1;
    if (z <= startZ) return 0;
    if (z >= endZ) return 1;

    return smoothStep(clamp((z - startZ) / (endZ - startZ), 0, 1));
}

function setUniformScale(object, scale) {
    object.scale.set(scale, scale, scale);
}

function setMaterialColor(material, color) {
    if (material.color && typeof material.color.setHex === "function") {
        material.color.setHex(color);
        return;
    }

    material.color = color;
}

function setMaterialHsl(material, hue, saturation, lightness) {
    if (!material || !material.color || typeof material.color.setHSL !== "function") return;

    material.color.setHSL(hue, saturation, lightness);
}

function setMaterialEmissiveHsl(material, hue, saturation, lightness) {
    if (!material || !material.emissive || typeof material.emissive.setHSL !== "function") return;

    material.emissive.setHSL(hue, saturation, lightness);
}

function cloneMaterial(material) {
    return material && typeof material.clone === "function" ? material.clone() : material;
}

function getBaseOpacity(material) {
    if (!material) return 1;

    const userData = material.userData || {};
    if (typeof userData.baseOpacity === "number") return userData.baseOpacity;
    if (typeof material.opacity === "number") return material.opacity;
    return 1;
}

function createFadeMaterial(material) {
    const fadeMaterial = cloneMaterial(material);

    if (!fadeMaterial) return fadeMaterial;

    fadeMaterial.userData = Object.assign({}, fadeMaterial.userData, {
        baseOpacity: getBaseOpacity(fadeMaterial)
    });
    fadeMaterial.transparent = true;
    return fadeMaterial;
}

function promoteGlowLayer(mesh, renderOrder) {
    mesh.renderOrder = renderOrder;

    if (!mesh.material) return;

    mesh.material.depthTest = true;
    mesh.material.depthWrite = false;
}

function setFadeOpacity(material, fade, opacity = getBaseOpacity(material)) {
    if (!material) return;

    material.opacity = opacity * fade;
}

function setEmissiveIntensity(material, intensity) {
    if (!material) return;

    material.emissiveIntensity = intensity;
}

function resolveBeatPulse(beatPulse = {}) {
    return {
        intensity: clamp(Number(beatPulse.intensity) || 0, 0, 1),
        tempo: clamp(Number(beatPulse.tempo) || 1, 0.6, 3)
    };
}

export default class Platform {
    constructor(options = {}) {
        const browserWindow = typeof window === "undefined" ? {} : window;
        const THREE = options.THREE || browserWindow.THREE;
        const scene = options.scene || (browserWindow.game && browserWindow.game.scene);
        const assets = options.assets || createSharedAssets(THREE);

        this.THREE = THREE;
        this.assets = assets;
        this.group = new THREE.Group();
        this.group.visible = false;
        this.active = false;
        this.type = "standard";
        this.radius = GAME_CONFIG.platform.baseRadius;
        this.pickupOffset = 0;
        this.feedbackTimer = 0;
        this.shockwaveMaxOpacity = IMPACT_SHOCKWAVE_OPACITY;
        this.afterglowMaxOpacity = IMPACT_AFTERGLOW_OPACITY;
        this.beaconPhase = 0;
        this.beaconOpacity = 0;
        this.orbitBandOpacity = 0;
        this.orbitBandHaloOpacity = 0;
        this.topRailOpacity = 0;
        this.topRailHaloOpacity = 0;
        this.topRailLengthScale = 1;
        this.topRailPulse = resolveBeatPulse();
        this.visualFade = 1;
        this.launchReveal = 1;
        this.launchRevealDelay = 0;
        this.launchRevealTimer = 0;
        this.colorCycle = {
            phase: 0,
            baseHue: PLATFORM_COLOR_HUES.standard
        };
        this.motion = this.createStationaryMotion(0);

        this.pad = new THREE.Mesh(
            assets.geometries.platformPad,
            createFadeMaterial(assets.materials.platform.standard)
        );
        this.orbitBandHalo = new THREE.Mesh(
            assets.geometries.platformOrbitBandHalo,
            createFadeMaterial(assets.materials.platform.orbitBandHalo)
        );
        this.orbitBand = new THREE.Mesh(
            assets.geometries.platformOrbitBand,
            createFadeMaterial(assets.materials.platform.orbitBand)
        );
        this.topRailGroup = new THREE.Group();
        this.topRailHalo = new THREE.Mesh(
            assets.geometries.platformTopRailHalo,
            createFadeMaterial(assets.materials.platform.topRailHalo)
        );
        this.topRail = new THREE.Mesh(
            assets.geometries.platformTopRail,
            createFadeMaterial(assets.materials.platform.topRail)
        );
        this.topRailCrossHalo = new THREE.Mesh(
            assets.geometries.platformTopRailHalo,
            createFadeMaterial(assets.materials.platform.topRailHalo)
        );
        this.topRailCross = new THREE.Mesh(
            assets.geometries.platformTopRail,
            createFadeMaterial(assets.materials.platform.topRail)
        );
        this.pickup = this.createPickup();
        this.beaconMaterial = createFadeMaterial(assets.materials.platform.beacon);
        this.beacon = new THREE.Mesh(
            assets.geometries.platformBeacon,
            this.beaconMaterial
        );
        this.hazard = new THREE.Mesh(
            assets.geometries.hazardMarker,
            createFadeMaterial(assets.materials.platform.hazardMarker)
        );
        this.shockwave = new THREE.Mesh(
            assets.geometries.shockwave,
            assets.createShockwaveMaterial()
        );
        this.impactAfterglow = new THREE.Mesh(
            assets.geometries.shockwave,
            assets.createShockwaveMaterial(0.24, COLORS.star)
        );

        this.orbitBand.rotation.x = Math.PI / 2;
        this.orbitBandHalo.rotation.x = Math.PI / 2;
        this.orbitBand.position.y = 0.1;
        this.orbitBandHalo.position.y = 0.08;
        this.topRail.rotation.z = Math.PI / 2;
        this.topRailHalo.rotation.z = Math.PI / 2;
        this.topRailCross.rotation.x = Math.PI / 2;
        this.topRailCrossHalo.rotation.x = Math.PI / 2;
        this.topRail.position.y = 0.28;
        this.topRailHalo.position.y = 0.27;
        this.topRailCross.position.y = 0.28;
        this.topRailCrossHalo.position.y = 0.27;
        this.pad.renderOrder = 0;
        this.topRailHalo.renderOrder = 2;
        this.topRail.renderOrder = 3;
        this.topRailCrossHalo.renderOrder = 2;
        this.topRailCross.renderOrder = 3;
        promoteGlowLayer(this.orbitBandHalo, 6);
        promoteGlowLayer(this.orbitBand, 7);
        this.pickup.position.y = PICKUP_BASE_Y;
        this.beacon.position.y = 1.95;
        this.hazard.position.y = 0.58;
        this.shockwave.position.y = 0.23;
        this.shockwave.rotation.x = Math.PI / 2;
        this.shockwave.visible = false;
        this.impactAfterglow.position.y = 0.18;
        this.impactAfterglow.rotation.x = Math.PI / 2;
        this.impactAfterglow.visible = false;

        this.group.add(this.pad);
        this.group.add(this.orbitBandHalo);
        this.group.add(this.orbitBand);
        this.topRailGroup.add(this.topRailHalo);
        this.topRailGroup.add(this.topRail);
        this.topRailGroup.add(this.topRailCrossHalo);
        this.topRailGroup.add(this.topRailCross);
        this.group.add(this.topRailGroup);
        this.group.add(this.pickup);
        this.group.add(this.beacon);
        this.group.add(this.hazard);
        this.group.add(this.impactAfterglow);
        this.group.add(this.shockwave);
        this.group.position.y = GAME_CONFIG.platform.startY;
        if (scene) scene.add(this.group);
    }

    setPadBrightness(blend = 0) {
        const idle = GAME_CONFIG.platform.idleEmissiveIntensity;
        const hit = GAME_CONFIG.platform.hitEmissiveIntensity;
        const clampedBlend = Math.max(0, Math.min(1, blend));

        setEmissiveIntensity(this.pad.material, idle + (hit - idle) * clampedBlend);
    }

    assignPadMaterial(type) {
        const sourceMaterial = this.assets.materials.platform[type] ||
            this.assets.materials.platform.standard;

        this.pad.material = createFadeMaterial(sourceMaterial);
        this.setPadBrightness(0);
    }

    fadeMaterials() {
        return [
            this.pad.material,
            this.orbitBand.material,
            this.orbitBandHalo.material,
            this.topRail.material,
            this.topRailHalo.material,
            this.topRailCross.material,
            this.topRailCrossHalo.material,
            this.beaconMaterial,
            this.hazard.material,
            this.pickup.core.material,
            this.pickup.ring.material,
            this.pickup.glint.material
        ];
    }

    applyVisibilityFade() {
        this.visualFade = resolvePlatformFade(this.group.position.z) * this.launchReveal;

        this.fadeMaterials().forEach((material) => {
            if (
                material === this.orbitBand.material ||
                material === this.orbitBandHalo.material ||
                material === this.topRail.material ||
                material === this.topRailHalo.material ||
                material === this.topRailCross.material ||
                material === this.topRailCrossHalo.material ||
                material === this.beaconMaterial
            ) {
                return;
            }

            setFadeOpacity(material, this.visualFade);
        });
        setFadeOpacity(this.orbitBand.material, this.visualFade, this.orbitBandOpacity || getBaseOpacity(this.orbitBand.material));
        setFadeOpacity(this.orbitBandHalo.material, this.visualFade, this.orbitBandHaloOpacity || getBaseOpacity(this.orbitBandHalo.material));
        setFadeOpacity(this.topRail.material, this.visualFade, this.topRailOpacity || getBaseOpacity(this.topRail.material));
        setFadeOpacity(this.topRailHalo.material, this.visualFade, this.topRailHaloOpacity || getBaseOpacity(this.topRailHalo.material));
        setFadeOpacity(this.topRailCross.material, this.visualFade, this.topRailOpacity || getBaseOpacity(this.topRailCross.material));
        setFadeOpacity(this.topRailCrossHalo.material, this.visualFade, this.topRailHaloOpacity || getBaseOpacity(this.topRailCrossHalo.material));
        setFadeOpacity(this.beaconMaterial, this.visualFade, this.beaconOpacity);
    }

    setTopRailScale(pulseScale = 1) {
        const lengthScale = this.topRailLengthScale * pulseScale;

        this.topRail.scale.set(1, lengthScale, 1);
        this.topRailHalo.scale.set(1, lengthScale, 1);
        this.topRailCross.scale.set(1, lengthScale, 1);
        this.topRailCrossHalo.scale.set(1, lengthScale, 1);
    }

    resolveTopRailLandingBoost() {
        if (this.feedbackTimer <= 0) return 0;

        return Math.pow(clamp(this.feedbackTimer / IMPACT_FEEDBACK_SECONDS, 0, 1), 0.48);
    }

    refreshTopRailGlow(beatPulse = this.topRailPulse, landingBoost = this.resolveTopRailLandingBoost()) {
        const pulse = resolveBeatPulse(beatPulse);
        const railRhythm = 0.68 + (Math.sin((this.beaconPhase * 0.82) + this.colorCycle.phase) + 1) * 0.06;
        const haloRhythm = 0.52 + (Math.sin((this.beaconPhase * 0.66) + this.colorCycle.phase) + 1) * 0.1;

        this.topRailOpacity = clamp(
            getBaseOpacity(this.topRail.material) *
                (railRhythm + pulse.intensity * TOP_RAIL_BEAT_OPACITY_BOOST +
                    landingBoost * TOP_RAIL_LANDING_OPACITY_BOOST),
            0,
            1
        );
        this.topRailHaloOpacity = clamp(
            getBaseOpacity(this.topRailHalo.material) *
                (haloRhythm + pulse.intensity * TOP_RAIL_BEAT_HALO_BOOST +
                    landingBoost * TOP_RAIL_LANDING_HALO_BOOST),
            0,
            1
        );
    }

    createPickup() {
        const pickup = new this.THREE.Group();
        const core = new this.THREE.Mesh(
            this.assets.geometries.pickupCore,
            createFadeMaterial(this.assets.materials.platform.pickupCore || this.assets.materials.platform.pickup)
        );
        const ring = new this.THREE.Mesh(
            this.assets.geometries.pickupRing,
            createFadeMaterial(this.assets.materials.platform.pickupRing || this.assets.materials.platform.pickup)
        );
        const glint = new this.THREE.Mesh(
            this.assets.geometries.pickupGlint || this.assets.geometries.pickupRing,
            createFadeMaterial(this.assets.materials.platform.pickupGlint || this.assets.materials.platform.pickup)
        );

        ring.rotation.z = Math.PI / 8;
        glint.position.y = 0.08;
        setUniformScale(core, PICKUP_CORE_SCALE);
        setUniformScale(ring, PICKUP_RING_BASE_SCALE);
        glint.scale.set(PICKUP_GLINT_BASE_SCALE, PICKUP_GLINT_BASE_SCALE, PICKUP_GLINT_BASE_SCALE);
        pickup.add(core);
        pickup.add(ring);
        pickup.add(glint);
        pickup.visible = false;
        pickup.core = core;
        pickup.ring = ring;
        pickup.glint = glint;
        return pickup;
    }

    resetPickupVisuals() {
        this.pickup.position.y = PICKUP_BASE_Y;
        this.pickup.rotation.y = 0;
        this.pickup.core.rotation.y = 0;
        this.pickup.ring.rotation.x = 0;
        this.pickup.ring.rotation.y = 0;
        this.pickup.ring.rotation.z = Math.PI / 8;
        this.pickup.glint.rotation.y = 0;
        setUniformScale(this.pickup.core, PICKUP_CORE_SCALE);
        setUniformScale(this.pickup.ring, PICKUP_RING_BASE_SCALE);
        this.pickup.glint.scale.set(PICKUP_GLINT_BASE_SCALE, PICKUP_GLINT_BASE_SCALE, PICKUP_GLINT_BASE_SCALE);
    }

    createStationaryMotion(originX) {
        return {
            enabled: false,
            originX,
            amplitude: 0,
            speed: 0,
            phase: 0
        };
    }

    configureMotion(x, motion = {}) {
        if (!motion.enabled) {
            this.motion = this.createStationaryMotion(x);
            return;
        }

        this.motion = {
            enabled: true,
            originX: x,
            amplitude: motion.amplitude,
            speed: motion.speed,
            phase: motion.phase || 0
        };
    }

    updateMotion(delta) {
        if (!this.motion.enabled || this.isCleared) return;

        this.motion.phase += delta * this.motion.speed;
        this.group.position.x = this.motion.originX + (Math.sin(this.motion.phase) * this.motion.amplitude);
    }

    activate(type, x, z, index = 0, motion = {}) {
        const config = PLATFORM_TYPES[type] || PLATFORM_TYPES.standard;
        const isNarrow = type === "narrow";

        this.active = true;
        this.isCleared = false;
        this.type = type;
        this.radius = config.radius;
        this.pickupOffset = config.pickup ? ((index % 3) - 1) * 0.78 : 0;
        this.feedbackTimer = 0;
        this.beaconPhase = index * 0.55;
        this.launchReveal = 1;
        this.launchRevealDelay = 0;
        this.launchRevealTimer = 0;
        this.colorCycle.phase = index * 0.37;
        this.colorCycle.baseHue = PLATFORM_COLOR_HUES[type] || PLATFORM_COLOR_HUES.standard;
        this.topRailPulse = resolveBeatPulse();
        this.topRailLengthScale = config.radius / GAME_CONFIG.platform.baseRadius;
        this.group.visible = true;
        this.group.position.set(x, GAME_CONFIG.platform.startY, z);
        this.group.scale.set(1, 1, 1);
        this.configureMotion(x, motion);
        this.pad.geometry = isNarrow ?
            this.assets.geometries.platformNarrowPad :
            this.assets.geometries.platformPad;
        this.orbitBand.geometry = isNarrow ?
            this.assets.geometries.platformNarrowOrbitBand :
            this.assets.geometries.platformOrbitBand;
        this.orbitBandHalo.geometry = isNarrow ?
            this.assets.geometries.platformNarrowOrbitBandHalo :
            this.assets.geometries.platformOrbitBandHalo;
        this.assignPadMaterial(type);
        this.pickup.visible = config.pickup;
        this.pickup.position.x = this.pickupOffset;
        this.resetPickupVisuals();
        this.beacon.visible = true;
        setMaterialColor(this.beaconMaterial, config.color);
        setMaterialColor(this.orbitBand.material, config.color);
        setMaterialColor(this.orbitBandHalo.material, config.color);
        setMaterialColor(this.topRail.material, config.color);
        setMaterialColor(this.topRailHalo.material, config.color);
        setMaterialColor(this.topRailCross.material, config.color);
        setMaterialColor(this.topRailCrossHalo.material, config.color);
        this.beaconOpacity = getBaseOpacity(this.beaconMaterial);
        this.orbitBandOpacity = getBaseOpacity(this.orbitBand.material);
        this.orbitBandHaloOpacity = getBaseOpacity(this.orbitBandHalo.material);
        this.topRailOpacity = getBaseOpacity(this.topRail.material);
        this.topRailHaloOpacity = getBaseOpacity(this.topRailHalo.material);
        this.refreshTopRailGlow();
        this.beaconMaterial.opacity = this.beaconOpacity;
        this.orbitBand.material.opacity = this.orbitBandOpacity;
        this.orbitBandHalo.material.opacity = this.orbitBandHaloOpacity;
        this.topRail.material.opacity = this.topRailOpacity;
        this.topRailHalo.material.opacity = this.topRailHaloOpacity;
        this.topRailCross.material.opacity = this.topRailOpacity;
        this.topRailCrossHalo.material.opacity = this.topRailHaloOpacity;
        this.beacon.scale.set(
            config.radius / GAME_CONFIG.platform.baseRadius,
            0.68,
            config.radius / GAME_CONFIG.platform.baseRadius
        );
        this.hazard.visible = config.resetsMultiplier;
        this.shockwave.visible = false;
        this.shockwave.material.opacity = 0;
        this.impactAfterglow.visible = false;
        this.impactAfterglow.material.opacity = 0;
        this.shockwave.scale.set(0.45, 0.45, 0.45);
        this.impactAfterglow.scale.set(0.65, 0.65, 0.65);
        this.pad.scale.set(1, 1, 1);
        this.orbitBand.scale.set(1, 1, 1);
        this.orbitBandHalo.scale.set(1, 1, 1);
        this.topRailGroup.rotation.y = 0;
        this.setTopRailScale(1);
        this.applyVisibilityFade();
    }

    startLaunchReveal(delay = 0) {
        this.launchReveal = 0;
        this.launchRevealDelay = Math.max(0, delay);
        this.launchRevealTimer = 0;
        this.group.visible = true;
        this.group.position.y = GAME_CONFIG.platform.startY - 0.42;
        this.group.scale.set(0.72, 0.72, 0.72);
        this.applyVisibilityFade();
    }

    updateLaunchReveal(delta) {
        if (!this.active || this.launchReveal >= 1) return;

        if (this.launchRevealDelay > 0) {
            this.launchRevealDelay = Math.max(0, this.launchRevealDelay - delta);
            return;
        }

        this.launchRevealTimer = Math.min(
            GAME_CONFIG.launch.platformRevealSeconds,
            this.launchRevealTimer + delta
        );

        const progress = this.launchRevealTimer / GAME_CONFIG.launch.platformRevealSeconds;
        const eased = easeOutCubic(progress);
        const scale = 0.72 + eased * 0.28;

        this.launchReveal = eased;
        this.group.position.y = GAME_CONFIG.platform.startY - ((1 - eased) * 0.42);
        this.group.scale.set(scale, scale, scale);
        this.applyVisibilityFade();

        if (progress >= 1) {
            this.launchReveal = 1;
            this.group.position.y = GAME_CONFIG.platform.startY;
            this.group.scale.set(1, 1, 1);
            this.applyVisibilityFade();
        }
    }

    deactivate() {
        this.active = false;
        this.group.visible = false;
        this.pickup.visible = false;
        this.beacon.visible = false;
        this.hazard.visible = false;
        this.shockwave.visible = false;
        this.impactAfterglow.visible = false;
        this.launchReveal = 1;
        this.group.scale.set(1, 1, 1);
    }

    setVisible(isVisible) {
        if (!this.active) return;

        this.group.visible = isVisible;
    }

    update(delta, speed, beatPulse = {}) {
        if (!this.active) return;

        const frameScale = Math.min(delta * 60, 2);
        const topRailPulse = resolveBeatPulse(beatPulse);
        this.group.position.z += speed * frameScale;
        this.updateMotion(delta);
        this.updateColorCycle(delta, speed);
        this.orbitBand.rotation.z += 0.028 * frameScale;
        this.orbitBandHalo.rotation.z += 0.018 * frameScale;
        this.topRailPulse = topRailPulse;
        this.topRailGroup.rotation.y += (0.008 + topRailPulse.tempo * 0.009) * frameScale;
        if (this.pickup.visible) {
            const pulse = 1 + Math.sin(this.beaconPhase * 1.65) * 0.055;
            const bob = Math.sin(this.beaconPhase * 1.35) * 0.055;

            this.pickup.position.y = PICKUP_BASE_Y + bob;
            this.pickup.core.rotation.y += 0.04 * frameScale;
            this.pickup.ring.rotation.z += 0.026 * frameScale;
            setUniformScale(this.pickup.ring, PICKUP_RING_BASE_SCALE * pulse);
            this.pickup.glint.scale.set(
                PICKUP_GLINT_BASE_SCALE,
                PICKUP_GLINT_BASE_SCALE + (pulse - 1) * 1.35,
                PICKUP_GLINT_BASE_SCALE
            );
            this.pickup.glint.rotation.y -= 0.052 * frameScale;
        }
        this.hazard.rotation.y -= 0.035 * frameScale;
        this.beaconPhase += delta * 4.8;
        this.beaconOpacity = getBaseOpacity(this.beaconMaterial) *
            (0.64 + (Math.sin(this.beaconPhase) + 1) * 0.14);
        if (delta > 0) {
            this.orbitBandOpacity = getBaseOpacity(this.orbitBand.material) *
                (0.86 + (Math.sin((this.beaconPhase * 0.9) + this.colorCycle.phase) + 1) * 0.07);
            this.orbitBandHaloOpacity = getBaseOpacity(this.orbitBandHalo.material) *
                (0.66 + (Math.sin((this.beaconPhase * 0.74) + this.colorCycle.phase) + 1) * 0.15);
            this.refreshTopRailGlow(topRailPulse);
        }

        if (this.feedbackTimer > 0) {
            this.feedbackTimer = Math.max(0, this.feedbackTimer - delta);
            const progress = 1 - (this.feedbackTimer / IMPACT_FEEDBACK_SECONDS);
            const eased = easeOutCubic(progress);
            const fade = 1 - progress;
            const primaryScale = 0.75 + eased * 2.25;
            const afterglowScale = 1.05 + eased * 3.15;
            const compression = 1 + Math.sin(progress * Math.PI) * 0.045;

            this.pad.scale.set(compression, 1, compression);
            this.orbitBand.scale.set(compression + 0.05, compression + 0.05, compression + 0.05);
            this.orbitBandHalo.scale.set(compression + 0.08, compression + 0.08, compression + 0.08);
            this.setTopRailScale(compression + 0.02);
            this.shockwave.scale.set(primaryScale, primaryScale, primaryScale);
            this.impactAfterglow.scale.set(afterglowScale, afterglowScale, afterglowScale);
            this.shockwave.material.opacity = Math.max(0, fade * this.shockwaveMaxOpacity);
            this.impactAfterglow.material.opacity = Math.max(0, fade * fade * this.afterglowMaxOpacity);
            this.shockwave.visible = this.feedbackTimer > 0;
            this.impactAfterglow.visible = this.feedbackTimer > 0;
            this.setPadBrightness(this.isCleared ? 1 : fade);
        } else {
            this.pad.scale.set(1, 1, 1);
            this.orbitBand.scale.set(1, 1, 1);
            this.orbitBandHalo.scale.set(1, 1, 1);
            this.setTopRailScale(1);
            this.setPadBrightness(this.isCleared ? 1 : 0);
        }

        this.applyVisibilityFade();
    }

    updateColorCycle(delta, speed = 0) {
        const startSpeed = GAME_CONFIG.platform.colorCycleStartSpeed;
        const maxSpeed = GAME_CONFIG.run.maxSpeed;

        if (!startSpeed || speed < startSpeed) return;

        const progress = clamp((speed - startSpeed) / Math.max(0.001, maxSpeed - startSpeed), 0, 1);
        const drift = Math.sin(this.colorCycle.phase) * (0.1 + progress * 0.12);
        const hue = (this.colorCycle.baseHue + drift + 1) % 1;
        const saturation = 0.66 + progress * 0.18;
        const padLightness = 0.13 + progress * 0.045;
        const emissiveLightness = 0.1 + progress * 0.035;
        const orbitBandLightness = 0.72 + progress * 0.18;
        const orbitBandHaloLightness = 0.58 + progress * 0.18;
        const topRailLightness = 0.46 + progress * 0.12;
        const topRailHaloLightness = 0.38 + progress * 0.1;

        this.colorCycle.phase += delta * (0.36 + progress * 0.42);
        setMaterialHsl(this.pad.material, hue, saturation, padLightness);
        setMaterialEmissiveHsl(this.pad.material, hue, 0.82, emissiveLightness);
        setMaterialHsl(this.orbitBand.material, hue, 0.98, orbitBandLightness);
        setMaterialHsl(this.orbitBandHalo.material, hue, 0.94, orbitBandHaloLightness);
        setMaterialHsl(this.topRail.material, hue, 0.82, topRailLightness);
        setMaterialHsl(this.topRailHalo.material, hue, 0.72, topRailHaloLightness);
        setMaterialHsl(this.topRailCross.material, hue, 0.82, topRailLightness);
        setMaterialHsl(this.topRailCrossHalo.material, hue, 0.72, topRailHaloLightness);
    }

    resolveLanding({ hitPickup, resetMultiplier, boost }) {
        const platformType = PLATFORM_TYPES[this.type] || PLATFORM_TYPES.standard;
        const impactColor = resetMultiplier ? COLORS.red : boost > 0 ? COLORS.gold : platformType.color;

        this.isCleared = true;
        this.feedbackTimer = IMPACT_FEEDBACK_SECONDS;
        this.setPadBrightness(1);
        this.shockwaveMaxOpacity = resetMultiplier ? DANGER_SHOCKWAVE_OPACITY : IMPACT_SHOCKWAVE_OPACITY;
        this.afterglowMaxOpacity = resetMultiplier ? DANGER_AFTERGLOW_OPACITY : IMPACT_AFTERGLOW_OPACITY;
        setMaterialColor(this.shockwave.material, impactColor);
        setMaterialColor(this.impactAfterglow.material, impactColor);
        this.shockwave.visible = true;
        this.impactAfterglow.visible = true;
        this.shockwave.material.opacity = this.shockwaveMaxOpacity;
        this.impactAfterglow.material.opacity = this.afterglowMaxOpacity;
        this.shockwave.scale.set(0.7, 0.7, 0.7);
        this.impactAfterglow.scale.set(1.05, 1.05, 1.05);
        this.refreshTopRailGlow(this.topRailPulse, 1);
        this.setTopRailScale(1.08);
        this.applyVisibilityFade();

        if (hitPickup) {
            this.pickup.visible = false;
        }

        this.lastLanding = { hitPickup, resetMultiplier, boost };
    }

    getPickupWorldX() {
        return this.group.position.x + this.pickupOffset;
    }

    removePlatform() {
        this.deactivate();
    }

    collision(multHit) {
        this.resolveLanding({
            hitPickup: Boolean(multHit),
            resetMultiplier: false,
            boost: 0
        });
    }
}
