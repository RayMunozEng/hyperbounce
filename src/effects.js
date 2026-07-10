import { COLORS, GAME_CONFIG } from "./config";

const STAR_LAYERS = [
    {
        key: "far",
        countScale: 1,
        spreadScale: 1.1,
        depthScale: 1,
        speedScale: 0.58,
        size: 0.11,
        opacity: 0.42,
        twinkle: 0.04,
        color: COLORS.starDim
    },
    {
        key: "near",
        countScale: 0.42,
        spreadScale: 0.86,
        depthScale: 0.82,
        speedScale: 0.96,
        size: 0.18,
        opacity: 0.68,
        twinkle: 0.075,
        color: COLORS.star
    },
    {
        key: "glint",
        countScale: 0.13,
        spreadScale: 0.74,
        depthScale: 0.66,
        speedScale: 1.22,
        size: 0.36,
        opacity: 0.92,
        twinkle: 0.2,
        color: COLORS.starGlint
    }
];

const SPACE_TRAFFIC_COLORS = [
    COLORS.cyan,
    COLORS.magenta,
    COLORS.gold,
    COLORS.green,
    COLORS.starGlint
];

function createStarMaterial(THREE, layer, suppliedMaterial) {
    if (suppliedMaterial && suppliedMaterial[layer.key]) {
        return suppliedMaterial[layer.key];
    }

    if (suppliedMaterial && !suppliedMaterial.far) {
        return suppliedMaterial;
    }

    return new THREE.PointsMaterial({
        color: layer.color,
        size: layer.size,
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
}

function createStarChunk(THREE, layerCount, spread, segmentDepth, material, offsetZ) {
    const positions = new Float32Array(layerCount * 3);

    for (let i = 0; i < layerCount; i++) {
        const offset = i * 3;

        positions[offset] = (Math.random() - 0.5) * spread;
        positions[offset + 1] = (Math.random() - 0.5) * spread;
        positions[offset + 2] = -Math.random() * segmentDepth;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const points = new THREE.Points(geometry, material);
    points.position.z = offsetZ;

    return { geometry, points };
}

export class Starfield {
    constructor({
        THREE,
        scene,
        count = GAME_CONFIG.stars.count,
        spread = GAME_CONFIG.stars.spread,
        depth = GAME_CONFIG.stars.depth,
        speedScale = GAME_CONFIG.stars.speedScale,
        material
    }) {
        this.depth = depth;
        this.speedScale = speedScale;
        this.time = 0;
        this.layers = STAR_LAYERS.map((layer) => {
            const layerDepth = depth * layer.depthScale;
            const layerSpread = spread * layer.spreadScale;
            const layerCount = Math.max(1, Math.floor(count * layer.countScale));
            const segmentDepth = layerDepth * 0.5;
            const layerMaterial = createStarMaterial(THREE, layer, material);

            layerMaterial.opacity = layer.opacity;
            layerMaterial.userData = Object.assign({}, layerMaterial.userData, {
                baseOpacity: layer.opacity,
                twinkle: layer.twinkle
            });

            const chunkCount = Math.max(1, Math.ceil(layerCount / 2));
            const chunks = [
                createStarChunk(THREE, chunkCount, layerSpread, segmentDepth, layerMaterial, 0),
                createStarChunk(THREE, chunkCount, layerSpread, segmentDepth, layerMaterial, -segmentDepth)
            ];

            chunks.forEach((chunk) => scene.add(chunk.points));

            return {
                chunks,
                geometry: chunks[0].geometry,
                material: layerMaterial,
                points: chunks[0].points,
                depth: layerDepth,
                segmentDepth,
                velocity: layer.speedScale,
                phase: Math.random() * Math.PI * 2
            };
        });
        this.geometry = this.layers[0].geometry;
        this.material = this.layers[0].material;
        this.points = this.layers[0].points;
    }

    update(delta, speed) {
        this.time += delta;

        this.layers.forEach((layer) => {
            const movement = delta * speed * this.speedScale * layer.velocity;
            const front = layer.segmentDepth;

            layer.chunks.forEach((chunk) => {
                chunk.points.position.z += movement;
                if (chunk.points.position.z > front) {
                    chunk.points.position.z -= layer.depth;
                }
            });

            const twinkle = layer.material.userData && layer.material.userData.twinkle;
            const baseOpacity = layer.material.userData && layer.material.userData.baseOpacity;
            if (twinkle && baseOpacity !== undefined) {
                layer.material.opacity = baseOpacity + Math.sin(this.time * 1.8 + layer.phase) * twinkle;
            }
        });
    }
}

function pickColor(random) {
    return SPACE_TRAFFIC_COLORS[Math.floor(random() * SPACE_TRAFFIC_COLORS.length)] || COLORS.starGlint;
}

function createTrafficMaterial(THREE, kind, random) {
    return new THREE.MeshBasicMaterial({
        color: pickColor(random),
        transparent: true,
        opacity: kind === "planet" ? 0.46 : 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
}

function createAtmosphereMaterial(THREE, random) {
    return new THREE.MeshBasicMaterial({
        color: pickColor(random),
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
}

function createPlanetBandMaterial(THREE, random) {
    return new THREE.MeshBasicMaterial({
        color: pickColor(random),
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
}

export class SpaceTraffic {
    constructor({
        THREE,
        scene,
        count = GAME_CONFIG.spaceTraffic.count,
        depth = GAME_CONFIG.spaceTraffic.depth,
        frontZ = GAME_CONFIG.spaceTraffic.frontZ,
        minSideX = GAME_CONFIG.spaceTraffic.minSideX,
        sideSpread = GAME_CONFIG.spaceTraffic.sideSpread,
        verticalSpread = GAME_CONFIG.spaceTraffic.verticalSpread,
        random = Math.random
    }) {
        this.THREE = THREE;
        this.depth = depth;
        this.frontZ = frontZ;
        this.minSideX = minSideX;
        this.sideSpread = sideSpread;
        this.verticalSpread = verticalSpread;
        this.random = random;
        this.planetGeometry = new THREE.SphereGeometry(1, 18, 14);
        this.planetAtmosphereGeometry = new THREE.SphereGeometry(1.18, 18, 14);
        this.planetBandGeometry = new THREE.TorusGeometry(1.02, 0.012, 6, 48);
        this.planetRingGeometry = new THREE.TorusGeometry(1.58, 0.035, 8, 72);
        this.asteroidGeometry = new THREE.DodecahedronGeometry(1, 1);
        this.bodies = [];

        for (let i = 0; i < count; i++) {
            const body = this.createBody();

            this.resetBody(body, true);
            if (scene) scene.add(body.mesh);
            this.bodies.push(body);
        }
    }

    createBody() {
        const kind = this.random() < 0.58 ? "planet" : "asteroid";
        const mesh = new this.THREE.Group();
        const core = new this.THREE.Mesh(
            kind === "planet" ? this.planetGeometry : this.asteroidGeometry,
            createTrafficMaterial(this.THREE, kind, this.random)
        );
        const body = {
            kind,
            mesh,
            core,
            atmosphere: null,
            surfaceBands: [],
            ring: null,
            speed: 0,
            spinX: 0,
            spinY: 0,
            spinZ: 0
        };

        mesh.add(core);

        if (kind === "planet") {
            body.atmosphere = new this.THREE.Mesh(
                this.planetAtmosphereGeometry,
                createAtmosphereMaterial(this.THREE, this.random)
            );
            body.ring = new this.THREE.Mesh(
                this.planetRingGeometry,
                createPlanetBandMaterial(this.THREE, this.random)
            );
            body.ring.rotation.x = Math.PI / 2.35;
            body.ring.rotation.y = Math.PI / 8;
            body.ring.visible = true;
            mesh.add(body.atmosphere);
            mesh.add(body.ring);

            for (let i = 0; i < 3; i++) {
                const band = new this.THREE.Mesh(
                    this.planetBandGeometry,
                    createPlanetBandMaterial(this.THREE, this.random)
                );

                band.rotation.x = Math.PI / 2 + (i - 1) * 0.22;
                band.rotation.y = (i - 1) * 0.18;
                band.scale.set(1 + i * 0.055, 1 + i * 0.055, 1 + i * 0.055);
                mesh.add(band);
                body.surfaceBands.push(band);
            }
        } else {
            body.ring = { visible: false };
        }

        return body;
    }

    resetBody(body, initial = false) {
        const side = this.random() < 0.5 ? -1 : 1;
        const x = side * (this.minSideX + this.random() * this.sideSpread);
        const y = (this.random() - 0.5) * this.verticalSpread;
        const z = initial ?
            -(this.random() * this.depth) :
            -(this.depth + this.random() * this.depth * 0.35);
        const scale = body.kind === "planet" ?
            1.35 + this.random() * 2.15 :
            0.72 + this.random() * 1.12;

        body.mesh.position.set(x, y, z);
        body.mesh.scale.set(scale, scale, scale);
        body.mesh.rotation.set(
            this.random() * Math.PI,
            this.random() * Math.PI,
            this.random() * Math.PI
        );
        if (body.atmosphere) {
            body.atmosphere.scale.set(1, 1, 1);
        }
        if (body.ring && body.kind === "planet") {
            body.ring.visible = true;
        }
        body.speed = body.kind === "planet" ?
            0.17 + this.random() * 0.12 :
            0.3 + this.random() * 0.22;
        body.spinX = (this.random() - 0.5) * 0.32;
        body.spinY = (this.random() - 0.5) * 0.42;
        body.spinZ = (this.random() - 0.5) * 0.28;
    }

    update(delta, speed) {
        const travel = delta * (12 + Math.max(speed, 0.16) * 38);

        this.bodies.forEach((body) => {
            body.mesh.position.z += travel * body.speed;
            body.mesh.rotation.x += body.spinX * delta;
            body.mesh.rotation.y += body.spinY * delta;
            body.mesh.rotation.z += body.spinZ * delta;
            if (body.atmosphere) {
                const glow = 1 + Math.sin(body.mesh.rotation.y * 2.2) * 0.035;

                body.atmosphere.scale.set(glow, glow, glow);
            }
            body.surfaceBands.forEach((band, index) => {
                band.rotation.z += delta * (0.05 + index * 0.018);
            });
            if (body.ring && body.kind === "planet") {
                body.ring.rotation.z += delta * 0.035;
            }

            if (body.mesh.position.z > this.frontZ) {
                this.resetBody(body);
            }
        });
    }
}
