import type { EncounterDefinition, EnemyDefinition } from '../../types/enemy';
import type { ItemDefinition } from '../../types/item';
import type { MemoryDefinition } from '../../types/memory';
import type { MemoryStory } from '../../types/record';
import type { SkillDefinition, SkillEffect, SkillKind } from '../../types/skill';
import type { WorldDefinition } from '../../types/world';
import { parseEncounter, parseEnemy, parseItem, parseMemory, parseSkill, parseStory, parseWorld, type DataIssue } from './validate';

/**
 * ゲームのマスターデータ（読み取り専用リポジトリ）。
 *
 * データの追加方法:
 *   src/data/<種類>/ に JSON ファイルを追加するだけで自動的に読み込まれる。
 *   1ファイルに配列でも単体オブジェクトでも記述できる。
 *   PHASE 5 では buildGameData に Supabase から取得した配列を渡すことで同じ仕組みを利用できる。
 */

export interface RawGameDataSources {
  memories: unknown[];
  skills: unknown[];
  records: unknown[];
  worlds: unknown[];
  items?: unknown[];
  enemies?: unknown[];
  encounters?: unknown[];
}

export interface GameData {
  memories: MemoryDefinition[];
  memoryById: ReadonlyMap<string, MemoryDefinition>;
  skillById: ReadonlyMap<string, SkillDefinition>;
  storyById: ReadonlyMap<string, MemoryStory>;
  worlds: WorldDefinition[];
  worldById: ReadonlyMap<string, WorldDefinition>;
  itemById: ReadonlyMap<string, ItemDefinition>;
  enemyById: ReadonlyMap<string, EnemyDefinition>;
  encounters: EncounterDefinition[];
  encounterById: ReadonlyMap<string, EncounterDefinition>;
  issues: DataIssue[];
}

function indexUnique<T extends { id: string }>(items: T[], kind: string, issues: DataIssue[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) {
      issues.push({ level: 'error', source: `${kind}:${item.id}`, message: 'ID が重複しています（後のデータを無視）' });
      continue;
    }
    map.set(item.id, item);
  }
  return map;
}

function parseAll<T extends { id: string }>(raw: unknown[] | undefined, parse: (r: unknown, issues: DataIssue[]) => T | null, kind: string, issues: DataIssue[]) {
  return indexUnique(
    (raw ?? []).map((r) => parse(r, issues)).filter((x): x is T => x !== null),
    kind,
    issues,
  );
}

