import { DUPLICATE_FRAGMENTS } from '../constants';
import type { GameData } from '../data/gameData';
import { createId } from '../id';
import { applyCurrencyChanges, type CurrencyChange } from '../player/economy';
import { addMemoryExp, addPlayerExp } from '../player/growth';
import { getLoadout, loadoutInstanceIds } from '../player/loadout';
import { detectMemory } from '../player/sync';
import type { BattleCommand, BattleState } from './types';
import { CURRENCIES, type BattleResultKind, type Currency, type PlayerSave } from '../../types/player';

/**
 * 戦闘結果の反映。
 * ローカルでは結果を信頼して反映する。PHASE 5 のオンラインでは、
 * サーバーが seed + commands から replayBattle で再計算し、一致した場合のみ報酬を確定する。
 */

export interface BattleOutcome {
  encounterId: string;
  loadoutId: string;
  result: BattleResultKind;
  rounds: number;
  seed: number;
  commands: BattleCommand[];
  itemsUsed: Record<string, number>;
}

export interface BattleSummary {
  result: BattleResultKind;
  firstClear: boolean;
  exp: number;
  level: { before: number; after: number };
  memoryGrowth: { instanceId: string; memoryId: string; before: number; after: number }[];
  currencies: Partial<Record<Currency, number>>;
  items: Record<string, number>;
  /** 検出された Memory（pending: 同期待ち / duplicate: 既に同期済み → FRAGMENT に変換） */
  detected: { memoryId: string; kind: 'pending' | 'duplicate' | 'already_pending'; fragments?: number }[];
  /** レベルアップで新たに読めるようになった記録 */
  unlockedRecords: { memoryId: string; title: string }[];
}

export function outcomeFromState(state: BattleState, loadoutId: string): BattleOutcome {
  if (state.phase !== 'victory' && state.phase !== 'defeat' && state.phase !== 'retreat') throw new Error('戦闘が終了していません');
  return {
    encounterId: state.encounterId,
    loadoutId,
    result: state.phase,
    rounds: state.round,
    seed: state.seed,
    commands: state.commands,
    itemsUsed: { ...state.itemsUsed },
  };
}

function addItems(inv: Record<string, number>, items: Record<string, number> | undefined, data: GameData, out: Record<string, number>) {
  for (const [id, n] of Object.entries(items ?? {})) {
    const def = data.itemById.get(id);
    if (!def) continue;
    inv[id] = Math.min(def.maxStack, (inv[id] ?? 0) + n);
    out[id] = (out[id] ?? 0) + n;
  }
}

