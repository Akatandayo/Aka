import {
  ACQUISITION_TYPES,
  ATTRIBUTES,
  MEMORY_CATEGORIES,
  RARITIES,
  STAT_KEYS,
  type AcquisitionMethod,
  type MemoryDefinition,
} from '../../types/memory';
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
import type { WorldDefinition, WorldUnlock } from '../../types/world';

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

class Collector {
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
  for (const k of STAT_KEYS) {
    if (!isNum(r[k]) || (r[k] as number) < 0) c.error(`${k} は0以上の数値である必要があります`);
  }
  const skills = strArray(r.skills);
  const passiveSkills = strArray(r.passiveSkills);
  const related = strArray(r.relatedMemories ?? []);
  if (!skills) c.error('skills は文字列配列である必要があります');
  if (!passiveSkills) c.error('passiveSkills は文字列配列である必要があります');
  if (!related) c.error('relatedMemories は文字列配列である必要があります');
  if (r.storyId !== null && r.storyId !== undefined && !isStr(r.storyId)) c.error('storyId が不正です');
  const acquisitionMethod = parseAcquisition(r.acquisitionMethod, c);

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
    hp: r.hp as number,
    atk: r.atk as number,
    def: r.def as number,
    spd: r.spd as number,
    tec: r.tec as number,
    res: r.res as number,
    skills: skills!,
    passiveSkills: passiveSkills!,
    rewrite: optStr(r.rewrite),
    acquisitionMethod,
    relatedMemories: related!,
    storyId: isStr(r.storyId) ? r.storyId : null,
    worldId: isStr(r.worldId) ? r.worldId : null,
    tags: strArray(r.tags) ?? [],
  };
  return finish(def);
}

// ---------------------------------------------------------------- Skill

function parseEffect(v: unknown, c: Collector): SkillEffect | null {
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
  if (e.type === 'special') {
    if (!isStr(v.id)) c.error('special 効果には id が必要です');
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
  let condition: SkillDefinition['condition'];
  if (r.kind === 'rewrite') {
    if (!isObj(r.condition) || !isOneOf(REWRITE_CONDITIONS, r.condition.type)) {
      c.error('rewrite スキルには有効な condition が必要です');
    } else {
      condition = {
        type: r.condition.type,
        ...(isNum(r.condition.value) ? { value: r.condition.value } : {}),
      };
    }
    if (!isStr(r.conditionText)) c.error('rewrite スキルには conditionText が必要です');
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
  return {
    id: raw.id,
    name: raw.name,
    subtitle: raw.subtitle,
    description: raw.description,
    attribute: raw.attribute,
    unlock,
  };
}
