/**
 * Memory 固有の「記録（ストーリー断片）」。
 *
 * Memory を集め・育てるほど断片が解放され、隠された真実に近づく。
 * 断片の解放によって、新しい Memory の存在が「発見」されることもある（reveals）。
 */

export type RecordUnlock =
  | { type: 'owned' }
  | { type: 'level'; value: number }
  | { type: 'limitBreak'; value: number }
  | { type: 'relatedOwned'; memoryId: string }
  | { type: 'flag'; flag: string; label: string };

export interface MemoryRecordFragment {
  id: string;
  title: string;
  text: string;
  unlock: RecordUnlock;
  /** この断片を閲覧すると「発見済み」になる Memory ID */
  reveals?: string[];
}

export interface MemoryStory {
  id: string;
  memoryId: string;
  fragments: MemoryRecordFragment[];
}
