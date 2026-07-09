import Player from "./player";
import PlatformManager from "./platform_generator";
import { Howl } from "howler";
import { CrossfadeMusic, createJumpSfx } from "./audio";
import { createSharedAssets } from "./materials";
import { Starfield } from "./effects";
import { didCollect, didLand } from "./collision";
import { GAME_CONFIG, PLATFORM_TYPES, COLORS, UI_STATES } from "./config";
import { InputController } from "./input";
import { Hud } from "./hud";
import { resolveLandingScore } from "./scoring";

export default class Game {
    constructor({ THREEImpl = window.THREE, doc = document, storage = localStorage } = {}) {
        window.game = this;
        this.THREE = THREEImpl;
        this.document = doc;
        this.storage = storage;
        this.localStorageName = "hyperbouncescore";
        this.highScore = Number(this.storage.getItem(this.localStorageName)) || 0;
        this.score = 0;
        this.multiplier = 1;
        this.speed = GAME_CONFIG.run.baseSpeed;
        this.state = UI_STATES.start;
        this.isMuted = false;
        this.cameraTarget = new this.THREE.Vector3();

        this.setupAudio();
        this.setupScene();
        this.setupUi();
        this.resetRun();

        this.animate = this.animate.bind(this);
        this.start = this.start.bind(this);
        this.restart = this.restart.bind(this);
        this.toggleSound = this.toggleSound.bind(this);
        this.onResize = this.onResize.bind(this);

        this.hud.bindControls({
            start: this.start,
            retry: this.restart,
            sound: this.toggleSound
        });
        this.hud.showStart({ highScore: this.highScore });
        this.document.defaultView.addEventListener("resize", this.onResize);
        requestAnimationFrame(this.animate);
    }

    setupAudio() {
        this.bgm = new CrossfadeMusic({
            HowlClass: Howl,
            src: ["./src/sounds/neon-runner.wav"],
            volume: 0.55,
            fadeSeconds: 4
        });
        this.bounceSFX = createJumpSfx({ HowlClass: Howl });
    }