export function buildGameData(src: RawGameDataSources): GameData {
  const issues: DataIssue[] = [];
  const skills = parseAll(src.skills, parseSkill, 'skill', issues);
  const worlds = parseAll(src.worlds, parseWorld, 'world', issues);
  const memoryMap = parseAll(src.memories, parseMemory, 'memory', issues);
  const stories = parseAll(src.records, parseStory, 'record', issues);
  const items = parseAll(src.items, parseItem, 'item', issues);
  const enemyMap = parseAll(src.enemies, parseEnemy, 'enemy', issues);
  const encounterMap = parseAll(src.encounters, parseEncounter, 'encounter', issues);

  const err = (source: string, message: string) => issues.push({ level: 'error', source, message });
  const warn = (source: string, message: string) => issues.push({ level: 'warning', source, message });

  // ---- 参照整合性チェック（壊れた参照は取り除き、ゲームは継続できるようにする）
  const checkSkillRefs = (source: string, ids: string[], kind: SkillKind, field: string) =>
    ids.filter((id) => {
      const s = skills.get(id);
      if (!s) {
        err(source, `${field} に存在しないスキル ${id} があります`);
        return false;
      }
      if (s.kind !== kind) {
        err(source, `${field} のスキル ${id} は ${kind} ではありません（${s.kind}）`);
        return false;
      }
      return true;
    });

  const checkEffects = (source: string, effects: SkillEffect[]) => {
    for (const e of effects) {
      if (e.type === 'grant_skill' && e.id && skills.get(e.id)?.kind !== 'active') err(source, `grant_skill の ${e.id} は存在しないか active ではありません`);
    }
  };
  for (const s of skills.values()) checkEffects(`skill:${s.id}`, s.effects);
  for (const it of items.values()) checkEffects(`item:${it.id}`, it.effects);

  const memories: MemoryDefinition[] = [];
  for (const m of memoryMap.values()) {
    const src = `memory:${m.id}`;
    const fixed: MemoryDefinition = {
      ...m,
      skills: checkSkillRefs(src, m.skills, 'active', 'skills'),
      passiveSkills: checkSkillRefs(src, m.passiveSkills, 'passive', 'passiveSkills'),
      rewrite: m.rewrite && checkSkillRefs(src, [m.rewrite], 'rewrite', 'rewrite').length ? m.rewrite : undefined,
      relatedMemories: m.relatedMemories.filter((id) => {
        const ok = memoryMap.has(id) && id !== m.id;
        if (!ok) err(src, `relatedMemories の ${id} が不正です`);
        return ok;
      }),
    };
    if (fixed.storyId) {
      const story = stories.get(fixed.storyId);
      if (!story) {
        err(src, `storyId ${fixed.storyId} が存在しません`);
        fixed.storyId = null;
      } else if (story.memoryId !== m.id) {
        err(src, `記録 ${story.id} の memoryId が一致しません`);
      }
    }
    if (fixed.worldId && !worlds.has(fixed.worldId)) warn(src, `worldId ${fixed.worldId} が存在しません`);
    for (const a of fixed.acquisitionMethod) {
      if (a.worldId && !worlds.has(a.worldId)) warn(src, `acquisitionMethod の worldId ${a.worldId} が存在しません`);
    }
    for (const c of fixed.syncCondition ?? []) {
      if (c.type === 'ownedMemory' && !memoryMap.has(c.memoryId)) err(src, `syncCondition の ${c.memoryId} が存在しません`);
    }
    memories.push(fixed);
  }
  memories.sort((a, b) => a.id.localeCompare(b.id));
  const memoryById = new Map(memories.map((m) => [m.id, m]));

  for (const story of stories.values()) {
    const src = `record:${story.id}`;
    if (!memoryById.has(story.memoryId)) err(src, `memoryId ${story.memoryId} が存在しません`);
    const fragIds = new Set<string>();
    for (const f of story.fragments) {
      if (fragIds.has(f.id)) err(src, `断片 ID ${f.id} が重複しています`);
      fragIds.add(f.id);
      if (f.unlock.type === 'relatedOwned' && !memoryById.has(f.unlock.memoryId)) err(src, `断片 ${f.id} の解放条件 ${f.unlock.memoryId} が存在しません`);
      for (const r of f.reveals ?? []) if (!memoryById.has(r)) err(src, `断片 ${f.id} の reveals ${r} が存在しません`);
    }
  }

  // ---- 敵
  const enemyById = new Map<string, EnemyDefinition>();
  for (const e of enemyMap.values()) {
    const src = `enemy:${e.id}`;
    const fixed: EnemyDefinition = {
      ...e,
      skills: checkSkillRefs(src, e.skills, 'active', 'skills'),
      passiveSkills: checkSkillRefs(src, e.passiveSkills, 'passive', 'passiveSkills'),
    };
    fixed.ai = fixed.ai.filter((a) => a.action === 'attack' || fixed.skills.includes(a.action));
    if (fixed.ai.length === 0) fixed.ai = [{ action: 'attack', weight: 1 }];
    enemyById.set(e.id, fixed);
  }

  // ---- 遭遇
  const encounters: EncounterDefinition[] = [];
  const checkItems = (src: string, map: Record<string, number> | undefined) => {
    for (const id of Object.keys(map ?? {})) if (!items.has(id)) err(src, `アイテム ${id} が存在しません`);
  };
  for (const enc of encounterMap.values()) {
    const src = `encounter:${enc.id}`;
    if (!worlds.has(enc.worldId)) warn(src, `worldId ${enc.worldId} が存在しません`);
    const enemies = enc.enemies.filter((id) => {
      if (!enemyById.has(id)) err(src, `敵 ${id} が存在しません`);
      return enemyById.has(id);
    });
    if (enemies.length > 3) err(src, '敵は最大3体です（超過分を無視）');
    if (enc.unlock.type === 'encounterClear' && !encounterMap.has(enc.unlock.encounterId)) err(src, `解放条件 ${enc.unlock.encounterId} が存在しません`);
    for (const m of enc.firstClear?.memories ?? []) if (!memoryById.has(m)) err(src, `初回報酬の Memory ${m} が存在しません`);
    checkItems(src, enc.rewards.items);
    checkItems(src, enc.firstClear?.items);
    if (enemies.length === 0) continue;
    encounters.push({ ...enc, enemies: enemies.slice(0, 3) });
  }

  return {
    memories,
    memoryById,
    skillById: skills,
    storyById: stories,
    worlds: [...worlds.values()],
    worldById: worlds,
    itemById: items,
    enemyById,
    encounters,
    encounterById: new Map(encounters.map((e) => [e.id, e])),
    issues,
  };
}

/** import.meta.glob の結果（1ファイル = 配列 or 単体）を平坦化する */
function flattenModules(modules: Record<string, unknown>): unknown[] {
  return Object.keys(modules)
    .sort()
    .flatMap((key) => {
      const v = modules[key];
      return Array.isArray(v) ? v : [v];
    });
}

export function loadBundledSources(): RawGameDataSources {
  return {
    memories: flattenModules(import.meta.glob('../../data/memories/*.json', { eager: true, import: 'default' })),
    skills: flattenModules(import.meta.glob('../../data/skills/*.json', { eager: true, import: 'default' })),
    records: flattenModules(import.meta.glob('../../data/records/*.json', { eager: true, import: 'default' })),
    worlds: flattenModules(import.meta.glob('../../data/worlds.json', { eager: true, import: 'default' })),
    items: flattenModules(import.meta.glob('../../data/items.json', { eager: true, import: 'default' })),
    enemies: flattenModules(import.meta.glob('../../data/enemies/*.json', { eager: true, import: 'default' })),
    encounters: flattenModules(import.meta.glob('../../data/encounters/*.json', { eager: true, import: 'default' })),
  };
}

/** アプリ全体で共有するマスターデータ */
export const gameData: GameData = buildGameData(loadBundledSources());

if (import.meta.env?.DEV && gameData.issues.length > 0) {
  console.warn('[NETWORK] マスターデータに問題があります:', gameData.issues);
}
