import type { GameData } from '../data/gameData';
import type { MemoryRecordFragment, RecordUnlock } from '../../types/record';
import type { PlayerMemory, PlayerSave } from '../../types/player';

/**
 * 記録断片の解放判定。
 * 「Memoryを集める・育てる」ことが物語の解放に直結する仕組みの中核。
 */

export interface RecordContext {
  ownedMemoryIds: ReadonlySet<string>;
  flags: PlayerSave['progress']['flags'];
  /** 閲覧中のインスタンス（level / limitBreak 判定用） */
  instance: PlayerMemory | null;
}

export function ownedMemoryIdSet(save: PlayerSave): Set<string> {
  return new Set(save.memories.map((m) => m.memoryId));
}

export function isUnlockSatisfied(unlock: RecordUnlock, ctx: RecordContext): boolean {
  switch (unlock.type) {
    case 'owned':
      return ctx.instance !== null;
    case 'level':
      return ctx.instance !== null && ctx.instance.level >= unlock.value;
    case 'limitBreak':
      return ctx.instance !== null && ctx.instance.limitBreak >= unlock.value;
    case 'relatedOwned':
      return ctx.ownedMemoryIds.has(unlock.memoryId);
    case 'flag':
      return Boolean(ctx.flags[unlock.flag]);
  }
}

/** 解放条件の表示テキスト */
export function describeUnlock(unlock: RecordUnlock, data: GameData, discovered: ReadonlySet<string>): string {
  switch (unlock.type) {
    case 'owned':
      return 'このMemoryを所持する';
    case 'level':
      return `Lv.${unlock.value} に到達する`;
    case 'limitBreak':
      return `限界突破 ${unlock.value} 段階に到達する`;
    case 'relatedOwned': {
      const m = data.memoryById.get(unlock.memoryId);
      const name = m && discovered.has(m.id) ? `『${m.name}』` : '未発見のMemory';
      return `${name}を所持する`;
    }
    case 'flag':
      return unlock.label;
  }
}

export interface FragmentView {
  fragment: MemoryRecordFragment;
  unlocked: boolean;
}

export function evaluateFragments(fragments: MemoryRecordFragment[], ctx: RecordContext): FragmentView[] {
  return fragments.map((fragment) => ({ fragment, unlocked: isUnlockSatisfied(fragment.unlock, ctx) }));
}
