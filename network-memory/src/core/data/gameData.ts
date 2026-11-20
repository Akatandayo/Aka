import type { EncounterDefinition, EnemyDefinition } from '../../types/enemy';
import type { ItemDefinition } from '../../types/item';
import type { MemoryDefinition } from '../../types/memory';
import type { MemoryStory } from '../../types/record';
import type { SkillDefinition, SkillEffect, SkillKind } from '../../types/skill';
import type { RestorationTarget, WorldDefinition } from '../../types/world';
import type { AreaDefinition, EventDefinition, QuestDefinition } from '../../types/exploration';
import type { ArchiveEntry } from '../../types/archive';
import type { Condition } from '../../types/condition';
import type { CharacterDefinition, StoryChapter } from '../../types/story';
import {
  parseArchiveEntry,
  parseArea,
  parseChapter,
  parseEvent,
  parseQuest,
  parseCharacter,
  parseEncounter,
  parseEnemy,
  parseItem,
  parseMemory,
  parseSkill,
  parseStory,
  parseWorld,
  type DataIssue,
} from './validate';

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
  characters?: unknown[];
  chapters?: unknown[];
  archive?: unknown[];
  areas?: unknown[];
  events?: unknown[];
  quests?: unknown[];
}

export interface FieldAbilityInfo {
  id: string;
  name: string;
  description: string;
  memoryId: string;
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
  characters: CharacterDefinition[];
  characterById: ReadonlyMap<string, CharacterDefinition>;
  /** ストーリーの章（order 順） */
  chapters: StoryChapter[];
  chapterById: ReadonlyMap<string, StoryChapter>;
  /** ARCHIVE（MEMORY RECORD 以外） */
  archive: ArchiveEntry[];
  archiveById: ReadonlyMap<string, ArchiveEntry>;
  /** WORLD の修復対象（ID → 対象） */
  restorationById: ReadonlyMap<string, RestorationTarget & { worldId: string }>;
  /** 探索（PHASE 4） */
  areas: AreaDefinition[];
  areaById: ReadonlyMap<string, AreaDefinition>;
  events: EventDefinition[];
  eventById: ReadonlyMap<string, EventDefinition>;
  quests: QuestDefinition[];
  questById: ReadonlyMap<string, QuestDefinition>;
  /** 探索能力 ID → 能力と、その能力を持つ Memory */
  fieldAbilityById: ReadonlyMap<string, FieldAbilityInfo>;
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
  const characterMap = parseAll(src.characters, parseCharacter, 'character', issues);
  const chapterMap = parseAll(src.chapters, parseChapter, 'story', issues);
  const archiveMap = parseAll(src.archive, parseArchiveEntry, 'archive', issues);
  const areaMap = parseAll(src.areas, parseArea, 'area', issues);
  const eventMap = parseAll(src.events, parseEvent, 'event', issues);
  const questMap = parseAll(src.quests, parseQuest, 'quest', issues);

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
    const skillsOk = checkSkillRefs(src, m.skills, 'active', 'skills');
    const se = { ...m.syncEffects };
    if (se.supportSkill && !skillsOk.includes(se.supportSkill)) {
      err(src, `syncEffects.supportSkill ${se.supportSkill} は skills に含まれている必要があります`);
      delete se.supportSkill;
    }
    if (se.rewrite && !checkSkillRefs(src, [se.rewrite], 'rewrite', 'syncEffects.rewrite').length) delete se.rewrite;
    const fixed: MemoryDefinition = {
      ...m,
      skills: skillsOk,
      passive: checkSkillRefs(src, m.passive, 'passive', 'passive'),
      syncEffects: se,
      relatedMemories: m.relatedMemories.filter((id) => {
        const ok = memoryMap.has(id) && id !== m.id;
        if (!ok) err(src, `relatedMemories の ${id} が不正です`);
        return ok;
      }),
      storyRecords: m.storyRecords.filter((rid) => {
        const story = stories.get(rid);
        if (!story) err(src, `storyRecords の ${rid} が存在しません`);
        else if (story.memoryId !== m.id) err(src, `記録 ${rid} の memoryId が一致しません`);
        return Boolean(story);
      }),
    };
    if (fixed.worldId && !worlds.has(fixed.worldId)) warn(src, `worldId ${fixed.worldId} が存在しません`);
    for (const a of fixed.acquisitionMethod) {
      if (a.worldId && !worlds.has(a.worldId)) warn(src, `acquisitionMethod の worldId ${a.worldId} が存在しません`);
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

  const restorationIds = new Set([...worlds.values()].flatMap((w) => w.restorations.map((t) => t.id)));

  // ---- 共通条件式の参照チェック
  const checkConds = (source: string, conds: Condition[] | undefined) => {
    for (const c of conds ?? []) {
      if ((c.type === 'ownedMemory' || c.type === 'discoveredMemory' || c.type === 'memoryLevel') && !memoryById.has(c.memoryId)) err(source, `条件の Memory ${c.memoryId} が存在しません`);
      if (c.type === 'encounterCleared' && !encounterMap.has(c.encounterId)) err(source, `条件の流出反応 ${c.encounterId} が存在しません`);
      if (c.type === 'storyCleared' && !chapterMap.has(c.chapterId)) err(source, `条件の章 ${c.chapterId} が存在しません`);
      if (c.type === 'worldRestoration' && !worlds.has(c.worldId)) err(source, `条件の WORLD ${c.worldId} が存在しません`);
      if (c.type === 'restored' && !restorationIds.has(c.targetId)) err(source, `条件の修復対象 ${c.targetId} が存在しません`);
      if (c.type === 'questCompleted' && !questMap.has(c.questId)) err(source, `条件のサブクエスト ${c.questId} が存在しません`);
    }
  };
  for (const m of memories) checkConds(`memory:${m.id}`, m.unlockConditions);

  // ---- WORLD の修復対象
  for (const w of worlds.values()) {
    const ids = new Set<string>();
    for (const t of w.restorations) {
      if (ids.has(t.id)) err(`world:${w.id}`, `修復対象 ID ${t.id} が重複しています`);
      ids.add(t.id);
      if (!memoryById.has(t.memoryId)) err(`world:${w.id}`, `修復対象 ${t.id} の Memory ${t.memoryId} が存在しません`);
    }
  }

  // ---- ストーリー・イベント（シナリオ）
  const checkScript = (source: string, script: StoryChapter['script']) => {
    for (const cmd of script) {
      if ((cmd.t === 'show' || cmd.t === 'hide' || cmd.t === 'say') && !characterMap.has(cmd.char) && cmd.char !== 'PLAYER') err(source, `登場人物 ${cmd.char} が存在しません`);
      if (cmd.t === 'detect' && !memoryById.has(cmd.memoryId)) err(source, `Memory ${cmd.memoryId} が存在しません`);
      if (cmd.t === 'if') checkConds(source, cmd.cond);
    }
  };
  const chapters = [...chapterMap.values()].sort((a, b) => a.order - b.order);
  for (const ch of chapters) {
    const source = `story:${ch.id}`;
    checkConds(source, ch.unlock);
    checkScript(source, ch.script);
    for (const id of Object.keys(ch.rewards?.items ?? {})) if (!items.has(id)) err(source, `報酬のアイテム ${id} が存在しません`);
  }
  for (const ev of eventMap.values()) {
    checkScript(`event:${ev.id}`, ev.script);
    checkItems(`event:${ev.id}`, ev.rewards?.items);
  }

  // ---- 探索能力（Memory の fieldAbilities）
  const fieldAbilityById = new Map<string, FieldAbilityInfo>();
  for (const m of memories) {
    for (const f of m.fieldAbilities ?? []) {
      if (fieldAbilityById.has(f.id)) err(`memory:${m.id}`, `探索能力 ${f.id} が重複しています`);
      else fieldAbilityById.set(f.id, { ...f, memoryId: m.id });
    }
  }

  // ---- 探索エリア
  const areas = [...areaMap.values()];
  const pointIds = new Set<string>();
  for (const a of areas) {
    const source = `area:${a.id}`;
    if (!worlds.has(a.worldId)) err(source, `WORLD ${a.worldId} が存在しません`);
    checkConds(source, a.unlock);
    for (const l of a.links) {
      const to = areaMap.get(l);
      if (!to) err(source, `つながっているエリア ${l} が存在しません`);
      else if (to.worldId !== a.worldId) err(source, `エリア ${l} は別の WORLD です`);
      else if (!to.links.includes(a.id)) warn(source, `エリア ${l} からこのエリアへの道がありません（片道）`);
    }
    if (a.revealedBy && !fieldAbilityById.has(a.revealedBy)) err(source, `探索能力 ${a.revealedBy} が存在しません`);
    for (const p of a.points) {
      if (pointIds.has(p.id)) err(source, `地点 ID ${p.id} が重複しています`);
      pointIds.add(p.id);
      checkConds(source, p.visible);
      checkConds(source, p.unlock);
      if (p.fieldAbility && !fieldAbilityById.has(p.fieldAbility)) err(source, `${p.id}: 探索能力 ${p.fieldAbility} が存在しません`);
      if (p.encounterId && !encounterMap.has(p.encounterId)) err(source, `${p.id}: 流出反応 ${p.encounterId} が存在しません`);
      if (p.eventId && !eventMap.has(p.eventId)) err(source, `${p.id}: イベント ${p.eventId} が存在しません`);
      if (p.npc && !characterMap.has(p.npc)) err(source, `${p.id}: 登場人物 ${p.npc} が存在しません`);
      for (const id of [...(p.discover ?? []), ...(p.detect ?? [])]) if (!memoryById.has(id)) err(source, `${p.id}: Memory ${id} が存在しません`);
      checkItems(source, p.rewards?.items);
    }
  }
  for (const w of worlds.values()) {
    const own = areas.filter((a) => a.worldId === w.id);
    if (own.length && own.filter((a) => a.entry).length !== 1) err(`world:${w.id}`, '探索エリアの入口（entry）は 1 つにしてください');
  }

  // ---- サブクエスト
  const quests = [...questMap.values()];
  for (const q of quests) {
    const source = `quest:${q.id}`;
    if (!worlds.has(q.worldId)) err(source, `WORLD ${q.worldId} が存在しません`);
    if (!characterMap.has(q.giver)) err(source, `依頼人 ${q.giver} が存在しません`);
    checkConds(source, q.unlock);
    checkConds(source, q.objectives.map((o) => o.cond));
    checkItems(source, q.rewards.items);
  }

  // ---- ARCHIVE
  for (const e of archiveMap.values()) {
    const source = `archive:${e.id}`;
    checkConds(source, e.unlock);
    for (const sec of e.sections) checkConds(source, sec.unlock);
    if (e.related?.characterId && !characterMap.has(e.related.characterId)) err(source, `登場人物 ${e.related.characterId} が存在しません`);
    if (e.related?.worldId && !worlds.has(e.related.worldId)) err(source, `WORLD ${e.related.worldId} が存在しません`);
    for (const id of e.related?.memoryIds ?? []) if (!memoryById.has(id)) err(source, `Memory ${id} が存在しません`);
  }

  return {
    characters: [...characterMap.values()],
    characterById: characterMap,
    chapters,
    chapterById: new Map(chapters.map((c) => [c.id, c])),
    archive: [...archiveMap.values()],
    archiveById: archiveMap,
    restorationById: new Map([...worlds.values()].flatMap((w) => w.restorations.map((t) => [t.id, { ...t, worldId: w.id }] as const))),
    areas,
    areaById: areaMap,
    events: [...eventMap.values()],
    eventById: eventMap,
    quests,
    questById: questMap,
    fieldAbilityById,
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
    characters: flattenModules(import.meta.glob('../../data/characters/*.json', { eager: true, import: 'default' })),
    chapters: flattenModules(import.meta.glob('../../data/story/*.json', { eager: true, import: 'default' })),
    archive: flattenModules(import.meta.glob('../../data/archive/*.json', { eager: true, import: 'default' })),
    areas: flattenModules(import.meta.glob('../../data/areas/*.json', { eager: true, import: 'default' })),
    events: flattenModules(import.meta.glob('../../data/events/*.json', { eager: true, import: 'default' })),
    quests: flattenModules(import.meta.glob('../../data/quests/*.json', { eager: true, import: 'default' })),
  };
}

/** アプリ全体で共有するマスターデータ */
export const gameData: GameData = buildGameData(loadBundledSources());

if (import.meta.env?.DEV && gameData.issues.length > 0) {
  console.warn('[NETWORK] マスターデータに問題があります:', gameData.issues);
}
