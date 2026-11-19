import { AFFINITY_ADVANTAGE_RATE, AFFINITY_DISADVANTAGE_RATE, ATTRIBUTE_ADVANTAGE, BATTLE_RULES, STAT_META } from '../constants';
import type { BattleCtx } from './context';
import type { BattleUnit } from './types';
import { STAT_KEYS, type Attribute, type StatKey } from '../../types/memory';
import type { PassiveTrigger, SkillEffect, SkillTarget, StatusId } from '../../types/skill';

/**
 * 効果の適用（ダメージ・回復・状態異常・バフ/デバフ・パッシブ）。
 * スキル・REWRITE・アイテム・パッシブはすべて SkillEffect で表現され、ここで解釈される。
 */

export type Affinity = 'advantage' | 'disadvantage' | 'neutral';

export function affinityOf(ctx: BattleCtx, attackAttr: Attribute, attacker: BattleUnit, defender: BattleUnit): { kind: Affinity; rate: number } {
  if (ctx.hasPassiveSpecial(attacker, 'ignore_affinity') || ctx.hasPassiveSpecial(defender, 'ignore_affinity')) return { kind: 'neutral', rate: 1 };
  if (ATTRIBUTE_ADVANTAGE[attackAttr].includes(defender.attribute)) {
    const bonus = ctx.passiveSpecials(attacker, 'advantage_bonus').reduce((a, b) => a + b, 0);
    return { kind: 'advantage', rate: AFFINITY_ADVANTAGE_RATE + bonus };
  }
  if (ATTRIBUTE_ADVANTAGE[defender.attribute].includes(attackAttr)) return { kind: 'disadvantage', rate: AFFINITY_DISADVANTAGE_RATE };
  return { kind: 'neutral', rate: 1 };
}

/** 同じスキル内の special によるダメージ補正 */
export interface DamageMods {
  bonusVsStatus?: number;
  bonusPerStatus?: number;
  ignoreRes?: number;
}

export function collectDamageMods(effects: SkillEffect[]): DamageMods {
  const mods: DamageMods = {};
  for (const e of effects) {
    if (e.type !== 'special') continue;
    if (e.id === 'bonus_vs_status') mods.bonusVsStatus = e.value ?? 1.5;
    if (e.id === 'bonus_per_status') mods.bonusPerStatus = e.value ?? 0.2;
    if (e.id === 'ignore_res') mods.ignoreRes = e.value ?? 0.5;
  }
  return mods;
}

// ---------------------------------------------------------------- targeting

export function resolveTargets(ctx: BattleCtx, actor: BattleUnit, target: SkillTarget | undefined, primary?: string): BattleUnit[] {
  switch (target ?? 'enemy_single') {
    case 'self':
      return actor.alive ? [actor] : [];
    case 'ally_single': {
      const allies = ctx.allies(actor);
      if (!allies.length) return [];
      return [allies.reduce((lo, u) => (u.hp / u.maxHp < lo.hp / lo.maxHp ? u : lo))];
    }
    case 'ally_all':
      return ctx.allies(actor);
    case 'enemy_all':
      return ctx.opponents(actor);
    case 'enemy_random': {
      const opp = ctx.opponents(actor);
      return opp.length ? [ctx.pick(opp)] : [];
    }
    case 'all':
      return ctx.living();
    case 'enemy_single':
    default: {
      const p = primary ? ctx.state.units.find((u) => u.uid === primary && u.alive) : undefined;
      if (p) return [p];
      const opp = ctx.opponents(actor);
      return opp.length ? [opp[0]] : [];
    }
  }
}

/** 単体攻撃の対象決定（混線中は対象がランダムになる） */
export function chooseSingleTarget(ctx: BattleCtx, actor: BattleUnit, requested?: string): string | undefined {
  if (ctx.hasStatus(actor, 'glitch')) {
    const pool = actor.side === 'player' ? ctx.opponents(actor) : ctx.living().filter((u) => u.uid !== actor.uid);
    if (pool.length) {
      const t = ctx.pick(pool);
      if (requested && t.uid !== requested) ctx.emit('info', `混線！ ${actor.name}の狙いが逸れた`, { actor: actor.uid, target: t.uid });
      return t.uid;
    }
  }
  const opp = ctx.opponents(actor);
  if (requested && opp.some((u) => u.uid === requested)) return requested;
  return opp[0]?.uid;
}

// ---------------------------------------------------------------- damage

