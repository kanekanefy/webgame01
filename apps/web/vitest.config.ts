import { defineConfig } from 'vitest/config';

// 单元测试（vitest）：排除 e2e/（那是 Playwright 的地盘）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    passWithNoTests: true,
  },
});
