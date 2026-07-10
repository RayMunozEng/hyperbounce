const assert = require("assert");
const test = require("node:test");
const loadSourceModule = require("./load-source-module.cjs");

function makeSupabaseFactory(calls, session = null) {
  return {
    createClient(url, anonKey) {
      calls.push(["createClient", url, anonKey]);
      return {
        auth: {
          getSession() {
            calls.push(["getSession"]);
            return Promise.resolve({ data: { session } });
          },
          signInWithOAuth(options) {
            calls.push(["oauth", options.provider, options.options.redirectTo]);
            return Promise.resolve({ data: {}, error: null });
          },
          signInWithOtp(options) {
            calls.push(["otp", options.email, options.options.emailRedirectTo]);
            return Promise.resolve({ data: {}, error: null });
          },
          signOut() {
            calls.push(["signOut"]);
            return Promise.resolve({ error: null });
          },
          onAuthStateChange(handler) {
            calls.push(["subscribe"]);
            this.handler = handler;
            return { data: { subscription: { unsubscribe() {} } } };
          },
        },
      };
    },
  };
}

test("auth client resolves Supabase config from window globals", () => {
  const { resolveSupabaseConfig } = loadSourceModule("src/auth.js");
  const config = resolveSupabaseConfig({
    HYPERBOUNCE_SUPABASE_URL: "https://project.supabase.co/",
    HYPERBOUNCE_SUPABASE_ANON_KEY: "anon",
  });

  assert.deepEqual(config, {
    url: "https://project.supabase.co",
    anonKey: "anon",
  });
});

test("auth client supports Google and email sign-in through Supabase", async () => {
  const { SupabaseAuthClient } = loadSourceModule("src/auth.js");
  const calls = [];
  const client = new SupabaseAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon",
    supabaseFactory: makeSupabaseFactory(calls),
    windowObj: {
      location: {
        href: "https://example.com/game?build=123#menu",
        origin: "https://example.com",
        pathname: "/game",
      },
    },
  });

  await client.signInWithGoogle();
  await client.sendMagicLink("ray@example.com");

  assert.equal(client.isConfigured(), true);
  assert.deepEqual(calls.slice(0, 3), [
    ["createClient", "https://project.supabase.co", "anon"],
    ["oauth", "google", "https://example.com/game"],
    ["otp", "ray@example.com", "https://example.com/game"],
  ]);
});

test("auth client exposes the current bearer token", async () => {
  const { SupabaseAuthClient } = loadSourceModule("src/auth.js");
  const calls = [];
  const client = new SupabaseAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon",
    supabaseFactory: makeSupabaseFactory(calls, {
      access_token: "token-123",
      user: { email: "ray@example.com" },
    }),
  });

  const session = await client.loadSession();

  assert.equal(session.user.email, "ray@example.com");
  assert.equal(client.getAccessToken(), "token-123");
});

test("auth client keeps a newer sign-in event over a stale guest session response", async () => {
  const { SupabaseAuthClient } = loadSourceModule("src/auth.js");
  let resolveInitialSession;
  let authStateHandler;
  const client = new SupabaseAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon",
    supabaseFactory: {
      createClient() {
        return {
          auth: {
            getSession() {
              return new Promise((resolve) => {
                resolveInitialSession = resolve;
              });
            },
            onAuthStateChange(handler) {
              authStateHandler = handler;
              return { data: { subscription: { unsubscribe() {} } } };
            },
          },
        };
      },
    },
  });
  const signedInSession = {
    access_token: "new-token",
    user: { email: "ray@example.com" },
  };

  client.subscribe(() => {});
  const loadingSession = client.loadSession();
  authStateHandler("SIGNED_IN", signedInSession);
  resolveInitialSession({ data: { session: null }, error: null });

  const resolvedSession = await loadingSession;

  assert.equal(resolvedSession, signedInSession);
  assert.equal(client.getAccessToken(), "new-token");
  assert.equal(client.getUserEmail(), "ray@example.com");
});