export function dealDamage(
  ctx: BattleCtx,
  attacker: BattleUnit,
  defender: BattleUnit,
  scale: StatKey,
  power: number,
  attribute: Attribute,
  mods: DamageMods = {},
): void {
  if (!defender.alive) return;

  // 被弾前のパッシブ（鉄の記憶: 一定確率で無効化）
  for (const chance of nullifyChances(ctx, defender)) {
    if (ctx.chance(chance)) {
      ctx.emit('nullify', `${defender.name}はダメージを無効化した`, { actor: attacker.uid, target: defender.uid });
      return;
    }
  }

  const atkStat = ctx.stat(attacker, scale);
  const defKey: StatKey = scale === 'atk' ? 'def' : 'res';
  const defStat = ctx.stat(defender, defKey) * (1 - (mods.ignoreRes ?? 0));
  const K = BATTLE_RULES.defenseK;
  const base = (atkStat * power * K) / (K + defStat);

  const aff = affinityOf(ctx, attribute, attacker, defender);
  let mult = aff.rate;
  if (attacker.empower) mult *= 1 + attacker.empower.value;
  const statusCount = defender.statuses.length;
  if (statusCount > 0) {
    if (mods.bonusVsStatus) mult *= mods.bonusVsStatus;
    for (const v of ctx.passiveSpecials(attacker, 'status_damage_bonus')) mult *= 1 + v;
  }
  if (mods.bonusPerStatus) mult *= 1 + mods.bonusPerStatus * statusCount;
  const crit = ctx.random() < BATTLE_RULES.critRate;
  if (crit) mult *= BATTLE_RULES.critMultiplier;
  const variance = 1 + (ctx.random() * 2 - 1) * BATTLE_RULES.variance;
  if (defender.defending) mult *= BATTLE_RULES.defendRate;

  const dmg = Math.max(1, Math.round(base * mult * variance));
  defender.hp = Math.max(0, defender.hp - dmg);
  // REWRITE GAUGE: 与えたヒット・受けたダメージで蓄積
  if (attacker.side === 'player') ctx.chargeGauge(BATTLE_RULES.gaugePerHit);
  if (defender.side === 'player') ctx.chargeGauge(Math.round((dmg / defender.maxHp) * BATTLE_RULES.gaugeOnDamageTaken));
  const affText = aff.kind === 'advantage' ? '【属性有利】' : aff.kind === 'disadvantage' ? '【属性不利】' : '';
  ctx.emit('damage', `${crit ? 'CRITICAL! ' : ''}${affText}${defender.name}に ${dmg} のダメージ`, {
    actor: attacker.uid,
    target: defender.uid,
    amount: dmg,
    crit,
    affinity: aff.kind,
  });

  if (defender.hp <= 0) handleLethal(ctx, defender);
  else triggerPassives(ctx, defender, 'on_damaged', attacker);
}

function nullifyChances(ctx: BattleCtx, u: BattleUnit): number[] {
  if (ctx.isSealed(u)) return [];
  const out: number[] = [];
  for (const p of u.passives) {
    const s = ctx.skill(p.skillId);
    if (s?.trigger !== 'on_damaged') continue;
    for (const e of s.effects) if (e.type === 'special' && e.id === 'nullify_damage') out.push(e.chance ?? 0.1);
  }
  return out;
}

export function handleLethal(ctx: BattleCtx, u: BattleUnit): void {
  if (!ctx.isSealed(u) && !u.endureUsed) {
    for (const p of u.passives) {
      const s = ctx.skill(p.skillId);
      if (s?.trigger === 'on_lethal' && s.effects.some((e) => e.type === 'special' && e.id === 'endure_once')) {
        u.endureUsed = true;
        u.hp = 1;
        ctx.emit('endure', `${u.name}は『${s.name}』で踏みとどまった！`, { target: u.uid });
        return;
      }
    }
  }
  u.hp = 0;
  u.alive = false;
  u.defending = false;
  u.statuses = [];
  ctx.state.downCount++;
  if (u.side === 'enemy') ctx.chargeGauge(BATTLE_RULES.gaugeOnEnemyDown);
  ctx.state.queue = ctx.state.queue.filter((id) => id !== u.uid);
  ctx.emit('down', u.side === 'enemy' ? `${u.name}の記録が崩壊した` : `${u.name}は倒れた……`, { target: u.uid });
  for (const other of ctx.living()) {
    if (other.side !== u.side) triggerPassives(ctx, other, 'on_enemy_down');
  }
}

// ---------------------------------------------------------------- heal / status / modifiers

