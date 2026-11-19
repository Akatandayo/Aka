import { describe, expect, it } from 'vitest';
import { buildGameData, gameData } from '../core/data/gameData';
import { MEMORY_CATEGORIES, RARITIES } from '../types/memory';

/**
 * 同梱マスターデータの検証。
 * `npm run validate:data` で実行できる。データを追加したら必ず通すこと。
 */
describe('bundled master data', () => {
  it('has no validation or reference issues', () => {
    expect(gameData.issues).toEqual([]);
  });

  it('contains at least 10 memories with skills and records', () => {
    expect(gameData.memories.length).toBeGreaterThanOrEqual(10);
    for (const m of gameData.memories) {
      expect(m.skills.length, m.id).toBeGreaterThan(0);
      expect(m.passiveSkills.length, m.id).toBeGreaterThan(0);
      expect(m.storyId, m.id).not.toBeNull();
    }
  });

  it('covers every category and rarity', () => {
    const cats = new Set(gameData.memories.map((m) => m.category));
    const rars = new Set(gameData.memories.map((m) => m.rarity));
    for (const c of MEMORY_CATEGORIES) expect(cats.has(c), c).toBe(true);
    for (const r of RARITIES) expect(rars.has(r), r).toBe(true);
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
    expect(m.passiveSkills).toEqual([]);
    expect(m.name).toBe('テスト');
    expect(d.issues.length).toBeGreaterThanOrEqual(3);
  });
});
