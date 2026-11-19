import { describe, expect, it } from 'vitest';
import { gameData } from './data/gameData';
import { DEFAULT_QUERY, applyQuery, buildEntries, normalizeSearchText } from './memory/query';
import { evaluateFragments, ownedMemoryIdSet } from './memory/records';
import { calcStats, combatPower, maxLevel } from './memory/stats';
import { discover, discoveryState } from './player/discovery';
import { applyCurrencyChanges } from './player/economy';
import { acquireMemory } from './player/memories';
import { createNewSave, starterMemoryIds } from './player/newGame';
import { autoLoadout, equipMemory, getActiveLoadout, loadoutInstanceIds } from './player/loadout';
import { sanitizeSave } from './save/sanitize';
import { SAVE_STORAGE_KEY } from './save/schema';
import { SaveManager, createMemoryStore, parseSaveText } from './save/storage';
import { gameReducer } from '../state/gameReducer';

const AT = '2026-11-19T00:00:00.000Z';
const fresh = () => createNewSave('テスター', gameData, AT);

describe('new game', () => {
  it('grants starter memories, currencies and an auto-formed team', () => {
    const s = fresh();
    expect(s.profile.name).toBe('テスター');
    expect(s.memories.map((m) => m.memoryId).sort()).toEqual(starterMemoryIds(gameData).sort());
    expect(s.memories.length).toBeGreaterThanOrEqual(9);
    expect(s.wallet.DATA).toBe(1000);
    expect(s.wallet.CREDIT).toBe(300);
    expect(s.transactions).toHaveLength(2);
    const l = getActiveLoadout(s);
    expect(l.slots.main[0]).not.toBeNull();
    expect(l.slots.sub.every((x) => x !== null)).toBe(true);
    expect(l.slots.passive.every((x) => x !== null)).toBe(true);
    expect(s.inventory['ITEM-0001']).toBe(3);
    // 非スターターは未所持
    expect(discoveryState(s, 'MEM-0012')).toBe('undiscovered');
    expect(discoveryState(s, 'MEM-0001')).toBe('owned');
  });

  it('falls back to a default name', () => {
    expect(createNewSave('   ', gameData, AT).profile.name).toBe('EXPLORER');
  });
});

describe('stats', () => {
  const def = gameData.memoryById.get('MEM-0007')!;
  it('scales with level and limit break', () => {
    const lv1 = calcStats(def, 1, 0);
    expect(lv1.tec).toBe(def.baseStats.tec);
    const lv11 = calcStats(def, 11, 0);
    expect(lv11.tec).toBe(Math.round(def.baseStats.tec * 1.5));
    expect(combatPower(lv11)).toBeGreaterThan(combatPower(lv1));
  });
  it('clamps level to rarity cap', () => {
    expect(maxLevel('RARE', 0)).toBe(50);
    expect(maxLevel('RARE', 2)).toBe(70);
    expect(calcStats(def, 999, 0)).toEqual(calcStats(def, 50, 0));
  });
});

describe('economy', () => {
  it('applies changes atomically and records transactions', () => {
    const s = fresh();
    const ok = applyCurrencyChanges(s, [{ currency: 'DATA', amount: -300, reason: 'MEMORY_LEVEL_UP' }], AT);
    expect(ok.ok && ok.save.wallet.DATA).toBe(700);
    expect(ok.ok && ok.save.transactions[0].balanceAfter).toBe(700);

    const ng = applyCurrencyChanges(
      s,
      [
        { currency: 'DATA', amount: -100, reason: 'SHOP_PURCHASE' },
        { currency: 'CORE', amount: -1, reason: 'SHOP_PURCHASE' },
      ],
      AT,
    );
    expect(ng.ok).toBe(false);
    expect(s.wallet.DATA).toBe(1000);
  });
  it('rejects non-integer amounts', () => {
    expect(applyCurrencyChanges(fresh(), [{ currency: 'DATA', amount: 1.5, reason: 'ADJUSTMENT' }], AT).ok).toBe(false);
    expect(applyCurrencyChanges(fresh(), [{ currency: 'DATA', amount: Number.NaN, reason: 'ADJUSTMENT' }], AT).ok).toBe(false);
  });
});

