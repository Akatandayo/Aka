import { ATTRIBUTE_META, CATEGORY_META, RARITY_META } from '../constants';
import type { GameData } from '../data/gameData';
import { calcStats, combatPower } from './stats';
import type { Attribute, MemoryCategory, MemoryDefinition, Rarity, StatBlock, StatKey } from '../../types/memory';
import type { PlayerMemory, PlayerSave } from '../../types/player';

/** 所持 Memory の一覧表示・検索・分類・ソート */

export interface MemoryEntry {
  instance: PlayerMemory;
  def: MemoryDefinition;
  stats: StatBlock;
  cp: number;
}

export const SORT_KEYS = ['acquired', 'rarity', 'level', 'cp', 'name', 'hp', 'atk', 'def', 'spd', 'tec', 'res'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export const SORT_LABEL: Record<SortKey, string> = {
  acquired: '入手順',
  rarity: 'レアリティ',
  level: 'レベル',
  cp: '総合力',
  name: '名前',
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
  tec: 'TEC',
  res: 'RES',
};

export interface MemoryQuery {
  text: string;
  categories: MemoryCategory[];
  rarities: Rarity[];
  attributes: Attribute[];
  favoritesOnly: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
}

export const DEFAULT_QUERY: MemoryQuery = {
  text: '',
  categories: [],
  rarities: [],
  attributes: [],
  favoritesOnly: false,
  sortKey: 'rarity',
  sortDir: 'desc',
};

export function toEntry(instance: PlayerMemory, def: MemoryDefinition): MemoryEntry {
  const stats = calcStats(def, instance.level, instance.limitBreak);
  return { instance, def, stats, cp: combatPower(stats) };
}

/** セーブデータの所持 Memory をマスターデータと結合する（マスターに存在しないものは除外） */
export function buildEntries(save: PlayerSave, data: GameData): MemoryEntry[] {
  const out: MemoryEntry[] = [];
  for (const instance of save.memories) {
    const def = data.memoryById.get(instance.memoryId);
    if (def) out.push(toEntry(instance, def));
  }
  return out;
}

/** 検索用の正規化: 全角/半角・大文字/小文字・カタカナ/ひらがなを同一視する */
export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .trim();
}

function searchableText(def: MemoryDefinition): string {
  return normalizeSearchText(
    [
      def.id,
      def.name,
      def.nameEn ?? '',
      def.title ?? '',
      def.category,
      CATEGORY_META[def.category].ja,
      def.attribute,
      ATTRIBUTE_META[def.attribute].ja,
      def.rarity,
      ...(def.tags ?? []),
    ].join(' '),
  );
}

export function matchesQuery(entry: MemoryEntry, q: MemoryQuery): boolean {
  const { def, instance } = entry;
  if (q.favoritesOnly && !instance.favorite) return false;
  if (q.categories.length && !q.categories.includes(def.category)) return false;
  if (q.rarities.length && !q.rarities.includes(def.rarity)) return false;
  if (q.attributes.length && !q.attributes.includes(def.attribute)) return false;
  const terms = normalizeSearchText(q.text).split(/\s+/).filter(Boolean);
  if (terms.length) {
    const hay = searchableText(def);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  return true;
}

function compareBy(key: SortKey, a: MemoryEntry, b: MemoryEntry): number {
  switch (key) {
    case 'acquired':
      return a.instance.acquiredAt.localeCompare(b.instance.acquiredAt);
    case 'rarity':
      return RARITY_META[a.def.rarity].order - RARITY_META[b.def.rarity].order;
    case 'level':
      return a.instance.level - b.instance.level;
    case 'cp':
      return a.cp - b.cp;
    case 'name':
      return a.def.name.localeCompare(b.def.name, 'ja');
    default:
      return a.stats[key as StatKey] - b.stats[key as StatKey];
  }
}

export function sortEntries(entries: MemoryEntry[], key: SortKey, dir: SortDir): MemoryEntry[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const primary = compareBy(key, a, b) * sign;
    if (primary !== 0) return primary;
    // 同値の場合は安定した順序（ID → インスタンス）にする
    return a.def.id.localeCompare(b.def.id) || a.instance.instanceId.localeCompare(b.instance.instanceId);
  });
}

export function applyQuery(entries: MemoryEntry[], q: MemoryQuery): MemoryEntry[] {
  return sortEntries(
    entries.filter((e) => matchesQuery(e, q)),
    q.sortKey,
    q.sortDir,
  );
}

export function activeFilterCount(q: MemoryQuery): number {
  return q.categories.length + q.rarities.length + q.attributes.length + (q.favoritesOnly ? 1 : 0);
}
