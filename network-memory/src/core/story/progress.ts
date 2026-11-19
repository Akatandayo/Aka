import { evaluateAll } from '../conditions';
import type { GameData } from '../data/gameData';
import { applyCurrencyChanges, type CurrencyChange } from '../player/economy';
import { detectMemory } from '../player/sync';
import { CURRENCIES, type PlayerSave } from '../../types/player';
import type { StoryChapter } from '../../types/story';
import type { FlagValue } from './engine';

/** メインストーリーの進行状態（セーブデータ）の更新 */

export type ChapterStatus = 'locked' | 'available' | 'in_progress' | 'cleared';

export function chapterStatus(save: PlayerSave, data: GameData, ch: StoryChapter): ChapterStatus {
  if (save.story.completedChapters.includes(ch.id)) return 'cleared';
  if (save.story.current?.chapterId === ch.id) return 'in_progress';
  return evaluateAll(ch.unlock, { save, data }) ? 'available' : 'locked';
}

/** 次に読むべき章（未クリアで解放済みの最初の章） */
export function nextChapter(save: PlayerSave, data: GameData): StoryChapter | null {
  return data.chapters.find((ch) => ['available', 'in_progress'].includes(chapterStatus(save, data, ch))) ?? null;
}

export function saveStoryProgress(save: PlayerSave, chapterId: string, index: number, flags: Record<string, FlagValue>, choices: Record<string, string>): PlayerSave {
  const prefixed = Object.fromEntries(Object.entries(choices).map(([k, v]) => [`${chapterId}:${k}`, v]));
  return {
    ...save,
    progress: { flags: { ...save.progress.flags, ...flags } },
    story: { ...save.story, current: { chapterId, index }, choices: { ...save.story.choices, ...prefixed } },
  };
}

/** 中断位置で使う、その章で選んだ選択肢 */
export function chapterChoices(save: PlayerSave, chapterId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(save.story.choices)) if (k.startsWith(`${chapterId}:`)) out[k.slice(chapterId.length + 1)] = v;
  return out;
}

export interface ChapterResult {
  save: PlayerSave;
  firstClear: boolean;
  detected: string[];
}

export function completeChapter(save: PlayerSave, data: GameData, chapterId: string, flags: Record<string, FlagValue>, detected: string[], at: string): ChapterResult {
  const ch = data.chapterById.get(chapterId);
  if (!ch) return { save, firstClear: false, detected: [] };
  const firstClear = !save.story.completedChapters.includes(chapterId);
  let next: PlayerSave = {
    ...save,
    progress: { flags: { ...save.progress.flags, ...flags } },
    story: {
      ...save.story,
      completedChapters: firstClear ? [...save.story.completedChapters, chapterId] : save.story.completedChapters,
      current: null,
    },
  };
  const newly: string[] = [];
  for (const id of detected) {
    if (!data.memoryById.has(id) || next.memories.some((m) => m.memoryId === id)) continue;
    if (!next.archive.pendingSyncIds.includes(id)) newly.push(id);
    next = detectMemory(next, id);
  }
  if (firstClear && ch.rewards) {
    const changes: CurrencyChange[] = CURRENCIES.flatMap((c) =>
      ch.rewards?.currencies?.[c] ? [{ currency: c, amount: ch.rewards.currencies[c]!, reason: 'STORY_REWARD' as const, note: `${ch.label} ${ch.title}` }] : [],
    );
    if (changes.length) {
      const r = applyCurrencyChanges(next, changes, at);
      if (r.ok) next = r.save;
    }
    const inv = { ...next.inventory };
    for (const [id, n] of Object.entries(ch.rewards.items ?? {})) {
      const item = data.itemById.get(id);
      if (item) inv[id] = Math.min(item.maxStack, (inv[id] ?? 0) + n);
    }
    next = { ...next, inventory: inv };
  }
  return { save: next, firstClear, detected: newly };
}
