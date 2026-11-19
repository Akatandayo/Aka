// `vite build --mode single` の出力（dist-single/）を、ダブルクリックで開ける 1 つの HTML にまとめる。
// - <script type="module" src> → インラインの <script type="module">
// - <link rel="stylesheet"> → <style>
// - favicon → data URI
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist-single');
const outFile = join(root, 'release', 'NETWORK-Memory-ReCollection.html');

let html = readFileSync(join(distDir, 'index.html'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const read = (href) => {
  const p = join(distDir, href.replace(/^\.\//, ''));
  if (!existsSync(p)) throw new Error(`asset not found: ${href}`);
  return readFileSync(p);
};

let scripts = 0;
let styles = 0;

html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  scripts++;
  // インライン化したスクリプト内の "</script" で HTML が途切れないようにする
  const code = read(src).toString('utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${code}\n</script>`;
});

html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g, (_, href) => {
  styles++;
  const css = read(href).toString('utf8').replace(/<\/style/gi, '<\\/style');
  return `<style>\n${css}\n</style>`;
});

html = html.replace(/<link\b[^>]*\brel="icon"[^>]*\bhref="([^"]+)"[^>]*>/g, (_, href) => {
  const data = read(href).toString('base64');
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${data}" />`;
});

if (scripts === 0) throw new Error('script tag not found in dist-single/index.html');
if (/\.\/assets\//.test(html)) throw new Error('external asset reference remains in the output');

html = html.replace('<head>', `<head>\n    <!-- NETWORK - Memory: ReCollection v${pkg.version} / single-file build -->`);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ ${outFile.replace(root + '/', '')} (${kb} KB, script ${scripts}, style ${styles})`);
