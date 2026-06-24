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
  {
    // File test: jest.mock factory bắt buộc dùng require() (do hoisting) → cho phép.
    files: ['__tests__/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
