const BURST_CENTERS = [
    [-0.82, 0.42],
    [-0.58, -0.18],
    [-0.36, 0.62],
    [-0.18, 0.08],
    [0, 0.48],
    [0.18, -0.28],
    [0.36, 0.66],
    [0.56, 0.12],
    [0.72, -0.22],
    [0.86, 0.4]
];
const COLORS = [
    [1, 0.72, 0.2],
    [0, 0.96, 1],
    [1, 0.24, 0.95],
    [1, 0.94, 0.68]
];
const PARTICLES_PER_BURST = 16;
const PARTICLE_COUNT = BURST_CENTERS.length * PARTICLES_PER_BURST;
const PARTICLE_LIFETIME = 1.45;
const EFFECT_DURATION = 2.6;
const RING_DELAYS = [0, 0.26, 0.54];
const HIDDEN_Z = -20;
const TWO_PI = Math.PI * 2;

function setGeometryAttribute(geometry, name, attribute) {
    const setter = geometry.setAttribute || geometry.addAttribute;
    setter.call(geometry, name, attribute);
}

export class RecordCelebration {
    constructor({ THREE, texture = null, random = Math.random } = {}) {
        this.THREE = THREE;
        this.random = random;
        this.elapsed = 0;
        this.active = false;
        this.aspect = 1;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.camera.position.z = 1;
        this.particleData = new Float32Array(PARTICLE_COUNT * 5);

        this.points = this.createParticles(texture);
        this.rings = RING_DELAYS.map((delay, index) => this.createRing(delay, index));
        this.scene.add(this.points);
        this.rings.forEach((ring) => this.scene.add(ring));
        this.stop();
    }

    createParticles(texture) {
        const THREE = this.THREE;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);

        for (let index = 0; index < PARTICLE_COUNT; index += 1) {
            const burstIndex = Math.floor(index / PARTICLES_PER_BURST);
            const particleIndex = index % PARTICLES_PER_BURST;
            const angle = (particleIndex / PARTICLES_PER_BURST) * TWO_PI + (this.random() - 0.5) * 0.18;
            const speed = 0.36 + this.random() * 0.34;
            const dataOffset = index * 5;
            const color = COLORS[(burstIndex + particleIndex) % COLORS.length];
            const positionOffset = index * 3;

            this.particleData[dataOffset] = burstIndex;
            this.particleData[dataOffset + 1] = Math.cos(angle) * speed;
            this.particleData[dataOffset + 2] = Math.sin(angle) * speed;
            this.particleData[dataOffset + 3] = burstIndex * 0.055 + this.random() * 0.08;
            this.particleData[dataOffset + 4] = 0.84 + this.random() * 0.28;
            positions[positionOffset + 2] = HIDDEN_Z;
            colors[positionOffset] = color[0];
            colors[positionOffset + 1] = color[1];
            colors[positionOffset + 2] = color[2];
        }

        setGeometryAttribute(geometry, "position", new THREE.BufferAttribute(positions, 3));
        setGeometryAttribute(geometry, "color", new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 22,
            map: texture || undefined,
            alphaTest: texture ? 0.02 : 0,
            transparent: true,
            opacity: 1,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            sizeAttenuation: false
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        return points;
    }

    createRing(delay, index) {
        const THREE = this.THREE;
        const geometry = new THREE.RingGeometry(0.19, 0.205, 64);
        const material = new THREE.MeshBasicMaterial({
            color: index === 1 ? 0x00f5ff : 0xffc857,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(geometry, material);
        ring.userData = { delay };
        ring.visible = false;
        ring.frustumCulled = false;
        return ring;
    }

    start() {
        this.elapsed = 0;
        this.active = true;
        this.points.visible = true;
        this.points.material.opacity = 1;
        this.rings.forEach((ring) => {
            ring.visible = true;
            ring.material.opacity = 0;
            ring.scale.set(0.2, 0.2, 1);
        });
        this.updateParticles(0);
    }

    stop() {
        this.active = false;
        this.points.visible = false;
        this.rings.forEach((ring) => {
            ring.visible = false;
        });
    }

    update(delta) {
        if (!this.active) return;

        this.elapsed += Math.max(0, delta || 0);
        if (this.elapsed >= EFFECT_DURATION) {
            this.stop();
            return;
        }

        this.updateParticles(this.elapsed);
        this.updateRings(this.elapsed);
        this.points.material.opacity = Math.min(1, (EFFECT_DURATION - this.elapsed) / 0.65);
    }

    updateParticles(elapsed) {
        const positions = this.points.geometry.attributes.position.array;

        for (let index = 0; index < PARTICLE_COUNT; index += 1) {
            const dataOffset = index * 5;
            const positionOffset = index * 3;
            const burstIndex = this.particleData[dataOffset];
            const localTime = elapsed - this.particleData[dataOffset + 3];
            const lifetime = PARTICLE_LIFETIME * this.particleData[dataOffset + 4];

            if (localTime < 0 || localTime > lifetime) {
                positions[positionOffset + 2] = HIDDEN_Z;
                continue;
            }

            const center = BURST_CENTERS[burstIndex];
            const dragTime = localTime * (1 - localTime * 0.1);
            positions[positionOffset] = center[0] * this.aspect + this.particleData[dataOffset + 1] * dragTime;
            positions[positionOffset + 1] = center[1] + this.particleData[dataOffset + 2] * dragTime - 0.12 * localTime * localTime;
            positions[positionOffset + 2] = 0;
        }

        this.points.geometry.attributes.position.needsUpdate = true;
    }

    updateRings(elapsed) {
        for (let index = 0; index < this.rings.length; index += 1) {
            const ring = this.rings[index];
            const localTime = elapsed - ring.userData.delay;
            const progress = Math.max(0, Math.min(1, localTime / 1.35));
            const scale = 0.2 + progress * 8.4;

            ring.visible = localTime >= 0 && progress < 1;
            ring.material.opacity = ring.visible ? Math.sin(progress * Math.PI) * 0.82 : 0;
            ring.scale.set(scale, scale, 1);
        }
    }

    resize(width, height) {
        this.aspect = Math.max(0.1, width / Math.max(1, height));
        this.camera.left = -this.aspect;
        this.camera.right = this.aspect;
        this.camera.top = 1;
        this.camera.bottom = -1;
        this.camera.updateProjectionMatrix();
    }

    render(renderer) {
        if (!this.active) return;

        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
    }
}

export default RecordCelebration;
