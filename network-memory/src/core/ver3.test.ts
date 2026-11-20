import { describe, expect, it } from 'vitest';
import { buildArchive } from './archive/archive';
import { evaluateCondition } from './conditions';
import { gameData } from './data/gameData';
import { PVP_MODES, PVP_RULES, createPvpEntry } from './online/pvp';
import { analyzeLoadout } from './player/character';
import { equipMemory, getActiveLoadout } from './player/loadout';
import { createNewSave } from './player/newGame';
import { detectMemory, syncMemory } from './player/sync';
import { advance, resumeChapter, startChapter, type StoryRun } from './story/engine';
import { chapterChoices, chapterStatus, completeChapter, nextChapter, saveStoryProgress } from './story/progress';
import { computeWorldState, overallRestoration, restorationChangesFor } from './world/restoration';
import type { PlayerSave } from '../types/player';

const AT = '2026-11-20T00:00:00.000Z';
const fresh = () => createNewSave('探索者', gameData, AT);
const inst = (s: PlayerSave, memoryId: string) => s.memories.find((m) => m.memoryId === memoryId)!.instanceId;

describe('MEMORY SYNC (Ver.3 full-sync model)', () => {
  it('main Memory decides the battle base stats; player level is a separate multiplier', () => {
    let s = fresh();
    const r = equipMemory(s, gameData, s.activeLoadoutId, 'main', 0, inst(s, 'MEM-0007'));
    if (!r.ok) throw new Error(r.error);
    s = r.save;
    const libra = gameData.memoryById.get('MEM-0007')!;
    const a = analyzeLoadout(s, gameData, getActiveLoadout(s));
    expect(a.base).toEqual(libra.baseStats);
    expect(a.attribute).toBe('ORDER');
    expect(a.appearance?.label).toBe(libra.syncEffects.appearance?.label);
    const leveled = analyzeLoadout({ ...s, profile: { ...s.profile, level: 11 } }, gameData, getActiveLoadout(s));
    expect(leveled.total.tec).toBeGreaterThan(a.total.tec);
    expect(leveled.base).toEqual(a.base);
  });

  it('sub Memories lend only their support skill; passives add their passive and a % bonus', () => {
    const s = fresh();
    const a = analyzeLoadout(s, gameData, getActiveLoadout(s));
    const main = a.main!.def;
    for (const c of a.contributions.filter((x) => x.slot === 'sub')) {
      const granted = a.skills.filter((k) => k.memoryId === c.def.id).map((k) => k.skillId);
      expect(granted).toEqual([c.def.syncEffects.supportSkill]);
    }
    expect(a.skills.filter((k) => k.memoryId === main.id).map((k) => k.skillId)).toEqual(main.skills);
    for (const c of a.contributions.filter((x) => x.slot === 'passive')) {
      expect(a.passives.some((p) => p.memoryId === c.def.id)).toBe(true);
    }
    expect(Object.keys(a.rates.passive).length).toBeGreaterThan(0);
  });

  it('sub slot rejects memories without a support skill', () => {
    const s = fresh();
    expect(equipMemory(s, gameData, 'LOADOUT-2', 'sub', 0, inst(s, 'MEM-0006')).ok).toBe(false);
  });
});

describe('WORLD RESTORATION', () => {
  it('derives state from recovered Memories and maps categories to restoration kinds', () => {
    const s = fresh();
    const w = gameData.worldById.get('WORLD-001')!;
    const st = computeWorldState(s, gameData, w, AT);
    expect(st.requiredMemories).toContain('MEM-0013');
    expect(st.recoveredMemories).not.toContain('MEM-0013');
    expect(st.restoredNPCs).toContain('R001-LUX'); // HUMAN → NPC 復帰
    expect(st.unlockedAreas).toContain('R001-CROSS'); // LOCATION → エリア
    expect(st.unlockedEvents).toContain('R001-GATE'); // EVENT → 出来事
    expect(st.restorationRate).toBeCloseTo(4 / 6);
    expect(s.worlds['WORLD-001'].restorationRate).toBeCloseTo(4 / 6);
  });

  it('syncing a Memory updates the matching world and reports what was restored', () => {
    let s = detectMemory(fresh(), 'MEM-0013');
    const changes = restorationChangesFor(s, gameData, 'MEM-0013');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ worldId: 'WORLD-001' });
    expect(changes[0].restored[0].kind).toBe('object');
    const before = overallRestoration(s, gameData);
    const r = syncMemory(s, gameData, 'MEM-0013', AT);
    if (!r.ok) throw new Error(r.error);
    s = r.save;
    expect(s.worlds['WORLD-001'].recoveredMemories).toContain('MEM-0013');
    expect(s.worlds['WORLD-001'].restorationRate).toBeCloseTo(5 / 6);
    expect(overallRestoration(s, gameData)).toBeGreaterThan(before);
    expect(evaluateCondition({ type: 'worldRestoration', worldId: 'WORLD-001', value: 0.8 }, { save: s, data: gameData })).toBe(true);
  });
});

