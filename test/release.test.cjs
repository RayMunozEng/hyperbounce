const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("GitHub Pages has a tested, minimal release pipeline", () => {
  const packageJson = JSON.parse(read("package.json"));
  const workflow = read(".github/workflows/pages.yml");

  assert.equal(packageJson.scripts.stage, "node scripts/stage-pages.cjs");
  assert.equal(packageJson.scripts["build:pages"], "npm run build && npm run stage");
  assert.match(workflow, /branches:\s*\[master\]/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build:pages/);
  assert.match(workflow, /path:\s*dist/);
});

test("public metadata and optional service configuration are deployment-ready", () => {
  const html = read("index.html");
  const config = read("site-config.js");
  const bootstrap = read("bootstrap.js");
  const license = read("LICENSE");

  assert.match(html, /<meta name="description"/);
  assert.match(html, /<meta property="og:image"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
  assert.ok(html.indexOf('src="site-config.js"') < html.indexOf('src="bootstrap.js"'));
  assert.doesNotMatch(html, /supabase-js|src="bundle\.js"/);
  assert.doesNotMatch(html, /window\.HYPERBOUNCE_[A-Z_]+\s*=/);
  assert.match(config, /HYPERBOUNCE_LEADERBOARD_URL/);
  assert.match(config, /HYPERBOUNCE_SUPABASE_URL/);
  assert.match(config, /HYPERBOUNCE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(config, /service_role|SUPABASE_SERVICE_ROLE/i);
  assert.match(bootstrap, /supabase-js@2/);
  assert.match(bootstrap, /script\.onerror = loadBundle/);
  assert.match(license, /ISC License/);
});

test("public project links use the canonical lowercase Pages path", () => {
  const packageJson = JSON.parse(read("package.json"));
  const publicCopy = [read("index.html"), read("README.md"), JSON.stringify(packageJson)].join("\n");

  assert.equal(packageJson.homepage, "https://raymunozeng.github.io/hyperbounce/");
  assert.match(publicCopy, /https:\/\/raymunozeng\.github\.io\/hyperbounce\//);
  assert.doesNotMatch(publicCopy, /github\.io\/Hyperbounce\//);
});

test("the staged site contains runtime assets without development internals", () => {
  const { stageSite } = require("../scripts/stage-pages.cjs");
  const outputPath = fs.mkdtempSync(path.join(os.tmpdir(), "hyperbounce-pages-"));

  try {
    stageSite(outputPath);

    [
      "index.html",
      "styling.css",
      "bundle.js",
      "bootstrap.js",
      "site-config.js",
      ".nojekyll",
      "src/fonts",
      "src/images",
      "src/sounds",
      "docs/images/hyperbounce-gameplay.png",
    ].forEach((relativePath) => {
      assert.ok(fs.existsSync(path.join(outputPath, relativePath)), `${relativePath} was not staged`);
    });

    ["node_modules", "test", "workers", "src/game.js", "package.json"].forEach((relativePath) => {
      assert.ok(!fs.existsSync(path.join(outputPath, relativePath)), `${relativePath} leaked into the site`);
    });
  } finally {
    fs.rmSync(outputPath, { recursive: true, force: true });
  }
});

test("the web app manifest is branded and safe under a Pages subpath", () => {
  const manifest = JSON.parse(read("src/images/favicon_io/site.webmanifest"));

  assert.equal(manifest.name, "Hyperbounce");
  assert.equal(manifest.short_name, "Hyperbounce");
  assert.equal(manifest.start_url, ".");
  assert.equal(manifest.scope, ".");
  assert.equal(manifest.theme_color, "#040712");
  assert.equal(manifest.background_color, "#040712");
  manifest.icons.forEach((icon) => assert.doesNotMatch(icon.src, /^\//));
});
