import { describeCondition, evaluateAll, type ConditionContext } from '../conditions';
import type { GameData } from '../data/gameData';
import { describeUnlock, evaluateFragments, ownedMemoryIdSet } from '../memory/records';
import { discoveryState } from '../player/discovery';
import { KIND_LABEL, computeWorldState, restorationViews } from '../world/restoration';
import type { ArchiveCategory } from '../../types/archive';
import type { Condition } from '../../types/condition';
import type { PlayerSave } from '../../types/player';

/**
 * MEMORY ARCHIVE（GDD Ver.3 §6）の表示モデル。
 * - data/archive の記録（人物・出来事・用語・断片ログ）
 * - Memory の個別記録（MEMORY RECORD）… data/records から自動生成
 * - 人物 Memory の人格記録（CHARACTER RECORD）… Memory の persona から自動生成
 * - WORLD の記録（WORLD RECORD）… WORLD データと修復状態から自動生成
 * 未発見の記録はタイトル・内容を伏せる。
 */

export const ARCHIVE_CATEGORY_META: Record<ArchiveCategory, { label: string; ja: string }> = {
  memory: { label: 'MEMORY RECORD', ja: 'Memoryの個別記録' },
  character: { label: 'CHARACTER RECORD', ja: '人物' },
  world: { label: 'WORLD RECORD', ja: '世界' },
  event: { label: 'EVENT RECORD', ja: '出来事' },
  term: { label: 'TERMINOLOGY', ja: '用語' },
  fragment: { label: 'FRAGMENT LOG', ja: '断片ログ' },
};

export interface ArchiveSectionView {
  id: string;
  title: string;
  text: string;
  contentNote?: string;
  unlocked: boolean;
  /** 未解放時のヒント */
  hint: string | null;
}

export interface ArchiveItem {
  id: string;
  category: ArchiveCategory;
  title: string;
  subtitle?: string;
  unlocked: boolean;
  /** 未解放時のヒント（エントリ自体の条件） */
  hint: string | null;
  sections: ArchiveSectionView[];
  memoryId?: string;
  worldId?: string;
  characterId?: string;
  isNew: boolean;
}

function hintOf(conds: Condition[] | undefined, ctx: ConditionContext): string | null {
  const unmet = (conds ?? []).filter((c) => !evaluateAll([c], ctx));
  return unmet.length ? unmet.map((c) => describeCondition(c, ctx)).join(' / ') : null;
}

export function buildArchive(save: PlayerSave, data: GameData): ArchiveItem[] {
  const ctx: ConditionContext = { save, data };
  const read = new Set(save.archive.readEntryIds);
  const items: ArchiveItem[] = [];
  const known = new Set([...save.archive.discoveredMemoryIds, ...save.memories.map((m) => m.memoryId)]);

  // ---- MEMORY RECORD
  for (const def of data.memories) {
    const state = discoveryState(save, def.id);
    const instance = save.memories.find((m) => m.memoryId === def.id) ?? null;
    const fragments = def.storyRecords.flatMap((rid) => data.storyById.get(rid)?.fragments ?? []);
    const views = evaluateFragments(fragments, { ownedMemoryIds: ownedMemoryIdSet(save), flags: save.progress.flags, instance });
    const unlocked = state !== 'undiscovered';
    items.push({
      id: `MEMREC-${def.id}`,
      category: 'memory',
      title: def.name,
      subtitle: def.title,
      unlocked,
      hint: unlocked ? null : '関連する記録を読み解くと、存在が判明するかもしれない',
      sections: views.map((v) => ({
        id: v.fragment.id,
        title: v.fragment.title,
        text: v.fragment.text,
        unlocked: v.unlocked,
        hint: v.unlocked ? null : describeUnlock(v.fragment.unlock, data, known),
      })),
      memoryId: def.id,
      isNew: false,
    });
  }

  // ---- data/archive の記録
  for (const e of data.archive) {
    const unlocked = evaluateAll(e.unlock, ctx);
    items.push({
      id: e.id,
      category: e.category,
      title: e.title,
      subtitle: e.subtitle,
      unlocked,
      hint: unlocked ? null : hintOf(e.unlock, ctx),
      sections: e.sections.map((s) => {
        const ok = unlocked && evaluateAll(s.unlock, ctx);
        return { id: s.id, title: s.title, text: s.text, contentNote: s.contentNote, unlocked: ok, hint: ok ? null : hintOf(s.unlock, ctx) };
      }),
      characterId: e.related?.characterId,
      worldId: e.related?.worldId,
      memoryId: e.related?.memoryIds?.[0],
      isNew: unlocked && !read.has(e.id),
    });
  }

  // ---- CHARACTER RECORD（人物 Memory の人格記録）
  for (const def of data.memories) {
    if (!def.persona) continue;
    const owned = save.memories.some((m) => m.memoryId === def.id);
    const id = `CHRMEM-${def.id}`;
    items.push({
      id,
      category: 'character',
      title: def.name,
      subtitle: `Memory の人格記録 / ${def.title ?? ''}`,
      unlocked: owned,
      hint: owned ? null : 'この人物の Memory と同期する',
      sections: [
        { id: 'personality', title: '人格', text: def.persona.personality, unlocked: owned, hint: null },
        ...(def.persona.note ? [{ id: 'note', title: '記憶', text: def.persona.note, unlocked: owned, hint: null }] : []),
      ],
      memoryId: def.id,
      isNew: owned && !read.has(id),
    });
  }

  // ---- WORLD RECORD
  for (const w of data.worlds) {
    const views = restorationViews(save, data, w);
    const ws = computeWorldState(save, data, w, '');
    const observed = views.some((v) => v.restored) || data.encounters.some((e) => e.worldId === w.id && (e.unlock.type === 'initial' || save.battle.encounters[e.unlock.encounterId]));
    const id = `WREC-${w.id}`;
    items.push({
      id,
      category: 'world',
      title: w.name,
      subtitle: w.subtitle,
      unlocked: observed,
      hint: observed ? null : 'この世界の Memory を回収する',
      sections: [
        { id: 'about', title: '概要', text: w.description, unlocked: observed, hint: null },
        {
          id: 'restoration',
          title: `修復の記録（${Math.round(ws.restorationRate * 100)}%）`,
          text: views
            .map((v) => (v.restored ? `◆ ${KIND_LABEL[v.kind].ja}：${v.target.name} —— ${v.target.description}` : `◇ ${KIND_LABEL[v.kind].ja}：？？？ —— ${v.target.lostDescription ?? '記録が欠落している。'}`))
            .join('\n'),
          unlocked: observed,
          hint: null,
        },
        {
          id: 'complete',
          title: '完全修復',
          text: `${w.name} のすべての修復対象が戻った。欠けていた世界の記録は、ここで静かに閉じられている。`,
          unlocked: ws.restorationRate >= 1,
          hint: ws.restorationRate >= 1 ? null : `${w.name} の修復率 100%`,
        },
      ],
      worldId: w.id,
      isNew: false,
    });
  }
  return items;
}

export function archiveProgress(items: ArchiveItem[]): { unlocked: number; total: number } {
  return { unlocked: items.filter((i) => i.unlocked).length, total: items.length };
}
