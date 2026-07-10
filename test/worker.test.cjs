const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

class HeadersShim {
  constructor(values = {}) {
    this.values = Object.keys(values).reduce((acc, key) => {
      acc[key.toLowerCase()] = values[key];
      return acc;
    }, {});
  }

  get(name) {
    return this.values[String(name).toLowerCase()] || "";
  }
}

class ResponseShim {
  constructor(body = null, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.headers = new HeadersShim(options.headers || {});
    this.ok = this.status >= 200 && this.status < 300;
  }

  async json() {
    return this.body ? JSON.parse(this.body) : null;
  }
}

global.Response = ResponseShim;

function makeRequest(url, options = {}) {
  return {
    url,
    method: options.method || "GET",
    headers: new HeadersShim(options.headers || {}),
    async json() {
      return JSON.parse(options.body || "{}");
    },
  };
}

function loadWorker() {
  const sourcePath = path.join(__dirname, "..", "workers", "leaderboard-worker.js");
  const source = fs.readFileSync(sourcePath, "utf8");

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`)
    .then((module) => module.default);
}

function makeEnv(fetchImpl) {
  const scores = new Map();
  const database = {
    prepare(sql) {
      let values = [];

      return {
        bind(...args) {
          values = args;
          return this;
        },
        async all() {
          return {
            results: [...scores.values()]
              .sort((a, b) => b.score - a.score || a.submittedAt.localeCompare(b.submittedAt))
              .slice(0, 10),
          };
        },
        async run() {
          assert.match(sql, /ON CONFLICT\s*\(user_id\)/i);
          const [userId, name, score, submittedAt] = values;
          const current = scores.get(userId);
          scores.set(userId, {
            userId,
            name,
            score: current ? Math.max(current.score, score) : score,
            submittedAt: current && current.score >= score ? current.submittedAt : submittedAt,
          });
          return { success: true };
        },
      };
    },
  };

  return {
    ALLOWED_ORIGIN: "https://raymunozeng.github.io",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    HYPERBOUNCE_DB: database,
    fetch: fetchImpl,
  };
}

test("leaderboard worker keeps reads public", async () => {
  const worker = await loadWorker();
  const env = makeEnv();
  const response = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard"), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.entries, []);
});

test("leaderboard worker exposes CORS only to the configured game origin", async () => {
  const worker = await loadWorker();
  const env = makeEnv();
  const allowed = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard", {
    headers: { Origin: "https://raymunozeng.github.io" },
  }), env);
  const untrusted = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard", {
    headers: { Origin: "https://example.com" },
  }), env);

  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://raymunozeng.github.io");
  assert.equal(untrusted.headers.get("Access-Control-Allow-Origin"), "");
});

test("leaderboard worker rejects score posts from unapproved origins", async () => {
  const worker = await loadWorker();
  let authCalls = 0;
  const env = makeEnv(async () => {
    authCalls += 1;
    return new ResponseShim(JSON.stringify({ id: "user-123" }), { status: 200 });
  });
  const response = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard", {
    method: "POST",
    body: JSON.stringify({ name: "Ray", score: 42 }),
    headers: {
      Authorization: "Bearer token-123",
      "Content-Type": "application/json",
      Origin: "https://example.com",
    },
  }), env);

  assert.equal(response.status, 403);
  assert.equal(authCalls, 0);
});

test("leaderboard worker requires auth before accepting score posts", async () => {
  const worker = await loadWorker();
  const env = makeEnv();
  const response = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard", {
    method: "POST",
    body: JSON.stringify({ name: "Ray", score: 42 }),
    headers: {
      "Content-Type": "application/json",
      Origin: "https://raymunozeng.github.io",
    },
  }), env);

  assert.equal(response.status, 401);
});

test("leaderboard worker verifies Supabase bearer tokens before saving scores", async () => {
  const worker = await loadWorker();
  const authRequests = [];
  const env = makeEnv(async (url, options = {}) => {
    authRequests.push({ url, options });
    return new ResponseShim(JSON.stringify({
      id: "user-123",
      email: "ray@example.com",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const response = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard", {
    method: "POST",
    body: JSON.stringify({ name: "Ray", score: 42 }),
    headers: {
      "Authorization": "Bearer token-123",
      "Content-Type": "application/json",
      Origin: "https://raymunozeng.github.io",
    },
  }), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.accepted, true);
  assert.equal(body.entries[0].name, "Ray");
  assert.equal(authRequests[0].url, "https://project.supabase.co/auth/v1/user");
  assert.equal(authRequests[0].options.headers.Authorization, "Bearer token-123");
  assert.equal(authRequests[0].options.headers.apikey, "anon");
});

test("leaderboard worker keeps one private personal best per authenticated account", async () => {
  const worker = await loadWorker();
  const env = makeEnv(async (url, options = {}) => {
    const token = options.headers.Authorization || "";
    const id = token.endsWith("user-two") ? "user-2" : "user-1";
    return new ResponseShim(JSON.stringify({ id }), { status: 200 });
  });

  async function submit(token, name, score) {
    const response = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard", {
      method: "POST",
      body: JSON.stringify({ name, score }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "https://raymunozeng.github.io",
      },
    }), env);
    return response.json();
  }

  await submit("user-one", "Ray", 42);
  await submit("user-one", "Ray", 60);
  await submit("user-one", "Ray", 10);
  const result = await submit("user-two", "Nova", 50);

  assert.deepEqual(result.entries.map(({ name, score }) => ({ name, score })), [
    { name: "Ray", score: 60 },
    { name: "Nova", score: 50 },
  ]);
  assert.ok(result.entries.every((entry) => !("userId" in entry)));
});

test("leaderboard worker uses conflict-safe storage for concurrent accounts", async () => {
  const worker = await loadWorker();
  const env = makeEnv(async (url, options = {}) => {
    const token = options.headers.Authorization || "";
    return new ResponseShim(JSON.stringify({ id: token }), { status: 200 });
  });
  const post = (token, name, score) => worker.fetch(makeRequest(
    "https://scores.example.dev/leaderboard",
    {
      method: "POST",
      body: JSON.stringify({ name, score }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "https://raymunozeng.github.io",
      },
    }
  ), env);

  await Promise.all([
    post("user-1", "Ray", 70),
    post("user-2", "Nova", 65),
  ]);
  const response = await worker.fetch(makeRequest("https://scores.example.dev/leaderboard"), env);
  const body = await response.json();

  assert.deepEqual(body.entries.map(({ name, score }) => ({ name, score })), [
    { name: "Ray", score: 70 },
    { name: "Nova", score: 65 },
  ]);
});

test("leaderboard worker is backed by D1 upserts rather than whole-board KV writes", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "workers", "leaderboard-worker.js"),
    "utf8"
  );

  assert.match(source, /HYPERBOUNCE_DB/);
  assert.match(source, /ON CONFLICT\s*\(user_id\)/i);
  assert.doesNotMatch(source, /HYPERBOUNCE_SCORES|\.put\(\s*LEADERBOARD_KEY/);
});
