import { DEFAULT_LOADOUT_CAPACITY, MAX_LOADOUT_CAPACITY, SLOT_RULES } from '../constants';
import type { GameData } from '../data/gameData';
import { buildEntries, sortEntries, type MemoryEntry } from '../memory/query';
import type { MemoryDefinition } from '../../types/memory';
import { LOADOUT_SLOT_TYPES, type LoadoutCapacity, type LoadoutSlotType, type PlayerLoadout, type PlayerSave } from '../../types/player';

/**
 * Memory 装備（GDD Ver.2 §6）。
 * - メイン 1 / サブ 3 / パッシブ 2（loadoutCapacity で拡張可能）
 * - 同じ Memory（memoryId）は 1 つの装備に 1 回まで
 * - 3 つのプリセットを切り替えられる（PHASE 1 の「編成」を置き換え）
 */

export const LOADOUT_PRESET_COUNT = 3;

export function clampCapacity(c: Partial<LoadoutCapacity> | undefined): LoadoutCapacity {
  const out = { ...DEFAULT_LOADOUT_CAPACITY };
  for (const t of LOADOUT_SLOT_TYPES) {
    const v = c?.[t];
    if (typeof v === 'number' && Number.isInteger(v)) out[t] = Math.max(DEFAULT_LOADOUT_CAPACITY[t], Math.min(MAX_LOADOUT_CAPACITY[t], v));
  }
  return out;
}

export function emptySlots(capacity: LoadoutCapacity): PlayerLoadout['slots'] {
  return {
    main: Array(capacity.main).fill(null),
    sub: Array(capacity.sub).fill(null),
    passive: Array(capacity.passive).fill(null),
  };
}

export function createDefaultLoadouts(capacity: LoadoutCapacity = DEFAULT_LOADOUT_CAPACITY): PlayerLoadout[] {
  return Array.from({ length: LOADOUT_PRESET_COUNT }, (_, i) => ({
    id: `LOADOUT-${i + 1}`,
    name: `LOADOUT ${String(i + 1).padStart(2, '0')}`,
    slots: emptySlots(capacity),
  }));
}

/** そのスロットに装備できる Memory か */
export function slotEligible(def: MemoryDefinition, slot: LoadoutSlotType): boolean {
  const rule = SLOT_RULES[slot];
  if (slot === 'main') return def.skills.length > 0;
  if (rule.grantsSkills) return def.skills.length > 0;
  if (rule.grantsPassives) return def.passiveSkills.length > 0;
  return false;
}

export function slotIneligibleReason(def: MemoryDefinition, slot: LoadoutSlotType): string | null {
  if (slotEligible(def, slot)) return null;
  if (def.skills.length === 0 && def.passiveSkills.length === 0) return '戦闘能力を持たない記録です（探索・ストーリー用）';
  if (slot === 'passive') return 'パッシブ効果を持っていません';
  return 'スキルを持っていません';
}

export function getLoadout(save: PlayerSave, id: string): PlayerLoadout | undefined {
  return save.loadouts.find((l) => l.id === id);
}

export function getActiveLoadout(save: PlayerSave): PlayerLoadout {
  return getLoadout(save, save.activeLoadoutId) ?? save.loadouts[0];
}

function replaceLoadout(save: PlayerSave, loadout: PlayerLoadout): PlayerSave {
  return { ...save, loadouts: save.loadouts.map((l) => (l.id === loadout.id ? loadout : l)) };
}

function cloneSlots(l: PlayerLoadout): PlayerLoadout['slots'] {
  return { main: [...l.slots.main], sub: [...l.slots.sub], passive: [...l.slots.passive] };
}

export type LoadoutResult = { ok: true; save: PlayerSave } | { ok: false; error: string };

/** 装備中の instanceId をすべて列挙する */
export function loadoutInstanceIds(l: PlayerLoadout): string[] {
  return LOADOUT_SLOT_TYPES.flatMap((t) => l.slots[t]).filter((x): x is string => x !== null);
}

/**
 * Memory を装備する（instanceId = null で外す）。
 * - 同じインスタンスが同じ装備の別スロットにある場合は移動（元の位置の Memory と入れ替え可能なら入れ替え）
 * - 同じ memoryId の別インスタンスが装備されていれば外す
 */