    setupScene() {
        this.clock = new this.THREE.Clock();
        this.scene = new this.THREE.Scene();
        this.scene2 = this.scene;
        this.assets = createSharedAssets(this.THREE);

        this.camera = new this.THREE.PerspectiveCamera(
            GAME_CONFIG.camera.fov,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.set(
            GAME_CONFIG.camera.start.x,
            GAME_CONFIG.camera.start.y,
            GAME_CONFIG.camera.start.z
        );
        this.camera.rotation.x = GAME_CONFIG.camera.tilt;
        this.camera.layers.enable(1);

        this.addLighting(this.scene);

        this.player = new Player({
            THREE: this.THREE,
            scene: this.scene,
            assets: this.assets
        });
        this.platformManager = new PlatformManager({
            THREE: this.THREE,
            scene: this.scene,
            assets: this.assets
        });
        this.starfield = new Starfield({
            THREE: this.THREE,
            scene: this.scene,
            material: this.assets.materials.stars
        });

        this.renderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.autoClear = false;
        this.renderer.setClearColor(COLORS.background);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.gammaInput = true;
        this.renderer.gammaOutput = true;
        this.renderer.toneMappingExposure = Math.pow(0.9, 4.0);
        this.document.body.appendChild(this.renderer.domElement);
        this.canvas = this.renderer.domElement;
        this.composer = this.createComposer();
    }

    setupUi() {
        this.input = new InputController(this.document);
        this.hud = new Hud(this.document);
    }

    addLighting(scene) {
        const key = new this.THREE.PointLight(COLORS.cyan, 2.2, 90);
        const rim = new this.THREE.PointLight(COLORS.magenta, 1.4, 70);

        key.position.set(18, 28, 16);
        rim.position.set(-20, 12, -12);
        scene.add(key);
        scene.add(rim);
    }

    createComposer() {
        if (!this.THREE.EffectComposer || !this.THREE.RenderPass) return null;

        const composer = new this.THREE.EffectComposer(this.renderer);
        composer.addPass(new this.THREE.RenderPass(this.scene, this.camera));

        if (this.THREE.UnrealBloomPass) {
            const bloom = new this.THREE.UnrealBloomPass(
                new this.THREE.Vector2(window.innerWidth, window.innerHeight),
                1.35,
                0.36,
                0.75
            );
            bloom.threshold = 0.22;
            bloom.strength = 2.2;
            bloom.radius = 0.16;
            bloom.renderToScreen = true;
            composer.addPass(bloom);
        }

        return composer;
    }

    resetRun() {
        this.score = 0;
        this.multiplier = 1;
        this.speed = GAME_CONFIG.run.baseSpeed;
        this.player.reset();
        this.platformManager.reset();
        this.camera.position.set(
            GAME_CONFIG.camera.start.x,
            GAME_CONFIG.camera.start.y,
            GAME_CONFIG.camera.start.z
        );
        this.hud.updateRun({
            score: this.score,
            highScore: this.highScore,
            multiplier: this.multiplier
        });
    }

    start() {
        if (this.state === UI_STATES.playing) return;

        this.resetRun();
        this.platformManager.releaseLaunchPad();
        this.state = UI_STATES.playing;
        this.input.start(this.canvas);
        this.hud.showPlaying({
            score: this.score,
            highScore: this.highScore,
            multiplier: this.multiplier
        });
        this.bgm.play();
    }

    restart() {
        this.start();
    }

    triggerDeath() {
        if (this.state !== UI_STATES.playing) return;

        this.state = "dying";
        this.input.stop();
        this.player.beginDeath();
    }

    end() {
        const isNewHighScore = this.score > this.highScore;

        if (isNewHighScore) {
            this.highScore = this.score;
            this.storage.setItem(this.localStorageName, String(this.highScore));
        }

        this.state = UI_STATES.gameOver;
        this.hud.showGameOver({
            score: this.score,
            highScore: this.highScore,
            isNewHighScore
        });
    }

    toggleSound() {
        this.isMuted = !this.isMuted;
        this.bgm.mute(this.isMuted);
        this.bounceSFX.mute(this.isMuted);
        this.hud.setSoundMuted(this.isMuted);
    }

    animate() {
        const delta = Math.min(this.clock.getDelta(), 0.033);

        if (this.state === UI_STATES.playing) {
            this.updatePlaying(delta);
        } else if (this.state === "dying") {
            this.platformManager.update(delta, this.speed * 0.55);
            if (this.player.updateDeath(delta)) this.end();
        }

        this.starfield.update(delta, Math.max(this.speed, 0.16));
        this.cameraLag();
        this.render();
        requestAnimationFrame(this.animate);
    }

    updatePlaying(delta) {
        this.player.syncRunSpeed(this.speed);
        this.player.update(delta, this.input.consumeMovement(), true);
        this.platformManager.update(delta, this.speed);

        if (this.player.landedThisFrame) {
            this.resolveLanding();
        }
    }

    resolveLanding() {
        const platform = this.platformManager.current();

        if (!platform || !didLand(this.player.position.x, platform.group.position.x, platform.radius)) {
            this.triggerDeath();
            return;
        }

        const platformType = PLATFORM_TYPES[platform.type] || PLATFORM_TYPES.standard;
        const hitPickup = platformType.pickup && platform.pickup.visible ?
            didCollect(
                this.player.position.x,
                platform.getPickupWorldX(),
                GAME_CONFIG.platform.pickupRadius
            ) :
            false;
        const result = resolveLandingScore({
            score: this.score,
            multiplier: this.multiplier,
            platformType: platform.type,
            hitPickup
        });

        this.score = result.score;
        this.multiplier = result.multiplier;
        platform.resolveLanding({
            hitPickup,
            resetMultiplier: result.resetMultiplier,
            boost: result.bonus
        });
        this.platformManager.spawnNext(this.score);
        this.speed = Math.min(
            GAME_CONFIG.run.maxSpeed,
            this.speed + GAME_CONFIG.run.speedGain
        );
        this.bounceSFX.play();
        this.hud.updateRun({
            score: this.score,
            highScore: this.highScore,
            multiplier: this.multiplier
        });
    }

    cameraLag() {
        this.cameraTarget.set(
            this.player.position.x,
            GAME_CONFIG.camera.start.y,
            GAME_CONFIG.camera.start.z
        );
        this.camera.position.lerp(this.cameraTarget, GAME_CONFIG.camera.followLerp);
    }

    render() {
        this.renderer.clear();

        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        if (this.composer && this.composer.setSize) this.composer.setSize(width, height);
    }
}
