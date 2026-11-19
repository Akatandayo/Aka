import type { GameData } from '../data/gameData';
import { analyzeLoadout } from '../player/character';
import { slotEligible } from '../player/loadout';
import type { StatBlock } from '../../types/memory';
import { LOADOUT_SLOT_TYPES, type PlayerLoadout, type PlayerSave } from '../../types/player';

/**
 * ONLINE（PvP）の共通ルール（GDD Ver.3 §9）。
 *
 * 通信対戦そのものは PHASE 5 で実装する（現在は未実装。画面にも未実装と表示している）。
 * ここではクライアントとサーバー（Edge Functions）が共有するルール定義と、参加前の装備検証を用意する。
 * サーバーは同じルールで装備スナップショットを再検証し、シード + コマンド列から Battle Engine を再実行して結果を確定する。
 */

export const PVP_MODES = ['ARENA', 'RANKED', 'FRIEND', 'GHOST', 'RAID'] as const;
export type PvpMode = (typeof PVP_MODES)[number];

export interface PvpModeDefinition {
  id: PvpMode;
  ja: string;
  description: string;
  /** レーティングが変動するか */
  rated: boolean;
  /** 対戦相手の種類 */
  opponent: 'player' | 'friend' | 'ghost' | 'raid-boss';
  phase: number;
}

export const PVP_MODE_DEFS: Record<PvpMode, PvpModeDefinition> = {
  ARENA: { id: 'ARENA', ja: 'アリーナ', description: '近いレートのプレイヤーとリアルタイムで対戦する。', rated: true, opponent: 'player', phase: 5 },
  RANKED: { id: 'RANKED', ja: 'ランクマッチ', description: 'シーズン制のランク戦。結果はランキングに記録される。', rated: true, opponent: 'player', phase: 5 },
  FRIEND: { id: 'FRIEND', ja: 'フレンド対戦', description: 'フレンドと対戦する。レートは変動しない。', rated: false, opponent: 'friend', phase: 5 },
  GHOST: { id: 'GHOST', ja: 'ゴースト対戦', description: '他プレイヤーの装備スナップショット（AI 操作）と非同期で対戦する。', rated: false, opponent: 'ghost', phase: 5 },
  RAID: { id: 'RAID', ja: 'レイド', description: '期間限定の巨大流出体に挑む。各プレイヤーは 1 人で戦い、与えたダメージを全体で集計する。', rated: false, opponent: 'raid-boss', phase: 5 },
};

/** 全モード共通の対戦ルール */
export const PVP_RULES = {
  /** 1 バトルに参加するプレイヤー（主人公）は 1 人 */
  playersPerSide: 1,
  /** 完全同期するメイン Memory は 1 つ */
  mainMemory: 1,
  /** バトル開始後は Memory の変更（装備変更・同期切り替え）を禁止。開始時のスナップショットで戦う */
  lockLoadoutAfterStart: true,
  /** サブ Memory はメイン Memory の能力体系内での補助（補助スキル 1 つ）としてのみ機能する */
  subsSupportOnly: true,
  /** 結果はサーバーで検証する（シード + コマンド列の再計算） */
  serverVerified: true,
  /** バトルアイテムの使用（対人戦では不可） */
  itemsAllowed: false,
} as const;

export interface PvpLoadoutSnapshot {
  engineVersion: 1;
  loadoutId: string;
  playerLevel: number;
  main: { memoryId: string; level: number; limitBreak: number };
  subs: { memoryId: string; level: number; supportSkill: string }[];
  passives: { memoryId: string; level: number }[];
  /** 参考値（サーバーは自分のデータから再計算し、一致しなければ拒否する） */
  stats: StatBlock;
}

export type PvpEntryResult = { ok: true; snapshot: PvpLoadoutSnapshot } | { ok: false; issues: string[] };

/**
 * 対人戦に参加できる装備かを検証し、開始時点のスナップショットを作る。
 * 以降の Memory 変更はスナップショットに影響しない（バトル開始後の変更禁止）。
 */
export function createPvpEntry(save: PlayerSave, data: GameData, loadout: PlayerLoadout): PvpEntryResult {
  const issues: string[] = [];
  const instById = new Map(save.memories.map((m) => [m.instanceId, m]));
  const usedMemories = new Set<string>();
  for (const slot of LOADOUT_SLOT_TYPES) {
    for (const id of loadout.slots[slot]) {
      if (!id) continue;
      const inst = instById.get(id);
      const def = inst ? data.memoryById.get(inst.memoryId) : undefined;
      if (!inst || !def) {
        issues.push('所持していない Memory が装備されています');
        continue;
      }
      if (usedMemories.has(def.id)) issues.push(`同じ Memory（${def.name}）が複数装備されています`);
      usedMemories.add(def.id);
      if (!slotEligible(def, slot)) issues.push(`${def.name} はこの枠に装備できません`);
    }
  }
  const mains = loadout.slots.main.filter(Boolean);
  if (mains.length !== PVP_RULES.mainMemory) issues.push('メイン Memory を 1 つ装備してください');
  if (issues.length) return { ok: false, issues };

  const a = analyzeLoadout(save, data, loadout);
  if (!a.main) return { ok: false, issues: ['メイン Memory を 1 つ装備してください'] };
  // サブは補助スキルのみ: メイン以外の Memory の固有スキル・REWRITE が混ざっていないことを確認する
  const mainId = a.main.def.id;
  for (const g of a.skills) {
    if (g.memoryId === mainId) continue;
    const def = data.memoryById.get(g.memoryId);
    if (!def || def.syncEffects.supportSkill !== g.skillId) issues.push(`${def?.name ?? g.memoryId} の能力が補助の範囲を超えています`);
  }
  if (a.rewrite && a.rewrite.memoryId !== mainId) issues.push('REWRITE はメイン Memory のものだけが使用できます');
  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    snapshot: {
      engineVersion: 1,
      loadoutId: loadout.id,
      playerLevel: save.profile.level,
      main: { memoryId: mainId, level: a.main.instance.level, limitBreak: a.main.instance.limitBreak },
      subs: a.contributions
        .filter((c) => c.slot === 'sub')
        .map((c) => ({ memoryId: c.def.id, level: c.instance.level, supportSkill: c.def.syncEffects.supportSkill ?? '' })),
      passives: a.contributions.filter((c) => c.slot === 'passive').map((c) => ({ memoryId: c.def.id, level: c.instance.level })),
      stats: { ...a.total },
    },
  };
}