export function heal(ctx: BattleCtx, target: BattleUnit, amount: number, source: string): void {
  if (!target.alive) return;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + Math.max(0, Math.round(amount)));
  const healed = target.hp - before;
  if (healed <= 0) return;
  ctx.emit('heal', `${target.name}のHPが ${healed} 回復${source ? `（${source}）` : ''}`, { target: target.uid, amount: healed });
}

export function addModifier(ctx: BattleCtx, target: BattleUnit, stat: StatKey, value: number, turns: number | undefined, source: string): void {
  if (!target.alive || value === 0) return;
  const t = turns === undefined ? -1 : turns;
  // 同じ出所・同じステータスの効果は上書き（重ね掛けで無限に伸びないようにする）
  target.modifiers = target.modifiers.filter((m) => !(m.source === source && m.stat === stat));
  target.modifiers.push({ stat, value, turns: t, source, ...(t > 0 && ctx.isFresh(target) ? { fresh: true } : {}) });
  const pct = Math.round(Math.abs(value) * 100);
  ctx.emit('modifier', `${target.name}の${STAT_META[stat].label}が ${pct}% ${value > 0 ? '上昇' : '低下'}${t > 0 ? `（${t}ターン）` : ''}`, {
    target: target.uid,
    amount: value,
  });
}

export function tryStatus(ctx: BattleCtx, target: BattleUnit, status: StatusId, chance: number, turns: number): void {
  if (!target.alive) return;
  const label = ctx.statusLabel(status);
  if (target.immuneTurns > 0) {
    ctx.emit('resist', `${target.name}は『${label}』を受け付けない`, { target: target.uid });
    return;
  }
  if (!ctx.chance(chance)) {
    ctx.emit('resist', `${target.name}に『${label}』は効かなかった`, { target: target.uid });
    return;
  }
  const existing = target.statuses.find((s) => s.id === status);
  if (existing) existing.turns = Math.max(existing.turns, turns);
  else target.statuses.push({ id: status, turns, ...(ctx.isFresh(target) ? { fresh: true } : {}) });
  ctx.emit('status', `${target.name}は『${label}』状態になった`, { target: target.uid });
  triggerPassives(ctx, target, 'on_status');
}

function cleanse(ctx: BattleCtx, target: BattleUnit): void {
  if (!target.statuses.length) return;
  target.statuses = [];
  ctx.emit('cleanse', `${target.name}の状態異常が解除された`, { target: target.uid });
}

function dispel(ctx: BattleCtx, target: BattleUnit): void {
  const before = target.modifiers.length + (target.empower ? 1 : 0);
  target.modifiers = target.modifiers.filter((m) => m.value < 0 || m.turns === -1);
  target.empower = null;
  if (target.modifiers.length + 0 < before) ctx.emit('cleanse', `${target.name}の強化が解除された`, { target: target.uid });
}

// ---------------------------------------------------------------- apply effects

export interface EffectSource {
  actor: BattleUnit;
  /** スキルの既定の対象 */
  target: SkillTarget | undefined;
  /** 選択された単体対象 */
  primary?: string;
  /** 攻撃属性 */
  attribute: Attribute;
  /** バフ等の出所（同出所の重ね掛け防止） */
  source: string;
  /** パッシブ由来の on_damaged 等で使う「相手」 */
  counterpart?: BattleUnit;
}

