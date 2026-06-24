// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions chạy trên Deno (import từ esm.sh, có Deno global) — không lint
    // bằng config Expo/Node để tránh lỗi giả import/no-unresolved.
    ignores: ['dist/*', 'supabase/functions/**'],
  },
]);
