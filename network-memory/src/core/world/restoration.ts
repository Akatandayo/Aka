import type { GameData } from '../data/gameData';
import type { MemoryCategory } from '../../types/memory';
import type { PlayerSave, WorldProgress } from '../../types/player';
import type { RestorationKind, RestorationTarget, WorldDefinition } from '../../types/world';

/**
 * 世界修復（GDD Ver.3 §5）: Memory の回収によって世界の状態が変わる。
 * 状態は「回収済み Memory」から決定的に算出できる。回収時に WorldProgress として保存する。
 */

export const KIND_BY_CATEGORY: Record<MemoryCategory, RestorationKind> = {
  HUMAN: 'npc',
  LOCATION: 'area',
  EVENT: 'event',
  OBJECT: 'object',
  CREATURE: 'ecosystem',
  CONCEPT: 'function',
  UNKNOWN: 'anomaly',
};

export const KIND_LABEL: Record<RestorationKind, { label: string; ja: string }> = {
  npc: { label: 'NPC', ja: '人物の帰還' },
  area: { label: 'AREA', ja: '建造物・エリアの復元' },
  event: { label: 'EVENT', ja: '歴史・イベントの解放' },
  object: { label: 'OBJECT', ja: '物体・機能の復元' },
  ecosystem: { label: 'ECOSYSTEM', ja: '生物・生態系の復元' },
  function: { label: 'FUNCTION', ja: '世界の特殊な機能の復元' },
  anomaly: { label: 'ANOMALY', ja: '観測不能な何かの輪郭' },
};

export function targetKind(t: RestorationTarget, data: GameData): RestorationKind {
  if (t.kind) return t.kind;
  const m = data.memoryById.get(t.memoryId);
  return m ? KIND_BY_CATEGORY[m.category] : 'object';
}

export function requiredMemories(world: WorldDefinition): string[] {
  return [...new Set(world.restorations.map((r) => r.memoryId))];
}

export interface RestorationView {
  target: RestorationTarget;
  kind: RestorationKind;
  restored: boolean;
}

export function restorationViews(save: PlayerSave, data: GameData, world: WorldDefinition): RestorationView[] {
  const owned = new Set(save.memories.map((m) => m.memoryId));
  return world.restorations.map((t) => ({ target: t, kind: targetKind(t, data), restored: owned.has(t.memoryId) }));
}

export function computeWorldState(save: PlayerSave, data: GameData, world: WorldDefinition, at: string): WorldProgress {
  const owned = new Set(save.memories.map((m) => m.memoryId));
  const required = requiredMemories(world);
  const recovered = required.filter((id) => owned.has(id));
  const views = restorationViews(save, data, world).filter((v) => v.restored);
  const ids = (kinds: RestorationKind[]) => views.filter((v) => kinds.includes(v.kind)).map((v) => v.target.id);
  return {
    restorationRate: required.length ? recovered.length / required.length : 0,
    requiredMemories: required,
    recoveredMemories: recovered,
    restoredObjects: ids(['object', 'ecosystem', 'function', 'anomaly']),
    restoredNPCs: ids(['npc']),
    unlockedAreas: ids(['area']),
    unlockedEvents: ids(['event']),
    updatedAt: at,
  };
}

export function worldRestorationRate(save: PlayerSave, data: GameData, worldId: string): number {
  const w = data.worldById.get(worldId);
  return w ? computeWorldState(save, data, w, '').restorationRate : 0;
}

/** 全 WORLD の状態を再計算して保存データに反映する（updatedAt は変化した WORLD のみ更新） */
export function syncWorldProgress(save: PlayerSave, data: GameData, at: string): PlayerSave {
  const worlds: Record<string, WorldProgress> = { ...save.worlds };
  let changed = false;
  for (const w of data.worlds) {
    const next = computeWorldState(save, data, w, at);
    const prev = worlds[w.id];
    if (!prev || prev.recoveredMemories.join() !== next.recoveredMemories.join() || prev.requiredMemories.join() !== next.requiredMemories.join()) {
      worlds[w.id] = next;
      changed = true;
    }
  }
  return changed ? { ...save, worlds } : save;
}

export interface RestorationChange {
  worldId: string;
  before: number;
  after: number;
  restored: { target: RestorationTarget; kind: RestorationKind }[];
}

/** Memory を回収した結果、どの WORLD の何が復元されるか（演出・通知用） */
export function restorationChangesFor(save: PlayerSave, data: GameData, memoryId: string): RestorationChange[] {
  const out: RestorationChange[] = [];
  const owned = new Set(save.memories.map((m) => m.memoryId));
  if (owned.has(memoryId)) return out;
  for (const w of data.worlds) {
    const req = requiredMemories(w);
    if (!req.includes(memoryId)) continue;
    const before = req.filter((id) => owned.has(id)).length / req.length;
    const after = (req.filter((id) => owned.has(id)).length + 1) / req.length;
    out.push({
      worldId: w.id,
      before,
      after,
      restored: w.restorations.filter((t) => t.memoryId === memoryId).map((t) => ({ target: t, kind: targetKind(t, data) })),
    });
  }
  return out;
}

export function overallRestoration(save: PlayerSave, data: GameData): number {
  const all = data.worlds.flatMap((w) => requiredMemories(w));
  if (!all.length) return 0;
  const owned = new Set(save.memories.map((m) => m.memoryId));
  return all.filter((id) => owned.has(id)).length / all.length;
}

export interface WorldConnection {
  connected: boolean;
  /** 世界の存在を知っている（接続済み、またはその世界の Memory を回収している） */
  known: boolean;
  /** 未接続の場合の接続条件 */
  requirement: string | null;
}

/**
 * WORLD への接続状態。エリア探索は PHASE 4 で実装するため、現在は
 * 「流出反応（BATTLE）を観測できる」か「WORLD の解放条件を満たした」ことを接続済みとみなす。
 */
export function worldConnection(save: PlayerSave, data: GameData, world: WorldDefinition): WorldConnection {
  const encs = data.encounters.filter((e) => e.worldId === world.id);
  const signal = encs.some((e) => e.unlock.type === 'initial' || save.battle.encounters[e.unlock.encounterId] || save.battle.encounters[e.id]);
  const u = world.unlock;
  let met = false;
  let requirement: string | null = null;
  if (u.type === 'initial') met = true;
  else if (u.type === 'worldClear') {
    const target = data.encounters.filter((e) => e.worldId === u.worldId);
    met = target.length > 0 && target.every((e) => save.battle.encounters[e.id]);
    requirement = `${data.worldById.get(u.worldId)?.name ?? u.worldId} の流出反応をすべて鎮静化`;
  } else {
    met = Boolean(save.progress.flags[u.flag]);
    requirement = u.label;
  }
  const owned = new Set(save.memories.map((m) => m.memoryId));
  const recovered = requiredMemories(world).some((id) => owned.has(id));
  return met || signal ? { connected: true, known: true, requirement: null } : { connected: false, known: recovered, requirement };
}
