import { describe, expect, it } from 'vitest';
import { gameData } from '../data/gameData';
import { devGrantAllMemories } from '../player/dev';
import { createNewSave } from '../player/newGame';
import { checkSyncConditions, detectMemory, syncMemory } from '../player/sync';
import { parseSaveText } from '../save/storage';
import type { PlayerSave } from '../../types/player';
import { chooseAutoCommand } from './autoplay';
import { simulateCampaign } from './campaign.sim';
import { BattleCtx } from './context';
import { affinityOf } from './effects';
import { playerUnit, replayBattle, rewriteAvailability, skillAvailability, startBattle, submitCommand } from './engine';
import { applyBattleOutcome, outcomeFromState } from './result';
import { createBattleSetup, encounterStatus } from './setup';
import type { BattleEvent, BattleSetup, BattleState, StepResult } from './types';

const AT = '2026-11-20T00:00:00.000Z';
const newSave = () => createNewSave('テスター', gameData, AT);

function setupFor(save: PlayerSave, encounterId = 'ENC-001', seed = 1) {
  const r = createBattleSetup(save, gameData, encounterId, seed);
  if (!r.ok) throw new Error(r.error);
  return r;
}

function runAuto(setup: BattleSetup): StepResult {
  let step = startBattle(setup, gameData);
  const events: BattleEvent[] = [...step.events];
  while (step.state.phase === 'awaiting_input') {
    step = submitCommand(step.state, chooseAutoCommand(step.state, gameData), gameData);
    events.push(...step.events);
  }
  return { state: step.state, events };
}

/** 敵を「倒れない・痛くない」標的にして、仕組みだけを検証しやすくする */
function dummyEnemies(setup: BattleSetup, spd = 1): BattleSetup {
  const s = structuredClone(setup);
  for (const e of s.enemies) {
    e.stats = { hp: 999999, atk: 1, def: 1, spd, tec: 1, res: 1 };
    e.hp = e.maxHp = 999999;
    e.ai = [{ action: 'attack', weight: 1 }];
  }
  return s;
}

const P = (s: BattleState) => playerUnit(s);

describe('battle engine — determinism', () => {
  it('produces identical results for the same seed and commands, and can be replayed', () => {
    const save = newSave();
    save.battle.encounters['ENC-001'] = { clears: 1, bestRounds: 3, firstClearedAt: AT };
    const { setup } = setupFor(save, 'ENC-002', 777);
    const a = runAuto(setup);
    const b = runAuto(setup);
    expect(a.state).toEqual(b.state);
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
    const replay = replayBattle(setup, a.state.commands, gameData);
    expect(replay.state).toEqual(a.state);
    expect(['victory', 'defeat']).toContain(a.state.phase);
  });

  it('different seeds diverge', () => {
    const s = newSave();
    const a = runAuto(setupFor(s, 'ENC-001', 1).setup);
    const b = runAuto(setupFor(s, 'ENC-001', 2).setup);
    expect(a.events.map((e) => e.text)).not.toEqual(b.events.map((e) => e.text));
  });

  it('does not mutate the previous state', () => {
    const { setup } = setupFor(newSave());
    const step = startBattle(setup, gameData);
    const frozen = structuredClone(step.state);
    submitCommand(step.state, { type: 'defend' }, gameData);
    expect(step.state).toEqual(frozen);
  });
});

