/**
 * پیکربندی Vitest — محیط workers و اجرای تست‌ها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

// پیکربندی ساده: تست‌های pure function + تست‌های یکپارچه با ماک D1 روی node:sqlite
// (بدون Miniflare — D1Database با src/test/mock-d1.ts شبیه‌سازی می‌شود)
export default defineConfig({
  // css.postcss inline — تا vite پیکربندی postcss پروژهٔ میزبان را نخواند (اینجا هیچ پلاگین postcss لازم نیست)
  css: { postcss: { plugins: [] } },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'server/**/__tests__/**/*.test.ts'],
    server: {
      deps: {
        // node:sqlite برای ماک D1 — vitest باید آن را external کند نه bundle
        external: [/^node:/]
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@domain': path.resolve(__dirname, './src/domain'),
      '@app': path.resolve(__dirname, './src/application')
    }
  }
});
