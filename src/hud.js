const ELEMENT_IDS = {
    shell: "app-shell",
    startPanel: "start-panel",
    startButton: "start-btn",
    retryButton: "retry-btn",
    soundButton: "sound-btn",
    score: "score",
    highScore: "highscore",
    overallHighScore: "overall-highscore",
    multiplier: "multiplier",
    overallStat: "overall-stat",
    leaderboardPanel: "leaderboard-panel",
    leaderboardList: "leaderboard-list",
    leaderboardEmpty: "leaderboard-empty",
    leaderboardForm: "leaderboard-form",
    leaderboardName: "leaderboard-name",
    leaderboardSubmit: "leaderboard-submit",
    leaderboardMessage: "leaderboard-message",
    authPanel: "auth-panel",
    authEmail: "auth-email",
    authEmailButton: "auth-email-btn",
    authGoogleButton: "auth-google-btn",
    authSignOutButton: "auth-signout-btn",
    authUser: "auth-user",
    authMessage: "auth-message",
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

    bindControls({ start, retry, sound, hover, submitScore, signInGoogle, sendEmailLink, signOut }) {
        if (start && this.elements.startButton) this.elements.startButton.addEventListener("click", start);
        if (retry && this.elements.retryButton) this.elements.retryButton.addEventListener("click", retry);
        if (sound && this.elements.soundButton) this.elements.soundButton.addEventListener("click", sound);
        if (submitScore && this.elements.leaderboardForm) {
            this.elements.leaderboardForm.addEventListener("submit", submitScore);
        }
        if (signInGoogle && this.elements.authGoogleButton) {
            this.elements.authGoogleButton.addEventListener("click", signInGoogle);
        }
        if (sendEmailLink && this.elements.authEmailButton) {
            this.elements.authEmailButton.addEventListener("click", sendEmailLink);
        }
        if (signOut && this.elements.authSignOutButton) {
            this.elements.authSignOutButton.addEventListener("click", signOut);
        }
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

    showStart({ highScore = 0, overallHighScore = 0 } = {}) {
        this.clearCelebration();
        this.showLeaderboardPrompt(false);
        this.setVisible(this.elements.startPanel, true);
        this.setVisible(this.elements.startButton, true);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, false);
        this.setVisible(this.elements.gameOver, false);
        this.hideLaunchCountdown();
        this.updateRun({ score: 0, highScore, overallHighScore, multiplier: 1 });
    }

    showLaunchSequence({ score = 0, highScore = 0, overallHighScore = 0, multiplier = 1, countdown = "" } = {}) {
        this.clearCelebration();
        this.showLeaderboardPrompt(false);
        this.setVisible(this.elements.startPanel, false);
        this.setVisible(this.elements.startButton, false);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, false);
        this.setVisible(this.elements.gameOver, false);
        this.updateRun({ score, highScore, overallHighScore, multiplier });
        this.updateLaunchCountdown(countdown);
        this.setVisible(this.elements.launchCountdown, true);
    }

    showPlaying(state) {
        this.clearCelebration();
        this.showLeaderboardPrompt(false);
        this.setVisible(this.elements.startPanel, false);
        this.setVisible(this.elements.startButton, false);
        this.setVisible(this.elements.retryButton, false);
        this.setVisible(this.elements.status, true);
        this.setVisible(this.elements.gameOver, false);
        this.hideLaunchCountdown();
        this.updateRun(state);
    }

    showGameOver({
        score,
        highScore,
        overallHighScore = 0,
        isNewHighScore,
        isAllTimeHighScore = false,
        qualifiesForLeaderboard = false
    }) {
        this.updateRun({ score, highScore, overallHighScore, multiplier: 1 });
        this.elements.gameOver.textContent = isAllTimeHighScore ?
            "ALL-TIME RECORD" :
            (isNewHighScore ? "NEW HIGH SCORE" : "GAME OVER");
        this.clearCelebration();
        if (isNewHighScore || isAllTimeHighScore) {
            this.elements.gameOver.classList.add("high-score-title");
        }
        if (isAllTimeHighScore) {
            this.elements.gameOver.classList.add("all-time-score-title");
        }
        this.finishIntro({ immediate: true });
        this.setVisible(this.elements.status, true);
        this.setVisible(this.elements.gameOver, true);
        this.setVisible(this.elements.retryButton, true);
        this.setVisible(this.elements.startPanel, true);
        this.setVisible(this.elements.startButton, false);
        this.showLeaderboardPrompt(qualifiesForLeaderboard);
        this.hideLaunchCountdown();
        if (isNewHighScore || isAllTimeHighScore) {
            this.showScoreCelebration({ tier: isAllTimeHighScore ? "all-time" : "personal" });
        }
    }

    updateRun({ score, highScore, overallHighScore = 0, multiplier }) {
        this.elements.score.textContent = String(score);
        this.elements.highScore.textContent = String(highScore);
        if (this.elements.overallHighScore) {
            this.elements.overallHighScore.textContent = String(overallHighScore);
        }
        this.elements.multiplier.textContent = `x${multiplier}`;
    }

    setLeaderboard({ entries = [], overallHighScore = 0, emptyMessage = "No scores yet." } = {}) {
        if (this.elements.overallHighScore) {
            this.elements.overallHighScore.textContent = String(overallHighScore);
        }
        if (!this.elements.leaderboardList || !this.document.createElement) return;

        if (typeof this.elements.leaderboardList.replaceChildren === "function") {
            this.elements.leaderboardList.replaceChildren();
        } else {
            this.elements.leaderboardList.children = [];
        }
        entries.slice(0, 10).forEach((entry, index) => {
            const row = this.document.createElement("li");
            const rank = this.document.createElement("span");
            const name = this.document.createElement("strong");
            const score = this.document.createElement("span");

            row.className = index === 0 ?
                "leaderboard-row leaderboard-champion" :
                `leaderboard-row${index < 3 ? " leaderboard-podium" : ""}`;
            rank.className = "leaderboard-rank";
            name.className = "leaderboard-name";
            score.className = "leaderboard-score";
            rank.textContent = String(index + 1).padStart(2, "0");
            name.textContent = entry.name;
            score.textContent = String(entry.score);
            row.appendChild(rank);
            row.appendChild(name);
            row.appendChild(score);
            this.elements.leaderboardList.appendChild(row);
        });

        if (this.elements.leaderboardEmpty) this.elements.leaderboardEmpty.textContent = emptyMessage;
        this.setVisible(this.elements.leaderboardEmpty, entries.length === 0);
    }

    setLeaderboardAvailability(isAvailable) {
        this.setVisible(this.elements.leaderboardPanel, isAvailable);
        this.setVisible(this.elements.overallStat, isAvailable);
    }

    showLeaderboardPrompt(isVisible) {
        this.setVisible(this.elements.leaderboardForm, isVisible);
        if (isVisible) {
            this.setLeaderboardSubmitState({
                status: "idle",
                message: "Top 10 score. Add your name."
            });
        }
    }

    readLeaderboardName() {
        return this.elements.leaderboardName ? this.elements.leaderboardName.value.trim() : "";
    }

    readAuthEmail() {
        return this.elements.authEmail ? this.elements.authEmail.value.trim() : "";
    }

    setLeaderboardSubmitState({ status = "idle", message = "" } = {}) {
        if (this.elements.leaderboardMessage) this.elements.leaderboardMessage.textContent = message;
        if (this.elements.leaderboardSubmit) this.elements.leaderboardSubmit.disabled = status === "saving";
    }

    setAuthState({ isConfigured = false, isSignedIn = false, email = "", message = "" } = {}) {
        const resolvedMessage = message || "Sign in to save top scores.";
        const showSignInOptions = isConfigured && !isSignedIn;

        this.setVisible(this.elements.authPanel, isConfigured);

        if (this.elements.authUser) {
            this.elements.authUser.textContent = isSignedIn && email ? email : "Guest";
        }
        if (this.elements.authMessage) {
            this.elements.authMessage.textContent = resolvedMessage;
        }
        if (this.elements.authEmail) {
            this.elements.authEmail.disabled = !isConfigured || isSignedIn;
            this.setVisible(this.elements.authEmail, showSignInOptions);
        }
        if (this.elements.authEmailButton) {
            this.elements.authEmailButton.disabled = !isConfigured || isSignedIn;
            this.setVisible(this.elements.authEmailButton, showSignInOptions);
        }
        if (this.elements.authGoogleButton) {
            this.elements.authGoogleButton.disabled = !isConfigured || isSignedIn;
            this.setVisible(this.elements.authGoogleButton, showSignInOptions);
        }
        if (this.elements.authSignOutButton) {
            this.elements.authSignOutButton.disabled = !isSignedIn;
            this.setVisible(this.elements.authSignOutButton, isSignedIn);
        }
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
        return this.showScoreCelebration({ tier: "personal" });
    }

    showScoreCelebration({ tier = "personal" } = {}) {
        if (!this.elements.comboCallouts || typeof this.document.createElement !== "function") {
            return [];
        }

        const isAllTime = tier === "all-time";
        if (isAllTime) {
            const trophy = this.createRecordTrophy();
            this.elements.comboCallouts.appendChild(trophy);
            return [trophy];
        }

        return FIREWORK_SLOTS.map((slot) => {
            const firework = this.document.createElement("div");

            firework.className = `record-effect neon-firework neon-firework-${slot}`;
            firework.setAttribute("aria-hidden", "true");
            scheduleTransientRemoval(this.document, firework, FIREWORK_CLEANUP_MS);
            this.elements.comboCallouts.appendChild(firework);
            return firework;
        });
    }

    createRecordTrophy() {
        const stage = this.document.createElement("div");
        const aura = this.document.createElement("div");
        const trophy = this.document.createElement("div");
        const parts = [
            "trophy-depth",
            "trophy-handle trophy-handle-left",
            "trophy-handle trophy-handle-right",
            "trophy-cup",
            "trophy-lip",
            "trophy-star",
            "trophy-stem",
            "trophy-base",
            "trophy-base trophy-base-lower"
        ];

        stage.className = "record-effect record-trophy-stage";
        stage.setAttribute("aria-hidden", "true");
        aura.className = "record-trophy-aura";
        trophy.className = "record-trophy";
        stage.appendChild(aura);
        parts.forEach((className) => {
            const part = this.document.createElement("span");

            part.className = className;
            trophy.appendChild(part);
        });
        stage.appendChild(trophy);
        return stage;
    }

    clearCelebration() {
        const gameOver = this.elements.gameOver;
        const layer = this.elements.comboCallouts;

        if (gameOver) {
            gameOver.classList.remove("high-score-title");
            gameOver.classList.remove("all-time-score-title");
        }
        if (!layer || !layer.children) return;

        Array.from(layer.children).forEach((child) => {
            if (child.className && child.className.includes("record-effect")) {
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
