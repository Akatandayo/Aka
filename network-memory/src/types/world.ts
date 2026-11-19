import type { Attribute } from './memory';

/**
 * WORLD マスターデータ。
 * 世界修復（GDD Ver.3 §5）: Memory の回収によって世界が修復される。
 * どの Memory が何を復元するかは WORLD 側のデータ（restorations）が持つため、
 * WORLD を追加しても既存の Memory や WORLD のデータを書き換える必要はない。
 * エリア探索・クエストは PHASE 4 で拡張する。
 */

/** 復元対象の種類（Memory の分類で決まる） */
export const RESTORATION_KINDS = ['npc', 'area', 'event', 'object', 'ecosystem', 'function', 'anomaly'] as const;
export type RestorationKind = (typeof RESTORATION_KINDS)[number];

export interface RestorationTarget {
  id: string;
  /** 回収すると復元される Memory */
  memoryId: string;
  /** 省略時は Memory の分類から決定（HUMAN→npc, LOCATION→area, EVENT→event, OBJECT→object, CREATURE→ecosystem, CONCEPT→function, UNKNOWN→anomaly） */
  kind?: RestorationKind;
  name: string;
  /** 復元後の説明 */
  description: string;
  /** 未復元時の説明（欠落の様子） */
  lostDescription?: string;
}
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
  /** 修復対象（ここに挙げた Memory が requiredMemories になる） */
  restorations: RestorationTarget[];
}
