import {
  ACQUISITION_TYPES,
  ATTRIBUTES,
  MEMORY_CATEGORIES,
  RARITIES,
  STAT_KEYS,
  type AcquisitionMethod,
  type AttackStyle,
  type FieldAbility,
  type MemoryDefinition,
  type SyncEffects,
} from '../../types/memory';
import type { Condition } from '../../types/condition';
import type { EncounterDefinition, EncounterReward, EnemyAiRule, EnemyDefinition } from '../../types/enemy';
import type { ItemDefinition } from '../../types/item';
import { CURRENCIES } from '../../types/player';
import type { MemoryRecordFragment, MemoryStory, RecordUnlock } from '../../types/record';
import {
  EFFECT_TYPES,
  PASSIVE_TRIGGERS,
  REWRITE_CONDITIONS,
  SKILL_KINDS,
  SKILL_TARGETS,
  STATUS_IDS,
  type SkillDefinition,
  type SkillEffect,
} from '../../types/skill';
import { RESTORATION_KINDS, type RestorationTarget, type WorldDefinition, type WorldUnlock } from '../../types/world';
import { ARCHIVE_CATEGORIES, type ArchiveEntry, type ArchiveSection } from '../../types/archive';
import type { CharacterDefinition, StoryChapter, StoryCommand } from '../../types/story';

/**
 * マスターデータの検証。
 * JSON/DB から読み込んだ未検証データ（unknown）を型付きデータに変換する。
 * 不正なエントリはゲームを止めずに除外し、issues に理由を記録する。
 */

export type IssueLevel = 'error' | 'warning';
export interface DataIssue {
  level: IssueLevel;
  source: string;
  message: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const optStr = (v: unknown): string | undefined => (isStr(v) ? v : undefined);
const strArray = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => isStr(x)) ? (v as string[]) : null;

export class Collector {
  issues: DataIssue[] = [];
  constructor(private readonly source: string) {}
  error(message: string) {
    this.issues.push({ level: 'error', source: this.source, message });
  }
  warn(message: string) {
    this.issues.push({ level: 'warning', source: this.source, message });
  }
}

// ---------------------------------------------------------------- Memory

export function parseAttackStyle(v: unknown, c: Collector): AttackStyle | undefined {
  if (!isObj(v) || !isStr(v.name) || (v.scale !== 'atk' && v.scale !== 'tec') || !isNum(v.power) || !isNum(v.hits) || v.hits < 1) {
    c.error(`attackStyle が不正です: ${JSON.stringify(v)}`);
    return undefined;
  }
  return { name: v.name, scale: v.scale, power: v.power, hits: Math.floor(v.hits) };
}

/** 共通の条件式（同期条件・ARCHIVE・ストーリー・WORLD で使用） */
export function parseCondition(x: unknown, c: Collector): Condition | null {
  if (!isObj(x)) {
    c.error('条件の形式が不正です');
    return null;
  }
  switch (x.type) {
    case 'playerLevel':
      if (isNum(x.value)) return { type: 'playerLevel', value: x.value };
      break;
    case 'ownedMemory':
    case 'discoveredMemory':
      if (isStr(x.memoryId)) return { type: x.type, memoryId: x.memoryId };
      break;
    case 'memoryLevel':
      if (isStr(x.memoryId) && isNum(x.value)) return { type: 'memoryLevel', memoryId: x.memoryId, value: x.value };
      break;
    case 'flag':
      if (isStr(x.flag)) return { type: 'flag', flag: x.flag, ...(isStr(x.label) ? { label: x.label } : {}) };
      break;
    case 'storyCleared':
      if (isStr(x.chapterId)) return { type: 'storyCleared', chapterId: x.chapterId };
      break;
    case 'encounterCleared':
      if (isStr(x.encounterId)) return { type: 'encounterCleared', encounterId: x.encounterId };
      break;
    case 'worldRestoration':
      if (isStr(x.worldId) && isNum(x.value)) return { type: 'worldRestoration', worldId: x.worldId, value: x.value };
      break;
    case 'unknown':
      return { type: 'unknown' };
  }
  c.error(`条件が不正です: ${JSON.stringify(x)}`);
  return null;
}

export function parseConditions(v: unknown, c: Collector, field: string): Condition[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    c.error(`${field} は配列である必要があります`);
    return [];
  }
  return v.map((x) => parseCondition(x, c)).filter((x): x is Condition => x !== null);
}

function parseFieldAbilities(v: unknown, c: Collector): FieldAbility[] | undefined {
  if (!Array.isArray(v)) {
    c.error('fieldAbilities は配列である必要があります');
    return undefined;
  }
  return v.flatMap((x) => {
    if (isObj(x) && isStr(x.id) && isStr(x.name) && isStr(x.description)) return [{ id: x.id, name: x.name, description: x.description }];
    c.error(`fieldAbilities の要素が不正です: ${JSON.stringify(x)}`);
    return [];
  });
}

