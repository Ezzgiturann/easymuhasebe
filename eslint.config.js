// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions runs on Deno, not React Native — different globals and
    // different lint rules. It is checked by `deno check`, not by this config.
    ignores: ["dist/*", "supabase/functions/*"],
  }
]);
