import type { Condition } from './condition';

/**
 * MEMORY ARCHIVE（GDD Ver.3 §6）
 * 記録は 6 種類に分類する。未発見の記録は内容を伏せて表示する。
 * MEMORY RECORD は Memory の個別記録（src/data/records）から自動で作られる。
 */
export const ARCHIVE_CATEGORIES = ['memory', 'character', 'world', 'event', 'term', 'fragment'] as const;
export type ArchiveCategory = (typeof ARCHIVE_CATEGORIES)[number];

export interface ArchiveSection {
  id: string;
  title: string;
  text: string;
  /** 省略時はエントリが解放されていれば読める */
  unlock?: Condition[];
}

export interface ArchiveEntry {
  id: string;
  category: Exclude<ArchiveCategory, 'memory'>;
  title: string;
  subtitle?: string;
  /** エントリ自体の解放条件（満たすまで ??? 表示） */
  unlock: Condition[];
  sections: ArchiveSection[];
  related?: { memoryIds?: string[]; characterId?: string; worldId?: string };
}
