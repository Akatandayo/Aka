import { describe, expect, it } from 'vitest';
import { buildGameData, gameData, loadBundledSources } from '../core/data/gameData';
import { MEMORY_CATEGORIES, RARITIES } from '../types/memory';

/**
 * 同梱マスターデータの検証。
 * `npm run validate:data` で実行できる。データを追加したら必ず通すこと。
 */
describe('bundled master data', () => {
  it('has no validation or reference issues', () => {
    expect(gameData.issues).toEqual([]);
  });

  it('contains at least 10 memories, every one with a record', () => {
    expect(gameData.memories.length).toBeGreaterThanOrEqual(10);
    for (const m of gameData.memories) expect(m.storyRecords.length, m.id).toBeGreaterThan(0);
  });

  it('allows non-combat memories but keeps enough combat ones (GDD §5)', () => {
    const combat = gameData.memories.filter((m) => m.skills.length > 0);
    const nonCombat = gameData.memories.filter((m) => m.skills.length === 0 && m.passive.length === 0);
    expect(combat.length).toBeGreaterThanOrEqual(10);
    expect(nonCombat.length).toBeGreaterThanOrEqual(1);
    for (const m of nonCombat) expect(m.fieldAbilities?.length ?? 0, m.id).toBeGreaterThan(0);
  });

  it('active skills define SP cost', () => {
    for (const m of gameData.memories) {
      for (const id of m.skills) expect(gameData.skillById.get(id)?.cost, id).toBeGreaterThanOrEqual(0);
    }
  });

  it('has a linear chain of encounters whose drops exist', () => {
    expect(gameData.encounters.length).toBeGreaterThanOrEqual(8);
    const ids = new Set<string>();
    for (const e of gameData.encounters) {
      if (e.unlock.type === 'encounterClear') expect(ids.has(e.unlock.encounterId), e.id).toBe(true);
      ids.add(e.id);
      expect(e.enemies.length).toBeGreaterThan(0);
      expect(e.enemies.length).toBeLessThanOrEqual(3);
    }
    const drops = gameData.encounters.flatMap((e) => e.firstClear?.memories ?? []);
    expect(drops.length).toBeGreaterThanOrEqual(4);
  });

  it('covers every category and rarity', () => {
    const cats = new Set(gameData.memories.map((m) => m.category));
    const rars = new Set(gameData.memories.map((m) => m.rarity));
    for (const c of MEMORY_CATEGORIES) expect(cats.has(c), c).toBe(true);
    for (const r of RARITIES) expect(rars.has(r), r).toBe(true);
  });

  it('defines Ver.3 sync data for every combat memory', () => {
    for (const m of gameData.memories.filter((x) => x.skills.length > 0)) {
      expect(m.syncEffects.style.name, m.id).toBeTruthy();
      expect(m.syncEffects.supportSkill, m.id).toBeDefined();
      expect(m.skills, m.id).toContain(m.syncEffects.supportSkill);
      expect(Object.keys(m.syncEffects.passiveBonus ?? {}).length, m.id).toBeGreaterThan(0);
      expect(m.syncEffects.direction?.lines?.length ?? 0, m.id).toBeGreaterThan(0);
    }
  });

  it('every world has restoration targets and story/archive data loads', () => {
    for (const w of gameData.worlds) expect(w.restorations.length, w.id).toBeGreaterThan(0);
    expect(gameData.characters.map((c) => c.id).sort()).toEqual(['CHR-HARUKA', 'CHR-HITORI', 'CHR-MOMIJI']);
    expect(gameData.chapters.map((c) => c.id)).toEqual(['CH-000', 'CH-001', 'INT-001', 'CH-002']);
    const cats = new Set(gameData.archive.map((a) => a.category));
    for (const c of ['character', 'event', 'term', 'fragment']) expect(cats.has(c as never), c).toBe(true);
  });

  it('accepts the Ver.1/Ver.2 memory format (flat stats, passiveSkills, rewrite, storyId, syncCondition)', () => {
    const legacy = {
      id: 'MEM-L1', name: 'legacy', category: 'HUMAN', rarity: 'RARE', attribute: 'ORDER', description: 'd', illustration: 'gen:human',
      hp: 10, atk: 2, def: 3, spd: 4, tec: 5, res: 6, skills: ['SK-0013'], passiveSkills: ['PS-0007'], rewrite: 'RW-0001',
      attackStyle: { name: 'x', scale: 'tec', power: 1, hits: 1 }, syncCondition: [{ type: 'playerLevel', value: 3 }],
      acquisitionMethod: [], relatedMemories: [], storyId: null,
    };
    const raw = { ...loadBundledSources() };
    const d = buildGameData({ ...raw, memories: [...raw.memories, legacy] });
    const m = d.memoryById.get('MEM-L1')!;
    expect(m.baseStats).toEqual({ hp: 10, atk: 2, def: 3, spd: 4, tec: 5, res: 6 });
    expect(m.passive).toEqual(['PS-0007']);
    expect(m.syncEffects.rewrite).toBe('RW-0001');
    expect(m.syncEffects.style.name).toBe('x');
    expect(m.unlockConditions).toEqual([{ type: 'playerLevel', value: 3 }]);
  });

  it('has the five initial worlds', () => {
    expect(gameData.worlds.map((w) => w.id)).toEqual(['WORLD-001', 'WORLD-002', 'WORLD-003', 'WORLD-004', 'WORLD-005']);
  });
});

describe('buildGameData validation', () => {
  const skill = { id: 'SK-T1', name: 't', kind: 'active', description: 'd', effects: [{ type: 'damage', scale: 'atk', power: 1 }] };
  const passive = { id: 'PS-T1', name: 'p', kind: 'passive', trigger: 'always', description: 'd', effects: [{ type: 'special', id: 'x' }] };
  const memory = {
    id: 'MEM-T1',
    name: 'テスト',
    category: 'HUMAN',
    rarity: 'COMMON',
    attribute: 'DATA',
    description: 'd',
    illustration: 'gen:human',
    hp: 1, atk: 1, def: 1, spd: 1, tec: 1, res: 1,
    skills: ['SK-T1'],
    passiveSkills: ['PS-T1'],
    acquisitionMethod: [{ type: 'starter', label: 'x' }],
    relatedMemories: [],
    storyId: null,
  };

  it('accepts a minimal valid memory', () => {
    const d = buildGameData({ memories: [memory], skills: [skill, passive], records: [], worlds: [] });
    expect(d.issues).toEqual([]);
    expect(d.memoryById.get('MEM-T1')?.name).toBe('テスト');
  });

  it('drops invalid memories and reports issues without throwing', () => {
    const bad = { ...memory, id: 'MEM-T2', rarity: 'SUPER', hp: -5 };
    const d = buildGameData({ memories: [memory, bad], skills: [skill, passive], records: [], worlds: [] });
    expect(d.memoryById.has('MEM-T2')).toBe(false);
    expect(d.issues.some((i) => i.source === 'memory:MEM-T2')).toBe(true);
  });

  it('removes broken skill references and duplicate ids', () => {
    const broken = { ...memory, skills: ['SK-T1', 'SK-NONE'], passiveSkills: ['SK-T1'] };
    const d = buildGameData({ memories: [broken, { ...memory, name: 'dup' }], skills: [skill, passive], records: [], worlds: [] });
    const m = d.memoryById.get('MEM-T1')!;
    expect(m.skills).toEqual(['SK-T1']);
    expect(m.passive).toEqual([]);
    expect(m.name).toBe('テスト');
    expect(d.issues.length).toBeGreaterThanOrEqual(3);
  });
});
