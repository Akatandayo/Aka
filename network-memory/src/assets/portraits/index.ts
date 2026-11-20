/**
 * 立ち絵画像の解決。
 * キャラクターデータの portraits には "portraits/CHR-XXX.png" のようなパスを書き、
 * 実体はこのフォルダに置く（ビルド時に取り込まれ、単一 HTML では埋め込まれる）。
 * 見つからないパスはそのまま URL として扱う（public/ に置いた画像や外部 URL）。
 */
const files = import.meta.glob('./*.{png,webp,jpg,jpeg,gif,svg}', { eager: true, import: 'default' }) as Record<string, string>;
const byName = new Map(Object.entries(files).map(([path, url]) => [path.split('/').pop()!, url]));

export function resolvePortrait(path: string): string {
  return byName.get(path.split('/').pop() ?? '') ?? path;
}