function parseAcquisition(v: unknown, c: Collector): AcquisitionMethod[] {
  if (!Array.isArray(v)) {
    c.error('acquisitionMethod は配列である必要があります');
    return [];
  }
  const out: AcquisitionMethod[] = [];
  for (const a of v) {
    if (!isObj(a) || !isOneOf(ACQUISITION_TYPES, a.type) || !isStr(a.label)) {
      c.error(`acquisitionMethod の要素が不正です: ${JSON.stringify(a)}`);
      continue;
    }
    out.push({ type: a.type, label: a.label, ...(isStr(a.worldId) ? { worldId: a.worldId } : {}) });
  }
  return out;
}

/**
 * Memory の読み込み。Ver.3 の形式（baseStats / passive / syncEffects / storyRecords / unlockConditions）を正とし、
 * Ver.1・Ver.2 の形式（hp〜res / passiveSkills / rewrite / attackStyle / storyId / syncCondition）も受け付けて変換する。
 */
export function parseMemory(raw: unknown, issues: DataIssue[]): MemoryDefinition | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`memory:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw)) {
    c.error('オブジェクトではありません');
    return finish(null);
  }
  const r = raw;
  if (!isStr(r.id)) c.error('id がありません');
  if (!isStr(r.name)) c.error('name がありません');
  if (!isOneOf(MEMORY_CATEGORIES, r.category)) c.error(`category が不正です: ${String(r.category)}`);
  if (!isOneOf(RARITIES, r.rarity)) c.error(`rarity が不正です: ${String(r.rarity)}`);
  if (!isOneOf(ATTRIBUTES, r.attribute)) c.error(`attribute が不正です: ${String(r.attribute)}`);
  if (!isStr(r.description)) c.error('description がありません');

  // ---- 固有ステータス
  const statSrc = isObj(r.baseStats) ? r.baseStats : r;
  const baseStats = {} as MemoryDefinition['baseStats'];
  for (const k of STAT_KEYS) {
    const v = statSrc[k];
    if (!isNum(v) || v < 0) c.error(`baseStats.${k} は0以上の数値である必要があります`);
    else baseStats[k] = v;
  }

  const skills = strArray(r.skills ?? []);
  const passive = strArray(r.passive ?? r.passiveSkills ?? []);
  const related = strArray(r.relatedMemories ?? []);
  if (!skills) c.error('skills は文字列配列である必要があります');
  if (!passive) c.error('passive は文字列配列である必要があります');
  if (!related) c.error('relatedMemories は文字列配列である必要があります');
  const acquisitionMethod = parseAcquisition(r.acquisitionMethod, c);

  // ---- 同期効果
  const se = isObj(r.syncEffects) ? r.syncEffects : {};
  const styleRaw = se.style ?? r.attackStyle;
  const style =
    styleRaw === undefined
      ? { name: 'ストライク', scale: (baseStats.tec ?? 0) > (baseStats.atk ?? 0) ? ('tec' as const) : ('atk' as const), power: 1, hits: 1 }
      : parseAttackStyle(styleRaw, c);
  let passiveBonus: SyncEffects['passiveBonus'];
  if (se.passiveBonus !== undefined) {
    if (!isObj(se.passiveBonus)) c.error('syncEffects.passiveBonus が不正です');
    else {
      passiveBonus = {};
      for (const [k, v] of Object.entries(se.passiveBonus)) {
        if (!isOneOf(STAT_KEYS, k) || !isNum(v) || v < 0 || v > 1) c.error(`syncEffects.passiveBonus.${k} が不正です`);
        else passiveBonus[k] = v;
      }
    }
  }
  let direction: SyncEffects['direction'];
  if (isObj(se.direction)) {
    direction = {
      ...(isStr(se.direction.color) ? { color: se.direction.color } : {}),
      ...(strArray(se.direction.lines) ? { lines: strArray(se.direction.lines)! } : {}),
    };
  }
  let appearance: SyncEffects['appearance'];
  if (se.appearance !== undefined) {
    if (!isObj(se.appearance) || !isStr(se.appearance.aura) || !isStr(se.appearance.label)) c.error('syncEffects.appearance が不正です');
    else appearance = { aura: se.appearance.aura, label: se.appearance.label };
  }
  const supportSkill = optStr(se.supportSkill);
  const rewrite = optStr(se.rewrite) ?? optStr(r.rewrite);

  const storyRecords = r.storyRecords !== undefined ? strArray(r.storyRecords) : isStr(r.storyId) ? [r.storyId] : [];
  if (storyRecords === null) c.error('storyRecords は文字列配列である必要があります');
  const unlockConditions = parseConditions(r.unlockConditions ?? r.syncCondition, c, 'unlockConditions');
  const fieldAbilities = r.fieldAbilities === undefined ? undefined : parseFieldAbilities(r.fieldAbilities, c);
  let persona: MemoryDefinition['persona'];
  if (r.persona !== undefined) {
    if (!isObj(r.persona) || !isStr(r.persona.personality)) c.error('persona.personality がありません');
    else persona = { personality: r.persona.personality, ...(isStr(r.persona.note) ? { note: r.persona.note } : {}) };
  }

  if (c.issues.some((i) => i.level === 'error')) return finish(null);

  const def: MemoryDefinition = {
    id: r.id as string,
    name: r.name as string,
    nameEn: optStr(r.nameEn),
    title: optStr(r.title),
    category: r.category as MemoryDefinition['category'],
    rarity: r.rarity as MemoryDefinition['rarity'],
    attribute: r.attribute as MemoryDefinition['attribute'],
    description: r.description as string,
    quote: optStr(r.quote),
    illustration: isStr(r.illustration) ? r.illustration : `gen:${String(r.category).toLowerCase()}`,
    baseStats,
    skills: skills!,
    passive: passive!,
    syncEffects: {
      style: style!,
      ...(supportSkill ? { supportSkill } : {}),
      ...(passiveBonus ? { passiveBonus } : {}),
      ...(rewrite ? { rewrite } : {}),
      ...(direction ? { direction } : {}),
      ...(appearance ? { appearance } : {}),
    },
    ...(fieldAbilities ? { fieldAbilities } : {}),
    ...(persona ? { persona } : {}),
    acquisitionMethod,
    relatedMemories: related!,
    worldId: isStr(r.worldId) ? r.worldId : null,
    storyRecords: storyRecords!,
    unlockConditions,
    tags: strArray(r.tags) ?? [],
  };
  return finish(def);
}

// ---------------------------------------------------------------- Skill

export function parseEffect(v: unknown, c: Collector): SkillEffect | null {
  if (!isObj(v) || !isOneOf(EFFECT_TYPES, v.type)) {
    c.error(`effect が不正です: ${JSON.stringify(v)}`);
    return null;
  }
  const e: SkillEffect = { type: v.type };
  if (v.target !== undefined) {
    if (!isOneOf(SKILL_TARGETS, v.target)) c.error(`effect.target が不正です: ${String(v.target)}`);
    else e.target = v.target;
  }
  if (v.scale !== undefined) {
    if (!isOneOf(STAT_KEYS, v.scale)) c.error(`effect.scale が不正です: ${String(v.scale)}`);
    else e.scale = v.scale;
  }
  if (v.stat !== undefined) {
    if (!isOneOf(STAT_KEYS, v.stat)) c.error(`effect.stat が不正です: ${String(v.stat)}`);
    else e.stat = v.stat;
  }
  if (v.status !== undefined) {
    if (!isOneOf(STATUS_IDS, v.status)) c.error(`effect.status が不正です: ${String(v.status)}`);
    else e.status = v.status;
  }
  if (v.attribute !== undefined) {
    if (!isOneOf(ATTRIBUTES, v.attribute)) c.error(`effect.attribute が不正です: ${String(v.attribute)}`);
    else e.attribute = v.attribute;
  }
  for (const k of ['power', 'hits', 'value', 'chance', 'turns'] as const) {
    if (v[k] !== undefined) {
      if (!isNum(v[k])) c.error(`effect.${k} は数値である必要があります`);
      else e[k] = v[k] as number;
    }
  }
  if (v.chance !== undefined && isNum(v.chance) && (v.chance < 0 || v.chance > 1)) {
    c.error('effect.chance は 0〜1 の範囲である必要があります');
  }
  if ((e.type === 'damage' || e.type === 'heal') && (!e.scale || e.power === undefined)) {
    c.error(`${e.type} 効果には scale と power が必要です`);
  }
  if ((e.type === 'buff' || e.type === 'debuff') && (!e.stat || e.value === undefined)) {
    c.error(`${e.type} 効果には stat と value が必要です`);
  }
  if (e.type === 'status' && !e.status) c.error('status 効果には status が必要です');
  if ((e.type === 'heal_percent' || e.type === 'empower' || e.type === 'sp_gain' || e.type === 'energy_gain') && e.value === undefined) c.error(`${e.type} 効果には value が必要です`);
  if (e.type === 'attribute_shift' && (!e.attribute || e.turns === undefined)) c.error('attribute_shift 効果には attribute と turns が必要です');
  if (e.type === 'special' || e.type === 'grant_skill') {
    if (!isStr(v.id)) c.error(`${e.type} 効果には id が必要です`);
    else e.id = v.id;
  }
  return e;
}

export function parseSkill(raw: unknown, issues: DataIssue[]): SkillDefinition | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`skill:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw)) {
    c.error('オブジェクトではありません');
    return finish(null);
  }
  const r = raw;
  if (!isStr(r.id)) c.error('id がありません');
  if (!isStr(r.name)) c.error('name がありません');
  if (!isOneOf(SKILL_KINDS, r.kind)) c.error(`kind が不正です: ${String(r.kind)}`);
  if (!isStr(r.description)) c.error('description がありません');
  if (r.attribute !== undefined && !isOneOf(ATTRIBUTES, r.attribute)) c.error('attribute が不正です');
  if (r.target !== undefined && !isOneOf(SKILL_TARGETS, r.target)) c.error('target が不正です');
  if (r.trigger !== undefined && !isOneOf(PASSIVE_TRIGGERS, r.trigger)) c.error('trigger が不正です');
  if (r.kind === 'passive' && r.trigger === undefined) c.error('passive スキルには trigger が必要です');
  if (r.cost !== undefined && (!isNum(r.cost) || r.cost < 0)) c.error('cost は0以上の数値である必要があります');
  if (r.cooldown !== undefined && (!isNum(r.cooldown) || r.cooldown < 0)) c.error('cooldown は0以上の数値である必要があります');
  let condition: SkillDefinition['condition'];
  if (r.kind === 'rewrite') {
    if (r.condition === undefined) {
      condition = undefined;
    } else if (!isObj(r.condition) || !isOneOf(REWRITE_CONDITIONS, r.condition.type)) {
      c.error('rewrite スキルの condition が不正です');
    } else {
      condition = {
        type: r.condition.type,
        ...(isNum(r.condition.value) ? { value: r.condition.value } : {}),
      };
    }
    if (r.condition !== undefined && !isStr(r.conditionText)) c.error('追加条件のある rewrite スキルには conditionText が必要です');
  }
  if (!Array.isArray(r.effects) || r.effects.length === 0) c.error('effects は1つ以上必要です');
  const effects = Array.isArray(r.effects)
    ? r.effects.map((e) => parseEffect(e, c)).filter((e): e is SkillEffect => e !== null)
    : [];

  if (c.issues.some((i) => i.level === 'error')) return finish(null);

  const direction = isObj(r.direction)
    ? {
        cutin: optStr(r.direction.cutin),
        glitch: r.direction.glitch === true,
        shake: r.direction.shake === true,
        color: optStr(r.direction.color),
      }
    : undefined;

  return finish({
    id: r.id as string,
    name: r.name as string,
    nameEn: optStr(r.nameEn),
    kind: r.kind as SkillDefinition['kind'],
    attribute: r.attribute as SkillDefinition['attribute'],
    description: r.description as string,
    target: r.target as SkillDefinition['target'],
    cooldown: isNum(r.cooldown) ? r.cooldown : undefined,
    cost: isNum(r.cost) ? r.cost : undefined,
    trigger: r.trigger as SkillDefinition['trigger'],
    condition,
    conditionText: optStr(r.conditionText),
    effects,
    direction,
  });
}

