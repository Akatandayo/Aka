import { createId } from '../id';
import type { GameData } from '../data/gameData';
import { clampLimitBreak, maxLevel } from '../memory/stats';
import { MAX_BALANCE, TRANSACTION_HISTORY_LIMIT, emptyWallet } from '../player/economy';
import { createDefaultTeams } from '../player/teams';
import { DEFAULT_SETTINGS, SAVE_VERSION, normalizePlayerName } from './schema';
import {
  CURRENCIES,
  TEAM_SIZE,
  TRANSACTION_REASONS,
  type PlayerMemory,
  type PlayerSave,
  type PlayerSettings,
  type PlayerTeam,
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
  const profile = {
    playerId: p.playerId as string,
    name: normalizePlayerName(p.name as string) || 'EXPLORER',
    title: str(p.title, '新米探索者'),
    level: Math.max(1, nonNegInt(p.level, 1, 999)),
    exp: nonNegInt(p.exp),
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

  // ---- teams
  const defaults = createDefaultTeams();
  const rawTeams = Array.isArray(raw.teams) ? raw.teams.filter(isObj) : [];
  const teams: PlayerTeam[] = defaults.map((d) => {
    const t = rawTeams.find((x) => x.id === d.id);
    if (!t) return d;
    const slots: (string | null)[] = Array(TEAM_SIZE).fill(null);
    const usedInstance = new Set<string>();
    const usedMemory = new Set<string>();
    const rawSlots = Array.isArray(t.slots) ? t.slots : [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const id = rawSlots[i];
      if (typeof id !== 'string') continue;
      const inst = instanceById.get(id);
      if (!inst || usedInstance.has(id) || usedMemory.has(inst.memoryId)) {
        issues.push(`${d.name} の不正な編成枠を空にしました`);
        continue;
      }
      usedInstance.add(id);
      usedMemory.add(inst.memoryId);
      slots[i] = id;
    }
    const name = typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 16) : d.name;
    return { id: d.id, name, slots };
  });
  const activeTeamId = teams.some((t) => t.id === raw.activeTeamId) ? (raw.activeTeamId as string) : teams[0].id;

  // ---- archive
  const ra = isObj(raw.archive) ? raw.archive : {};
  const strings = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : []);
  const discovered = new Set(strings(ra.discoveredMemoryIds));
  for (const m of memories) discovered.add(m.memoryId);
  const archive = { discoveredMemoryIds: [...discovered], readFragmentIds: strings(ra.readFragmentIds) };

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
      teams,
      activeTeamId,
      archive,
      inventory,
      progress: { flags },
      settings,
    },
  };
}
