const path = require("path");

module.exports = {
    context: __dirname,
    entry: "./src/index.js",
    output: {
        path: path.resolve(__dirname),
        filename: "bundle.js"
    },
    devtool: false,
    performance: {
        maxAssetSize: 921600,
        maxEntrypointSize: 921600
    },
    resolve: {
        extensions: [".js"]
    }
};