// ---------------------------------------------------------------- Record

function parseUnlock(v: unknown, c: Collector): RecordUnlock | null {
  if (!isObj(v)) {
    c.error('unlock がありません');
    return null;
  }
  switch (v.type) {
    case 'owned':
      return { type: 'owned' };
    case 'level':
    case 'limitBreak':
      if (!isNum(v.value)) {
        c.error(`unlock.${v.type} には value が必要です`);
        return null;
      }
      return { type: v.type, value: v.value };
    case 'relatedOwned':
      if (!isStr(v.memoryId)) {
        c.error('unlock.relatedOwned には memoryId が必要です');
        return null;
      }
      return { type: 'relatedOwned', memoryId: v.memoryId };
    case 'flag':
      if (!isStr(v.flag) || !isStr(v.label)) {
        c.error('unlock.flag には flag と label が必要です');
        return null;
      }
      return { type: 'flag', flag: v.flag, label: v.label };
    default:
      c.error(`unlock.type が不正です: ${String(v.type)}`);
      return null;
  }
}

export function parseStory(raw: unknown, issues: DataIssue[]): MemoryStory | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`record:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.memoryId) || !Array.isArray(raw.fragments)) {
    c.error('id / memoryId / fragments が必要です');
    return finish(null);
  }
  const fragments: MemoryRecordFragment[] = [];
  for (const f of raw.fragments) {
    if (!isObj(f) || !isStr(f.id) || !isStr(f.title) || !isStr(f.text)) {
      c.error(`fragment が不正です: ${JSON.stringify(f)?.slice(0, 80)}`);
      continue;
    }
    const unlock = parseUnlock(f.unlock, c);
    if (!unlock) continue;
    const reveals = f.reveals === undefined ? undefined : strArray(f.reveals);
    if (reveals === null) c.error(`fragment ${f.id} の reveals が不正です`);
    fragments.push({ id: f.id, title: f.title, text: f.text, unlock, ...(reveals ? { reveals } : {}) });
  }
  return finish({ id: raw.id, memoryId: raw.memoryId, fragments });
}

// ---------------------------------------------------------------- World

export function parseWorld(raw: unknown, issues: DataIssue[]): WorldDefinition | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`world:${id}`);
  if (
    !isObj(raw) ||
    !isStr(raw.id) ||
    !isStr(raw.name) ||
    !isStr(raw.subtitle) ||
    !isStr(raw.description) ||
    !isOneOf(ATTRIBUTES, raw.attribute) ||
    !isObj(raw.unlock)
  ) {
    c.error('id / name / subtitle / description / attribute / unlock が必要です');
    issues.push(...c.issues);
    return null;
  }
  const u = raw.unlock;
  let unlock: WorldUnlock;
  if (u.type === 'initial') unlock = { type: 'initial' };
  else if (u.type === 'worldClear' && isStr(u.worldId)) unlock = { type: 'worldClear', worldId: u.worldId };
  else if (u.type === 'flag' && isStr(u.flag) && isStr(u.label)) unlock = { type: 'flag', flag: u.flag, label: u.label };
  else {
    c.error('unlock が不正です');
    issues.push(...c.issues);
    return null;
  }
  const restorations: RestorationTarget[] = [];
  const rr = Array.isArray(raw.restorations) ? raw.restorations : [];
  for (const t of rr) {
    if (!isObj(t) || !isStr(t.id) || !isStr(t.memoryId) || !isStr(t.name) || !isStr(t.description)) {
      c.error(`restorations の要素が不正です: ${JSON.stringify(t)?.slice(0, 80)}`);
      continue;
    }
    if (t.kind !== undefined && !isOneOf(RESTORATION_KINDS, t.kind)) {
      c.error(`restorations.kind が不正です: ${String(t.kind)}`);
      continue;
    }
    restorations.push({
      id: t.id,
      memoryId: t.memoryId,
      ...(t.kind ? { kind: t.kind as RestorationTarget['kind'] } : {}),
      name: t.name,
      description: t.description,
      ...(isStr(t.lostDescription) ? { lostDescription: t.lostDescription } : {}),
    });
  }
  issues.push(...c.issues);
  return {
    id: raw.id,
    name: raw.name,
    subtitle: raw.subtitle,
    description: raw.description,
    attribute: raw.attribute,
    unlock,
    restorations,
  };
}

// ---------------------------------------------------------------- Character

export function parseCharacter(raw: unknown, issues: DataIssue[]): CharacterDefinition | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`character:${id}`);
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || !isStr(raw.role) || !isStr(raw.color) || !isStr(raw.profile)) {
    c.error('id / name / role / color / profile が必要です');
    issues.push(...c.issues);
    return null;
  }
  const expressions = strArray(raw.expressions) ?? ['normal'];
  const abilities = Array.isArray(raw.abilities)
    ? raw.abilities.flatMap((a) => (isObj(a) && isStr(a.name) && isStr(a.description) ? [{ name: a.name, description: a.description }] : []))
    : undefined;
  const portraits: Record<string, string> = {};
  if (isObj(raw.portraits)) for (const [k, v] of Object.entries(raw.portraits)) if (isStr(v)) portraits[k] = v;
  issues.push(...c.issues);
  return {
    id: raw.id,
    name: raw.name,
    reading: optStr(raw.reading),
    role: raw.role,
    age: isNum(raw.age) ? raw.age : undefined,
    origin: optStr(raw.origin),
    color: raw.color,
    hair: optStr(raw.hair),
    eyes: optStr(raw.eyes),
    profile: raw.profile,
    ...(abilities ? { abilities } : {}),
    expressions: expressions.length ? expressions : ['normal'],
    ...(Object.keys(portraits).length ? { portraits } : {}),
  };
}

// ---------------------------------------------------------------- Story

const STORY_FX = ['fade-out', 'fade-in', 'shake', 'glitch', 'flash', 'noise'] as const;
const STAGE_POS = ['left', 'center', 'right'] as const;
const flagValue = (v: unknown): v is boolean | number | string => typeof v === 'boolean' || typeof v === 'string' || isNum(v);

function parseCommand(x: unknown, c: Collector, at: number): StoryCommand | null {
  const bad = (msg: string) => {
    c.error(`script[${at}] ${msg}: ${JSON.stringify(x)?.slice(0, 80)}`);
    return null;
  };
  if (!isObj(x) || !isStr(x.t)) return bad('命令が不正です');
  switch (x.t) {
    case 'bg':
      return isStr(x.id) ? { t: 'bg', id: x.id, ...(x.fx === 'fade' || x.fx === 'cut' ? { fx: x.fx } : {}) } : bad('bg.id が必要です');
    case 'bgm':
      return x.id === null || isStr(x.id) ? { t: 'bgm', id: (x.id as string | null) ?? null } : bad('bgm.id が必要です');
    case 'se':
      return isStr(x.id) ? { t: 'se', id: x.id } : bad('se.id が必要です');
    case 'show':
      if (!isStr(x.char)) return bad('show.char が必要です');
      if (x.pos !== undefined && !isOneOf(STAGE_POS, x.pos)) return bad('show.pos が不正です');
      return { t: 'show', char: x.char, ...(isOneOf(STAGE_POS, x.pos) ? { pos: x.pos } : {}), ...(isStr(x.expr) ? { expr: x.expr } : {}) };
    case 'hide':
      return isStr(x.char) ? { t: 'hide', char: x.char } : bad('hide.char が必要です');
    case 'say':
      return isStr(x.char) && isStr(x.text) ? { t: 'say', char: x.char, text: x.text, ...(isStr(x.expr) ? { expr: x.expr } : {}) } : bad('say には char と text が必要です');
    case 'narr':
      return isStr(x.text) ? { t: 'narr', text: x.text } : bad('narr.text が必要です');
    case 'title':
      return isStr(x.text) ? { t: 'title', text: x.text, ...(isStr(x.sub) ? { sub: x.sub } : {}) } : bad('title.text が必要です');
    case 'fx':
      return isOneOf(STORY_FX, x.type) ? { t: 'fx', type: x.type, ...(isNum(x.ms) ? { ms: x.ms } : {}) } : bad('fx.type が不正です');
    case 'choice': {
      if (!isStr(x.id) || !Array.isArray(x.options) || x.options.length === 0) return bad('choice には id と options が必要です');
      const options = x.options.flatMap((o) => {
        if (!isObj(o) || !isStr(o.value) || !isStr(o.text)) {
          bad('choice.options の要素が不正です');
          return [];
        }
        const set: Record<string, boolean | number | string> = {};
        if (isObj(o.set)) for (const [k, v] of Object.entries(o.set)) if (flagValue(v)) set[k] = v;
        return [{ value: o.value, text: o.text, ...(isStr(o.goto) ? { goto: o.goto } : {}), ...(Object.keys(set).length ? { set } : {}) }];
      });
      return { t: 'choice', id: x.id, options };
    }
    case 'label':
      return isStr(x.id) ? { t: 'label', id: x.id } : bad('label.id が必要です');
    case 'goto':
      return isStr(x.label) ? { t: 'goto', label: x.label } : bad('goto.label が必要です');
    case 'if': {
      if (!isStr(x.goto)) return bad('if.goto が必要です');
      const cond = parseConditions(Array.isArray(x.cond) ? x.cond : [x.cond], c, `script[${at}].cond`);
      return { t: 'if', cond, goto: x.goto, ...(isStr(x.else) ? { else: x.else } : {}) };
    }
    case 'set':
      return isStr(x.flag) && flagValue(x.value) ? { t: 'set', flag: x.flag, value: x.value } : bad('set には flag と value が必要です');
    case 'detect':
      return isStr(x.memoryId) ? { t: 'detect', memoryId: x.memoryId } : bad('detect.memoryId が必要です');
    case 'wait':
      return isNum(x.ms) ? { t: 'wait', ms: x.ms } : bad('wait.ms が必要です');
    case 'end':
      return { t: 'end' };
    default:
      return bad(`不明な命令 ${x.t}`);
  }
}

export function parseChapter(raw: unknown, issues: DataIssue[]): StoryChapter | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`story:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.title) || !isStr(raw.label) || !isNum(raw.order) || !Array.isArray(raw.script)) {
    c.error('id / label / title / order / script が必要です');
    return finish(null);
  }
  const script = raw.script.map((x, i) => parseCommand(x, c, i)).filter((x): x is StoryCommand => x !== null);
  const labels = new Set(script.flatMap((x) => (x.t === 'label' ? [x.id] : [])));
  for (const cmd of script) {
    const targets = cmd.t === 'goto' ? [cmd.label] : cmd.t === 'if' ? [cmd.goto, cmd.else] : cmd.t === 'choice' ? cmd.options.map((o) => o.goto) : [];
    for (const l of targets) if (l && !labels.has(l)) c.error(`ラベル ${l} が存在しません`);
  }
  if (!script.some((x) => x.t === 'end')) c.error('script に end がありません');
  let rewards: StoryChapter['rewards'];
  if (isObj(raw.rewards)) {
    const currencies: Partial<Record<(typeof CURRENCIES)[number], number>> = {};
    if (isObj(raw.rewards.currencies)) for (const [k, v] of Object.entries(raw.rewards.currencies)) if (isOneOf(CURRENCIES, k) && isNum(v) && v > 0) currencies[k] = v;
    const items: Record<string, number> = {};
    if (isObj(raw.rewards.items)) for (const [k, v] of Object.entries(raw.rewards.items)) if (isNum(v) && v > 0) items[k] = v;
    rewards = { currencies, items };
  }
  if (c.issues.some((i) => i.level === 'error')) return finish(null);
  return finish({
    id: raw.id,
    order: raw.order,
    label: raw.label,
    title: raw.title,
    summary: isStr(raw.summary) ? raw.summary : '',
    unlock: parseConditions(raw.unlock, c, 'unlock'),
    ...(rewards ? { rewards } : {}),
    script,
  });
}