describe('STORY ENGINE', () => {
  const ch = gameData.chapterById.get('CH-000')!;
  const play = (s: PlayerSave, pick: (id: string) => string): StoryRun => {
    let run = startChapter(ch, { save: s, data: gameData });
    for (let i = 0; i < 500 && !run.ended; i++) run = run.view.choice ? advance(ch, run, { save: s, data: gameData }, pick(run.view.choice.id)) : advance(ch, run, { save: s, data: gameData });
    return run;
  };

  it('plays the prologue to the end, sets flags and records choices', () => {
    const run = play(fresh(), (id) => (id === 'first-question' ? 'who' : 'help'));
    expect(run.ended).toBe(true);
    expect(run.flags['story.prologue.clear']).toBe(true);
    expect(run.choices).toEqual({ 'first-question': 'who', join: 'help' });
  });

  it('branches on Memory ownership (special conversation)', () => {
    const seen = (s: PlayerSave) => {
      const texts: string[] = [];
      let run = startChapter(ch, { save: s, data: gameData });
      for (let i = 0; i < 500 && !run.ended; i++) {
        if (run.view.line?.kind === 'say') texts.push(run.view.line.text);
        run = run.view.choice ? advance(ch, run, { save: s, data: gameData }, run.view.choice.options[0].value) : advance(ch, run, { save: s, data: gameData });
      }
      return texts.join('\n');
    };
    const without = seen(fresh());
    let s = detectMemory(fresh(), 'MEM-0013');
    const r = syncMemory(s, gameData, 'MEM-0013', AT);
    if (!r.ok) throw new Error(r.error);
    s = r.save;
    expect(without).not.toMatch(/巡回ドローンの記録/);
    expect(seen(s)).toMatch(/巡回ドローンの記録/);
  });

  it('resumes mid-chapter with the same view', () => {
    const s = fresh();
    let run = startChapter(ch, { save: s, data: gameData });
    for (let i = 0; i < 12; i++) run = run.view.choice ? advance(ch, run, { save: s, data: gameData }, 'where') : advance(ch, run, { save: s, data: gameData });
    const saved = saveStoryProgress(s, ch.id, run.pc, run.flags, run.choices);
    const resumed = resumeChapter(ch, { save: saved, data: gameData }, saved.story.current!.index, chapterChoices(saved, ch.id));
    expect(resumed.pc).toBe(run.pc);
    expect(resumed.view.bg).toBe(run.view.bg);
    expect(resumed.view.stage).toEqual(run.view.stage);
    expect(resumed.view.line).toEqual(run.view.line);
  });

  it('chapter completion unlocks the next chapter and detects Memories', () => {
    let s = fresh();
    expect(chapterStatus(s, gameData, ch)).toBe('available');
    expect(chapterStatus(s, gameData, gameData.chapterById.get('CH-001')!)).toBe('locked');
    s = completeChapter(s, gameData, 'CH-000', { 'story.prologue.clear': true }, [], AT).save;
    expect(s.story.completedChapters).toEqual(['CH-000']);
    expect(s.wallet.DATA).toBe(1300);
    s = { ...s, battle: { ...s.battle, encounters: { 'ENC-001': { clears: 1, bestRounds: 3, firstClearedAt: AT }, 'ENC-002': { clears: 1, bestRounds: 5, firstClearedAt: AT } } } };
    expect(nextChapter(s, gameData)?.id).toBe('CH-001');
    const r = completeChapter(s, gameData, 'CH-001', { 'story.chapter1.clear': true }, ['MEM-0011'], AT);
    expect(r.detected).toEqual(['MEM-0011']);
    expect(r.save.archive.pendingSyncIds).toContain('MEM-0011');
    // 2 回目のクリアでは報酬は増えない
    const again = completeChapter(r.save, gameData, 'CH-001', {}, [], AT);
    expect(again.firstClear).toBe(false);
    expect(again.save.wallet).toEqual(r.save.wallet);
  });
});

