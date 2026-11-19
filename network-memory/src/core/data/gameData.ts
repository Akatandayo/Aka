import type { MemoryDefinition } from '../../types/memory';
import type { MemoryStory } from '../../types/record';
import type { SkillDefinition, SkillKind } from '../../types/skill';
import type { WorldDefinition } from '../../types/world';
import { parseMemory, parseSkill, parseStory, parseWorld, type DataIssue } from './validate';

/**
 * ゲームのマスターデータ（読み取り専用リポジトリ）。
 *
 * データの追加方法:
 *   src/data/memories/ 等に JSON ファイルを追加するだけで自動的に読み込まれる。
 *   1ファイルに配列でも単体オブジェクトでも記述できる。
 *   PHASE 5 では buildGameData に Supabase から取得した配列を渡すことで同じ仕組みを利用できる。
 */

export interface RawGameDataSources {
  memories: unknown[];
  skills: unknown[];
  records: unknown[];
  worlds: unknown[];
}

export interface GameData {
  memories: MemoryDefinition[];
  memoryById: ReadonlyMap<string, MemoryDefinition>;
  skillById: ReadonlyMap<string, SkillDefinition>;
  storyById: ReadonlyMap<string, MemoryStory>;
  worlds: WorldDefinition[];
  worldById: ReadonlyMap<string, WorldDefinition>;
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

export function buildGameData(src: RawGameDataSources): GameData {
  const issues: DataIssue[] = [];
  const skills = indexUnique(
    src.skills.map((s) => parseSkill(s, issues)).filter((s): s is SkillDefinition => s !== null),
    'skill',
    issues,
  );
  const worlds = indexUnique(
    src.worlds.map((w) => parseWorld(w, issues)).filter((w): w is WorldDefinition => w !== null),
    'world',
    issues,
  );
  const memoryMap = indexUnique(
    src.memories.map((m) => parseMemory(m, issues)).filter((m): m is MemoryDefinition => m !== null),
    'memory',
    issues,
  );
  const stories = indexUnique(
    src.records.map((r) => parseStory(r, issues)).filter((r): r is MemoryStory => r !== null),
    'record',
    issues,
  );

  // ---- 参照整合性チェック（壊れた参照は取り除き、ゲームは継続できるようにする）
  const checkSkillRefs = (m: MemoryDefinition, ids: string[], kind: SkillKind, field: string) =>
    ids.filter((id) => {
      const s = skills.get(id);
      if (!s) {
        issues.push({ level: 'error', source: `memory:${m.id}`, message: `${field} に存在しないスキル ${id} があります` });
        return false;
      }
      if (s.kind !== kind) {
        issues.push({ level: 'error', source: `memory:${m.id}`, message: `${field} のスキル ${id} は ${kind} ではありません（${s.kind}）` });
        return false;
      }
      return true;
    });

  const memories: MemoryDefinition[] = [];
  for (const m of memoryMap.values()) {
    const fixed: MemoryDefinition = {
      ...m,
      skills: checkSkillRefs(m, m.skills, 'active', 'skills'),
      passiveSkills: checkSkillRefs(m, m.passiveSkills, 'passive', 'passiveSkills'),
      rewrite: m.rewrite && checkSkillRefs(m, [m.rewrite], 'rewrite', 'rewrite').length ? m.rewrite : undefined,
      relatedMemories: m.relatedMemories.filter((id) => {
        const ok = memoryMap.has(id) && id !== m.id;
        if (!ok) issues.push({ level: 'error', source: `memory:${m.id}`, message: `relatedMemories の ${id} が不正です` });
        return ok;
      }),
    };
    if (fixed.storyId) {
      const story = stories.get(fixed.storyId);
      if (!story) {
        issues.push({ level: 'error', source: `memory:${m.id}`, message: `storyId ${fixed.storyId} が存在しません` });
        fixed.storyId = null;
      } else if (story.memoryId !== m.id) {
        issues.push({ level: 'error', source: `memory:${m.id}`, message: `記録 ${story.id} の memoryId が一致しません` });
      }
    }
    if (fixed.worldId && !worlds.has(fixed.worldId)) {
      issues.push({ level: 'warning', source: `memory:${m.id}`, message: `worldId ${fixed.worldId} が存在しません` });
    }
    for (const a of fixed.acquisitionMethod) {
      if (a.worldId && !worlds.has(a.worldId)) {
        issues.push({ level: 'warning', source: `memory:${m.id}`, message: `acquisitionMethod の worldId ${a.worldId} が存在しません` });
      }
    }
    memories.push(fixed);
  }
  memories.sort((a, b) => a.id.localeCompare(b.id));
  const memoryById = new Map(memories.map((m) => [m.id, m]));

  for (const story of stories.values()) {
    if (!memoryById.has(story.memoryId)) {
      issues.push({ level: 'error', source: `record:${story.id}`, message: `memoryId ${story.memoryId} が存在しません` });
    }
    const fragIds = new Set<string>();
    for (const f of story.fragments) {
      if (fragIds.has(f.id)) issues.push({ level: 'error', source: `record:${story.id}`, message: `断片 ID ${f.id} が重複しています` });
      fragIds.add(f.id);
      if (f.unlock.type === 'relatedOwned' && !memoryById.has(f.unlock.memoryId)) {
        issues.push({ level: 'error', source: `record:${story.id}`, message: `断片 ${f.id} の解放条件 ${f.unlock.memoryId} が存在しません` });
      }
      for (const r of f.reveals ?? []) {
        if (!memoryById.has(r)) issues.push({ level: 'error', source: `record:${story.id}`, message: `断片 ${f.id} の reveals ${r} が存在しません` });
      }
    }
  }

  return {
    memories,
    memoryById,
    skillById: skills,
    storyById: stories,
    worlds: [...worlds.values()],
    worldById: worlds,
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
  };
}

/** アプリ全体で共有するマスターデータ */
export const gameData: GameData = buildGameData(loadBundledSources());

if (import.meta.env?.DEV && gameData.issues.length > 0) {
  console.warn('[NETWORK] マスターデータに問題があります:', gameData.issues);
}
