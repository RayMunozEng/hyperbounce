import Player from "./player";
import PlatformManager from "./platform_generator";
import { Howl } from "howler";
import {
    CrossfadeMusic,
    createComboSfx,
    createDeathSfx,
    createHighScoreSfx,
    createIntroSfx,
    createJumpSfx,
    createLaunchSfx,
    createOrbSfx,
    createUiSfx
} from "./audio";
import { createSharedAssets } from "./materials";
import { SpaceTraffic, Starfield } from "./effects";
import { didCollect, didLand } from "./collision";
import { GAME_CONFIG, PLATFORM_TYPES, COLORS, UI_STATES } from "./config";
import { InputController } from "./input";
import { Hud } from "./hud";
import { SupabaseAuthClient } from "./auth";
import { LeaderboardClient } from "./leaderboard";
import { AdaptiveRenderQuality } from "./render_quality";
import { RecordCelebration } from "./record_celebration";
import { resolveLandingScore } from "./scoring";
import { resolvePlatformBouncePhase } from "./tempo";

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

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function resolveInitialHighScore({ storage, key }) {
    const score = storage && typeof storage.getItem === "function" ?
        Math.floor(Number(storage.getItem(key))) :
        0;

    return Number.isFinite(score) && score > 0 ? score : 0;
}

export function resolveOverallHighScore(loadedScore = 0) {
    const score = Math.floor(Number(loadedScore));

    return Number.isFinite(score) && score > 0 ? score : 0;
}

export function createRendererOptions() {
    return {
        antialias: false,
        alpha: false,
        stencil: false,
        powerPreference: "high-performance"
    };
}

const MAX_RENDER_PIXELS = 1600000;
const MAX_RENDER_PIXEL_RATIO = 1.25;

export function resolveRendererPixelRatio(devicePixelRatio = 1, width = 0, height = 0) {
    const displayRatio = Math.max(0.5, Number(devicePixelRatio) || 1);
    const viewportPixels = Math.max(0, Number(width)) * Math.max(0, Number(height));
    const pixelBudgetRatio = viewportPixels > 0 ?
        Math.sqrt(MAX_RENDER_PIXELS / viewportPixels) :
        MAX_RENDER_PIXEL_RATIO;

    return Math.max(0.5, Math.min(displayRatio, MAX_RENDER_PIXEL_RATIO, pixelBudgetRatio));
}

export function createBloomSettings() {
    return {
        strength: 1.24,
        threshold: 0.42,
        radius: 0.12
    };
}

