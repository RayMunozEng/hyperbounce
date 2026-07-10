export function createJumpSfx({ HowlClass }) {
    return createSfx({
        HowlClass,
        src: "./src/sounds/neon-jump.wav",
        volume: 0.34
    });
}

export function createDeathSfx({ HowlClass }) {
    return createSfx({
        HowlClass,
        src: "./src/sounds/gravity-rift-death.wav",
        volume: 0.46
    });
}

export function createOrbSfx({ HowlClass }) {
    const sounds = {
        collect: createSfx({
            HowlClass,
            src: "./src/sounds/orb-collect.wav",
            volume: 0.32
        }),
        miss: createSfx({
            HowlClass,
            src: "./src/sounds/orb-miss.wav",
            volume: 0.28
        })
    };

    return {
        ...sounds,
        mute(isMuted) {
            muteSfxGroup(sounds, isMuted);
        }
    };
}

export function createIntroSfx({ HowlClass }) {
    const sounds = {
        zoom: createSfx({
            HowlClass,
            src: "./src/sounds/intro-zoom.wav",
            volume: 0.22
        }),
        wipe: createSfx({
            HowlClass,
            src: "./src/sounds/intro-wipe.wav",
            volume: 0.2
        }),
        star: createSfx({
            HowlClass,
            src: "./src/sounds/intro-star.wav",
            volume: 0.34
        })
    };

    return {
        ...sounds,
        mute(isMuted) {
            muteSfxGroup(sounds, isMuted);
        }
    };
}

export function createUiSfx({ HowlClass }) {
    const sounds = {
        hover: createSfx({
            HowlClass,
            src: "./src/sounds/ui-hover.wav",
            volume: 0.14
        })
    };

    return {
        ...sounds,
        mute(isMuted) {
            muteSfxGroup(sounds, isMuted);
        }
    };
}

export function createComboSfx({ HowlClass }) {
    const sounds = {
        milestone: createSfx({
            HowlClass,
            src: "./src/sounds/combo-milestone.wav",
            volume: 0.34
        })
    };

    return {
        ...sounds,
        mute(isMuted) {
            muteSfxGroup(sounds, isMuted);
        }
    };
}

export function createLaunchSfx({ HowlClass }) {
    const sounds = {
        countdown: createSfx({
            HowlClass,
            src: "./src/sounds/countdown-pulse.wav",
            volume: 0.38
        }),
        start: createSfx({
            HowlClass,
            src: "./src/sounds/launch-start.wav",
            volume: 0.5
        })
    };

    return {
        ...sounds,
        mute(isMuted) {
            muteSfxGroup(sounds, isMuted);
        }
    };
}

export function createHighScoreSfx({ HowlClass }) {
    const sounds = {
        fanfare: createSfx({
            HowlClass,
            src: "./src/sounds/high-score-fanfare.wav",
            volume: 0.42
        }),
        allTimeFanfare: createSfx({
            HowlClass,
            src: "./src/sounds/all-time-record-fanfare.wav",
            volume: 0.52
        })
    };

    return {
        ...sounds,
        mute(isMuted) {
            muteSfxGroup(sounds, isMuted);
        }
    };
}

function createSfx({ HowlClass, src, volume, rate = 1 }) {
    return new HowlClass({
        src: [src],
        volume,
        rate,
        onplayerror: replayAfterAudioUnlock
    });
}

function muteSfxGroup(sounds, isMuted) {
    Object.keys(sounds).forEach((key) => sounds[key].mute(isMuted));
}

function replayAfterAudioUnlock() {
    if (typeof this.once !== "function") return;

    this.once("unlock", () => this.play());
}

export class CrossfadeMusic {
    constructor({
        HowlClass,
        src,
        volume = 0.55,
        fadeSeconds = 4,
        setTimer = window.setTimeout.bind(window),
        clearTimer = window.clearTimeout.bind(window)
    }) {
        this.volume = volume;
        this.fadeMs = fadeSeconds * 1000;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.activeIndex = 0;
        this.isPlaying = false;
        this.rate = 1;
        this.rateTimer = null;
        this.rateAnimationId = 0;
        this.timer = null;
        this.stopTimer = null;
        this.tracks = [
            new HowlClass({
                src,
                loop: false,
                autoplay: false,
                volume: 0,
                onplayerror: replayAfterAudioUnlock
            }),
            new HowlClass({
                src,
                loop: false,
                autoplay: false,
                volume: 0,
                onplayerror: replayAfterAudioUnlock
            })
        ];
    }

