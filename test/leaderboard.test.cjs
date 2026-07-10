const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

test("leaderboard sanitizes display names for public scores", () => {
  const { sanitizeLeaderboardName } = loadSourceModule("src/leaderboard.js");

  assert.equal(sanitizeLeaderboardName("  Ray <script> Munoz!!!  "), "Ray script Munoz");
  assert.equal(sanitizeLeaderboardName(""), "");
  assert.equal(sanitizeLeaderboardName("A very very very long name"), "A very very very");
});

test("leaderboard ranking accepts only top ten scores", () => {
  const { rankLeaderboardEntries } = loadSourceModule("src/leaderboard.js");
  const entries = Array.from({ length: 10 }, (_, index) => ({
    name: `P${index}`,
    score: 100 - index
  }));

  const accepted = rankLeaderboardEntries(entries, { name: "Ray", score: 96 });
  const rejected = rankLeaderboardEntries(entries, { name: "Nope", score: 2 });

  assert.equal(accepted.accepted, true);
  assert.equal(accepted.rank, 5);
  assert.equal(accepted.entries.length, 10);
  assert.deepEqual(accepted.entries.slice(0, 5).map((entry) => entry.score), [100, 99, 98, 97, 96]);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.rank, null);
});

test("leaderboard client loads and submits scores through the configured API", async () => {
  const { LeaderboardClient } = loadSourceModule("src/leaderboard.js");
  const requests = [];
  const client = new LeaderboardClient({
    endpoint: "https://scores.example.dev",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          entries: [{ name: "Ray", score: 24 }],
          overallHighScore: 24,
          accepted: true,
          rank: 1
        })
      };
    }
  });

  const loaded = await client.load();
  const submitted = await client.submit({ name: "Ray", score: 24 });

  assert.equal(loaded.overallHighScore, 24);
  assert.equal(submitted.accepted, true);
  assert.equal(requests[0].url, "https://scores.example.dev/leaderboard");
  assert.equal(requests[1].url, "https://scores.example.dev/leaderboard");
  assert.equal(requests[1].options.method, "POST");
  assert.equal(JSON.parse(requests[1].options.body).name, "Ray");
});

test("leaderboard client sends bearer token when authenticated", async () => {
  const { LeaderboardClient } = loadSourceModule("src/leaderboard.js");
  const authHeaders = [];
  const client = new LeaderboardClient({
    endpoint: "https://scores.example.dev",
    tokenProvider: () => "token-123",
    fetchImpl: async (url, options = {}) => {
      authHeaders.push(options.headers.Authorization || "");
      return {
        ok: true,
        json: async () => ({ entries: [], overallHighScore: 0 }),
      };
    },
  });

  await client.load();
  await client.submit({ name: "Ray", score: 24 });

  assert.deepEqual(authHeaders, ["Bearer token-123", "Bearer token-123"]);
});