describe('battle engine — turn order & commands', () => {
  it('acts in SPD order', () => {
    const { setup } = setupFor(newSave());
    const s = dummyEnemies(setup);
    s.enemies[0].stats.spd = 99999;
    const step = startBattle(s, gameData);
    const actions = step.events.filter((e) => e.kind === 'action').map((e) => e.actor);
    expect(actions).toEqual(['E1']); // 最速の E1 が行動 → 主人公の入力待ち（E2 は主人公より遅い）
    expect(step.state.phase).toBe('awaiting_input');
  });

  it('spends SYNC ENERGY and applies cooldowns to SKILL', () => {
    const { setup } = setupFor(newSave());
    let step = startBattle(dummyEnemies(setup), gameData);
    const sk = skillAvailability(step.state, gameData).find((x) => (x.skill.cooldown ?? 0) >= 1 && x.usable)!;
    expect(sk).toBeDefined();
    const energy = P(step.state).energy;
    step = submitCommand(step.state, { type: 'skill', skillId: sk.skill.id, target: 'E1' }, gameData);
    const after = skillAvailability(step.state, gameData).find((x) => x.skill.id === sk.skill.id)!;
    expect(P(step.state).energy).toBe(Math.min(100, energy - sk.cost + 15));
    expect(after.usable).toBe(false);
    expect(after.reason).toMatch(/CT/);
    expect(() => submitCommand(step.state, { type: 'skill', skillId: sk.skill.id }, gameData)).toThrow();
    for (let i = 0; i < (sk.skill.cooldown ?? 0); i++) step = submitCommand(step.state, { type: 'defend' }, gameData);
    expect(skillAvailability(step.state, gameData).find((x) => x.skill.id === sk.skill.id)!.usable).toBe(true);
  });

  it('DEFEND restores extra SYNC ENERGY and sets the defending flag', () => {
    const { setup } = setupFor(newSave());
    const step = startBattle(dummyEnemies(setup), gameData);
    const energy = P(step.state).energy;
    const next = submitCommand(step.state, { type: 'defend' }, gameData);
    const defendEvent = next.events.find((e) => e.kind === 'action');
    expect(defendEvent?.snapshot.find((u) => u.uid === 'P')?.defending).toBe(true);
    expect(P(next.state).energy).toBe(Math.min(100, energy + 20 + 15));
  });

  it('silence blocks skills, stun skips a turn, corrupt deals damage over time', () => {
    const { setup } = setupFor(newSave());
    const step = startBattle(dummyEnemies(setup), gameData);
    const silenced = structuredClone(step.state);
    P(silenced).statuses.push({ id: 'silence', turns: 1 });
    const skillId = skillAvailability(step.state, gameData)[0].skill.id;
    expect(() => submitCommand(silenced, { type: 'skill', skillId }, gameData)).toThrow(/沈黙/);

    const stunned = structuredClone(step.state);
    stunned.units.find((u) => u.uid === 'E1')!.statuses.push({ id: 'stun', turns: 1 });
    const r1 = submitCommand(stunned, { type: 'defend' }, gameData);
    expect(r1.events.some((e) => e.kind === 'skip' && e.actor === 'E1')).toBe(true);

    const corrupted = structuredClone(step.state);
    P(corrupted).statuses.push({ id: 'corrupt', turns: 2 });
    const r2 = submitCommand(corrupted, { type: 'defend' }, gameData);
    expect(r2.events.some((e) => e.kind === 'damage' && e.target === 'P' && e.text.includes('侵食'))).toBe(true);
  });

  it('uses items and records consumption', () => {
    const save = newSave();
    const { setup, loadoutId } = setupFor(save);
    let step = startBattle(dummyEnemies(setup), gameData);
    P(step.state).hp = 100;
    step = submitCommand(step.state, { type: 'item', itemId: 'ITEM-0001' }, gameData);
    expect(P(step.state).hp).toBeGreaterThan(100);
    expect(step.state.items['ITEM-0001']).toBe(2);
    step = submitCommand(step.state, { type: 'retreat' }, gameData);
    expect(step.state.phase).toBe('retreat');
    const applied = applyBattleOutcome(save, gameData, outcomeFromState(step.state, loadoutId), AT);
    expect(applied.save.inventory['ITEM-0001']).toBe(2);
    expect(applied.save.battle.retreats).toBe(1);
    expect(applied.summary.exp).toBe(0);
  });

  it('ends in a timeout defeat after the round limit', () => {
    const { setup } = setupFor(newSave());
    const s = dummyEnemies(setup);
    let step = startBattle(s, gameData);
    let guard = 0;
    while (step.state.phase === 'awaiting_input' && guard++ < 100) step = submitCommand(step.state, { type: 'defend' }, gameData);
    expect(step.state.phase).toBe('defeat');
    expect(step.state.endReason).toBe('timeout');
  });
});

