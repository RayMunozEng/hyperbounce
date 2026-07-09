import Player from "./player";
import PlatformManager from "./platform_generator";
import { Howl } from "howler";
import {
    CrossfadeMusic,
    createComboSfx,
    createHighScoreSfx,
    createIntroSfx,
    createJumpSfx,
    createOrbSfx,
    createUiSfx
} from "./audio";
import { createSharedAssets } from "./materials";
import { SpaceTraffic, Starfield } from "./effects";
import { didCollect, didLand } from "./collision";
import { GAME_CONFIG, PLATFORM_TYPES, COLORS, UI_STATES } from "./config";
import { InputController } from "./input";
import { Hud } from "./hud";
import { resolveLandingScore } from "./scoring";

const MENU_MUSIC_VOLUME = 0.22;
const RUN_MUSIC_VOLUME = 0.55;
const RUN_MUSIC_FADE_SECONDS = 1.35;
const NORMAL_MUSIC_RATE = 1;
const DARK_MUSIC_RATE = 0.88;
const HIGH_SCORE_MUSIC_RATE = 1.12;
const MUSIC_RATE_SHIFT_SECONDS = 0.45;
const INTRO_ZOOM_DELAY_MS = 1000;
const INTRO_WIPE_DELAY_MS = 2920;
const INTRO_STAR_DELAY_MS = 3060;
const INTRO_MENU_READY_MS = 4700;
const TWO_PI = Math.PI * 2;
export const TEMP_TEST_HIGH_SCORE = 10;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function resetSavedHighScoreIfRequested({ storage, location, history, key }) {
    if (!storage || !location || !location.href) return false;

    let url;

    try {
        url = new URL(location.href);
    } catch (error) {
        return false;
    }

    if (url.searchParams.get("resetBest") !== "1") return false;

    storage.removeItem(key);
    url.searchParams.delete("resetBest");

    if (history && typeof history.replaceState === "function") {
        const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
        history.replaceState(null, "", cleanUrl || "/");
    }

    return true;
}

function isTemporaryHighScoreTesting() {
    return typeof TEMP_TEST_HIGH_SCORE === "number";
}

export function resolveInitialHighScore({ storage, key }) {
    if (isTemporaryHighScoreTesting()) return TEMP_TEST_HIGH_SCORE;

    return Number(storage.getItem(key)) || 0;
}

export function createRendererOptions() {
    return {
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    };
}

export function resolveRendererPixelRatio(devicePixelRatio = 1) {
    return Math.min(devicePixelRatio || 1, 1.6);
}

export function createBloomSettings() {
    return {
        strength: 1.24,
        threshold: 0.42,
        radius: 0.12
    };
}

export default class Game {
    constructor({ THREEImpl = window.THREE, doc = document, storage = localStorage, HowlClass = Howl } = {}) {
        window.game = this;
        this.THREE = THREEImpl;
        this.HowlClass = HowlClass;
        this.document = doc;
        this.storage = storage;
        this.localStorageName = "hyperbouncescore";
        resetSavedHighScoreIfRequested({
            storage: this.storage,
            location: this.document.defaultView && this.document.defaultView.location,
            history: this.document.defaultView && this.document.defaultView.history,
            key: this.localStorageName
        });
        this.highScore = resolveInitialHighScore({
            storage: this.storage,
            key: this.localStorageName
        });
        this.score = 0;
        this.multiplier = 1;
        this.speed = GAME_CONFIG.run.baseSpeed;
        this.state = UI_STATES.start;
        this.hasPlayedLaunchSequence = false;
        this.launchElapsed = 0;
        this.launchLastCountdown = null;
        this.launchIntroSeconds = GAME_CONFIG.launch.introSeconds;
        this.launchCountdownSeconds = GAME_CONFIG.launch.countdownSeconds;
        this.musicPulsePhase = 0;
        this.isMuted = false;
        this.cameraTarget = new this.THREE.Vector3();

        this.setupAudio();
        this.setupScene();
        this.setupUi();
        this.resetRun({ showGameplayObjects: false });

        this.animate = this.animate.bind(this);
        this.start = this.start.bind(this);
        this.restart = this.restart.bind(this);
        this.toggleSound = this.toggleSound.bind(this);
        this.playUiHoverSfx = this.playUiHoverSfx.bind(this);
        this.onResize = this.onResize.bind(this);

        this.hud.bindControls({
            start: this.start,
            retry: this.restart,
            sound: this.toggleSound,
            hover: this.playUiHoverSfx
        });
        this.hud.showStart({ highScore: this.highScore });
        this.scheduleIntroSequence();
        this.document.defaultView.addEventListener("resize", this.onResize);
        requestAnimationFrame(this.animate);
    }

