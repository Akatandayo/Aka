/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' にすることで、ビルド結果をどのサブパス（GitHub Pages 等）に置いても動作する。
// `--mode single` では、画像・フォントを含むすべてを 1 つの HTML にまとめるための設定で出力する
// （仕上げは scripts/build-single-html.mjs）。
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react()],
    server: { host: true, port: 5173 },
    build: single
      ? {
          outDir: 'dist-single',
          emptyOutDir: true,
          // フォント・画像をすべて data URI として CSS/JS に埋め込む
          assetsInlineLimit: () => true,
          cssCodeSplit: false,
          modulePreload: false,
          reportCompressedSize: false,
        }
      : undefined,
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
