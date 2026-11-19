/**
 * 共通の条件式。
 * Memory の同期条件（unlockConditions）・ARCHIVE の解放条件・ストーリーの分岐・WORLD のイベントで共通に使う。
 * 新しい条件は型を追加し、core/conditions.ts の evaluate / describe に実装するだけでよい。
 */
export type Condition =
  | { type: 'playerLevel'; value: number }
  /** Memory を同期（所持）している */
  | { type: 'ownedMemory'; memoryId: string }
  /** Memory の存在を発見している（所持していなくてもよい） */
  | { type: 'discoveredMemory'; memoryId: string }
  /** 所持している Memory のレベル */
  | { type: 'memoryLevel'; memoryId: string; value: number }
  /** ストーリー・イベントのフラグ */
  | { type: 'flag'; flag: string; label?: string }
  /** ストーリーの章をクリアしている */
  | { type: 'storyCleared'; chapterId: string }
  /** 流出反応（遭遇）をクリアしている */
  | { type: 'encounterCleared'; encounterId: string }
  /** WORLD の修復率（0〜1）が一定以上 */
  | { type: 'worldRestoration'; worldId: string; value: number }
  /** 条件不明（満たされない） */
  | { type: 'unknown' };

export const CONDITION_TYPES = [
  'playerLevel',
  'ownedMemory',
  'discoveredMemory',
  'memoryLevel',
  'flag',
  'storyCleared',
  'encounterCleared',
  'worldRestoration',
  'unknown',
] as const;
