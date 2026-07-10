export const RENDER_QUALITY_SCALES = Object.freeze([1, 0.82, 0.68, 0.5, 0.4]);

export class AdaptiveRenderQuality {
    constructor({
        scales = RENDER_QUALITY_SCALES,
        sampleSeconds = 0.75,
        slowFps = 52,
        fastFps = 58,
        slowWindows = 2,
        fastWindows = 8,
        maxFrameSeconds = 0.2,
        catastrophicFrameStreak = 3
    } = {}) {
        this.scales = scales;
        this.sampleSeconds = sampleSeconds;
        this.slowFps = slowFps;
        this.fastFps = fastFps;
        this.slowWindows = slowWindows;
        this.fastWindows = fastWindows;
        this.maxFrameSeconds = maxFrameSeconds;
        this.catastrophicFrameStreak = catastrophicFrameStreak;
        this.tier = 0;
        this.sampleElapsed = 0;
        this.sampleFrames = 0;
        this.slowStreak = 0;
        this.fastStreak = 0;
        this.longFrameStreak = 0;
    }

    get scale() {
        return this.scales[this.tier];
    }

    resetSample() {
        this.sampleElapsed = 0;
        this.sampleFrames = 0;
    }

    resetMonitoring() {
        this.resetSample();
        this.slowStreak = 0;
        this.fastStreak = 0;
        this.longFrameStreak = 0;
    }

    update(frameSeconds, isActive = true) {
        if (!isActive) {
            this.resetMonitoring();
            return null;
        }

        if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) {
            this.longFrameStreak = 0;
            this.resetSample();
            return null;
        }

        let sampledFrameSeconds = frameSeconds;
        if (frameSeconds > this.maxFrameSeconds) {
            this.longFrameStreak += 1;
            if (this.longFrameStreak < this.catastrophicFrameStreak) {
                this.resetSample();
                return null;
            }
            sampledFrameSeconds = this.maxFrameSeconds;
        } else {
            this.longFrameStreak = 0;
        }

        this.sampleElapsed += sampledFrameSeconds;
        this.sampleFrames += 1;
        if (this.sampleElapsed < this.sampleSeconds) return null;

        const fps = this.sampleFrames / this.sampleElapsed;

        this.resetSample();
        if (fps < this.slowFps) {
            this.slowStreak += 1;
            this.fastStreak = 0;
        } else if (fps > this.fastFps) {
            this.fastStreak += 1;
            this.slowStreak = 0;
        } else {
            this.slowStreak = 0;
            this.fastStreak = 0;
        }

        if (this.slowStreak >= this.slowWindows && this.tier < this.scales.length - 1) {
            this.tier += 1;
            this.slowStreak = 0;
            return this.scale;
        }

        if (this.fastStreak >= this.fastWindows && this.tier > 0) {
            this.tier -= 1;
            this.fastStreak = 0;
            return this.scale;
        }

        return null;
    }
}
