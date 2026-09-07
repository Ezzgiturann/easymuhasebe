const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Let Metro bundle Drizzle's generated .sql migration files as source.
config.resolver.sourceExts.push('sql');

// expo-sqlite's web worker imports wa-sqlite.wasm. Pure resolver config with no
// runtime effect on native — it just stops `expo export --platform web` from
// failing outright. See CLAUDE.md for what else web would need.
config.resolver.assetExts.push('wasm');

module.exports = config;
