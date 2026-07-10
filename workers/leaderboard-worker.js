const LEADERBOARD_LIMIT = 10;
const NAME_LIMIT = 16;
const MAX_REASONABLE_SCORE = 100000;

function allowedOrigins(env) {
    return String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean);
}

function isAllowedOrigin(request, env) {
    const origin = request.headers.get("Origin") || "";

    return Boolean(origin && allowedOrigins(env).includes(origin.replace(/\/+$/, "")));
}

function corsHeaders(request, env) {
    const headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Cache-Control": "no-store",
        "Vary": "Origin"
    };

    if (isAllowedOrigin(request, env)) {
        headers["Access-Control-Allow-Origin"] = request.headers.get("Origin").replace(/\/+$/, "");
    }

    return headers;
}

function sanitizeName(name = "") {
    return String(name)
        .replace(/[^a-z0-9 _-]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, NAME_LIMIT)
        .trim();
}

function clampScore(score) {
    const parsed = Math.floor(Number(score));

    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(parsed, MAX_REASONABLE_SCORE);
}

function normalizeEntries(entries = []) {
    return entries
        .map((entry) => ({
            name: sanitizeName(entry.name) || "Unknown",
            score: clampScore(entry.score),
            submittedAt: entry.submittedAt || new Date(0).toISOString(),
            userId: String(entry.userId || "")
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.submittedAt.localeCompare(b.submittedAt))
        .slice(0, LEADERBOARD_LIMIT);
}

function payload(entries, extra = {}) {
    const cleanEntries = normalizeEntries(entries);

    return {
        entries: cleanEntries.map(({ userId, ...entry }) => entry),
        overallHighScore: cleanEntries[0] ? cleanEntries[0].score : 0,
        ...extra
    };
}

async function readEntries(env) {
    const result = await env.HYPERBOUNCE_DB
        .prepare(`
            SELECT
                user_id AS userId,
                name,
                score,
                submitted_at AS submittedAt
            FROM hyperbounce_scores
            ORDER BY score DESC, submitted_at ASC
            LIMIT ?1
        `)
        .bind(LEADERBOARD_LIMIT)
        .all();

    return normalizeEntries(result && result.results ? result.results : []);
}

async function upsertPersonalBest(env, entry) {
    await env.HYPERBOUNCE_DB
        .prepare(`
            INSERT INTO hyperbounce_scores (user_id, name, score, submitted_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(user_id) DO UPDATE SET
                name = excluded.name,
                score = MAX(hyperbounce_scores.score, excluded.score),
                submitted_at = CASE
                    WHEN excluded.score > hyperbounce_scores.score
                    THEN excluded.submitted_at
                    ELSE hyperbounce_scores.submitted_at
                END
        `)
        .bind(entry.userId, entry.name, entry.score, entry.submittedAt)
        .run();
}

function jsonResponse(request, env, body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request, env)
        }
    });
}

function resolveBearerToken(request) {
    const header = request.headers.get("Authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    return match ? match[1].trim() : "";
}

async function verifySupabaseUser(request, env) {
    const token = resolveBearerToken(request);
    const fetchImpl = env.fetch || (typeof fetch === "function" ? fetch : null);
    const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");

    if (!token) {
        return { ok: false, status: 401, body: { error: "Sign in required" } };
    }
    if (!supabaseUrl || !env.SUPABASE_ANON_KEY || !fetchImpl) {
        return { ok: false, status: 500, body: { error: "Missing auth config" } };
    }

    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: env.SUPABASE_ANON_KEY
        }
    });

    if (!response || !response.ok) {
        return { ok: false, status: 401, body: { error: "Invalid session" } };
    }

    const user = await response.json();

    if (!user || !user.id) {
        return { ok: false, status: 401, body: { error: "Invalid session" } };
    }

    return { ok: true, user };
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return isAllowedOrigin(request, env) ?
                new Response(null, { headers: corsHeaders(request, env) }) :
                jsonResponse(request, env, { error: "Origin not allowed" }, 403);
        }

        if (url.pathname !== "/leaderboard") {
            return jsonResponse(request, env, { error: "Not found" }, 404);
        }

        if (request.method === "POST" && !isAllowedOrigin(request, env)) {
            return jsonResponse(request, env, { error: "Origin not allowed" }, 403);
        }

        if (!env.HYPERBOUNCE_DB) {
            return jsonResponse(request, env, { error: "Missing D1 binding" }, 500);
        }

        if (request.method === "GET") {
            const entries = await readEntries(env);
            return jsonResponse(request, env, payload(entries));
        }

        if (request.method !== "POST") {
            return jsonResponse(request, env, { error: "Method not allowed" }, 405);
        }

        const authResult = await verifySupabaseUser(request, env);

        if (!authResult.ok) {
            return jsonResponse(request, env, authResult.body, authResult.status);
        }

        let body;

        try {
            body = await request.json();
        } catch (error) {
            return jsonResponse(request, env, { error: "Invalid JSON" }, 400);
        }

        const submitted = {
            name: sanitizeName(body.name),
            score: clampScore(body.score),
            submittedAt: new Date().toISOString(),
            userId: String(authResult.user.id)
        };

        if (!submitted.name || submitted.score <= 0) {
            return jsonResponse(request, env, { error: "Invalid score" }, 400);
        }

        await upsertPersonalBest(env, submitted);
        const rankedEntries = await readEntries(env);
        const rankIndex = rankedEntries.findIndex((entry) => entry.userId === submitted.userId);
        const accepted = rankIndex >= 0 && rankIndex < LEADERBOARD_LIMIT;

        return jsonResponse(request, env, payload(rankedEntries, {
            accepted,
            rank: accepted ? rankIndex + 1 : null
        }));
    }
};
