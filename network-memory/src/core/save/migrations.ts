import { SAVE_VERSION, STARTING_ITEMS } from './schema';

/**
 * セーブデータのマイグレーション。
 *
 * MIGRATIONS[n] は「バージョン n のデータ」を「バージョン n+1」に変換する。
 * 変換後の値の妥当性は sanitize.ts が保証するので、ここでは構造の変換に専念する。
 */
type Raw = Record<string, unknown>;
type Migration = (raw: Raw) => Raw;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

export const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2（GDD Ver.2）
   * - 3体編成（teams）→ Memory 装備（loadouts: main 1 / sub 3 / passive 2）
   *   編成の 1 体目をメイン、2・3 体目をサブに移す。装備できない Memory は sanitize で外れる。
   * - 主人公の外見・紹介文、MEMORY SYNC 待ちリスト、戦闘記録を追加
   * - 既存プレイヤーにも初期アイテムを付与
   */
  1: (raw) => {
    const teams = Array.isArray(raw.teams) ? raw.teams.filter(isObj) : [];
    const loadouts = teams.map((t, i) => {
      const slots = Array.isArray(t.slots) ? t.slots : [];
      const id = typeof t.id === 'string' ? t.id.replace('TEAM-', 'LOADOUT-') : `LOADOUT-${i + 1}`;
      const name = typeof t.name === 'string' ? t.name.replace(/^TEAM/, 'LOADOUT') : id;
      return {
        id,
        name,
        slots: { main: [slots[0] ?? null], sub: [slots[1] ?? null, slots[2] ?? null, null], passive: [null, null] },
      };
    });
    const activeLoadoutId = typeof raw.activeTeamId === 'string' ? raw.activeTeamId.replace('TEAM-', 'LOADOUT-') : 'LOADOUT-1';
    const profile = isObj(raw.profile) ? raw.profile : {};
    const archive = isObj(raw.archive) ? raw.archive : {};
    const inventory: Raw = isObj(raw.inventory) ? { ...raw.inventory } : {};
    for (const [id, n] of Object.entries(STARTING_ITEMS)) {
      inventory[id] = (typeof inventory[id] === 'number' ? (inventory[id] as number) : 0) + n;
    }
    const { teams: _teams, activeTeamId: _active, ...rest } = raw;
    return {
      ...rest,
      version: 2,
      profile: { ...profile, avatar: profile.avatar ?? null, bio: profile.bio ?? '' },
      loadouts,
      activeLoadoutId,
      archive: { ...archive, pendingSyncIds: [] },
      inventory,
      battle: { encounters: {}, wins: 0, losses: 0, retreats: 0, records: [] },
    };
  },
  /**
   * v2 → v3（GDD Ver.3）
   * - メインストーリーの進行状態、WORLD の修復状態、ARCHIVE の閲覧履歴を追加
   *   （WORLD の修復状態は sanitize で回収済み Memory から算出される）
   */
  2: (raw) => {
    const archive = isObj(raw.archive) ? raw.archive : {};
    return {
      ...raw,
      version: 3,
      archive: { ...archive, readEntryIds: [] },
      story: { completedChapters: [], current: null, choices: {} },
      worlds: {},
    };
  },
};

export type MigrateResult = { ok: true; data: Raw; from: number } | { ok: false; error: string };

export function migrateSave(raw: unknown): MigrateResult {
  if (!isObj(raw)) return { ok: false, error: 'セーブデータの形式が不正です' };
  let data = raw;
  const from = typeof data.version === 'number' ? data.version : NaN;
  if (!Number.isInteger(from) || from < 1) return { ok: false, error: 'セーブデータのバージョンが不明です' };
  if (from > SAVE_VERSION) {
    return { ok: false, error: `新しいバージョン（v${from}）のセーブデータです。ゲームを更新してください` };
  }
  for (let v = from; v < SAVE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) return { ok: false, error: `v${v} からのマイグレーションが定義されていません` };
    data = m(data);
  }
  return { ok: true, data, from };
}