describe('battle engine — affinity, passives, REWRITE', () => {
  it('applies the attribute cycle DATA→VOID→LIFE→ERROR→DATA and ORDER⇄CHAOS', () => {
    const { setup } = setupFor(newSave());
    const step = startBattle(setup, gameData);
    const ctx = new BattleCtx(structuredClone(step.state), gameData);
    const [a, d] = [ctx.player, ctx.state.units[1]];
    const at = (atk: typeof a.attribute, def: typeof a.attribute) => {
      d.attribute = def;
      a.passives = [];
      return affinityOf(ctx, atk, a, d).kind;
    };
    expect(at('DATA', 'VOID')).toBe('advantage');
    expect(at('VOID', 'DATA')).toBe('disadvantage');
    expect(at('LIFE', 'ERROR')).toBe('advantage');
    expect(at('ERROR', 'DATA')).toBe('advantage');
    expect(at('ORDER', 'CHAOS')).toBe('advantage');
    expect(at('CHAOS', 'ORDER')).toBe('advantage');
    expect(at('DATA', 'LIFE')).toBe('neutral');
  });

  it('endure passive survives a lethal hit once', () => {
    const { setup } = setupFor(newSave());
    const s = dummyEnemies(setup, 99999);
    s.player.passives.push({ skillId: 'PS-0002', sourceMemoryId: 'MEM-0002', stacks: 0 });
    s.player.hp = 1;
    for (const e of s.enemies) e.stats.atk = 99999;
    const step = startBattle(s, gameData);
    expect(step.events.some((e) => e.kind === 'endure')).toBe(true);
  });

  it('REWRITE GAUGE charges through actions and damage, and REWRITE resets it', () => {
    const { setup } = setupFor(newSave());
    expect(setup.rewrite.skillId).not.toBeNull();
    let step = startBattle(dummyEnemies(setup), gameData);
    expect(step.state.rewrite.gauge).toBe(0);
    expect(rewriteAvailability(step.state, gameData)).toMatchObject({ usable: false });
    expect(rewriteAvailability(step.state, gameData).reason).toMatch(/GAUGE/);
    expect(() => submitCommand(step.state, { type: 'rewrite' }, gameData)).toThrow();
    step = submitCommand(step.state, { type: 'attack', target: 'E1' }, gameData);
    expect(step.state.rewrite.gauge).toBeGreaterThan(0);
    let guard = 0;
    while (step.state.rewrite.gauge < 100 && guard++ < 25) step = submitCommand(step.state, { type: 'attack', target: 'E1' }, gameData);
    expect(rewriteAvailability(step.state, gameData).usable).toBe(true);
    step = submitCommand(step.state, { type: 'rewrite' }, gameData);
    expect(step.events[0].kind).toBe('rewrite');
    expect(step.state.rewrite.uses).toBe(1);
    expect(step.state.rewrite.gauge).toBeLessThan(100);
    expect(rewriteAvailability(step.state, gameData).usable).toBe(false);
  });

  it('taking damage charges the REWRITE GAUGE', () => {
    const { setup } = setupFor(newSave());
    const s = dummyEnemies(setup, 99999);
    for (const e of s.enemies) e.stats.atk = 400;
    const step = startBattle(s, gameData);
    expect(step.state.rewrite.gauge).toBeGreaterThan(0);
  });

  it('REWRITE can shift attribute (属性変化) and unlock a special skill (特殊スキル解放)', () => {
    const { setup } = setupFor(newSave(), 'ENC-001');
    const s = dummyEnemies(setup);
    s.rewrite = { skillId: 'RW-0007', memoryId: 'MEM-0016' };
    let step = startBattle(s, gameData);
    step.state.rewrite.gauge = 100;
    step = submitCommand(step.state, { type: 'rewrite' }, gameData);
    expect(P(step.state).attribute).toBe('ORDER');
    expect(P(step.state).empower?.value).toBeCloseTo(0.3);
    for (let i = 0; i < 3; i++) step = submitCommand(step.state, { type: 'defend' }, gameData);
    expect(P(step.state).attribute).toBe(P(step.state).baseAttribute);

    const s2 = dummyEnemies(setup);
    s2.rewrite = { skillId: 'RW-0003', memoryId: 'MEM-0009' };
    let st = startBattle(s2, gameData);
    st.state.rewrite.gauge = 100;
    st = submitCommand(st.state, { type: 'rewrite' }, gameData);
    expect(P(st.state).skills.some((x) => x.skillId === 'SK-0101')).toBe(true);
  });
});