    setupAudio() {
        this.musicMenuVolume = MENU_MUSIC_VOLUME;
        this.musicRunVolume = RUN_MUSIC_VOLUME;
        this.musicFadeSeconds = RUN_MUSIC_FADE_SECONDS;
        this.musicNormalRate = NORMAL_MUSIC_RATE;
        this.musicDarkRate = DARK_MUSIC_RATE;
        this.musicHighScoreRate = HIGH_SCORE_MUSIC_RATE;
        this.musicShiftSeconds = MUSIC_RATE_SHIFT_SECONDS;
        this.bgm = new CrossfadeMusic({
            HowlClass: this.HowlClass,
            src: ["./src/sounds/neon-runner.wav"],
            volume: this.musicRunVolume,
            fadeSeconds: 4
        });
        this.bgm.play(this.musicMenuVolume);
        this.bounceSFX = createJumpSfx({ HowlClass: this.HowlClass });
        this.orbSFX = createOrbSfx({ HowlClass: this.HowlClass });
        this.introSFX = createIntroSfx({ HowlClass: this.HowlClass });
        this.uiSFX = createUiSfx({ HowlClass: this.HowlClass });
        this.comboSFX = createComboSfx({ HowlClass: this.HowlClass });
        this.highScoreSFX = createHighScoreSfx({ HowlClass: this.HowlClass });
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
        this.spaceTraffic = new SpaceTraffic({
            THREE: this.THREE,
            scene: this.scene
        });

        this.renderer = new this.THREE.WebGLRenderer(createRendererOptions());
        this.renderer.autoClear = false;
        this.renderer.setClearColor(COLORS.background);
        this.renderer.setPixelRatio(resolveRendererPixelRatio(window.devicePixelRatio));
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
            const bloomSettings = createBloomSettings();
            const bloom = new this.THREE.UnrealBloomPass(
                new this.THREE.Vector2(window.innerWidth, window.innerHeight),
                1.35,
                0.36,
                0.75
            );
            bloom.threshold = bloomSettings.threshold;
            bloom.strength = bloomSettings.strength;
            bloom.radius = bloomSettings.radius;
            bloom.renderToScreen = true;
            composer.addPass(bloom);
        }