describe('loadout (GDD Ver.2 §6)', () => {
  const inst = (s: ReturnType<typeof fresh>, memoryId: string) => s.memories.find((m) => m.memoryId === memoryId)!.instanceId;

  it('rejects memories that cannot fill a slot', () => {
    const s = fresh();
    // MEM-0006 は戦闘能力を持たない記録
    const r = equipMemory(s, gameData, 'LOADOUT-2', 'main', 0, inst(s, 'MEM-0006'));
    expect(r.ok).toBe(false);
    expect(equipMemory(s, gameData, 'LOADOUT-2', 'sub', 9, null).ok).toBe(false);
    expect(equipMemory(s, gameData, 'LOADOUT-2', 'main', 0, 'nope').ok).toBe(false);
  });

  it('moves a memory between slots and keeps memoryId unique', () => {
    let s = fresh();
    const lux = inst(s, 'MEM-0001');
    let r = equipMemory(s, gameData, 'LOADOUT-2', 'main', 0, lux);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    r = equipMemory(r.save, gameData, 'LOADOUT-2', 'sub', 1, lux);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.save;
    const l = s.loadouts[1];
    expect(l.slots.main[0]).toBeNull();
    expect(l.slots.sub[1]).toBe(lux);

    const dup = acquireMemory(s, gameData, 'MEM-0001', 'test', AT);
    if (!dup.ok) throw new Error();
    const r2 = equipMemory(dup.save, gameData, 'LOADOUT-2', 'passive', 0, dup.instance.instanceId);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const ids = loadoutInstanceIds(r2.save.loadouts[1]);
      expect(ids).toEqual([dup.instance.instanceId]);
    }
  });

  it('auto loadout fills every slot with distinct memories', () => {
    const r = autoLoadout(fresh(), gameData, 'LOADOUT-3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = loadoutInstanceIds(r.save.loadouts[2]);
    expect(ids).toHaveLength(6);
    const memIds = ids.map((id) => r.save.memories.find((m) => m.instanceId === id)!.memoryId);
    expect(new Set(memIds).size).toBe(6);
    expect(memIds).not.toContain('MEM-0006');
  });
});

describe('query', () => {
  it('filters by category / rarity / text and sorts', () => {
    const entries = buildEntries(fresh(), gameData);
    const creatures = applyQuery(entries, { ...DEFAULT_QUERY, categories: ['CREATURE'] });
    expect(creatures.every((e) => e.def.category === 'CREATURE')).toBe(true);
    expect(creatures.length).toBe(3);

    const byText = applyQuery(entries, { ...DEFAULT_QUERY, text: 'りぶら' });
    expect(byText.map((e) => e.def.id)).toEqual(['MEM-0007']);

    const bySpd = applyQuery(entries, { ...DEFAULT_QUERY, sortKey: 'spd', sortDir: 'desc' });
    for (let i = 1; i < bySpd.length; i++) expect(bySpd[i - 1].stats.spd).toBeGreaterThanOrEqual(bySpd[i].stats.spd);
  });
  it('normalizes katakana and width', () => {
    expect(normalizeSearchText('ビットＣＡＴ')).toBe('びっとcat');
  });
});