export function applyBattleOutcome(save: PlayerSave, data: GameData, outcome: BattleOutcome, at: string): { save: PlayerSave; summary: BattleSummary } {
  const enc = data.encounterById.get(outcome.encounterId);
  let next: PlayerSave = { ...save, inventory: { ...save.inventory } };
  const summary: BattleSummary = {
    result: outcome.result,
    firstClear: false,
    exp: 0,
    level: { before: save.profile.level, after: save.profile.level },
    memoryGrowth: [],
    currencies: {},
    items: {},
    detected: [],
    unlockedRecords: [],
  };

  // 使用したアイテムは勝敗に関係なく消費
  for (const [id, n] of Object.entries(outcome.itemsUsed)) {
    next.inventory[id] = Math.max(0, (next.inventory[id] ?? 0) - Math.max(0, Math.floor(n)));
    if (next.inventory[id] === 0) delete next.inventory[id];
  }

  const battle = { ...next.battle, encounters: { ...next.battle.encounters } };
  if (outcome.result === 'victory') battle.wins++;
  else if (outcome.result === 'defeat') battle.losses++;
  else battle.retreats++;
  battle.records = [
    { id: createId('battle'), encounterId: outcome.encounterId, result: outcome.result, rounds: outcome.rounds, seed: outcome.seed, commands: outcome.commands, at },
    ...battle.records,
  ].slice(0, 20);

  if (outcome.result !== 'victory' || !enc) {
    next = { ...next, battle };
    return { save: next, summary };
  }

  const prev = battle.encounters[enc.id];
  summary.firstClear = !prev;
  battle.encounters[enc.id] = prev
    ? { ...prev, clears: prev.clears + 1, bestRounds: Math.min(prev.bestRounds, outcome.rounds) }
    : { clears: 1, bestRounds: outcome.rounds, firstClearedAt: at };
  next = { ...next, battle };

  // ---- 主人公の経験値
  const lv = addPlayerExp(next.profile.level, next.profile.exp, enc.rewards.exp);
  summary.exp = enc.rewards.exp;
  summary.level.after = lv.level;
  next = { ...next, profile: { ...next.profile, level: lv.level, exp: lv.exp } };

  // ---- 装備 Memory の同期経験値（使い込むほど同期が深まる）
  const loadout = getLoadout(next, outcome.loadoutId);
  const equipped = new Set(loadout ? loadoutInstanceIds(loadout) : []);
  next = {
    ...next,
    memories: next.memories.map((m) => {
      if (!equipped.has(m.instanceId)) return m;
      const def = data.memoryById.get(m.memoryId);
      if (!def) return m;
      const r = addMemoryExp(m, def, enc.rewards.memoryExp);
      if (r.gained > 0) {
        summary.memoryGrowth.push({ instanceId: m.instanceId, memoryId: m.memoryId, before: m.level, after: r.memory.level });
        const fragments = def.storyRecords.flatMap((rid) => data.storyById.get(rid)?.fragments ?? []);
        for (const f of fragments) {
          if (f.unlock.type === 'level' && f.unlock.value > m.level && f.unlock.value <= r.memory.level) {
            summary.unlockedRecords.push({ memoryId: def.id, title: f.title });
          }
        }
      }
      return r.memory;
    }),
  };

  // ---- 通貨・アイテム
  const changes: CurrencyChange[] = [];
  const addCurrencies = (c: Partial<Record<Currency, number>> | undefined, note: string) => {
    for (const cur of CURRENCIES) {
      const n = c?.[cur];
      if (!n) continue;
      changes.push({ currency: cur, amount: n, reason: 'BATTLE_REWARD', note });
      summary.currencies[cur] = (summary.currencies[cur] ?? 0) + n;
    }
  };
  addCurrencies(enc.rewards.currencies, enc.name);
  addItems(next.inventory, enc.rewards.items, data, summary.items);
  if (summary.firstClear) {
    addCurrencies(enc.firstClear?.currencies, `${enc.name}（初回）`);
    addItems(next.inventory, enc.firstClear?.items, data, summary.items);
    // ---- Memory の検出（MEMORY SYNC 待ちに追加 / 同期済みなら FRAGMENT に変換）
    for (const memoryId of enc.firstClear?.memories ?? []) {
      const def = data.memoryById.get(memoryId);
      if (!def) continue;
      if (next.memories.some((m) => m.memoryId === memoryId)) {
        const fragments = DUPLICATE_FRAGMENTS[def.rarity];
        changes.push({ currency: 'FRAGMENT', amount: fragments, reason: 'DUPLICATE_MEMORY', note: `${def.name}（同期済み）` });
        summary.currencies.FRAGMENT = (summary.currencies.FRAGMENT ?? 0) + fragments;
        summary.detected.push({ memoryId, kind: 'duplicate', fragments });
      } else if (next.archive.pendingSyncIds.includes(memoryId)) {
        summary.detected.push({ memoryId, kind: 'already_pending' });
      } else {
        next = detectMemory(next, memoryId);
        summary.detected.push({ memoryId, kind: 'pending' });
      }
    }
  }
  if (changes.length) {
    const r = applyCurrencyChanges(next, changes, at);
    if (r.ok) next = r.save;
  }
  return { save: next, summary };
}
