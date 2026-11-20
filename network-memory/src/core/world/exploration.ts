import { describeCondition, evaluateAll, evaluateCondition, type ConditionContext } from '../conditions';
import { encounterStatus } from '../battle/setup';
import type { GameData } from '../data/gameData';
import { applyCurrencyChanges, type CurrencyChange } from '../player/economy';
import { discover } from '../player/discovery';
import { detectMemory } from '../player/sync';
import type { Condition } from '../../types/condition';
import type { AreaDefinition, AreaPoint, Rewards } from '../../types/exploration';
import { CURRENCIES, type PlayerSave, type TransactionReason } from '../../types/player';
import { worldConnection } from './restoration';

/**
 * WORLD 探索（PHASE 4）。
 * エリアの解放・地点の状態・探索能力・調査の結果をすべて純粋関数で扱う（UI は結果を表示するだけ）。
 */

// ---------------------------------------------------------------- 探索能力

/** 所持している Memory が持つ探索能力 */
export function ownedFieldAbilities(save: PlayerSave, data: GameData): Set<string> {
  const owned = new Set(save.memories.map((m) => m.memoryId));
  return new Set([...data.fieldAbilityById.values()].filter((f) => owned.has(f.memoryId)).map((f) => f.id));
}

export function hasFieldAbility(save: PlayerSave, data: GameData, id: string): boolean {
  return ownedFieldAbilities(save, data).has(id);
}

/** その探索能力を使う場所（Memory 詳細の案内用） */
export function fieldAbilityUses(data: GameData, id: string): { area: AreaDefinition; point: AreaPoint | null }[] {
  const out: { area: AreaDefinition; point: AreaPoint | null }[] = [];
  for (const a of data.areas) {
    if (a.revealedBy === id) out.push({ area: a, point: null });
    for (const p of a.points) if (p.fieldAbility === id) out.push({ area: a, point: p });
  }
  return out;
}

// ---------------------------------------------------------------- エリア

export type AreaState = 'open' | 'locked' | 'hidden';

export function worldAreas(data: GameData, worldId: string): AreaDefinition[] {
  return data.areas.filter((a) => a.worldId === worldId);
}

export function entryArea(data: GameData, worldId: string): AreaDefinition | undefined {
  return worldAreas(data, worldId).find((a) => a.entry);
}

/** WORLD を探索できるか（接続済みで、エリアがある） */
export function canExplore(save: PlayerSave, data: GameData, worldId: string): boolean {
  const w = data.worldById.get(worldId);
  return Boolean(w && worldConnection(save, data, w).connected && entryArea(data, worldId));
}

export function areaState(save: PlayerSave, data: GameData, area: AreaDefinition): AreaState {
  const ctx = { save, data };
  if (!canExplore(save, data, area.worldId)) return area.hidden ? 'hidden' : 'locked';
  if (evaluateAll(area.unlock, ctx)) return 'open';
  if (area.hidden && !(area.revealedBy && hasFieldAbility(save, data, area.revealedBy))) return 'hidden';
  return 'locked';
}

export function unmetConditions(conds: Condition[] | undefined, ctx: ConditionContext): string[] {
  return (conds ?? []).filter((c) => !evaluateCondition(c, ctx)).map((c) => describeCondition(c, ctx));
}

// ---------------------------------------------------------------- 地点

export type PointState = 'hidden' | 'locked' | 'needs-ability' | 'available' | 'done';

export function pointState(save: PlayerSave, data: GameData, point: AreaPoint): PointState {
  const ctx = { save, data };
  if (!evaluateAll(point.visible, ctx)) return 'hidden';
  if (point.type === 'signal') {
    const enc = point.encounterId ? data.encounterById.get(point.encounterId) : undefined;
    if (!enc) return 'hidden';
    const st = encounterStatus(save, enc);
    if (st === 'locked') return 'locked';
    if (!evaluateAll(point.unlock, ctx)) return 'locked';
    return st === 'cleared' ? 'done' : 'available';
  }
  if (!evaluateAll(point.unlock, ctx)) return 'locked';
  if (point.fieldAbility && !hasFieldAbility(save, data, point.fieldAbility)) return 'needs-ability';
  if (point.type === 'search') return save.exploration.points[point.id] ? 'done' : 'available';
  return point.eventId && save.exploration.events[point.eventId] ? 'done' : 'available';
}

/** 地点が未解放のときの条件表示 */
export function pointRequirements(save: PlayerSave, data: GameData, point: AreaPoint): string[] {
  const ctx = { save, data };
  const reqs = unmetConditions(point.unlock, ctx);
  if (point.type === 'signal' && point.encounterId) {
    const enc = data.encounterById.get(point.encounterId);
    if (enc && encounterStatus(save, enc) === 'locked' && enc.unlock.type === 'encounterClear') {
      reqs.push(describeCondition({ type: 'encounterCleared', encounterId: enc.unlock.encounterId }, ctx));
    }
  }
  if (point.fieldAbility && !hasFieldAbility(save, data, point.fieldAbility)) {
    const fa = data.fieldAbilityById.get(point.fieldAbility);
    const mem = fa ? data.memoryById.get(fa.memoryId) : undefined;
    const known = mem && (save.archive.discoveredMemoryIds.includes(mem.id) || save.memories.some((m) => m.memoryId === mem.id));
    reqs.push(fa ? `探索能力【${fa.name}】${known ? `（${mem!.name}）` : ''}` : '未知の探索能力');
  }
  return reqs;
}

