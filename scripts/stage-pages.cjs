const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "index.html",
  "styling.css",
  "bundle.js",
  "bundle.js.LICENSE.txt",
  "bootstrap.js",
  "site-config.js",
  ".nojekyll",
];
const directories = ["src/fonts", "src/images", "src/sounds", "docs/images"];

function copyEntry(relativePath, outputPath) {
  const source = path.join(root, relativePath);
  const destination = path.join(outputPath, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing release asset: ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function stageSite(outputPath = path.join(root, "dist")) {
  fs.rmSync(outputPath, { recursive: true, force: true });
  fs.mkdirSync(outputPath, { recursive: true });
  [...files, ...directories].forEach((entry) => copyEntry(entry, outputPath));
  return outputPath;
}

if (require.main === module) {
  const outputPath = stageSite();
  console.log(`Staged GitHub Pages site at ${outputPath}`);
}

module.exports = { stageSite };