export function equipMemory(
  save: PlayerSave,
  data: GameData,
  loadoutId: string,
  slot: LoadoutSlotType,
  index: number,
  instanceId: string | null,
): LoadoutResult {
  const loadout = getLoadout(save, loadoutId);
  if (!loadout) return { ok: false, error: '装備プリセットが存在しません' };
  if (!LOADOUT_SLOT_TYPES.includes(slot) || !Number.isInteger(index) || index < 0 || index >= loadout.slots[slot].length) {
    return { ok: false, error: 'スロットが不正です' };
  }
  const slots = cloneSlots(loadout);
  if (instanceId === null) {
    slots[slot][index] = null;
    return { ok: true, save: replaceLoadout(save, { ...loadout, slots }) };
  }
  const inst = save.memories.find((m) => m.instanceId === instanceId);
  if (!inst) return { ok: false, error: '所持していないMemoryです' };
  const def = data.memoryById.get(inst.memoryId);
  if (!def) return { ok: false, error: '不明なMemoryです' };
  const reason = slotIneligibleReason(def, slot);
  if (reason) return { ok: false, error: reason };

  const occupant = slots[slot][index];
  if (occupant === instanceId) return { ok: true, save };

  // 既に同じ装備のどこかにいる → 移動
  for (const t of LOADOUT_SLOT_TYPES) {
    const i = slots[t].indexOf(instanceId);
    if (i < 0) continue;
    const occDef = occupant ? data.memoryById.get(save.memories.find((m) => m.instanceId === occupant)?.memoryId ?? '') : undefined;
    slots[t][i] = occupant && occDef && slotEligible(occDef, t) ? occupant : null;
    slots[slot][index] = instanceId;
    return { ok: true, save: replaceLoadout(save, { ...loadout, slots }) };
  }
  // 同じ memoryId の別インスタンスを外す
  for (const t of LOADOUT_SLOT_TYPES) {
    slots[t] = slots[t].map((id) => (id && save.memories.find((m) => m.instanceId === id)?.memoryId === inst.memoryId ? null : id));
  }
  slots[slot][index] = instanceId;
  return { ok: true, save: replaceLoadout(save, { ...loadout, slots }) };
}

export function renameLoadout(save: PlayerSave, loadoutId: string, name: string): LoadoutResult {
  const l = getLoadout(save, loadoutId);
  if (!l) return { ok: false, error: '装備プリセットが存在しません' };
  const trimmed = name.trim().slice(0, 16);
  if (!trimmed) return { ok: false, error: '名前を入力してください' };
  return { ok: true, save: replaceLoadout(save, { ...l, name: trimmed }) };
}

export function setActiveLoadout(save: PlayerSave, loadoutId: string): LoadoutResult {
  if (!getLoadout(save, loadoutId)) return { ok: false, error: '装備プリセットが存在しません' };
  return { ok: true, save: { ...save, activeLoadoutId: loadoutId } };
}

export function clearLoadout(save: PlayerSave, loadoutId: string): LoadoutResult {
  const l = getLoadout(save, loadoutId);
  if (!l) return { ok: false, error: '装備プリセットが存在しません' };
  return { ok: true, save: replaceLoadout(save, { ...l, slots: emptySlots(save.loadoutCapacity) }) };
}

/** おまかせ装備: 総合力の高い順に、メイン → サブ → パッシブへ重複なく割り当てる */
export function autoLoadout(save: PlayerSave, data: GameData, loadoutId: string): LoadoutResult {
  const l = getLoadout(save, loadoutId);
  if (!l) return { ok: false, error: '装備プリセットが存在しません' };
  const pool = sortEntries(buildEntries(save, data), 'cp', 'desc');
  const used = new Set<string>();
  const slots = emptySlots(save.loadoutCapacity);
  const pick = (slot: LoadoutSlotType, prefer?: (e: MemoryEntry) => boolean) => {
    const candidates = pool.filter((e) => !used.has(e.def.id) && slotEligible(e.def, slot));
    const e = (prefer && candidates.find(prefer)) || candidates[0];
    if (!e) return null;
    used.add(e.def.id);
    return e.instance.instanceId;
  };
  slots.main = slots.main.map(() => pick('main', (e) => Boolean(e.def.rewrite)));
  slots.sub = slots.sub.map(() => pick('sub'));
  slots.passive = slots.passive.map(() => pick('passive'));
  return { ok: true, save: replaceLoadout(save, { ...l, slots }) };
}

export interface LoadoutPlacement {
  loadoutId: string;
  slot: LoadoutSlotType;
  index: number;
}

/** インスタンス ID → 装備されている場所 */
export function loadoutMembership(save: PlayerSave): Map<string, LoadoutPlacement[]> {
  const map = new Map<string, LoadoutPlacement[]>();
  for (const l of save.loadouts) {
    for (const t of LOADOUT_SLOT_TYPES) {
      l.slots[t].forEach((id, index) => {
        if (!id) return;
        map.set(id, [...(map.get(id) ?? []), { loadoutId: l.id, slot: t, index }]);
      });
    }
  }
  return map;
}

export function placementLabel(p: LoadoutPlacement): string {
  return `L${p.loadoutId.replace('LOADOUT-', '')} ${SLOT_RULES[p.slot].label}`;
}
