import { COLORS, GAME_CONFIG } from "./config";
import { createSharedAssets } from "./materials";
import { resolveBounceSpeed } from "./tempo";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export default class Player {
    constructor(options = {}) {
        const browserWindow = typeof window === "undefined" ? {} : window;
        const THREE = options.THREE || browserWindow.THREE;
        const scene = options.scene || (browserWindow.game && browserWindow.game.scene2);
        const assets = options.assets || createSharedAssets(THREE);

        this.THREE = THREE;
        this.assets = assets;
        this.group = new THREE.Group();
        this.position = this.group.position;
        this.direction = 1;
        this.speed = resolveBounceSpeed(GAME_CONFIG.run.baseSpeed);
        this.deadState = false;
        this.landedThisFrame = false;
        this.trailCursor = 0;

        this.core = new THREE.Mesh(assets.geometries.playerCore, assets.materials.player.core);
        this.shell = new THREE.Mesh(assets.geometries.playerShell, assets.materials.player.shell);
        this.ringA = new THREE.Mesh(assets.geometries.playerRing, assets.materials.player.ring);
        this.ringB = new THREE.Mesh(assets.geometries.playerRing, assets.materials.player.ring);
        this.light = new THREE.PointLight(COLORS.cyan, 1.8, 9);
        this.trail = this.createTrail();

        this.ringA.rotation.x = Math.PI / 2;
        this.ringB.rotation.y = Math.PI / 2;

        this.group.add(this.trail);
        this.group.add(this.core);
        this.group.add(this.shell);
        this.group.add(this.ringA);
        this.group.add(this.ringB);
        this.group.add(this.light);
        this.group.layers.set(0);
        this.sphere = this.group;

        if (scene) scene.add(this.group);
        this.reset();
    }

    createTrail() {
        const geometry = new this.THREE.Geometry();

        for (let i = 0; i < 18; i++) {
            geometry.vertices.push(new this.THREE.Vector3(0, GAME_CONFIG.player.startY, 0));
        }

        return new this.THREE.Points(geometry, this.assets.materials.player.trail);
    }

    reset() {
        this.position.set(0, GAME_CONFIG.player.startY, 0);
        this.direction = 1;
        this.syncRunSpeed(GAME_CONFIG.run.baseSpeed);
        this.deadState = false;
        this.landedThisFrame = false;
        this.trailCursor = 0;
        this.group.visible = true;
        this.seedTrail();
    }

    syncRunSpeed(runSpeed) {
        this.speed = resolveBounceSpeed(runSpeed);
    }

    seedTrail() {
        const vertices = this.trail.geometry.vertices;

        for (let i = 0; i < vertices.length; i++) {
            vertices[i].x = this.position.x;
            vertices[i].y = this.position.y;
            vertices[i].z = this.position.z;
        }

        this.trail.geometry.verticesNeedUpdate = true;
    }

    update(delta, movement, running) {
        this.landedThisFrame = false;
        if (!running || this.deadState) return;

        const frameScale = Math.min(delta * 60, 2);
        this.position.x = clamp(
            this.position.x + movement * GAME_CONFIG.player.inputSensitivity,
            -GAME_CONFIG.player.maxX,
            GAME_CONFIG.player.maxX
        );
        this.position.y += this.direction * this.speed * frameScale;

        if (this.position.y >= GAME_CONFIG.player.topY) {
            this.position.y = GAME_CONFIG.player.topY;
            this.direction = -1;
        } else if (this.position.y <= GAME_CONFIG.player.startY) {
            this.position.y = GAME_CONFIG.player.startY;
            this.direction = 1;
            this.landedThisFrame = true;
        }

        this.shell.rotation.y += 0.025 * frameScale;
        this.ringA.rotation.z += 0.035 * frameScale;
        this.ringB.rotation.x += 0.03 * frameScale;
        this.updateTrail();
    }

    updateTrail() {
        const vertices = this.trail.geometry.vertices;
        const point = vertices[this.trailCursor];

        point.x = this.position.x;
        point.y = this.position.y - 0.15;
        point.z = this.position.z + 0.2;
        this.trailCursor = (this.trailCursor + 1) % vertices.length;
        this.trail.geometry.verticesNeedUpdate = true;
    }

    beginDeath() {
        this.deadState = true;
    }

    updateDeath(delta) {
        const frameScale = Math.min(delta * 60, 2);
        this.position.y -= this.speed * frameScale;
        this.shell.rotation.x += 0.05 * frameScale;
        this.shell.rotation.z += 0.04 * frameScale;
        this.updateTrail();
        return this.position.y <= GAME_CONFIG.player.deathFloor;
    }

    move() {
        this.legacyMoving = true;
    }

    dead() {
        this.beginDeath();
    }
}