describe('records & discovery', () => {
  it('unlocks fragments by ownership of related memories', () => {
    const s = fresh();
    const story = gameData.storyById.get('REC-0004')!;
    const inst = s.memories.find((m) => m.memoryId === 'MEM-0004')!;
    const views = evaluateFragments(story.fragments, { ownedMemoryIds: ownedMemoryIdSet(s), flags: {}, instance: inst });
    expect(views.map((v) => v.unlocked)).toEqual([true, true, false]);
    expect(views[1].fragment.reveals).toContain('MEM-0012');
  });

  it('discover marks memories as discovered only once', () => {
    const s = fresh();
    const r = discover(s, gameData, ['MEM-0012', 'MEM-0012', 'MEM-9999'], ['REC-0004-2']);
    expect(r.newlyDiscovered).toEqual(['MEM-0012']);
    expect(discoveryState(r.save, 'MEM-0012')).toBe('discovered');
    expect(discover(r.save, gameData, ['MEM-0012']).newlyDiscovered).toEqual([]);
  });
});

describe('save / load', () => {
  it('round-trips through the save manager', () => {
    const store = createMemoryStore();
    const mgr = new SaveManager(store, gameData);
    expect(mgr.load().status).toBe('empty');
    const s = fresh();
    expect(mgr.save(s).ok).toBe(true);
    const loaded = mgr.load();
    expect(loaded.status).toBe('loaded');
    if (loaded.status === 'loaded') {
      expect(loaded.issues).toEqual([]);
      expect(loaded.save.memories).toEqual(s.memories);
      expect(loaded.save.loadouts).toEqual(s.loadouts);
      expect(loaded.save.wallet).toEqual(s.wallet);
    }
  });

  it('backs up corrupted data instead of deleting it', () => {
    const store = createMemoryStore();
    store.set(SAVE_STORAGE_KEY, '{not json');
    const r = new SaveManager(store, gameData).load();
    expect(r.status).toBe('corrupted');
    if (r.status === 'corrupted') {
      expect(r.backupKey).not.toBeNull();
      expect(store.get(r.backupKey!)).toBe('{not json');
    }
    expect(store.get(SAVE_STORAGE_KEY)).toBeNull();
  });

  it('repairs tampered values', () => {
    const s = fresh();
    const tampered = JSON.parse(JSON.stringify(s));
    tampered.wallet.DATA = -50;
    tampered.wallet.CORE = 'lots';
    tampered.memories[0].level = 99999;
    tampered.loadouts[0].slots = { main: [s.memories[0].instanceId], sub: [s.memories[0].instanceId, 'ghost', null], passive: [null, null] };
    const r = sanitizeSave(tampered, gameData);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.wallet.DATA).toBe(0);
    expect(r.save.wallet.CORE).toBe(0);
    const def = gameData.memoryById.get(s.memories[0].memoryId)!;
    expect(r.save.memories[0].level).toBe(maxLevel(def.rarity, 0));
    expect(r.save.loadouts[0].slots).toEqual({ main: [s.memories[0].instanceId], sub: [null, null, null], passive: [null, null] });
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('rejects saves from a newer version and non-save JSON', () => {
    expect(parseSaveText(JSON.stringify({ ...fresh(), version: 999 }), gameData).ok).toBe(false);
    expect(parseSaveText('[1,2,3]', gameData).ok).toBe(false);
    expect(parseSaveText('{"version":1}', gameData).ok).toBe(false);
  });
});

describe('reducer', () => {
  it('handles the main flow', () => {
    let s = gameReducer(null, { type: 'NEW_GAME', name: 'A', at: AT }, gameData);
    expect(s).not.toBeNull();
    const id = s!.memories[0].instanceId;
    s = gameReducer(s, { type: 'TOGGLE_FAVORITE', instanceId: id }, gameData);
    expect(s!.memories[0].favorite).toBe(true);
    s = gameReducer(s, { type: 'DEV_GRANT_ALL', at: AT }, gameData);
    expect(new Set(s!.memories.map((m) => m.memoryId)).size).toBe(gameData.memories.length);
    s = gameReducer(s, { type: 'RENAME_PLAYER', name: '  ' }, gameData);
    expect(s!.profile.name).toBe('A');
    expect(gameReducer(s, { type: 'RESET' }, gameData)).toBeNull();
  });
});
