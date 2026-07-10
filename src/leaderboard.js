export const LEADERBOARD_LIMIT = 10;
export const LEADERBOARD_NAME_LIMIT = 16;

function clampScore(score) {
    const parsed = Math.floor(Number(score));

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function sanitizeLeaderboardName(name = "") {
    return String(name)
        .replace(/[^a-z0-9 _-]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, LEADERBOARD_NAME_LIMIT)
        .trim();
}

export function normalizeLeaderboardEntries(entries = []) {
    return entries
        .map((entry) => ({
            name: sanitizeLeaderboardName(entry.name) || "Unknown",
            score: clampScore(entry.score),
            isSubmittedEntry: Boolean(entry.isSubmittedEntry)
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) =>
            b.score - a.score ||
            Number(b.isSubmittedEntry) - Number(a.isSubmittedEntry) ||
            a.name.localeCompare(b.name)
        )
        .slice(0, LEADERBOARD_LIMIT);
}

export function resolveOverallHighScore(entries = []) {
    const rankedEntries = normalizeLeaderboardEntries(entries);

    return rankedEntries[0] ? rankedEntries[0].score : 0;
}

export function rankLeaderboardEntries(entries = [], entry = {}) {
    const submittedEntry = {
        name: sanitizeLeaderboardName(entry.name),
        score: clampScore(entry.score),
        isSubmittedEntry: true
    };

    if (!submittedEntry.name || submittedEntry.score <= 0) {
        return {
            accepted: false,
            rank: null,
            entries: normalizeLeaderboardEntries(entries).map(({ isSubmittedEntry, ...rankedEntry }) => rankedEntry),
            overallHighScore: resolveOverallHighScore(entries)
        };
    }

    const rankedEntries = normalizeLeaderboardEntries([...entries, submittedEntry]);
    const rankIndex = rankedEntries.findIndex((rankedEntry) => rankedEntry.isSubmittedEntry);
    const cleanEntries = rankedEntries.map(({ isSubmittedEntry, ...rankedEntry }) => rankedEntry);
    const accepted = rankIndex >= 0 && rankIndex < LEADERBOARD_LIMIT;

    return {
        accepted,
        rank: accepted ? rankIndex + 1 : null,
        entries: cleanEntries,
        overallHighScore: resolveOverallHighScore(cleanEntries)
    };
}

export function qualifiesForLeaderboard(score, entries = []) {
    const scoreValue = clampScore(score);
    const rankedEntries = normalizeLeaderboardEntries(entries);

    if (scoreValue <= 0) return false;
    if (rankedEntries.length < LEADERBOARD_LIMIT) return true;

    return scoreValue > rankedEntries[rankedEntries.length - 1].score;
}

export function normalizeLeaderboardPayload(payload = {}) {
    const entries = normalizeLeaderboardEntries(payload.entries)
        .map(({ isSubmittedEntry, ...entry }) => entry);

    return {
        entries,
        overallHighScore: Math.max(clampScore(payload.overallHighScore), resolveOverallHighScore(entries)),
        playerName: sanitizeLeaderboardName(payload.playerName),
        accepted: Boolean(payload.accepted),
        rank: Number.isFinite(Number(payload.rank)) ? Number(payload.rank) : null
    };
}

export function resolveLeaderboardEndpoint(win = typeof window === "undefined" ? null : window) {
    if (!win) return "";

    if (win.HYPERBOUNCE_LEADERBOARD_URL) {
        return String(win.HYPERBOUNCE_LEADERBOARD_URL).replace(/\/+$/, "");
    }

    const doc = win.document;
    const meta = doc && typeof doc.querySelector === "function" ?
        doc.querySelector("meta[name='hyperbounce-leaderboard-api']") :
        null;

    return meta && meta.content ? String(meta.content).replace(/\/+$/, "") : "";
}

export class LeaderboardClient {
    constructor({
        endpoint = "",
        fetchImpl = null,
        tokenProvider = null,
        windowObj = typeof window === "undefined" ? null : window
    } = {}) {
        this.endpoint = (endpoint || resolveLeaderboardEndpoint(windowObj)).replace(/\/+$/, "");
        this.fetch = fetchImpl || (windowObj && windowObj.fetch ? windowObj.fetch.bind(windowObj) : null);
        this.tokenProvider = tokenProvider;
    }

    isEnabled() {
        return Boolean(this.endpoint && this.fetch);
    }

    qualifies(score, entries = []) {
        return qualifiesForLeaderboard(score, entries);
    }

    url() {
        return `${this.endpoint}/leaderboard`;
    }

    setTokenProvider(tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    authHeaders() {
        const token = this.tokenProvider ? this.tokenProvider() : "";

        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    load() {
        if (!this.isEnabled()) return Promise.resolve(normalizeLeaderboardPayload());

        return this.fetch(this.url(), {
            method: "GET",
            headers: {
                Accept: "application/json",
                ...this.authHeaders()
            }
        }).then((response) => this.parseResponse(response));
    }

    submit({ name, score }) {
        if (!this.isEnabled()) return Promise.resolve(normalizeLeaderboardPayload());

        return this.fetch(this.url(), {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...this.authHeaders()
            },
            body: JSON.stringify({
                name: sanitizeLeaderboardName(name),
                score: clampScore(score)
            })
        }).then((response) => this.parseResponse(response));
    }

    parseResponse(response) {
        if (!response || !response.ok) {
            return Promise.reject(new Error("Leaderboard request failed"));
        }

        return response.json().then((payload) => normalizeLeaderboardPayload(payload));
    }
}
