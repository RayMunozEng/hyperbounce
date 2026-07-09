const ELEMENT_IDS = {
    shell: "app-shell",
    startPanel: "start-panel",
    startButton: "start-btn",
    retryButton: "retry-btn",
    soundButton: "sound-btn",
    score: "score",
    highScore: "highscore",
    multiplier: "multiplier",
    comboCallouts: "combo-callouts",
    launchCountdown: "launch-countdown",
    status: "status-chip",
    gameOver: "game-over"
};

const FIREWORK_SLOTS = ["left", "upper-left", "center", "upper-right", "right"];
const COMBO_CALLOUT_CLEANUP_MS = 2600;
const FIREWORK_CLEANUP_MS = 1900;
const INTRO_PANEL_HANDOFF_MS = 2450;

function scheduleTransientRemoval(doc, element, fallbackMs) {
    const view = doc.defaultView;
    let timer = null;
    let isRemoved = false;

    const removeElement = () => {
        if (isRemoved) return;

        isRemoved = true;
        if (timer && view && typeof view.clearTimeout === "function") {
            view.clearTimeout(timer);
        }
        element.remove();
    };

    element.addEventListener("animationend", removeElement);
    if (view && typeof view.setTimeout === "function") {
        timer = view.setTimeout(removeElement, fallbackMs);
    }
    element.removeTransient = removeElement;
}

export class Hud {
    constructor(doc = document) {
        this.document = doc;
        this.elements = {};
        this.introHandoffTimer = null;

        Object.keys(ELEMENT_IDS).forEach((key) => {
            this.elements[key] = this.document.getElementById(ELEMENT_IDS[key]);
        });
    }

    bindControls({ start, retry, sound, hover }) {
        if (start) this.elements.startButton.addEventListener("click", start);
        if (retry) this.elements.retryButton.addEventListener("click", retry);
        if (sound) this.elements.soundButton.addEventListener("click", sound);
        if (hover) this.bindHoverCue(hover);
    }

    bindHoverCue(handler) {
        this.controlElements().forEach((element) => {
            element.addEventListener("mouseenter", handler);
            element.addEventListener("focus", handler);
        });
    }

    controlElements() {
        const knownControls = [
            this.elements.startButton,
            this.elements.retryButton,
            this.elements.soundButton
        ].filter(Boolean);

        if (typeof this.document.querySelectorAll !== "function") {
            return knownControls;
        }

        return Array.from(new Set([
            ...knownControls,
            ...this.document.querySelectorAll("button")
        ]));
    }

