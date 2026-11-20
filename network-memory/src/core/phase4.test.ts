import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './conditions';
import { gameData } from './data/gameData';
import { createNewSave } from './player/newGame';
import { detectMemory, syncMemory } from './player/sync';
import { advance, startChapter } from './story/engine';
import { areaState, canExplore, completeEvent, explorationProgress, pointState, searchPoint, visitArea } from './world/exploration';
import { acceptQuest, claimQuest, questStatus } from './world/quests';
import type { PlayerSave } from '../types/player';
import type { StoryChapter } from '../types/story';

const AT = '2026-11-21T00:00:00.000Z';
const fresh = () => createNewSave('探索者', gameData, AT);
const area = (id: string) => gameData.areaById.get(id)!;
const point = (id: string) => gameData.areas.flatMap((a) => a.points).find((p) => p.id === id)!;
const withFlags = (s: PlayerSave, flags: Record<string, boolean>) => ({ ...s, progress: { flags: { ...s.progress.flags, ...flags } } });
const sync = (s: PlayerSave, memoryId: string) => {
  const r = syncMemory(detectMemory(s, memoryId), gameData, memoryId, AT);
  if (!r.ok) throw new Error(r.error);
  return r.save;
};

describe('WORLD exploration (PHASE 4)', () => {
  it('opens areas by conditions; a hidden alley is revealed by the patrol-route ability', () => {
    let s = fresh();
    expect(canExplore(s, gameData, 'WORLD-001')).toBe(true);
    expect(areaState(s, gameData, area('A001-AKARUA'))).toBe('open');
    // 雨の交差点は「雨の止まない交差点」（初期 Memory）の修復で開いている
    expect(areaState(s, gameData, area('A001-CROSS'))).toBe('open');
    expect(areaState(s, gameData, area('A001-RAINALLEY'))).toBe('hidden');
    s = sync(s, 'MEM-0013'); // 巡回ルート
    expect(areaState(s, gameData, area('A001-RAINALLEY'))).toBe('locked');
    s = withFlags(s, { 'explore.rainalley.found': true });
    expect(areaState(s, gameData, area('A001-RAINALLEY'))).toBe('open');
    s = visitArea(s, gameData, 'A001-RAINALLEY');
    expect(s.exploration.lastArea).toBe('A001-RAINALLEY');
    expect(s.exploration.visitedAreas).toContain('A001-RAINALLEY');
  });

  it('field abilities gate search points; owned (not equipped) Memories count', () => {
    const s = fresh();
    expect(pointState(s, gameData, point('P001-PUDDLE'))).toBe('available'); // 雨音の地図（MEM-0004）
    expect(pointState(s, gameData, point('P001-GATE'))).toBe('available'); // 身元照合（装備できない MEM-0006）
    expect(pointState(s, gameData, point('P001-TRACE'))).toBe('needs-ability'); // 流出経路の追跡（MEM-0011）
    expect(pointState(s, gameData, point('P001-OTHERSIDE'))).toBe('locked'); // CHAPTER 1 のあと
  });

  it('searching grants rewards once, sets flags and discovers Memories', () => {
    let s = fresh();
    const before = { data: s.wallet.DATA, patch: s.inventory['ITEM-0001'] ?? 0 };
    const r = searchPoint(s, gameData, 'P001-BOX', AT);
    if (!r.ok) throw new Error(r.error);
    s = r.save;
    expect(s.wallet.DATA).toBe(before.data + 150);
    expect(s.inventory['ITEM-0001']).toBe(before.patch + 1);
    expect(pointState(s, gameData, point('P001-BOX'))).toBe('done');
    expect(searchPoint(s, gameData, 'P001-BOX', AT).ok).toBe(false);
    expect(s.transactions.some((t) => t.reason === 'EXPLORE_REWARD' && t.amount === 150)).toBe(true);

    s = { ...s, story: { ...s.story, completedChapters: ['CH-000', 'CH-001'] } };
    const g = searchPoint(s, gameData, 'P001-OTHERSIDE', AT);
    if (!g.ok) throw new Error(g.error);
    expect(g.outcome.discovered).toEqual(['MEM-0012']);
    expect(g.save.progress.flags['explore.cross.glimpse']).toBe(true);
    expect(explorationProgress(g.save, gameData, 'WORLD-001').done).toBe(2);
  });

  it('signals in areas are the BATTLE encounters (state follows encounter progress)', () => {
    let s = fresh();
    expect(pointState(s, gameData, point('P001-SIG-ALLEY'))).toBe('available');
    expect(pointState(s, gameData, point('P001-SIG-STREET'))).toBe('locked');
    s = { ...s, battle: { ...s.battle, encounters: { 'ENC-001': { clears: 1, bestRounds: 3, firstClearedAt: AT } } } };
    expect(pointState(s, gameData, point('P001-SIG-ALLEY'))).toBe('done');
    expect(pointState(s, gameData, point('P001-SIG-STREET'))).toBe('available');
  });

  it('events give first-time rewards only and keep flags', () => {
    let s = fresh();
    const frag = s.wallet.FRAGMENT;
    let o = completeEvent(s, gameData, 'EV-ALLEY-CATS', {}, [], AT);
    expect(o.firstTime).toBe(true);
    expect(o.save.wallet.FRAGMENT).toBe(frag + 10);
    o = completeEvent(o.save, gameData, 'EV-ALLEY-CATS', {}, [], AT);
    expect(o.firstTime).toBe(false);
    expect(o.save.wallet.FRAGMENT).toBe(frag + 10);
    s = completeEvent(o.save, gameData, 'EV-LUX', { 'talked.lux': true }, [], AT).save;
    expect(s.progress.flags['talked.lux']).toBe(true);
    expect(pointState(s, gameData, point('P001-LUX'))).toBe('done');
  });

  it('every event script reaches its end with every choice', () => {
    const s = fresh();
    for (const ev of gameData.events) {
      const ch: StoryChapter = { id: ev.id, order: 0, label: 'EVENT', title: ev.title, summary: '', unlock: [], script: ev.script };
      for (const pick of [0, 1]) {
        let run = startChapter(ch, { save: s, data: gameData });
        for (let i = 0; i < 300 && !run.ended; i++) {
          const opts = run.view.choice?.options;
          run = advance(ch, run, { save: s, data: gameData }, opts ? opts[Math.min(pick, opts.length - 1)].value : undefined);
        }
        expect(run.ended, `${ev.id} pick ${pick}`).toBe(true);
      }
    }
  });

  it('the unknown signal event connects WORLD-005 UNKNOWN', () => {
    let s = fresh();
    expect(canExplore(s, gameData, 'WORLD-005')).toBe(false);
    const ev = gameData.eventById.get('EV-UNKNOWN-SIGNAL')!;
    const ch: StoryChapter = { id: ev.id, order: 0, label: 'EVENT', title: ev.title, summary: '', unlock: [], script: ev.script };
    let run = startChapter(ch, { save: s, data: gameData });
    for (let i = 0; i < 300 && !run.ended; i++) run = advance(ch, run, { save: s, data: gameData });
    s = completeEvent(s, gameData, ev.id, run.flags, run.detected, AT).save;
    expect(canExplore(s, gameData, 'WORLD-005')).toBe(true);
    expect(areaState(s, gameData, area('A005-VOID'))).toBe('open');
  });
});