// ---------------------------------------------------------------- Archive

export function parseArchiveEntry(raw: unknown, issues: DataIssue[]): ArchiveEntry | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`archive:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.title) || !isOneOf(ARCHIVE_CATEGORIES, raw.category) || raw.category === 'memory' || !Array.isArray(raw.sections)) {
    c.error('id / category（memory 以外）/ title / sections が必要です');
    return finish(null);
  }
  const sections: ArchiveSection[] = [];
  for (const sec of raw.sections) {
    if (!isObj(sec) || !isStr(sec.id) || !isStr(sec.title) || !isStr(sec.text)) {
      c.error(`sections の要素が不正です: ${JSON.stringify(sec)?.slice(0, 60)}`);
      continue;
    }
    sections.push({ id: sec.id, title: sec.title, text: sec.text, ...(sec.unlock !== undefined ? { unlock: parseConditions(sec.unlock, c, `sections.${sec.id}.unlock`) } : {}) });
  }
  const rel = isObj(raw.related) ? raw.related : undefined;
  if (c.issues.some((i) => i.level === 'error')) return finish(null);
  return finish({
    id: raw.id,
    category: raw.category as ArchiveEntry['category'],
    title: raw.title,
    subtitle: optStr(raw.subtitle),
    unlock: parseConditions(raw.unlock, c, 'unlock'),
    sections,
    ...(rel
      ? {
          related: {
            ...(strArray(rel.memoryIds) ? { memoryIds: strArray(rel.memoryIds)! } : {}),
            ...(isStr(rel.characterId) ? { characterId: rel.characterId } : {}),
            ...(isStr(rel.worldId) ? { worldId: rel.worldId } : {}),
          },
        }
      : {}),
  });
}

// ---------------------------------------------------------------- Item

export function parseItem(raw: unknown, issues: DataIssue[]): ItemDefinition | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`item:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || !isStr(raw.description)) {
    c.error('id / name / description が必要です');
    return finish(null);
  }
  if (raw.kind !== 'consumable' && raw.kind !== 'material' && raw.kind !== 'key') c.error('kind が不正です');
  if (raw.target !== undefined && !isOneOf(SKILL_TARGETS, raw.target)) c.error('target が不正です');
  const effects = Array.isArray(raw.effects) ? raw.effects.map((e) => parseEffect(e, c)).filter((e): e is SkillEffect => e !== null) : [];
  if (raw.battle === true && effects.length === 0) c.error('戦闘用アイテムには effects が必要です');
  if (c.issues.some((i) => i.level === 'error')) return finish(null);
  return finish({
    id: raw.id,
    name: raw.name,
    description: raw.description,
    kind: raw.kind as ItemDefinition['kind'],
    battle: raw.battle === true,
    target: raw.target as ItemDefinition['target'],
    effects,
    maxStack: isNum(raw.maxStack) && raw.maxStack > 0 ? Math.floor(raw.maxStack) : 99,
  });
}

