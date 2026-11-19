import type { GameData } from './data/gameData';
import { worldRestorationRate } from './world/restoration';
import type { Condition } from '../types/condition';
import type { PlayerSave } from '../types/player';

/** 共通条件式の評価と表示（同期条件・ARCHIVE・ストーリー分岐・WORLD） */

export interface ConditionContext {
  save: PlayerSave;
  data: GameData;
}

const isKnownMemory = (save: PlayerSave, id: string) => save.memories.some((m) => m.memoryId === id) || save.archive.discoveredMemoryIds.includes(id);

export function evaluateCondition(c: Condition, { save, data }: ConditionContext): boolean {
  switch (c.type) {
    case 'playerLevel':
      return save.profile.level >= c.value;
    case 'ownedMemory':
      return save.memories.some((m) => m.memoryId === c.memoryId);
    case 'discoveredMemory':
      return isKnownMemory(save, c.memoryId);
    case 'memoryLevel':
      return save.memories.some((m) => m.memoryId === c.memoryId && m.level >= c.value);
    case 'flag':
      return Boolean(save.progress.flags[c.flag]);
    case 'storyCleared':
      return save.story.completedChapters.includes(c.chapterId);
    case 'encounterCleared':
      return Boolean(save.battle.encounters[c.encounterId]);
    case 'worldRestoration':
      return worldRestorationRate(save, data, c.worldId) >= c.value;
    case 'unknown':
      return false;
  }
}

export function evaluateAll(conds: Condition[] | undefined, ctx: ConditionContext): boolean {
  return (conds ?? []).every((c) => evaluateCondition(c, ctx));
}

/** 条件の表示テキスト（未発見の Memory 名は伏せる） */
export function describeCondition(c: Condition, { save, data }: ConditionContext): string {
  const memName = (id: string) => {
    const m = data.memoryById.get(id);
    return m && isKnownMemory(save, id) ? `『${m.name}』` : '未発見のMemory';
  };
  switch (c.type) {
    case 'playerLevel':
      return `探索者 Lv.${c.value} 以上`;
    case 'ownedMemory':
      return `${memName(c.memoryId)}と同期済み`;
    case 'discoveredMemory':
      return `${memName(c.memoryId)}の存在を発見する`;
    case 'memoryLevel':
      return `${memName(c.memoryId)} Lv.${c.value} 以上`;
    case 'flag':
      return c.label ?? 'ストーリーを進める';
    case 'storyCleared': {
      const ch = data.chapterById.get(c.chapterId);
      return `STORY「${ch?.title ?? c.chapterId}」をクリア`;
    }
    case 'encounterCleared': {
      const e = data.encounterById.get(c.encounterId);
      return e && (save.battle.encounters[c.encounterId] || e.unlock.type === 'initial' || save.battle.encounters[e.unlock.encounterId]) ? `流出反応「${e.name}」を鎮静化` : '未知の流出反応を鎮静化';
    }
    case 'worldRestoration': {
      const w = data.worldById.get(c.worldId);
      return `${w?.name ?? c.worldId} の修復率 ${Math.round(c.value * 100)}% 以上`;
    }
    case 'unknown':
      return 'ERROR: 条件を解析できない';
  }
}