    play(volume = this.volume) {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.volume = volume;
        this.activeIndex = 0;
        if (this.rate !== 1) this.applyRateToTrack(this.activeTrack());
        this.activeTrack().volume(this.volume);
        this.activeTrack().play();
        this.scheduleCrossfade();
    }

    fadeTo(volume, fadeSeconds = this.fadeMs / 1000) {
        const fadeMs = fadeSeconds * 1000;

        if (!this.isPlaying) {
            this.volume = volume;
            return;
        }

        this.activeTrack().fade(this.volume, volume, fadeMs);
        this.volume = volume;
    }

    shiftRate(rate, seconds = 0.45) {
        const startRate = this.rate;
        const stepCount = 8;
        const stepDelay = (seconds * 1000) / stepCount;
        const animationId = this.rateAnimationId + 1;

        this.rateAnimationId = animationId;
        this.clearTimer(this.rateTimer);

        if (!seconds || startRate === rate) {
            this.setRate(rate);
            return;
        }

        let step = 0;
        const tick = () => {
            if (animationId !== this.rateAnimationId) return;

            step += 1;
            const progress = step / stepCount;
            const eased = 1 - Math.pow(1 - progress, 2);
            const nextRate = startRate + ((rate - startRate) * eased);

            this.setRate(step === stepCount ? rate : nextRate);

            if (step < stepCount) {
                this.rateTimer = this.setTimer(tick, stepDelay);
            } else {
                this.rateTimer = null;
            }
        };

        this.rateTimer = this.setTimer(tick, stepDelay);
    }

    setRate(rate) {
        this.rate = rate;
        this.tracks.forEach((track) => this.applyRateToTrack(track));
        if (this.isPlaying) this.scheduleCrossfade();
    }

    applyRateToTrack(track) {
        if (typeof track.rate === "function") track.rate(this.rate);
    }

    stop() {
        this.isPlaying = false;
        this.clearScheduled();
        this.tracks.forEach((track) => track.stop());
    }

    mute(isMuted) {
        this.tracks.forEach((track) => track.mute(isMuted));
    }

    activeTrack() {
        return this.tracks[this.activeIndex];
    }

    inactiveTrack() {
        return this.tracks[1 - this.activeIndex];
    }

    scheduleCrossfade() {
        const track = this.activeTrack();
        const duration = track.duration();
        const fadeSeconds = this.fadeMs / 1000;

        if (!duration || duration <= fadeSeconds + 0.25) {
            this.clearTimer(this.timer);
            this.timer = this.setTimer(() => this.scheduleCrossfade(), 1000);
            return;
        }

        const seek = typeof track.seek === "function" ? Number(track.seek()) : 0;
        const elapsedSeconds = Number.isFinite(seek) ? Math.max(0, seek) : 0;
        const playbackRate = Number.isFinite(this.rate) && this.rate > 0 ? this.rate : 1;
        const remainingSeconds = Math.max(0, (duration - elapsedSeconds) / playbackRate);
        const delay = Math.max(0, (remainingSeconds - fadeSeconds) * 1000);

        this.clearTimer(this.timer);
        this.timer = this.setTimer(() => this.crossfade(), delay);
    }

    crossfade() {
        if (!this.isPlaying) return;

        const fadingOut = this.activeTrack();
        const fadingIn = this.inactiveTrack();

        this.applyRateToTrack(fadingIn);
        fadingIn.volume(0);
        fadingIn.play();
        fadingIn.fade(0, this.volume, this.fadeMs);
        fadingOut.fade(this.volume, 0, this.fadeMs);
        this.clearTimer(this.stopTimer);
        this.stopTimer = this.setTimer(() => fadingOut.stop(), this.fadeMs);
        this.activeIndex = 1 - this.activeIndex;
        this.scheduleCrossfade();
    }

    clearScheduled() {
        this.clearTimer(this.timer);
        this.clearTimer(this.stopTimer);
        this.clearTimer(this.rateTimer);
        this.timer = null;
        this.stopTimer = null;
        this.rateTimer = null;
    }
}