export function applyEffects(ctx: BattleCtx, effects: SkillEffect[], src: EffectSource): void {
  const mods = collectDamageMods(effects);
  const { actor } = src;
  for (const e of effects) {
    if (!actor.alive && e.type !== 'special') break;
    const targets = resolveTargets(ctx, actor, e.target ?? src.target, src.counterpart?.uid ?? src.primary);
    switch (e.type) {
      case 'damage':
        for (const t of targets) {
          for (let h = 0; h < (e.hits ?? 1); h++) {
            if (!t.alive || !actor.alive) break;
            dealDamage(ctx, actor, t, e.scale ?? 'atk', e.power ?? 1, src.attribute, mods);
          }
        }
        break;
      case 'heal':
        for (const t of targets) heal(ctx, t, ctx.stat(actor, e.scale ?? 'tec') * (e.power ?? 1), '');
        break;
      case 'heal_percent':
        for (const t of targets) heal(ctx, t, t.maxHp * (e.value ?? 0), '');
        break;
      case 'buff':
      case 'debuff':
        for (const t of targets) {
          if (!e.stat || e.value === undefined) continue;
          if (e.chance !== undefined && !ctx.chance(e.chance)) continue;
          addModifier(ctx, t, e.stat, e.type === 'buff' ? e.value : -e.value, e.turns, src.source);
        }
        break;
      case 'status':
        for (const t of targets) if (e.status) tryStatus(ctx, t, e.status, e.chance ?? 1, e.turns ?? 1);
        break;
      case 'cleanse':
        for (const t of targets) if (e.chance === undefined || ctx.chance(e.chance)) cleanse(ctx, t);
        break;
      case 'dispel':
        for (const t of targets) dispel(ctx, t);
        break;
      case 'immune':
        for (const t of targets) {
          t.immuneTurns = Math.max(t.immuneTurns, (e.turns ?? 1) + (ctx.isFresh(t) ? 1 : 0));
          ctx.emit('modifier', `${t.name}は状態異常を受け付けなくなった（${e.turns ?? 1}ターン）`, { target: t.uid });
        }
        break;
      case 'empower':
        for (const t of targets) {
          t.empower = { value: e.value ?? 0, turns: (e.turns ?? 1) + (ctx.isFresh(t) ? 1 : 0) };
          ctx.emit('modifier', `${t.name}の与ダメージが ${Math.round((e.value ?? 0) * 100)}% 強化された（${e.turns ?? 1}ターン）`, { target: t.uid });
        }
        break;
      case 'attribute_shift':
        for (const t of targets) {
          if (!e.attribute) continue;
          t.attribute = e.attribute;
          t.attributeTurns = (e.turns ?? 1) + (ctx.isFresh(t) ? 1 : 0);
          ctx.emit('modifier', `${t.name}の属性が ${e.attribute} に変化した（${e.turns ?? 1}ターン）`, { target: t.uid });
        }
        break;
      case 'grant_skill': {
        const s = e.id ? ctx.skill(e.id) : undefined;
        if (s && !actor.skills.some((x) => x.skillId === s.id)) {
          actor.skills.push({ skillId: s.id, sourceMemoryId: null, cooldown: 0 });
          ctx.emit('info', `特殊スキル『${s.name}』が解放された！`, { actor: actor.uid, skillId: s.id });
        }
        break;
      }
      case 'energy_gain':
      case 'sp_gain':
        for (const t of targets) {
          const before = t.energy;
          t.energy = Math.min(t.maxEnergy, t.energy + (e.value ?? 0));
          ctx.emit('heal', `${t.name}の SYNC ENERGY が ${t.energy - before} 回復`, { target: t.uid });
        }
        break;
      case 'special':
        applySpecial(ctx, e, targets, src);
        break;
    }
  }
}

function applySpecial(ctx: BattleCtx, e: SkillEffect, targets: BattleUnit[], src: EffectSource): void {
  switch (e.id) {
    // ダメージ補正・パッシブ照会型（他の箇所で処理）
    case 'bonus_vs_status':
    case 'bonus_per_status':
    case 'ignore_res':
    case 'advantage_bonus':
    case 'ignore_affinity':
    case 'status_damage_bonus':
    case 'endure_once':
    case 'nullify_damage':
    case 'pack_bonus':
    case 'stacking_tec':
      return;
    case 'random_debuff':
      for (const t of targets) {
        const stat = ctx.pick(STAT_KEYS.filter((k) => k !== 'hp'));
        addModifier(ctx, t, stat, -(e.value ?? 0.2), e.turns ?? 2, `${src.source}:${stat}`);
      }
      return;
    case 'random_flux':
      for (const t of ctx.living()) {
        const stat = ctx.pick(STAT_KEYS.filter((k) => k !== 'hp'));
        const v = (ctx.random() < 0.5 ? -1 : 1) * (e.value ?? 0.1);
        addModifier(ctx, t, stat, v, e.turns ?? 1, `${src.source}:flux`);
      }
      return;
    case 'swap_modifiers':
      for (const t of ctx.living()) {
        for (const m of t.modifiers) if (m.turns !== -1) m.value = -m.value;
      }
      ctx.emit('info', 'すべての強化と弱体化が反転した', { actor: src.actor.uid });
      return;
    case 'recollection': {
      const a = src.actor;
      heal(ctx, a, a.maxHp, '');
      a.statuses = [];
      a.modifiers = a.modifiers.filter((m) => m.value > 0 || m.turns === -1);
      for (const t of ctx.opponents(a)) dealDamage(ctx, a, t, 'tec', 2.5, 'VOID');
      return;
    }
    default:
      ctx.emit('info', `記録の一部が解析できない（${e.id ?? 'unknown'}）`, { actor: src.actor.uid });
  }
}

