import { GAME_CONFIG, PLATFORM_TYPES } from "./config";
import { createSharedAssets } from "./materials";

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

        this.edge.rotation.x = Math.PI / 2;
        this.pickup.position.y = 0.62;
        this.beacon.position.y = 1.95;
        this.hazard.position.y = 0.58;
        this.shockwave.position.y = 0.23;
        this.shockwave.rotation.x = Math.PI / 2;
        this.shockwave.visible = false;

        this.group.add(this.pad);
        this.group.add(this.edge);
        this.group.add(this.pickup);
        this.group.add(this.beacon);
        this.group.add(this.hazard);
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
        this.beaconMaterial.opacity = 0.2;
        this.beacon.scale.set(
            config.radius / GAME_CONFIG.platform.baseRadius,
            1,
            config.radius / GAME_CONFIG.platform.baseRadius
        );
        this.hazard.visible = config.resetsMultiplier;
        this.shockwave.visible = false;
        this.shockwave.material.opacity = 0;
        this.shockwave.scale.set(0.45, 0.45, 0.45);
    }

    deactivate() {
        this.active = false;
        this.group.visible = false;
        this.pickup.visible = false;
        this.beacon.visible = false;
        this.hazard.visible = false;
        this.shockwave.visible = false;
    }

    update(delta, speed) {
        if (!this.active) return;

        const frameScale = Math.min(delta * 60, 2);
        this.group.position.z += speed * frameScale;
        this.edge.rotation.z += 0.018 * frameScale;
        this.pickup.rotation.y += 0.04 * frameScale;
        this.hazard.rotation.y -= 0.035 * frameScale;
        this.beaconPhase += delta * 4.8;
        this.beaconMaterial.opacity = 0.16 + (Math.sin(this.beaconPhase) + 1) * 0.05;

        if (this.feedbackTimer > 0) {
            this.feedbackTimer = Math.max(0, this.feedbackTimer - delta);
            const progress = 1 - (this.feedbackTimer / 0.38);
            const scale = 0.7 + progress * 2.6;
            this.shockwave.scale.set(scale, scale, scale);
            this.shockwave.material.opacity = Math.max(0, 0.82 - progress);
            this.shockwave.visible = this.feedbackTimer > 0;
        }
    }

    resolveLanding({ hitPickup, resetMultiplier, boost }) {
        this.isCleared = true;
        this.feedbackTimer = 0.38;
        this.shockwave.visible = true;
        this.shockwave.material.opacity = resetMultiplier ? 0.95 : 0.82;
        this.shockwave.scale.set(0.7, 0.7, 0.7);

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