describe('sub-quests (PHASE 4)', () => {
  it('accept → objectives → report, with rewards once', () => {
    let s = fresh();
    const q = gameData.questById.get('Q-001')!;
    expect(questStatus(s, gameData, q)).toBe('locked');
    s = { ...s, story: { ...s.story, completedChapters: ['CH-000'] } };
    expect(questStatus(s, gameData, q)).toBe('available');
    expect(claimQuest(s, gameData, q.id, AT).ok).toBe(false);
    const a = acceptQuest(s, gameData, q.id, AT);
    if (!a.ok) throw new Error(a.error);
    s = a.save;
    expect(questStatus(s, gameData, q)).toBe('active');
    s = withFlags({ ...s, battle: { ...s.battle, encounters: { 'ENC-002': { clears: 1, bestRounds: 5, firstClearedAt: AT } } } }, { 'talked.lux': true });
    expect(questStatus(s, gameData, q)).toBe('ready');
    const data0 = s.wallet.DATA;
    const c = claimQuest(s, gameData, q.id, AT);
    if (!c.ok) throw new Error(c.error);
    expect(c.save.wallet.DATA).toBe(data0 + 400);
    expect(questStatus(c.save, gameData, q)).toBe('completed');
    expect(evaluateCondition({ type: 'questCompleted', questId: 'Q-001' }, { save: c.save, data: gameData })).toBe(true);
    expect(claimQuest(c.save, gameData, q.id, AT).ok).toBe(false);
  });

  it('restored condition follows world restoration', () => {
    const s = fresh();
    expect(evaluateCondition({ type: 'restored', targetId: 'R001-CROSS' }, { save: s, data: gameData })).toBe(true);
    expect(evaluateCondition({ type: 'restored', targetId: 'R001-PATROL' }, { save: s, data: gameData })).toBe(false);
  });
});