// ---------------------------------------------------------------- passives

/** パッシブの発動。施錠中は発動しない */
export function triggerPassives(ctx: BattleCtx, u: BattleUnit, trigger: PassiveTrigger, counterpart?: BattleUnit): void {
  if (!u.alive || ctx.isSealed(u)) return;
  for (const p of u.passives) {
    const s = ctx.skill(p.skillId);
    if (!s || s.trigger !== trigger) continue;
    // 照会型・専用処理の special のみで構成されるパッシブはここでは何もしない
    const actionable = s.effects.filter((e) => !(e.type === 'special' && ['nullify_damage', 'endure_once'].includes(e.id ?? '')));
    if (!actionable.length) continue;

    if (trigger === 'on_enemy_down') {
      for (const e of actionable) {
        if (e.type === 'special' && e.id === 'stacking_tec' && p.stacks < 3) {
          p.stacks++;
          addModifier(ctx, u, 'tec', (e.value ?? 0.1) * p.stacks, -1, `passive:${s.id}`);
        }
      }
      continue;
    }
    if (trigger === 'on_damaged' && (!counterpart || !counterpart.alive)) continue;
    ctx.emit('info', `${u.name}のパッシブ『${s.name}』が発動`, { actor: u.uid, skillId: s.id });
    applyEffects(ctx, actionable, {
      actor: u,
      target: s.target ?? 'self',
      attribute: s.attribute ?? u.attribute,
      source: `passive:${s.id}`,
      counterpart: trigger === 'on_damaged' ? counterpart : undefined,
    });
  }
}

/** 戦闘開始時: 常時パッシブ（永続バフ）と開始時パッシブを適用する */
export function initPassives(ctx: BattleCtx, u: BattleUnit): void {
  for (const p of u.passives) {
    const s = ctx.skill(p.skillId);
    if (!s) continue;
    if (s.trigger === 'always') {
      for (const e of s.effects) {
        if ((e.type === 'buff' || e.type === 'debuff') && e.stat && e.value !== undefined) {
          addModifier(ctx, u, e.stat, e.type === 'buff' ? e.value : -e.value, -1, `passive:${s.id}`);
        }
        if (e.type === 'special' && e.id === 'pack_bonus') {
          const count = u.equippedAttributes.filter((a) => a === 'ERROR').length;
          if (count > 0) addModifier(ctx, u, 'atk', (e.value ?? 0.05) * count, -1, `passive:${s.id}`);
        }
      }
    }
  }
  triggerPassives(ctx, u, 'battle_start');
}

// ---------------------------------------------------------------- turn end

/** 自分の手番の終了時: 侵食ダメージ、各種持続ターンの経過 */
export function endOwnTurn(ctx: BattleCtx, u: BattleUnit): void {
  if (!u.alive) return;
  if (ctx.hasStatus(u, 'corrupt')) {
    const dmg = Math.max(1, Math.round(u.maxHp * BATTLE_RULES.corruptRate));
    u.hp = Math.max(0, u.hp - dmg);
    ctx.emit('damage', `侵食により${u.name}に ${dmg} のダメージ`, { target: u.uid, amount: dmg, affinity: 'neutral' });
    if (u.hp <= 0) {
      handleLethal(ctx, u);
      if (!u.alive) return;
    }
  }
  const expired: string[] = [];
  u.statuses = u.statuses.filter((s) => {
    if (s.id === 'stun') return true;
    if (s.fresh) {
      s.fresh = false;
      return true;
    }
    s.turns--;
    if (s.turns <= 0) expired.push(ctx.statusLabel(s.id));
    return s.turns > 0;
  });
  u.modifiers = u.modifiers.filter((m) => {
    if (m.turns === -1) return true;
    if (m.fresh) {
      m.fresh = false;
      return true;
    }
    m.turns--;
    return m.turns > 0;
  });
  if (u.immuneTurns > 0) u.immuneTurns--;
  if (u.empower) {
    u.empower.turns--;
    if (u.empower.turns <= 0) u.empower = null;
  }
  if (u.attributeTurns > 0) {
    u.attributeTurns--;
    if (u.attributeTurns === 0 && u.attribute !== u.baseAttribute) {
      u.attribute = u.baseAttribute;
      ctx.emit('info', `${u.name}の属性が ${u.baseAttribute} に戻った`, { target: u.uid });
    }
  }
  if (expired.length) ctx.emit('info', `${u.name}の『${expired.join('・')}』が解除された`, { target: u.uid });
}