// ---------------------------------------------------------------- Enemy

export function parseEnemy(raw: unknown, issues: DataIssue[]): EnemyDefinition | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`enemy:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || !isStr(raw.description)) {
    c.error('id / name / description が必要です');
    return finish(null);
  }
  const r = raw;
  if (!isOneOf(ATTRIBUTES, r.attribute)) c.error('attribute が不正です');
  if (!isNum(r.level) || r.level < 1) c.error('level が不正です');
  for (const k of STAT_KEYS) if (!isNum(r[k]) || (r[k] as number) < 0) c.error(`${k} は0以上の数値である必要があります`);
  if (!isNum(r.hp) || r.hp < 1) c.error('hp は1以上である必要があります');
  const attack = parseAttackStyle(r.attack, c);
  const skills = strArray(r.skills ?? []);
  const passiveSkills = strArray(r.passiveSkills ?? []);
  if (!skills || !passiveSkills) c.error('skills / passiveSkills は文字列配列である必要があります');
  const ai: EnemyAiRule[] = [];
  if (!Array.isArray(r.ai) || r.ai.length === 0) c.error('ai は1つ以上必要です');
  else {
    for (const a of r.ai) {
      if (!isObj(a) || !isStr(a.action) || !isNum(a.weight) || a.weight <= 0) {
        c.error(`ai の要素が不正です: ${JSON.stringify(a)}`);
        continue;
      }
      let when: EnemyAiRule['when'];
      if (a.when !== undefined) {
        const w = a.when;
        if (isObj(w) && (w.type === 'hp_below' || w.type === 'hp_above' || w.type === 'turn_at_least') && isNum(w.value)) when = { type: w.type, value: w.value };
        else c.error(`ai.when が不正です: ${JSON.stringify(w)}`);
      }
      if (a.action !== 'attack' && skills && !skills.includes(a.action)) c.error(`ai の ${a.action} は skills に含まれていません`);
      ai.push({ action: a.action, weight: a.weight, ...(when ? { when } : {}) });
    }
  }
  if (c.issues.some((i) => i.level === 'error')) return finish(null);
  return finish({
    id: r.id as string,
    name: r.name as string,
    nameEn: optStr(r.nameEn),
    description: r.description as string,
    attribute: r.attribute as EnemyDefinition['attribute'],
    level: r.level as number,
    illustration: optStr(r.illustration),
    boss: r.boss === true,
    hp: r.hp as number,
    atk: r.atk as number,
    def: r.def as number,
    spd: r.spd as number,
    tec: r.tec as number,
    res: r.res as number,
    attack: attack!,
    skills: skills!,
    passiveSkills: passiveSkills!,
    ai,
  });
}

// ---------------------------------------------------------------- Encounter

function parseCurrencies(v: unknown, c: Collector, field: string): Partial<Record<(typeof CURRENCIES)[number], number>> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) {
    c.error(`${field} が不正です`);
    return undefined;
  }
  const out: Partial<Record<(typeof CURRENCIES)[number], number>> = {};
  for (const [k, n] of Object.entries(v)) {
    if (!isOneOf(CURRENCIES, k) || !isNum(n) || n <= 0 || !Number.isInteger(n)) c.error(`${field}.${k} が不正です`);
    else out[k] = n;
  }
  return out;
}

function parseItemMap(v: unknown, c: Collector, field: string): Record<string, number> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) {
    c.error(`${field} が不正です`);
    return undefined;
  }
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (!isNum(n) || n <= 0 || !Number.isInteger(n)) c.error(`${field}.${k} が不正です`);
    else out[k] = n;
  }
  return out;
}

export function parseEncounter(raw: unknown, issues: DataIssue[]): EncounterDefinition | null {
  const id = isObj(raw) && isStr(raw.id) ? raw.id : '(id不明)';
  const c = new Collector(`encounter:${id}`);
  const finish = <T>(v: T) => {
    issues.push(...c.issues);
    return v;
  };
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || !isStr(raw.worldId) || !isStr(raw.description)) {
    c.error('id / name / worldId / description が必要です');
    return finish(null);
  }
  const r = raw;
  const enemies = strArray(r.enemies);
  if (!enemies || enemies.length === 0) c.error('enemies は1体以上必要です');
  if (!isNum(r.recommendedLevel) || r.recommendedLevel < 1) c.error('recommendedLevel が不正です');
  let unlock: EncounterDefinition['unlock'] = { type: 'initial' };
  if (isObj(r.unlock) && r.unlock.type === 'encounterClear' && isStr(r.unlock.encounterId)) unlock = { type: 'encounterClear', encounterId: r.unlock.encounterId };
  else if (!isObj(r.unlock) || r.unlock.type !== 'initial') c.error('unlock が不正です');
  let rewards: EncounterReward = { exp: 0, memoryExp: 0 };
  if (!isObj(r.rewards) || !isNum(r.rewards.exp) || !isNum(r.rewards.memoryExp)) c.error('rewards.exp / rewards.memoryExp が必要です');
  else {
    rewards = {
      exp: r.rewards.exp,
      memoryExp: r.rewards.memoryExp,
      currencies: parseCurrencies(r.rewards.currencies, c, 'rewards.currencies'),
      items: parseItemMap(r.rewards.items, c, 'rewards.items'),
    };
  }
  let firstClear: EncounterDefinition['firstClear'];
  if (r.firstClear !== undefined) {
    if (!isObj(r.firstClear)) c.error('firstClear が不正です');
    else {
      const mems = r.firstClear.memories === undefined ? undefined : strArray(r.firstClear.memories);
      if (mems === null) c.error('firstClear.memories が不正です');
      firstClear = {
        ...(mems ? { memories: mems } : {}),
        currencies: parseCurrencies(r.firstClear.currencies, c, 'firstClear.currencies'),
        items: parseItemMap(r.firstClear.items, c, 'firstClear.items'),
      };
    }
  }
  if (c.issues.some((i) => i.level === 'error')) return finish(null);
  return finish({
    id: r.id as string,
    worldId: r.worldId as string,
    name: r.name as string,
    description: r.description as string,
    recommendedLevel: r.recommendedLevel as number,
    boss: r.boss === true,
    enemies: enemies!,
    unlock,
    rewards,
    firstClear,
  });
}
