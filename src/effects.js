import { GAME_CONFIG } from "./config";

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
        this.geometry = new THREE.Geometry();
        this.material = material || new THREE.PointsMaterial({
            color: 0x99ddff,
            size: GAME_CONFIG.stars.size,
            transparent: true,
            opacity: 0.86,
            depthWrite: false
        });

        for (let i = 0; i < count; i++) {
            this.geometry.vertices.push(new THREE.Vector3(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * depth
            ));
        }

        this.points = new THREE.Points(this.geometry, this.material);
        scene.add(this.points);
    }

    update(delta, speed) {
        const movement = delta * speed * this.speedScale;
        const front = this.depth * 0.5;

        for (let i = 0; i < this.geometry.vertices.length; i++) {
            const star = this.geometry.vertices[i];
            star.z += movement;
            if (star.z > front) {
                star.z -= this.depth;
            }
        }

        this.geometry.verticesNeedUpdate = true;
    }
}
