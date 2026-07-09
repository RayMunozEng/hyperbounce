import { COLORS, GAME_CONFIG } from "./config";

const STAR_LAYERS = [
    {
        key: "far",
        countScale: 1,
        spreadScale: 1.1,
        depthScale: 1,
        speedScale: 0.58,
        size: 0.08,
        opacity: 0.34,
        twinkle: 0.025,
        color: COLORS.starDim
    },
    {
        key: "near",
        countScale: 0.34,
        spreadScale: 0.86,
        depthScale: 0.82,
        speedScale: 0.96,
        size: 0.13,
        opacity: 0.58,
        twinkle: 0.055,
        color: COLORS.star
    },
    {
        key: "glint",
        countScale: 0.1,
        spreadScale: 0.74,
        depthScale: 0.66,
        speedScale: 1.22,
        size: 0.22,
        opacity: 0.74,
        twinkle: 0.16,
        color: COLORS.starGlint
    }
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
            const geometry = new THREE.Geometry();
            const layerMaterial = createStarMaterial(THREE, layer, material);

            layerMaterial.opacity = layer.opacity;
            layerMaterial.userData = Object.assign({}, layerMaterial.userData, {
                baseOpacity: layer.opacity,
                twinkle: layer.twinkle
            });

            for (let i = 0; i < layerCount; i++) {
                geometry.vertices.push(new THREE.Vector3(
                    (Math.random() - 0.5) * layerSpread,
                    (Math.random() - 0.5) * layerSpread,
                    (Math.random() - 0.5) * layerDepth
                ));
            }

            const points = new THREE.Points(geometry, layerMaterial);
            scene.add(points);

            return {
                geometry,
                material: layerMaterial,
                points,
                depth: layerDepth,
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
            const front = layer.depth * 0.5;

            for (let i = 0; i < layer.geometry.vertices.length; i++) {
                const star = layer.geometry.vertices[i];
                star.z += movement;
                if (star.z > front) {
                    star.z -= layer.depth;
                }
            }

            const twinkle = layer.material.userData && layer.material.userData.twinkle;
            const baseOpacity = layer.material.userData && layer.material.userData.baseOpacity;
            if (twinkle && baseOpacity !== undefined) {
                layer.material.opacity = baseOpacity + Math.sin(this.time * 1.8 + layer.phase) * twinkle;
            }

            layer.geometry.verticesNeedUpdate = true;
        });
    }
}
