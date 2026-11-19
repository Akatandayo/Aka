import { createId } from '../id';
import type { GameData } from '../data/gameData';
import { clampLimitBreak, maxLevel } from '../memory/stats';
import { MAX_BALANCE, TRANSACTION_HISTORY_LIMIT, emptyWallet } from '../player/economy';
import { clampCapacity, createDefaultLoadouts, slotEligible } from '../player/loadout';
import { PLAYER_MAX_LEVEL } from '../constants';
import { DEFAULT_AVATAR, DEFAULT_SETTINGS, PLAYER_BIO_MAX, SAVE_VERSION, normalizePlayerName } from './schema';
import {
  CURRENCIES,
  LOADOUT_SLOT_TYPES,
  TRANSACTION_REASONS,
  type BattleProgress,
  type BattleRecordEntry,
  type PlayerLoadout,
  type PlayerMemory,
  type PlayerSave,
  type PlayerSettings,
  type Transaction,
} from '../../types/player';

/**
 * セーブデータの検証・修復。
 * 破損・改ざん・古いバージョン由来の不整合を検出し、安全な値に補正する。
 * プロフィールが読めないなど、修復不能な場合は ok: false を返す。
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v.length > 0 ? v : fallback);
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const nonNegInt = (v: unknown, fallback = 0, max = MAX_BALANCE): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? Math.min(v, max) : fallback;

export type SanitizeResult = { ok: true; save: PlayerSave; issues: string[] } | { ok: false; error: string };

export function sanitizeSave(raw: unknown, data: GameData, now: string = new Date().toISOString()): SanitizeResult {
  const issues: string[] = [];
  if (!isObj(raw)) return { ok: false, error: 'セーブデータの形式が不正です' };
  if (!isObj(raw.profile) || typeof raw.profile.name !== 'string' || typeof raw.profile.playerId !== 'string') {
    return { ok: false, error: 'プロフィール情報が読み取れません' };
  }

  // ---- profile
  const p = raw.profile;
  const av = isObj(p.avatar) ? p.avatar : {};
  const profile = {
    playerId: p.playerId as string,
    name: normalizePlayerName(p.name as string) || 'EXPLORER',
    title: str(p.title, '新米探索者'),
    level: Math.max(1, nonNegInt(p.level, 1, PLAYER_MAX_LEVEL)),
    exp: nonNegInt(p.exp),
    avatar: {
      preset: typeof av.preset === 'string' && /^[a-z0-9-]{1,32}$/.test(av.preset) ? av.preset : DEFAULT_AVATAR.preset,
      color: typeof av.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(av.color) ? av.color : DEFAULT_AVATAR.color,
    },
    bio: typeof p.bio === 'string' ? p.bio.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, PLAYER_BIO_MAX) : '',
    createdAt: isIsoDate(p.createdAt) ? p.createdAt : now,
    lastLoginAt: isIsoDate(p.lastLoginAt) ? p.lastLoginAt : now,
  };

  // ---- wallet
  const wallet = emptyWallet();
  const rw = isObj(raw.wallet) ? raw.wallet : {};
  for (const c of CURRENCIES) {
    const v = rw[c];
    const n = nonNegInt(v, 0);
    if (v !== undefined && n !== v) issues.push(`${c} の値が不正だったため補正しました`);
    wallet[c] = n;
  }

  // ---- transactions
  const transactions: Transaction[] = [];
  if (Array.isArray(raw.transactions)) {
    for (const t of raw.transactions.slice(0, TRANSACTION_HISTORY_LIMIT)) {
      if (
        isObj(t) &&
        typeof t.id === 'string' &&
        isIsoDate(t.at) &&
        (CURRENCIES as readonly unknown[]).includes(t.currency) &&
        typeof t.amount === 'number' &&
        Number.isSafeInteger(t.amount) &&
        typeof t.balanceAfter === 'number' &&
        (TRANSACTION_REASONS as readonly unknown[]).includes(t.reason)
      ) {
        transactions.push({
          id: t.id,
          at: t.at,
          currency: t.currency as Transaction['currency'],
          amount: t.amount,
          balanceAfter: t.balanceAfter,
          reason: t.reason as Transaction['reason'],
          ...(typeof t.note === 'string' ? { note: t.note } : {}),
        });
      }
    }
  }

  // ---- memories
  const memories: PlayerMemory[] = [];
  const seenInstance = new Set<string>();
  if (Array.isArray(raw.memories)) {
    for (const m of raw.memories) {
      if (!isObj(m) || typeof m.instanceId !== 'string' || typeof m.memoryId !== 'string') {
        issues.push('読み取れない所持Memoryを除外しました');
        continue;
      }
      if (seenInstance.has(m.instanceId)) {
        issues.push(`重複した所持Memory（${m.instanceId}）を除外しました`);
        continue;
      }
      seenInstance.add(m.instanceId);
      const def = data.memoryById.get(m.memoryId);
      if (!def) {
        // マスターデータから一時的に消えている可能性があるため、データは保持する（表示からは除外される）
        issues.push(`マスターデータに存在しないMemory（${m.memoryId}）があります。表示から除外されます`);
      }
      const limitBreak = clampLimitBreak(nonNegInt(m.limitBreak, 0, 99));
      const cap = def ? maxLevel(def.rarity, limitBreak) : 999;
      const level = Math.min(cap, Math.max(1, nonNegInt(m.level, 1, 999)));
      const skillLevels: Record<string, number> = {};
      if (isObj(m.skillLevels)) {
        for (const [k, v] of Object.entries(m.skillLevels)) {
          const n = nonNegInt(v, 0, 99);
          if (n > 0) skillLevels[k] = n;
        }
      }
      memories.push({
        instanceId: m.instanceId,
        memoryId: m.memoryId,
        level,
        exp: nonNegInt(m.exp),
        limitBreak,
        skillLevels,
        form: typeof m.form === 'string' ? m.form : null,
        favorite: m.favorite === true,
        acquiredAt: isIsoDate(m.acquiredAt) ? m.acquiredAt : now,
        acquiredFrom: str(m.acquiredFrom, '不明'),
      });
    }
  }
  const instanceById = new Map(memories.map((m) => [m.instanceId, m]));

  // ---- loadouts（Memory 装備）
  const loadoutCapacity = clampCapacity(isObj(raw.loadoutCapacity) ? (raw.loadoutCapacity as Partial<PlayerSave['loadoutCapacity']>) : undefined);
  const defaults = createDefaultLoadouts(loadoutCapacity);
  const rawLoadouts = Array.isArray(raw.loadouts) ? raw.loadouts.filter(isObj) : [];
  const loadouts: PlayerLoadout[] = defaults.map((d) => {
    const l = rawLoadouts.find((x) => x.id === d.id);
    if (!l) return d;
    const rs = isObj(l.slots) ? l.slots : {};
    const usedInstance = new Set<string>();
    const usedMemory = new Set<string>();
    const slots = { ...d.slots };
    let dropped = 0;
    for (const t of LOADOUT_SLOT_TYPES) {
      const arr = Array.isArray(rs[t]) ? (rs[t] as unknown[]) : [];
      slots[t] = d.slots[t].map((_, i) => {
        const id = arr[i];
        if (typeof id !== 'string') return null;
        const inst = instanceById.get(id);
        const def = inst ? data.memoryById.get(inst.memoryId) : undefined;
        if (!inst || !def || usedInstance.has(id) || usedMemory.has(inst.memoryId) || !slotEligible(def, t)) {
          dropped++;
          return null;
        }
        usedInstance.add(id);
        usedMemory.add(inst.memoryId);
        return id;
      });
    }
    if (dropped) issues.push(`${d.name} の装備できないMemory（${dropped}件）を外しました`);
    const name = typeof l.name === 'string' && l.name.trim() ? l.name.trim().slice(0, 16) : d.name;
    return { id: d.id, name, slots };
  });
  const activeLoadoutId = loadouts.some((l) => l.id === raw.activeLoadoutId) ? (raw.activeLoadoutId as string) : loadouts[0].id;

  // ---- archive
  const ra = isObj(raw.archive) ? raw.archive : {};
  const strings = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);
  const discovered = new Set(strings(ra.discoveredMemoryIds));
  for (const m of memories) discovered.add(m.memoryId);
  const ownedIds = new Set(memories.map((m) => m.memoryId));
  const archive = {
    discoveredMemoryIds: [...discovered],
    readFragmentIds: strings(ra.readFragmentIds),
    // 同期待ちは「存在するMemory」かつ「未同期」のもののみ
    pendingSyncIds: strings(ra.pendingSyncIds).filter((id) => data.memoryById.has(id) && !ownedIds.has(id)),
  };
  for (const id of archive.pendingSyncIds) if (!discovered.has(id)) archive.discoveredMemoryIds.push(id);

  // ---- battle progress
  const rb = isObj(raw.battle) ? raw.battle : {};
  const encounters: BattleProgress['encounters'] = {};
  if (isObj(rb.encounters)) {
    for (const [id, v] of Object.entries(rb.encounters)) {
      if (!isObj(v) || !isIsoDate(v.firstClearedAt)) continue;
      encounters[id] = { clears: Math.max(1, nonNegInt(v.clears, 1)), bestRounds: Math.max(1, nonNegInt(v.bestRounds, 1, 999)), firstClearedAt: v.firstClearedAt };
    }
  }
  const records: BattleRecordEntry[] = [];
  if (Array.isArray(rb.records)) {
    for (const r of rb.records.slice(0, 20)) {
      if (!isObj(r) || typeof r.id !== 'string' || typeof r.encounterId !== 'string' || !isIsoDate(r.at)) continue;
      if (r.result !== 'victory' && r.result !== 'defeat' && r.result !== 'retreat') continue;
      records.push({
        id: r.id,
        encounterId: r.encounterId,
        result: r.result,
        rounds: nonNegInt(r.rounds, 0, 999),
        seed: typeof r.seed === 'number' && Number.isSafeInteger(r.seed) ? r.seed : 0,
        commands: Array.isArray(r.commands) ? r.commands.slice(0, 200) : [],
        at: r.at,
      });
    }
  }
  const battle: BattleProgress = {
    encounters,
    wins: nonNegInt(rb.wins),
    losses: nonNegInt(rb.losses),
    retreats: nonNegInt(rb.retreats),
    records,
  };

  // ---- inventory / progress
  const inventory: Record<string, number> = {};
  if (isObj(raw.inventory)) {
    for (const [k, v] of Object.entries(raw.inventory)) {
      const n = nonNegInt(v, 0);
      if (n > 0) inventory[k] = n;
    }
  }
  const flags: PlayerSave['progress']['flags'] = {};
  const rp = isObj(raw.progress) && isObj(raw.progress.flags) ? raw.progress.flags : {};
  for (const [k, v] of Object.entries(rp)) {
    if (typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) flags[k] = v;
  }

  // ---- settings
  const rs = isObj(raw.settings) ? raw.settings : {};
  const num01 = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
  const settings: PlayerSettings = {
    fx: rs.fx === 'reduced' ? 'reduced' : 'full',
    skipBoot: rs.skipBoot === true,
    textSpeed: typeof rs.textSpeed === 'number' && rs.textSpeed >= 1 && rs.textSpeed <= 5 ? Math.round(rs.textSpeed) : DEFAULT_SETTINGS.textSpeed,
    bgmVolume: num01(rs.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
    seVolume: num01(rs.seVolume, DEFAULT_SETTINGS.seVolume),
    devMode: rs.devMode === true,
  };

  return {
    ok: true,
    issues,
    save: {
      version: SAVE_VERSION,
      saveId: str(raw.saveId, createId('save')),
      createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : profile.createdAt,
      updatedAt: isIsoDate(raw.updatedAt) ? raw.updatedAt : now,
      profile,
      wallet,
      transactions,
      memories,
      loadouts,
      activeLoadoutId,
      loadoutCapacity,
      archive,
      battle,
      inventory,
      progress: { flags },
      settings,
    },
  };
}
