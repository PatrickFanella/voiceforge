const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

module.exports = withRorkMetro(config);
