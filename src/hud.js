const ELEMENT_IDS = {
    shell: "app-shell",
    startPanel: "start-panel",
    startButton: "start-btn",
    retryButton: "retry-btn",
    soundButton: "sound-btn",
    score: "score",
    highScore: "highscore",
    multiplier: "multiplier",
    status: "status-chip",
    gameOver: "game-over"
};

export class Hud {
    constructor(doc = document) {
        this.document = doc;
        this.elements = {};

        Object.keys(ELEMENT_IDS).forEach((key) => {
            this.elements[key] = this.document.getElementById(ELEMENT_IDS[key]);
        });
    }

    bindControls({ start, retry, sound }) {
        if (start) this.elements.startButton.addEventListener("click", start);
        if (retry) this.elements.retryButton.addEventListener("click", retry);
        if (sound) this.elements.soundButton.addEventListener("click", sound);
    }

    showStart({ highScore = 0 } = {}) {
        this.setVisible(this.elements.startPanel, true);
        this.setVisible(this.elements.startButton, true);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, false);
        this.setVisible(this.elements.gameOver, false);
        this.updateRun({ score: 0, highScore, multiplier: 1 });
    }

    showPlaying(state) {
        this.setVisible(this.elements.startPanel, false);
        this.setVisible(this.elements.startButton, false);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, true);
        this.setVisible(this.elements.gameOver, false);
        this.updateRun(state);
    }

    showGameOver({ score, highScore, isNewHighScore }) {
        this.updateRun({ score, highScore, multiplier: 1 });
        this.elements.gameOver.textContent = isNewHighScore ? "NEW HIGH SCORE" : "GAME OVER";
        this.setVisible(this.elements.status, true);
        this.setVisible(this.elements.gameOver, true);
        this.setVisible(this.elements.retryButton, true);
        this.setVisible(this.elements.startPanel, true);
        this.setVisible(this.elements.startButton, false);
    }

    updateRun({ score, highScore, multiplier }) {
        this.elements.score.textContent = String(score);
        this.elements.highScore.textContent = String(highScore);
        this.elements.multiplier.textContent = `x${multiplier}`;
    }

    setSoundMuted(isMuted) {
        this.elements.soundButton.textContent = isMuted ? "Sound Off" : "Sound On";
        this.elements.soundButton.setAttribute("aria-pressed", String(isMuted));
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