describe('battle results, growth and MEMORY SYNC', () => {
  function winEncounter(save: PlayerSave, encounterId: string, seed = 5) {
    const { setup, loadoutId } = setupFor(save, encounterId, seed);
    const r = runAuto(setup);
    expect(r.state.phase).toBe('victory');
    return applyBattleOutcome(save, gameData, outcomeFromState(r.state, loadoutId), AT);
  }

  it('awards exp, memory sync exp, currencies, items and detects a Memory on first clear', () => {
    const save = newSave();
    expect(encounterStatus(save, gameData.encounterById.get('ENC-002')!)).toBe('locked');
    const { save: s1, summary } = winEncounter(save, 'ENC-001');
    expect(summary.firstClear).toBe(true);
    expect(s1.profile.level).toBe(2);
    expect(summary.memoryGrowth.length).toBe(6);
    expect(s1.wallet.DATA).toBe(save.wallet.DATA + 100);
    expect(s1.archive.pendingSyncIds).toEqual(['MEM-0013']);
    expect(summary.detected).toEqual([{ memoryId: 'MEM-0013', kind: 'pending' }]);
    expect(encounterStatus(s1, gameData.encounterById.get('ENC-002')!)).toBe('available');

    const { save: s2, summary: again } = winEncounter(s1, 'ENC-001', 9);
    expect(again.firstClear).toBe(false);
    expect(again.detected).toEqual([]);
    expect(s2.battle.encounters['ENC-001'].clears).toBe(2);
    expect(s2.battle.records).toHaveLength(2);
  });

  it('syncs a detected Memory when its conditions are met', () => {
    let save = detectMemory(newSave(), 'MEM-0014');
    const check = checkSyncConditions(save, gameData, 'MEM-0014');
    expect(check.ok).toBe(false);
    expect(syncMemory(save, gameData, 'MEM-0014', AT).ok).toBe(false);
    save = { ...save, profile: { ...save.profile, level: 4 } };
    const r = syncMemory(save, gameData, 'MEM-0014', AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.memories.some((m) => m.memoryId === 'MEM-0014')).toBe(true);
    expect(r.save.archive.pendingSyncIds).not.toContain('MEM-0014');
    expect(syncMemory(r.save, gameData, 'MEM-0013', AT).ok).toBe(false); // 未検出
  });

  it('converts an already-synced drop into FRAGMENT', () => {
    const save = devGrantAllMemories(newSave(), gameData, AT).save;
    const { save: s1, summary } = winEncounter(save, 'ENC-001');
    expect(summary.detected[0]).toMatchObject({ memoryId: 'MEM-0013', kind: 'duplicate', fragments: 10 });
    expect(s1.wallet.FRAGMENT).toBe(save.wallet.FRAGMENT + 10);
  });

  it('the full campaign is clearable with sensible pacing', () => {
    for (const seed of [11, 22, 33, 44]) {
      const r = simulateCampaign(seed);
      expect(r.cleared, `seed ${seed}`).toBe(true);
      expect(r.logs[0].hpLeft).toBeGreaterThan(50);
      for (const l of r.logs) expect(l.rounds, l.encounterId).toBeLessThan(25);
    }
  }, 60000);
});

describe('save migration v1 → v3', () => {
  it('converts PHASE 1 teams into loadouts and grants starter items', () => {
    const v2 = newSave();
    const id = (mid: string) => v2.memories.find((m) => m.memoryId === mid)!.instanceId;
    const { loadouts: _l, activeLoadoutId: _a, loadoutCapacity: _c, battle: _b, ...rest } = v2;
    const v1 = {
      ...rest,
      version: 1,
      profile: { ...v2.profile, avatar: undefined, bio: undefined },
      archive: { discoveredMemoryIds: v2.archive.discoveredMemoryIds, readFragmentIds: [] },
      inventory: {},
      teams: [
        { id: 'TEAM-1', name: 'TEAM 01', slots: [id('MEM-0007'), id('MEM-0006'), id('MEM-0008')] },
        { id: 'TEAM-2', name: 'MY TEAM', slots: [null, null, null] },
        { id: 'TEAM-3', name: 'TEAM 03', slots: [null, null, null] },
      ],
      activeTeamId: 'TEAM-2',
    };
    const r = parseSaveText(JSON.stringify(v1), gameData);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.version).toBe(3);
    expect(r.save.story).toEqual({ completedChapters: [], current: null, choices: {} });
    expect(r.save.worlds['WORLD-001'].recoveredMemories.length).toBeGreaterThan(0);
    expect(r.save.loadouts[0].slots.main).toEqual([id('MEM-0007')]);
    // MEM-0006 は戦闘能力を持たない記録になったため装備から外れる
    expect(r.save.loadouts[0].slots.sub).toEqual([null, id('MEM-0008'), null]);
    expect(r.save.loadouts[1].name).toBe('MY TEAM');
    expect(r.save.activeLoadoutId).toBe('LOADOUT-2');
    expect(r.save.inventory['ITEM-0001']).toBe(3);
    expect(r.save.archive.pendingSyncIds).toEqual([]);
    expect(r.save.profile.avatar.color).toMatch(/^#/);
    expect(r.issues.join()).toMatch(/v1 から/);
  });
});
