const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("@babel/core");

function compile(filename, parent) {
  const source = fs.readFileSync(filename, "utf8");
  const { code } = babel.transformSync(source, {
    filename,
    presets: ["@babel/preset-env"],
  });
  const mod = new Module(filename, parent);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

function loadSourceModule(relativePath) {
  const projectRoot = path.join(__dirname, "..");
  const previousLoader = require.extensions[".js"];

  require.extensions[".js"] = function loadTranspiledSource(mod, filename) {
    if (filename.startsWith(path.join(projectRoot, "src"))) {
      const source = fs.readFileSync(filename, "utf8");
      const { code } = babel.transformSync(source, {
        filename,
        presets: ["@babel/preset-env"],
      });
      mod._compile(code, filename);
      return;
    }

    previousLoader(mod, filename);
  };

  try {
    return compile(path.join(projectRoot, relativePath), module);
  } finally {
    require.extensions[".js"] = previousLoader;
  }
}

module.exports = loadSourceModule;
