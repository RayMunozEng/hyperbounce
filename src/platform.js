import { COLORS, GAME_CONFIG, PLATFORM_TYPES } from "./config";
import { createSharedAssets } from "./materials";

const IMPACT_FEEDBACK_SECONDS = 0.38;
const IMPACT_SHOCKWAVE_OPACITY = 0.12;
const IMPACT_AFTERGLOW_OPACITY = 0.028;
const DANGER_SHOCKWAVE_OPACITY = 0.17;
const DANGER_AFTERGLOW_OPACITY = 0.045;

function easeOutCubic(value) {
    return 1 - Math.pow(1 - value, 3);
}

function setMaterialColor(material, color) {
    if (material.color && typeof material.color.setHex === "function") {
        material.color.setHex(color);
        return;
    }

    material.color = color;
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

        this.pad = new THREE.Mesh(
            assets.geometries.platformPad,
            assets.materials.platform.standard
        );
        this.edge = new THREE.Mesh(
            assets.geometries.platformEdge,
            assets.materials.platform.edge
        );
        this.pickup = this.createPickup();
        this.beaconMaterial = assets.materials.platform.beacon.clone();
        this.beacon = new THREE.Mesh(
            assets.geometries.platformBeacon,
            this.beaconMaterial
        );
        this.hazard = new THREE.Mesh(
            assets.geometries.hazardMarker,
            assets.materials.platform.hazardMarker
        );
        this.shockwave = new THREE.Mesh(
            assets.geometries.shockwave,
            assets.createShockwaveMaterial()
        );
        this.impactAfterglow = new THREE.Mesh(
            assets.geometries.shockwave,
            assets.createShockwaveMaterial(0.24, COLORS.star)
        );

        this.edge.rotation.x = Math.PI / 2;
        this.pickup.position.y = 0.62;
        this.beacon.position.y = 1.95;
        this.hazard.position.y = 0.58;
        this.shockwave.position.y = 0.23;
        this.shockwave.rotation.x = Math.PI / 2;
        this.shockwave.visible = false;
        this.impactAfterglow.position.y = 0.18;
        this.impactAfterglow.rotation.x = Math.PI / 2;
        this.impactAfterglow.visible = false;

        this.group.add(this.pad);
        this.group.add(this.edge);
        this.group.add(this.pickup);
        this.group.add(this.beacon);
        this.group.add(this.hazard);
        this.group.add(this.impactAfterglow);
        this.group.add(this.shockwave);
        this.group.position.y = GAME_CONFIG.platform.startY;
        if (scene) scene.add(this.group);
    }

    createPickup() {
        const pickup = new this.THREE.Group();
        const core = new this.THREE.Mesh(
            this.assets.geometries.pickupCore,
            this.assets.materials.platform.pickup
        );
        const ring = new this.THREE.Mesh(
            this.assets.geometries.pickupRing,
            this.assets.materials.platform.pickup
        );

        ring.rotation.x = Math.PI / 2;
        pickup.add(core);
        pickup.add(ring);
        pickup.visible = false;
        pickup.ring = ring;
        return pickup;
    }

    activate(type, x, z, index = 0) {
        const config = PLATFORM_TYPES[type] || PLATFORM_TYPES.standard;
        const isNarrow = type === "narrow";

        this.active = true;
        this.type = type;
        this.radius = config.radius;
        this.pickupOffset = config.pickup ? ((index % 3) - 1) * 0.78 : 0;
        this.feedbackTimer = 0;
        this.beaconPhase = index * 0.55;
        this.group.visible = true;
        this.group.position.set(x, GAME_CONFIG.platform.startY, z);
        this.pad.geometry = isNarrow ?
            this.assets.geometries.platformNarrowPad :
            this.assets.geometries.platformPad;
        this.edge.geometry = isNarrow ?
            this.assets.geometries.platformNarrowEdge :
            this.assets.geometries.platformEdge;
        this.pad.material = this.assets.materials.platform[type] ||
            this.assets.materials.platform.standard;
        this.pickup.visible = config.pickup;
        this.pickup.position.x = this.pickupOffset;
        this.beacon.visible = true;
        this.beaconMaterial.opacity = 0.045;
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
        this.edge.scale.set(1, 1, 1);
    }

    deactivate() {
        this.active = false;
        this.group.visible = false;
        this.pickup.visible = false;
        this.beacon.visible = false;
        this.hazard.visible = false;
        this.shockwave.visible = false;
        this.impactAfterglow.visible = false;
    }

    update(delta, speed) {
        if (!this.active) return;

        const frameScale = Math.min(delta * 60, 2);
        this.group.position.z += speed * frameScale;
        this.edge.rotation.z += 0.018 * frameScale;
        this.pickup.rotation.y += 0.04 * frameScale;
        this.hazard.rotation.y -= 0.035 * frameScale;
        this.beaconPhase += delta * 4.8;
        this.beaconMaterial.opacity = 0.024 + (Math.sin(this.beaconPhase) + 1) * 0.009;

        if (this.feedbackTimer > 0) {
            this.feedbackTimer = Math.max(0, this.feedbackTimer - delta);
            const progress = 1 - (this.feedbackTimer / IMPACT_FEEDBACK_SECONDS);
            const eased = easeOutCubic(progress);
            const fade = 1 - progress;
            const primaryScale = 0.75 + eased * 2.25;
            const afterglowScale = 1.05 + eased * 3.15;
            const compression = 1 + Math.sin(progress * Math.PI) * 0.045;

            this.pad.scale.set(compression, 1, compression);
            this.edge.scale.set(compression + 0.03, compression + 0.03, compression + 0.03);
            this.shockwave.scale.set(primaryScale, primaryScale, primaryScale);
            this.impactAfterglow.scale.set(afterglowScale, afterglowScale, afterglowScale);
            this.shockwave.material.opacity = Math.max(0, fade * this.shockwaveMaxOpacity);
            this.impactAfterglow.material.opacity = Math.max(0, fade * fade * this.afterglowMaxOpacity);
            this.shockwave.visible = this.feedbackTimer > 0;
            this.impactAfterglow.visible = this.feedbackTimer > 0;
        } else {
            this.pad.scale.set(1, 1, 1);
            this.edge.scale.set(1, 1, 1);
        }
    }

    resolveLanding({ hitPickup, resetMultiplier, boost }) {
        const platformType = PLATFORM_TYPES[this.type] || PLATFORM_TYPES.standard;
        const impactColor = resetMultiplier ? COLORS.red : boost > 0 ? COLORS.gold : platformType.color;

        this.isCleared = true;
        this.feedbackTimer = IMPACT_FEEDBACK_SECONDS;
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