export default class Game {
    constructor({
        THREEImpl = window.THREE,
        doc = document,
        storage = localStorage,
        HowlClass = Howl,
        leaderboardClient = null,
        authClient = null
    } = {}) {
        window.game = this;
        this.THREE = THREEImpl;
        this.HowlClass = HowlClass;
        this.document = doc;
        this.storage = storage;
        this.windowObj = this.document.defaultView || window;
        this.leaderboardClient = leaderboardClient || new LeaderboardClient({
            windowObj: this.windowObj
        });
        this.authClient = authClient || new SupabaseAuthClient({
            windowObj: this.windowObj
        });
        if (this.leaderboardClient && this.leaderboardClient.setTokenProvider) {
            this.leaderboardClient.setTokenProvider(() =>
                this.authClient && this.authClient.getAccessToken ? this.authClient.getAccessToken() : ""
            );
        }
        this.localStorageName = "hyperbouncescore";
        this.highScore = resolveInitialHighScore({
            storage: this.storage,
            key: this.localStorageName
        });
        this.overallHighScore = resolveOverallHighScore();
        this.lastCelebratedOverallScore = 0;
        this.leaderboardEntries = [];
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
        this.musicPulse = { intensity: 0, tempo: 1 };
        this.renderQuality = new AdaptiveRenderQuality();
        this.renderScale = this.renderQuality.scale;
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
        this.submitLeaderboardScore = this.submitLeaderboardScore.bind(this);
        this.signInGoogle = this.signInGoogle.bind(this);
        this.sendEmailLink = this.sendEmailLink.bind(this);
        this.signOut = this.signOut.bind(this);
        this.onResize = this.onResize.bind(this);

        this.hud.bindControls({
            start: this.start,
            retry: this.restart,
            sound: this.toggleSound,
            submitScore: this.submitLeaderboardScore,
            signInGoogle: this.signInGoogle,
            sendEmailLink: this.sendEmailLink,
            signOut: this.signOut,
            hover: this.playUiHoverSfx
        });
        this.hud.showStart({
            highScore: this.highScore,
            overallHighScore: this.overallHighScore
        });
        this.initAuth();
        this.loadLeaderboard();
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
            src: ["./src/sounds/neon-runner.mp3"],
            volume: this.musicRunVolume,
            fadeSeconds: 4
        });
        this.bgm.play(this.musicMenuVolume);
        this.bounceSFX = createJumpSfx({ HowlClass: this.HowlClass });
        this.deathSFX = createDeathSfx({ HowlClass: this.HowlClass });
        this.orbSFX = createOrbSfx({ HowlClass: this.HowlClass });
        this.introSFX = createIntroSfx({ HowlClass: this.HowlClass });
        this.uiSFX = createUiSfx({ HowlClass: this.HowlClass });
        this.comboSFX = createComboSfx({ HowlClass: this.HowlClass });
        this.launchSFX = createLaunchSfx({ HowlClass: this.HowlClass });
        this.highScoreSFX = createHighScoreSfx({ HowlClass: this.HowlClass });
    }

    setupScene() {
        this.clock = new this.THREE.Timer();
        this.clock.connect(this.document);
        this.scene = new this.THREE.Scene();
        this.scene2 = this.scene;
        this.assets = createSharedAssets(this.THREE);

        const viewportWidth = this.windowObj.innerWidth;
        const viewportHeight = this.windowObj.innerHeight;

        this.camera = new this.THREE.PerspectiveCamera(
            GAME_CONFIG.camera.fov,
            viewportWidth / viewportHeight,
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
        this.recordCelebration = new RecordCelebration({
            THREE: this.THREE,
            texture: this.assets.textures.star
        });
        this.recordCelebration.resize(viewportWidth, viewportHeight);

        this.renderer = new this.THREE.WebGLRenderer(createRendererOptions());
        this.renderer.autoClear = false;
        this.renderer.setClearColor(COLORS.background);
        this.resizeRenderer(viewportWidth, viewportHeight);
    this.renderer.outputColorSpace = this.THREE.LinearSRGBColorSpace;
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
                new this.THREE.Vector2(this.windowObj.innerWidth, this.windowObj.innerHeight),
                1.35,
                0.36,
                0.75
            );
            bloom.threshold = bloomSettings.threshold;
            bloom.strength = bloomSettings.strength;
            bloom.radius = bloomSettings.radius;
            composer.addPass(bloom);
        }

        if (this.THREE.OutputPass) composer.addPass(new this.THREE.OutputPass());

        return composer;
    }

    resetRun({ showGameplayObjects = true } = {}) {
        this.score = 0;
        this.multiplier = 1;
        this.speed = GAME_CONFIG.run.baseSpeed;
        this.targetPlatformGap = Math.abs(GAME_CONFIG.platform.startZ);
        this.musicPulsePhase = 0;
        if (this.recordCelebration) this.recordCelebration.stop();
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
            overallHighScore: this.overallHighScore,
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
            overallHighScore: this.overallHighScore,
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
            this.playLaunchCountdownCue(countdownValue);
        }

        if (countdownElapsed >= this.launchCountdownSeconds) {
            this.finishLaunchSequence();
        }
    }

    finishLaunchSequence() {
        if (this.input && this.input.consumeMovement) {
            this.input.consumeMovement();
        }
        if (this.launchSFX && this.launchSFX.start) {
            this.launchSFX.start.play();
        }
        this.hud.hideLaunchCountdown();
        this.beginPlaying({ captureInput: false });
        if (this.input && this.input.capturePointer) {
            this.input.capturePointer();
        }
    }

    beginPlaying({ captureInput = true } = {}) {
        this.platformManager.releaseLaunchPad();
        this.targetPlatformGap = this.resolveTargetPlatformGap();
        this.state = UI_STATES.playing;
        if (captureInput) this.input.start(this.canvas);
        this.hud.showPlaying({
            score: this.score,
            highScore: this.highScore,
            overallHighScore: this.overallHighScore,
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

    playLaunchCountdownCue(value) {
        const cue = this.launchSFX && this.launchSFX.countdown;
        const rates = { 3: 0.9, 2: 1, 1: 1.12 };

        if (!cue) return;
        if (typeof cue.rate === "function") cue.rate(rates[value] || 1);
        cue.play();
    }

    triggerDeath() {
        if (this.state !== UI_STATES.playing) return;

        this.state = "dying";
        this.input.stop();
        this.player.beginDeath();
        this.deathSFX.play();
    }

    end() {
        const isNewHighScore = this.score > this.highScore;
        const isAllTimeHighScore = this.isAllTimeRecord ?
            this.isAllTimeRecord(this.score) :
            false;
        const qualifiesForLeaderboard = this.canSubmitLeaderboardScore ?
            this.canSubmitLeaderboardScore(this.score) :
            false;

        if (isNewHighScore) {
            this.highScore = this.score;
            this.storage.setItem(this.localStorageName, String(this.highScore));
        }
        if (isAllTimeHighScore) {
            this.lastCelebratedOverallScore = Math.max(
                Number(this.lastCelebratedOverallScore) || 0,
                this.score
            );
        }

        this.state = UI_STATES.gameOver;
        this.bgm.shiftRate(
            isNewHighScore || isAllTimeHighScore ? this.musicHighScoreRate : this.musicDarkRate,
            this.musicShiftSeconds
        );
        if (isNewHighScore || isAllTimeHighScore) {
            this.playHighScoreCelebration(isAllTimeHighScore ? "all-time" : "personal");
        }
        if (this.recordCelebration) {
            if (isAllTimeHighScore) {
                this.recordCelebration.start();
            } else {
                this.recordCelebration.stop();
            }
        }
        this.hud.showGameOver({
            score: this.score,
            highScore: this.highScore,
            overallHighScore: this.overallHighScore,
            isNewHighScore,
            isAllTimeHighScore,
            qualifiesForLeaderboard
        });
    }

    toggleSound() {
        this.isMuted = !this.isMuted;
        this.bgm.mute(this.isMuted);
        this.bounceSFX.mute(this.isMuted);
        this.deathSFX.mute(this.isMuted);
        this.orbSFX.mute(this.isMuted);
        this.introSFX.mute(this.isMuted);
        if (this.uiSFX) this.uiSFX.mute(this.isMuted);
        if (this.comboSFX) this.comboSFX.mute(this.isMuted);
        if (this.launchSFX) this.launchSFX.mute(this.isMuted);
        if (this.highScoreSFX) this.highScoreSFX.mute(this.isMuted);
        this.hud.setSoundMuted(this.isMuted);
    }

    animate(timestamp) {
        this.clock.update(timestamp);
        const rawDelta = this.clock.getDelta();
        const delta = Math.min(rawDelta, 0.033);

        this.updateRenderQuality(rawDelta);

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
        if (this.recordCelebration) this.recordCelebration.update(delta);
        this.cameraLag();
        this.render();
        requestAnimationFrame(this.animate);
    }

    updatePlaying(delta) {
        const musicPulse = this.resolveMusicPulse(delta);

        this.player.syncRunSpeed(this.speed, this.targetPlatformGap);
        this.platformManager.update(delta, this.speed, musicPulse);
        const bouncePhase = this.resolveTargetPlatformPhase();

        this.player.update(
            delta,
            this.input.consumeMovement(),
            true,
            bouncePhase
        );

        if (this.player.landedThisFrame) {
            this.resolveLanding();
            const nextPhase = this.resolveTargetPlatformPhase();

            if (Number.isFinite(nextPhase) && this.player.syncBouncePhase) {
                this.player.syncBouncePhase(nextPhase);
            }
        }
    }

    resolveTargetPlatformPhase() {
        const platform = this.platformManager && typeof this.platformManager.current === "function" ?
            this.platformManager.current() :
            null;

        if (!platform || !platform.group || !platform.group.position) return null;

        return resolvePlatformBouncePhase(
            platform.group.position.z,
            platform.travelGap,
            GAME_CONFIG.platform.landingZ
        );
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

        const pulse = this.musicPulse || (this.musicPulse = { intensity: 0, tempo: 1 });
        pulse.intensity = intensity;
        pulse.tempo = tempo;
        return pulse;
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
        this.targetPlatformGap = this.resolveTargetPlatformGap();
        this.speed = Math.min(
            GAME_CONFIG.run.maxSpeed,
            this.speed + GAME_CONFIG.run.speedGain
        );
        this.bounceSFX.play();
        this.hud.updateRun({
            score: this.score,
            highScore: this.highScore,
            overallHighScore: this.overallHighScore,
            multiplier: this.multiplier
        });
    }

    resolveTargetPlatformGap() {
        const platform = this.platformManager && typeof this.platformManager.current === "function" ?
            this.platformManager.current() :
            null;
        const travelGap = Number(platform && platform.travelGap);

        return travelGap > 0 ? travelGap : Math.abs(GAME_CONFIG.platform.startZ);
    }

    canSubmitLeaderboardScore(score) {
        return Boolean(
            this.leaderboardClient &&
            this.leaderboardClient.isEnabled &&
            this.leaderboardClient.isEnabled() &&
            this.leaderboardClient.qualifies(score, this.leaderboardEntries)
        );
    }

    isAllTimeRecord(score) {
        const client = this.leaderboardClient;
        const hasLoadedRecord = Number(this.overallHighScore) > 0;
        const recordToBeat = Math.max(
            Number(this.overallHighScore) || 0,
            Number(this.lastCelebratedOverallScore) || 0
        );

        return Boolean(
            client &&
            client.isEnabled &&
            client.isEnabled() &&
            hasLoadedRecord &&
            score > recordToBeat
        );
    }

    loadLeaderboard() {
        if (!this.leaderboardClient || !this.leaderboardClient.isEnabled || !this.leaderboardClient.isEnabled()) {
            this.leaderboardEntries = [];
            this.overallHighScore = 0;
            if (this.hud.setLeaderboardAvailability) this.hud.setLeaderboardAvailability(false);
            return Promise.resolve();
        }

        if (this.hud.setLeaderboardAvailability) this.hud.setLeaderboardAvailability(true);

        return this.leaderboardClient.load()
            .then((leaderboard) => {
                this.applyLeaderboard(leaderboard);
            })
            .catch(() => {
                this.hud.setLeaderboard({
                    entries: [],
                    overallHighScore: 0,
                    emptyMessage: "Leaderboard unavailable."
                });
            });
    }

    applyLeaderboard({ entries = [], overallHighScore = 0 } = {}) {
        this.leaderboardEntries = entries;
        this.overallHighScore = resolveOverallHighScore(overallHighScore);
        this.lastCelebratedOverallScore = Math.max(
            Number(this.lastCelebratedOverallScore) || 0,
            this.overallHighScore
        );
        if (this.hud.setLeaderboardAvailability) this.hud.setLeaderboardAvailability(true);
        this.hud.setLeaderboard({
            entries: this.leaderboardEntries,
            overallHighScore: this.overallHighScore
        });
    }

    initAuth() {
        if (!this.authClient || !this.hud || !this.hud.setAuthState) return Promise.resolve(null);

        const isConfigured = this.authClient.isConfigured && this.authClient.isConfigured();

        this.hud.setAuthState({ isConfigured });
        if (!isConfigured) return Promise.resolve(null);

        if (this.authClient.subscribe) {
            this.authSubscription = this.authClient.subscribe((event, session) => {
                this.applyAuthSession(session, event === "SIGNED_IN" ? "Signed in" : "");
            });
        }

        return this.authClient.loadSession()
            .then((session) => this.applyAuthSession(session))
            .catch(() => {
                this.hud.setAuthState({
                    isConfigured: true,
                    isSignedIn: false,
                    message: "Could not load account"
                });
            });
    }

    applyAuthSession(session, message = "") {
        const isSignedIn = Boolean(session && session.access_token);
        const email = this.authClient && this.authClient.getUserEmail ? this.authClient.getUserEmail() : "";

        this.hud.setAuthState({
            isConfigured: this.authClient && this.authClient.isConfigured ? this.authClient.isConfigured() : false,
            isSignedIn,
            email,
            message: message || (isSignedIn ? "Signed in" : "Sign in to save top scores.")
        });

        return session;
    }

    signInGoogle() {
        if (!this.authClient || !this.authClient.isConfigured || !this.authClient.isConfigured()) {
            this.hud.setAuthState({ isConfigured: false });
            return Promise.resolve();
        }

        this.hud.setAuthState({
            isConfigured: true,
            isSignedIn: false,
            message: "Opening Google sign-in..."
        });

        return this.authClient.signInWithGoogle()
            .catch(() => {
                this.hud.setAuthState({
                    isConfigured: true,
                    isSignedIn: false,
                    message: "Google sign-in failed"
                });
            });
    }

    sendEmailLink(event) {
        if (event && event.preventDefault) event.preventDefault();

        if (!this.authClient || !this.authClient.isConfigured || !this.authClient.isConfigured()) {
            this.hud.setAuthState({ isConfigured: false });
            return Promise.resolve();
        }

        const email = this.hud.readAuthEmail();

        if (!email) {
            this.hud.setAuthState({
                isConfigured: true,
                isSignedIn: false,
                message: "Enter an email first"
            });
            return Promise.resolve();
        }

        this.hud.setAuthState({
            isConfigured: true,
            isSignedIn: false,
            message: "Sending magic link..."
        });

        return this.authClient.sendMagicLink(email)
            .then(() => {
                this.hud.setAuthState({
                    isConfigured: true,
                    isSignedIn: false,
                    message: "Check your email for the link"
                });
            })
            .catch(() => {
                this.hud.setAuthState({
                    isConfigured: true,
                    isSignedIn: false,
                    message: "Could not send magic link"
                });
            });
    }

    signOut() {
        if (!this.authClient || !this.authClient.isConfigured || !this.authClient.isConfigured()) {
            this.hud.setAuthState({ isConfigured: false });
            return Promise.resolve();
        }

        return this.authClient.signOut()
            .then(() => this.applyAuthSession(null, "Signed out"))
            .catch(() => {
                this.hud.setAuthState({
                    isConfigured: true,
                    isSignedIn: true,
                    email: this.authClient.getUserEmail ? this.authClient.getUserEmail() : "",
                    message: "Could not sign out"
                });
            });
    }

    submitLeaderboardScore(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (!this.leaderboardClient || !this.leaderboardClient.isEnabled || !this.leaderboardClient.isEnabled()) {
            return Promise.resolve();
        }

        if (this.authClient && this.authClient.getAccessToken && !this.authClient.getAccessToken()) {
            this.hud.setLeaderboardSubmitState({
                status: "error",
                message: "Sign in first"
            });
            return Promise.resolve();
        }

        const name = this.hud.readLeaderboardName();
        if (!name) {
            this.hud.setLeaderboardSubmitState({
                status: "error",
                message: "Enter a name first"
            });
            return Promise.resolve();
        }

        this.hud.setLeaderboardSubmitState({
            status: "saving",
            message: "Saving score..."
        });

        return this.leaderboardClient.submit({
                name,
                score: this.score
            })
            .then((result) => {
                this.applyLeaderboard(result);
                if (result.accepted) this.hud.showLeaderboardPrompt(false);
                this.hud.setLeaderboardSubmitState({
                    status: "success",
                    message: result.accepted ? "Leaderboard updated" : "Score missed the top 10"
                });
            })
            .catch(() => {
                this.hud.setLeaderboardSubmitState({
                    status: "error",
                    message: "Could not save score"
                });
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

    playHighScoreCelebration(tier = "personal") {
        if (!this.highScoreSFX) return;

        const cue = tier === "all-time" && this.highScoreSFX.allTimeFanfare ?
            this.highScoreSFX.allTimeFanfare :
            this.highScoreSFX.fanfare;

        if (cue) cue.play();
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
        if (this.recordCelebration) this.recordCelebration.render(this.renderer);
    }

    updateRenderQuality(rawDelta) {
        const isActive = !this.document.hidden && (
            this.state === UI_STATES.launching ||
            this.state === UI_STATES.playing ||
            this.state === "dying"
        );
        const nextScale = this.renderQuality.update(rawDelta, isActive);

        if (nextScale === null) return false;

        this.renderScale = nextScale;
        this.resizeRenderer(this.windowObj.innerWidth, this.windowObj.innerHeight);
        return true;
    }

    resizeRenderer(width, height) {
        const basePixelRatio = resolveRendererPixelRatio(
            this.windowObj.devicePixelRatio,
            width,
            height
        );
        const pixelRatio = Math.max(0.35, basePixelRatio * (this.renderScale || 1));

        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height);
        if (this.composer && this.composer.setSize) {
            if (this.composer.setPixelRatio) this.composer.setPixelRatio(pixelRatio);
            this.composer.setSize(width, height);
        }

        return pixelRatio;
    }

    onResize() {
        const width = this.windowObj.innerWidth;
        const height = this.windowObj.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.resizeRenderer(width, height);
        if (this.recordCelebration) this.recordCelebration.resize(width, height);
    }
}
