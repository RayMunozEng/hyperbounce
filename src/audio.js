export function createJumpSfx({ HowlClass }) {
    return new HowlClass({
        src: ["./src/sounds/neon-jump.wav"],
        volume: 0.34,
        rate: 1
    });
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
        this.timer = null;
        this.stopTimer = null;
        this.tracks = [
            new HowlClass({ src, loop: false, autoplay: false, volume: 0 }),
            new HowlClass({ src, loop: false, autoplay: false, volume: 0 })
        ];
    }

    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.activeIndex = 0;
        this.activeTrack().volume(this.volume);
        this.activeTrack().play();
        this.scheduleCrossfade();
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
        const duration = this.activeTrack().duration();
        const fadeSeconds = this.fadeMs / 1000;

        if (!duration || duration <= fadeSeconds + 0.25) {
            this.clearTimer(this.timer);
            this.timer = this.setTimer(() => this.scheduleCrossfade(), 1000);
            return;
        }

        const delay = (duration - fadeSeconds) * 1000;

        this.clearTimer(this.timer);
        this.timer = this.setTimer(() => this.crossfade(), delay);
    }

    crossfade() {
        if (!this.isPlaying) return;

        const fadingOut = this.activeTrack();
        const fadingIn = this.inactiveTrack();

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
        this.timer = null;
        this.stopTimer = null;
    }
}