    showStart({ highScore = 0 } = {}) {
        this.clearCelebration();
        this.setVisible(this.elements.startPanel, true);
        this.setVisible(this.elements.startButton, true);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, false);
        this.setVisible(this.elements.gameOver, false);
        this.hideLaunchCountdown();
        this.updateRun({ score: 0, highScore, multiplier: 1 });
    }

    showLaunchSequence({ score = 0, highScore = 0, multiplier = 1, countdown = "" } = {}) {
        this.clearCelebration();
        this.setVisible(this.elements.startPanel, false);
        this.setVisible(this.elements.startButton, false);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, false);
        this.setVisible(this.elements.gameOver, false);
        this.updateRun({ score, highScore, multiplier });
        this.updateLaunchCountdown(countdown);
        this.setVisible(this.elements.launchCountdown, true);
    }

    showPlaying(state) {
        this.clearCelebration();
        this.setVisible(this.elements.startPanel, false);
        this.setVisible(this.elements.startButton, false);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, true);
        this.setVisible(this.elements.gameOver, false);
        this.hideLaunchCountdown();
        this.updateRun(state);
    }

    showGameOver({ score, highScore, isNewHighScore }) {
        this.updateRun({ score, highScore, multiplier: 1 });
        this.elements.gameOver.textContent = isNewHighScore ? "NEW HIGH SCORE" : "GAME OVER";
        this.clearCelebration();
        if (isNewHighScore) {
            this.elements.gameOver.classList.add("high-score-title");
        }
        this.finishIntro({ immediate: true });
        this.setVisible(this.elements.status, true);
        this.setVisible(this.elements.gameOver, true);
        this.setVisible(this.elements.retryButton, true);
        this.setVisible(this.elements.startPanel, true);
        this.setVisible(this.elements.startButton, false);
        this.hideLaunchCountdown();
        if (isNewHighScore) this.showHighScoreCelebration();
    }

    updateRun({ score, highScore, multiplier }) {
        this.elements.score.textContent = String(score);
        this.elements.highScore.textContent = String(highScore);
        this.elements.multiplier.textContent = `x${multiplier}`;
    }

    updateLaunchCountdown(value) {
        if (!this.elements.launchCountdown) return;

        this.elements.launchCountdown.textContent = value;
        this.elements.launchCountdown.classList.remove("countdown-pop");
        void this.elements.launchCountdown.offsetWidth;
        if (value) {
            this.elements.launchCountdown.setAttribute("data-count", value);
            this.elements.launchCountdown.classList.add("countdown-pop");
        }
    }

    hideLaunchCountdown() {
        this.setVisible(this.elements.launchCountdown, false);
    }

    showMultiplierMilestone({ multiplier, side }) {
        if (!this.elements.comboCallouts || typeof this.document.createElement !== "function") {
            return null;
        }

        const callout = this.document.createElement("div");
        const resolvedSide = side === "right" ? "right" : "left";

        callout.className = `combo-callout combo-callout-${resolvedSide}`;
        callout.textContent = `x${multiplier}`;
        callout.setAttribute("aria-label", `Combo multiplier ${multiplier}`);
        scheduleTransientRemoval(this.document, callout, COMBO_CALLOUT_CLEANUP_MS);
        this.elements.comboCallouts.appendChild(callout);
        return callout;
    }

    showHighScoreCelebration() {
        if (!this.elements.comboCallouts || typeof this.document.createElement !== "function") {
            return [];
        }

        return FIREWORK_SLOTS.map((slot, index) => {
            const firework = this.document.createElement("div");

            firework.className = `neon-firework neon-firework-${slot}`;
            firework.setAttribute("aria-hidden", "true");
            scheduleTransientRemoval(this.document, firework, FIREWORK_CLEANUP_MS);
            this.elements.comboCallouts.appendChild(firework);
            return firework;
        });
    }

    clearCelebration() {
        const gameOver = this.elements.gameOver;
        const layer = this.elements.comboCallouts;

        if (gameOver) gameOver.classList.remove("high-score-title");
        if (!layer || !layer.children) return;

        Array.from(layer.children).forEach((child) => {
            if (child.className && child.className.includes("neon-firework")) {
                if (typeof child.removeTransient === "function") {
                    child.removeTransient();
                } else {
                    child.remove();
                }
            }
        });
    }

    setSoundMuted(isMuted) {
        this.elements.soundButton.textContent = isMuted ? "Sound Off" : "Sound On";
        this.elements.soundButton.setAttribute("aria-pressed", String(isMuted));
    }

    finishIntro({ immediate = false } = {}) {
        const panel = this.elements.startPanel;
        const view = this.document.defaultView;
        const clearHandoffTimer = () => {
            if (this.introHandoffTimer && view && typeof view.clearTimeout === "function") {
                view.clearTimeout(this.introHandoffTimer);
            }
            this.introHandoffTimer = null;
        };
        const clearIntroClasses = () => {
            panel.classList.remove("intro-panel");
            panel.classList.remove("intro-handoff");
            this.introHandoffTimer = null;
        };

        panel.classList.add("panel-ready");

        if (immediate || !panel.classList.contains("intro-panel")) {
            clearHandoffTimer();
            clearIntroClasses();
            return;
        }

        panel.classList.add("intro-handoff");
        clearHandoffTimer();

        if (view && typeof view.setTimeout === "function") {
            this.introHandoffTimer = view.setTimeout(clearIntroClasses, INTRO_PANEL_HANDOFF_MS);
        } else {
            clearIntroClasses();
        }
    }

    setVisible(element, isVisible) {
        if (!element) return;

        if (isVisible) {
            element.classList.remove("hidden");
        } else {
            element.classList.add("hidden");
        }
    }
}