export function findPoint(data: GameData, pointId: string): { area: AreaDefinition; point: AreaPoint } | null {
  for (const area of data.areas) {
    const point = area.points.find((p) => p.id === pointId);
    if (point) return { area, point };
  }
  return null;
}

// ---------------------------------------------------------------- 報酬

/** 報酬（通貨・アイテム）を付与する。アイテムは所持上限で切り捨てる */
export function applyRewards(save: PlayerSave, data: GameData, rewards: Rewards | undefined, reason: TransactionReason, note: string, at: string): PlayerSave {
  if (!rewards) return save;
  let next = save;
  const changes: CurrencyChange[] = CURRENCIES.flatMap((c) => (rewards.currencies?.[c] ? [{ currency: c, amount: rewards.currencies[c]!, reason, note }] : []));
  if (changes.length) {
    const r = applyCurrencyChanges(next, changes, at);
    if (r.ok) next = r.save;
  }
  const items = Object.entries(rewards.items ?? {});
  if (items.length) {
    const inv = { ...next.inventory };
    for (const [id, n] of items) {
      const item = data.itemById.get(id);
      if (item) inv[id] = Math.min(item.maxStack, (inv[id] ?? 0) + n);
    }
    next = { ...next, inventory: inv };
  }
  return next;
}

// ---------------------------------------------------------------- 行動

export function visitArea(save: PlayerSave, data: GameData, areaId: string): PlayerSave {
  const area = data.areaById.get(areaId);
  if (!area || areaState(save, data, area) !== 'open') return save;
  const visited = save.exploration.visitedAreas.includes(areaId) ? save.exploration.visitedAreas : [...save.exploration.visitedAreas, areaId];
  if (visited === save.exploration.visitedAreas && save.exploration.lastArea === areaId) return save;
  return { ...save, exploration: { ...save.exploration, visitedAreas: visited, lastArea: areaId } };
}

export interface SearchOutcome {
  text: string;
  rewards: Rewards | undefined;
  discovered: string[];
  detected: string[];
}

export type SearchResult = { ok: true; save: PlayerSave; outcome: SearchOutcome } | { ok: false; error: string };

/** 地点を調べる（一度だけ）。報酬・フラグ・Memory の発見/検出を反映する */
export function searchPoint(save: PlayerSave, data: GameData, pointId: string, at: string): SearchResult {
  const found = findPoint(data, pointId);
  if (!found || found.point.type !== 'search') return { ok: false, error: '調べられる地点ではありません' };
  const { area, point } = found;
  if (areaState(save, data, area) !== 'open') return { ok: false, error: 'このエリアにはまだ入れません' };
  const st = pointState(save, data, point);
  if (st === 'done') return { ok: false, error: 'すでに調べた' };
  if (st !== 'available') return { ok: false, error: '今は調べられない' };

  let next = applyRewards(save, data, point.rewards, 'EXPLORE_REWARD', `${area.name}・${point.name}`, at);
  if (point.setFlags?.length) next = { ...next, progress: { flags: { ...next.progress.flags, ...Object.fromEntries(point.setFlags.map((f) => [f, true])) } } };
  const d = discover(next, data, point.discover ?? []);
  next = d.save;
  const detected: string[] = [];
  for (const id of point.detect ?? []) {
    if (next.memories.some((m) => m.memoryId === id) || next.archive.pendingSyncIds.includes(id)) continue;
    next = detectMemory(next, id);
    detected.push(id);
  }
  next = { ...next, exploration: { ...next.exploration, points: { ...next.exploration.points, [point.id]: at } } };
  return { ok: true, save: next, outcome: { text: point.resultText ?? '', rewards: point.rewards, discovered: d.newlyDiscovered, detected } };
}

export interface EventOutcome {
  save: PlayerSave;
  firstTime: boolean;
  rewards: Rewards | undefined;
  detected: string[];
}

/** 探索イベントの終了。フラグ・検出した Memory・初回報酬を反映する */
export function completeEvent(save: PlayerSave, data: GameData, eventId: string, flags: Record<string, boolean | number | string>, detectedIds: string[], at: string): EventOutcome {
  const ev = data.eventById.get(eventId);
  if (!ev) return { save, firstTime: false, rewards: undefined, detected: [] };
  const firstTime = !save.exploration.events[eventId];
  let next: PlayerSave = {
    ...save,
    progress: { flags: { ...save.progress.flags, ...flags } },
    exploration: { ...save.exploration, events: { ...save.exploration.events, [eventId]: (save.exploration.events[eventId] ?? 0) + 1 } },
  };
  const detected: string[] = [];
  for (const id of detectedIds) {
    if (!data.memoryById.has(id) || next.memories.some((m) => m.memoryId === id) || next.archive.pendingSyncIds.includes(id)) continue;
    next = detectMemory(next, id);
    detected.push(id);
  }
  if (firstTime) next = applyRewards(next, data, ev.rewards, 'EVENT_REWARD', ev.title, at);
  return { save: next, firstTime, rewards: firstTime ? ev.rewards : undefined, detected };
}

/** WORLD の探索の進み具合（調べた地点・見たイベントの割合） */
export function explorationProgress(save: PlayerSave, data: GameData, worldId: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const a of worldAreas(data, worldId)) {
    for (const p of a.points) {
      if (p.type === 'signal') continue;
      total++;
      if (p.type === 'search' ? save.exploration.points[p.id] : p.eventId && save.exploration.events[p.eventId]) done++;
    }
  }
  return { done, total };
}