        return composer;
    }

    resetRun({ showGameplayObjects = true } = {}) {
        this.score = 0;
        this.multiplier = 1;
        this.speed = GAME_CONFIG.run.baseSpeed;
        this.musicPulsePhase = 0;
        this.player.reset();
        this.platformManager.reset();
        this.setGameplayObjectsVisible(showGameplayObjects);
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

    setGameplayObjectsVisible(isVisible) {
        if (this.player && this.player.setVisible) {
            this.player.setVisible(isVisible);
        }
        if (this.platformManager && this.platformManager.setVisible) {
            this.platformManager.setVisible(isVisible);
        }
    }

    start() {
        if (this.state === UI_STATES.playing || this.state === UI_STATES.launching) return;

        this.resetRun();
        this.bgm.shiftRate(this.musicNormalRate, this.musicShiftSeconds);
        this.bgm.fadeTo(this.musicRunVolume, this.musicFadeSeconds);

        if (this.hasPlayedLaunchSequence === false) {
            this.beginLaunchSequence();
            return;
        }

        this.beginPlaying();
    }

    restart() {
        this.start();
    }

    beginLaunchSequence() {
        this.hasPlayedLaunchSequence = true;
        this.state = UI_STATES.launching;
        this.launchElapsed = 0;
        this.launchLastCountdown = null;

        if (this.platformManager.startLaunchReveal) {
            this.platformManager.startLaunchReveal();
        }
        if (this.player.beginTeleportArrival) {
            this.player.beginTeleportArrival();
        }
        this.input.start(this.canvas);

        this.hud.showLaunchSequence({
            score: this.score,
            highScore: this.highScore,
            multiplier: this.multiplier,
            countdown: ""
        });
    }

    updateLaunchSequence(delta) {
        this.launchElapsed += delta;

        if (this.platformManager.updateLaunchReveal) {
            this.platformManager.updateLaunchReveal(delta);
        }
        if (this.player.updateLaunchVisual) {
            this.player.updateLaunchVisual(delta);
        }

        const countdownElapsed = this.launchElapsed - this.launchIntroSeconds;
        if (countdownElapsed < 0) return;

        const countdownValue = Math.max(
            1,
            this.launchCountdownSeconds - Math.floor(countdownElapsed)
        );

        if (countdownElapsed < this.launchCountdownSeconds && countdownValue !== this.launchLastCountdown) {
            this.launchLastCountdown = countdownValue;
            this.hud.updateLaunchCountdown(String(countdownValue));
        }

        if (countdownElapsed >= this.launchCountdownSeconds) {
            this.finishLaunchSequence();
        }
    }

    finishLaunchSequence() {
        if (this.input && this.input.consumeMovement) {
            this.input.consumeMovement();
        }
        this.hud.hideLaunchCountdown();
        this.beginPlaying({ captureInput: false });
        if (this.input && this.input.capturePointer) {
            this.input.capturePointer();
        }
    }

    beginPlaying({ captureInput = true } = {}) {
        this.platformManager.releaseLaunchPad();
        this.state = UI_STATES.playing;
        if (captureInput) this.input.start(this.canvas);
        this.hud.showPlaying({
            score: this.score,
            highScore: this.highScore,
            multiplier: this.multiplier
        });
    }

    scheduleIntroSequence() {
        const view = this.document.defaultView || window;

        this.introTimers = [
            view.setTimeout(() => this.playIntroCue("zoom"), INTRO_ZOOM_DELAY_MS),
            view.setTimeout(() => this.playIntroCue("wipe"), INTRO_WIPE_DELAY_MS),
            view.setTimeout(() => this.playIntroCue("star"), INTRO_STAR_DELAY_MS),
            view.setTimeout(() => this.hud.finishIntro(), INTRO_MENU_READY_MS)
        ];
    }

    playIntroCue(name) {
        const cue = this.introSFX && this.introSFX[name];

        if (cue) cue.play();
    }

    playUiHoverSfx() {
        if (this.uiSFX && this.uiSFX.hover) this.uiSFX.hover.play();
    }

    triggerDeath() {
        if (this.state !== UI_STATES.playing) return;

        this.state = "dying";
        this.input.stop();
        this.player.beginDeath();
    }

    end() {
        const isNewHighScore = this.score > this.highScore;

        if (isNewHighScore && !isTemporaryHighScoreTesting()) {
            this.highScore = this.score;
            this.storage.setItem(this.localStorageName, String(this.highScore));
        }

        this.state = UI_STATES.gameOver;
        this.bgm.shiftRate(
            isNewHighScore ? this.musicHighScoreRate : this.musicDarkRate,
            this.musicShiftSeconds
        );
        if (isNewHighScore) this.playHighScoreCelebration();
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
        this.orbSFX.mute(this.isMuted);
        this.introSFX.mute(this.isMuted);
        if (this.uiSFX) this.uiSFX.mute(this.isMuted);
        if (this.comboSFX) this.comboSFX.mute(this.isMuted);
        if (this.highScoreSFX) this.highScoreSFX.mute(this.isMuted);
        this.hud.setSoundMuted(this.isMuted);
    }

    animate() {
        const delta = Math.min(this.clock.getDelta(), 0.033);

        if (this.state === UI_STATES.playing) {
            this.updatePlaying(delta);
        } else if (this.state === UI_STATES.launching) {
            this.updateLaunchSequence(delta);
        } else if (this.state === "dying") {
            this.platformManager.update(delta, this.speed * 0.55);
            if (this.player.updateDeath(delta)) this.end();
        }

        this.starfield.update(delta, Math.max(this.speed, 0.16));
        this.spaceTraffic.update(delta, Math.max(this.speed, 0.16));
        this.cameraLag();
        this.render();
        requestAnimationFrame(this.animate);
    }

    updatePlaying(delta) {
        const musicPulse = this.resolveMusicPulse(delta);

        this.player.syncRunSpeed(this.speed);
        this.player.update(delta, this.input.consumeMovement(), true);
        this.platformManager.update(delta, this.speed, musicPulse);

        if (this.player.landedThisFrame) {
            this.resolveLanding();
        }
    }

    resolveMusicPulse(delta) {
        const playbackRate = this.bgm && typeof this.bgm.rate === "number" ?
            this.bgm.rate :
            this.musicNormalRate || NORMAL_MUSIC_RATE;
        const speedProgress = clamp(
            (this.speed - GAME_CONFIG.run.baseSpeed) /
                Math.max(0.001, GAME_CONFIG.run.maxSpeed - GAME_CONFIG.run.baseSpeed),
            0,
            1
        );
        const tempo = playbackRate * (1.05 + speedProgress * 1.15);

        this.musicPulsePhase = (this.musicPulsePhase || 0) + delta * tempo * TWO_PI;

        const beatPosition = ((this.musicPulsePhase / TWO_PI) % 1 + 1) % 1;
        const beatDistance = Math.min(beatPosition, 1 - beatPosition);
        const intensity = Math.pow(clamp(1 - (beatDistance / 0.34), 0, 1), 2.15);

        return {
            intensity,
            tempo
        };
    }

    resolveLanding() {
        const platform = this.platformManager.current();

        if (!platform || !didLand(this.player.position.x, platform.group.position.x, platform.radius)) {
            this.triggerDeath();
            return;
        }

        const platformType = PLATFORM_TYPES[platform.type] || PLATFORM_TYPES.standard;
        const hasPickup = platformType.pickup && platform.pickup.visible;
        const hitPickup = hasPickup ?
            didCollect(
                this.player.position.x,
                platform.getPickupWorldX(),
                GAME_CONFIG.platform.pickupRadius
            ) :
            false;
        const previousMultiplier = this.multiplier;
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
        this.playOrbOutcomeSfx({ hasPickup, hitPickup });
        this.maybeShowMultiplierMilestone(previousMultiplier, this.multiplier);
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

    maybeShowMultiplierMilestone(previousMultiplier, nextMultiplier) {
        if (nextMultiplier <= previousMultiplier || nextMultiplier % 5 !== 0) return;

        this.hud.showMultiplierMilestone({
            multiplier: nextMultiplier,
            side: this.player.position.x >= 0 ? "left" : "right"
        });

        if (this.comboSFX && this.comboSFX.milestone) {
            this.comboSFX.milestone.play();
        }
    }

    playOrbOutcomeSfx({ hasPickup, hitPickup }) {
        if (!hasPickup || !this.orbSFX) return;

        const cue = hitPickup ? this.orbSFX.collect : this.orbSFX.miss;
        cue.play();
    }

    playHighScoreCelebration() {
        if (this.highScoreSFX && this.highScoreSFX.fanfare) {
            this.highScoreSFX.fanfare.play();
        }
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
