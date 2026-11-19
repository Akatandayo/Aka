import { BATTLE_RULES, STATUS_META } from '../constants';
import type { GameData } from '../data/gameData';
import { nextRandom } from './rng';
import type { BattleEvent, BattleEventKind, BattleState, BattleUnit, UnitSnapshot } from './types';
import type { StatKey } from '../../types/memory';
import type { SkillDefinition, StatusId } from '../../types/skill';

/** 1 ステップ（startBattle / submitCommand）の処理中だけ存在する作業用コンテキスト */
export class BattleCtx {
  readonly events: BattleEvent[] = [];

  constructor(
    readonly state: BattleState,
    readonly data: GameData,
  ) {}

  // ---------------------------------------------------------------- random

  random(): number {
    const [v, next] = nextRandom(this.state.rngState);
    this.state.rngState = next;
    return v;
  }

  chance(p: number): boolean {
    if (p >= 1) return true;
    if (p <= 0) return false;
    return this.random() < p;
  }

  pick<T>(list: T[]): T {
    return list[Math.floor(this.random() * list.length) % list.length];
  }

  weighted<T extends { weight: number }>(list: T[]): T {
    const total = list.reduce((s, x) => s + x.weight, 0);
    let r = this.random() * total;
    for (const x of list) {
      r -= x.weight;
      if (r < 0) return x;
    }
    return list[list.length - 1];
  }

  // ---------------------------------------------------------------- units

  unit(uid: string): BattleUnit {
    const u = this.state.units.find((x) => x.uid === uid);
    if (!u) throw new Error(`unknown unit ${uid}`);
    return u;
  }

  get player(): BattleUnit {
    return this.state.units.find((u) => u.side === 'player')!;
  }

  living(side?: BattleUnit['side']): BattleUnit[] {
    return this.state.units.filter((u) => u.alive && (!side || u.side === side));
  }

  opponents(u: BattleUnit): BattleUnit[] {
    return this.living(u.side === 'player' ? 'enemy' : 'player');
  }

  allies(u: BattleUnit): BattleUnit[] {
    return this.living(u.side);
  }

  skill(id: string): SkillDefinition | undefined {
    return this.data.skillById.get(id);
  }

  // ---------------------------------------------------------------- stats & states

  hasStatus(u: BattleUnit, id: StatusId): boolean {
    return u.statuses.some((s) => s.id === id);
  }

  isSealed(u: BattleUnit): boolean {
    return this.hasStatus(u, 'seal');
  }

  /** 有効なパッシブの special 値を列挙（施錠中は無効） */
  passiveSpecials(u: BattleUnit, id: string): number[] {
    if (this.isSealed(u)) return [];
    const out: number[] = [];
    for (const p of u.passives) {
      const s = this.skill(p.skillId);
      for (const e of s?.effects ?? []) if (e.type === 'special' && e.id === id) out.push(e.value ?? 0);
    }
    return out;
  }

  hasPassiveSpecial(u: BattleUnit, id: string): boolean {
    return this.passiveSpecials(u, id).length > 0;
  }

  /** バフ・デバフを反映したステータス */
  stat(u: BattleUnit, k: StatKey): number {
    const sealed = this.isSealed(u);
    let sum = 0;
    for (const m of u.modifiers) {
      if (m.stat !== k) continue;
      if (sealed && m.source.startsWith('passive:')) continue;
      sum += m.value;
    }
    const mult = Math.min(BATTLE_RULES.modifierCeil, Math.max(BATTLE_RULES.modifierFloor, 1 + sum));
    return Math.max(1, Math.round(u.stats[k] * mult));
  }

  /** 手番中のユニット自身への付与かどうか（その手番の終了時に持続ターンを減らさない） */
  isFresh(target: BattleUnit): boolean {
    return this.state.activeUid === target.uid;
  }

  statusLabel(id: StatusId): string {
    return STATUS_META[id].label;
  }

  // ---------------------------------------------------------------- events

  snapshot(): UnitSnapshot[] {
    return this.state.units.map((u) => ({
      uid: u.uid,
      hp: u.hp,
      maxHp: u.maxHp,
      sp: u.sp,
      maxSp: u.maxSp,
      alive: u.alive,
      defending: u.defending,
      attribute: u.attribute,
      statuses: u.statuses.map((s) => ({ id: s.id, turns: s.turns })),
      modifiers: u.modifiers.map((m) => ({ stat: m.stat, value: m.value, turns: m.turns })),
      empowered: Boolean(u.empower),
    }));
  }

  emit(kind: BattleEventKind, text: string, extra: Omit<Partial<BattleEvent>, 'kind' | 'text' | 'snapshot'> = {}): void {
    this.events.push({ kind, text, ...extra, snapshot: this.snapshot() });
  }
}