describe('INTERLUDE「目印」', () => {
  const inter = gameData.chapterById.get('INT-001')!;
  const playWith = (s: PlayerSave, picks: Record<string, string>) => {
    let run = startChapter(inter, { save: s, data: gameData });
    const speakers = new Set<string>();
    for (let i = 0; i < 500 && !run.ended; i++) {
      if (run.view.line?.kind === 'say') speakers.add(run.view.line.char);
      run = run.view.choice ? advance(inter, run, { save: s, data: gameData }, picks[run.view.choice.id]) : advance(inter, run, { save: s, data: gameData });
    }
    return { run, speakers };
  };

  it('unlocks after CHAPTER 1 and warns about its content', () => {
    let s = fresh();
    expect(chapterStatus(s, gameData, inter)).toBe('locked');
    s = { ...s, story: { ...s.story, completedChapters: ['CH-000', 'CH-001'] } };
    expect(chapterStatus(s, gameData, inter)).toBe('available');
    expect(inter.contentNote).toBeTruthy();
  });

  it('every combination of choices reaches the end with all three members speaking', () => {
    for (const wait of ['stay', 'search'])
      for (const answer of ['thanks', 'now'])
        for (const promise of ['me', 'them']) {
          const { run, speakers } = playWith(fresh(), { wait, answer, promise });
          expect(run.ended, `${wait}/${answer}/${promise}`).toBe(true);
          expect(run.flags['story.interlude.mark.clear']).toBe(true);
          expect([...speakers].sort()).toEqual(['CHR-HARUKA', 'CHR-HITORI', 'CHR-MOMIJI']);
        }
  });

  it("clearing it reveals the trio's past in the ARCHIVE", () => {
    let s = { ...fresh(), story: { ...fresh().story, completedChapters: ['CH-000', 'CH-001'] } };
    const past = (save: PlayerSave) => buildArchive(save, gameData).find((i) => i.id === 'CHR-REC-HITORI')!.sections.filter((x) => x.id === '4' || x.id === '5');
    expect(past(s).every((x) => !x.unlocked)).toBe(true);
    s = completeChapter(s, gameData, 'INT-001', { 'story.interlude.mark.clear': true }, [], AT).save;
    expect(past(s).every((x) => x.unlocked && x.contentNote)).toBe(true);
    const momiji = buildArchive(s, gameData).find((i) => i.id === 'CHR-REC-MOMIJI')!;
    expect(momiji.sections.find((x) => x.id === '4')?.unlocked).toBe(true);
    expect(gameData.characterById.get('CHR-MOMIJI')?.formerName).toBe('孤月 紅葉');
  });
});

describe('MEMORY ARCHIVE', () => {
  it('hides undiscovered records and reveals them with progress', () => {
    let s = fresh();
    let items = buildArchive(s, gameData);
    const cats = new Set(items.map((i) => i.category));
    expect([...cats].sort()).toEqual(['character', 'event', 'fragment', 'memory', 'term', 'world']);
    const haruka = items.find((i) => i.id === 'CHR-REC-HARUKA')!;
    expect(haruka.unlocked).toBe(false);
    expect(haruka.hint).toMatch(/PROLOGUE|アカルア/);
    s = completeChapter(s, gameData, 'CH-000', {}, [], AT).save;
    items = buildArchive(s, gameData);
    const h2 = items.find((i) => i.id === 'CHR-REC-HARUKA')!;
    expect(h2.unlocked).toBe(true);
    expect(h2.isNew).toBe(true);
    expect(h2.sections.find((x) => x.id === '3')!.unlocked).toBe(false);
    expect(items.find((i) => i.id === 'MEMREC-MEM-0012')!.unlocked).toBe(false);
    expect(items.find((i) => i.id === 'WREC-WORLD-001')!.unlocked).toBe(true);
  });
});

describe('ONLINE (PvP) rules', () => {
  it('snapshots a valid loadout: one main, subs as support only', () => {
    const s = fresh();
    const r = createPvpEntry(s, gameData, getActiveLoadout(s));
    if (!r.ok) throw new Error(r.issues.join(' / '));
    expect(PVP_RULES.playersPerSide).toBe(1);
    expect(r.snapshot.main.memoryId).toBe(analyzeLoadout(s, gameData, getActiveLoadout(s)).main!.def.id);
    for (const sub of r.snapshot.subs) expect(sub.supportSkill).toBe(gameData.memoryById.get(sub.memoryId)!.syncEffects.supportSkill);
  });

  it('rejects a loadout without a main Memory', () => {
    const s = fresh();
    const lo = getActiveLoadout(s);
    const r = createPvpEntry(s, gameData, { ...lo, slots: { ...lo.slots, main: [null] } });
    expect(r.ok).toBe(false);
  });

  it('the snapshot is unaffected by Memory changes after the battle starts', () => {
    let s = fresh();
    const r = createPvpEntry(s, gameData, getActiveLoadout(s));
    if (!r.ok) throw new Error('entry failed');
    const before = structuredClone(r.snapshot);
    const other = s.memories.find((m) => m.memoryId !== r.snapshot.main.memoryId && gameData.memoryById.get(m.memoryId)!.skills.length > 0)!;
    const e = equipMemory(s, gameData, s.activeLoadoutId, 'main', 0, other.instanceId);
    if (!e.ok) throw new Error(e.error);
    s = e.save;
    expect(r.snapshot).toEqual(before);
    expect(PVP_MODES).toEqual(['ARENA', 'RANKED', 'FRIEND', 'GHOST', 'RAID']);
  });
});
