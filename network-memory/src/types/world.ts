import type { Attribute } from './memory';

/**
 * WORLD マスターデータ（PHASE 1 では基本情報のみ）。
 * エリア・クエスト・イベント・敵などは PHASE 4 で拡張する。
 */
export type WorldUnlock =
  | { type: 'initial' }
  | { type: 'worldClear'; worldId: string }
  | { type: 'flag'; flag: string; label: string };

export interface WorldDefinition {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  /** 世界のテーマ属性（演出カラー等に使用） */
  attribute: Attribute;
  unlock: WorldUnlock;
}
