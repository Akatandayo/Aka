import { BATTLE_RULES } from '../constants';
import type { GameData } from '../data/gameData';
import { BattleCtx } from './context';
import { applyEffects, chooseSingleTarget, dealDamage, endOwnTurn, initPassives, triggerPassives } from './effects';
import type { BattleCommand, BattleSetup, BattleState, BattleUnit, StepResult } from './types';
import type { EnemyAiRule } from '../../types/enemy';
import type { SkillDefinition } from '../../types/skill';

/**
 * Battle Engine（GDD Ver.2 §7）
 *
 * - 主人公 1 人 vs 敵（最大 3 体）のターン制コマンドバトル
 * - 毎ラウンド SPD 順に行動（同速はシード乱数で決定）
 * - コマンド: ATTACK / DEFEND / MEMORY SKILL / ITEM / REWRITE（+ 撤退）
 * - UI から完全に独立。startBattle / submitCommand は新しい state とイベント列を返す純粋関数
 * - 同じ setup（シード含む）と同じコマンド列からは常に同じ結果になる（replayBattle）
 */

// ---------------------------------------------------------------- public API

export function startBattle(setup: BattleSetup, data: GameData): StepResult {
  const units = [structuredClone(setup.player), ...setup.enemies.slice(0, BATTLE_RULES.maxEnemies).map((e) => structuredClone(e))];
  const state: BattleState = {
    engineVersion: 1,
    encounterId: setup.encounterId,
    seed: setup.seed,
    rngState: setup.seed | 0,
    round: 0,
    phase: 'running',
    activeUid: null,
    units,
    queue: [],
    rewrite: { skillId: setup.rewrite.skillId, memoryId: setup.rewrite.memoryId, used: false },
    items: { ...setup.items },
    itemsUsed: {},
    downCount: 0,
    commands: [],
    endReason: null,
  };
  const ctx = new BattleCtx(state, data);
  const enemies = units.filter((u) => u.side === 'enemy');
  ctx.emit('start', `流出反応に接続——${enemies.map((e) => e.name).join('、')}が現れた！`);
  for (const u of units) initPassives(ctx, u);
  beginRound(ctx);
  runUntilInput(ctx);
  return { state, events: ctx.events };
}

export function submitCommand(prev: BattleState, command: BattleCommand, data: GameData): StepResult {
  if (prev.phase !== 'awaiting_input') throw new Error('入力を受け付けていません');
  const check = validateCommand(prev, command, data);
  if (!check.ok) throw new Error(check.error);

  const state = structuredClone(prev);
  state.commands.push(command);
  const ctx = new BattleCtx(state, data);
  const player = ctx.player;
  state.phase = 'running';

  if (command.type === 'retreat') {
    state.phase = 'retreat';
    state.endReason = 'retreat';
    ctx.emit('end', `${player.name}は接続を切断し、撤退した`);
    return { state, events: ctx.events };
  }

  executePlayerCommand(ctx, player, command);
  if (player.alive) endOwnTurn(ctx, player);
  state.activeUid = null;
  runUntilInput(ctx);
  return { state, events: ctx.events };
}

/** シードとコマンド列から戦闘を再現する（サーバー側検証・リプレイ用） */
export function replayBattle(setup: BattleSetup, commands: BattleCommand[], data: GameData): StepResult {
  let step = startBattle(setup, data);
  const events = [...step.events];
  for (const c of commands) {
    if (step.state.phase !== 'awaiting_input') break;
    step = submitCommand(step.state, c, data);
    events.push(...step.events);
  }
  return { state: step.state, events };
}

// ---------------------------------------------------------------- command availability

export interface SkillAvailability {
  skill: SkillDefinition;
  sourceMemoryId: string | null;
  cooldown: number;
  cost: number;
  usable: boolean;
  reason: string | null;
}

export interface RewriteAvailability {
  skill: SkillDefinition | null;
  usable: boolean;
  reason: string | null;
}

export function playerUnit(state: BattleState): BattleUnit {
  return state.units.find((u) => u.side === 'player')!;
}

export function skillAvailability(state: BattleState, data: GameData): SkillAvailability[] {
  const p = playerUnit(state);
  const silenced = p.statuses.some((s) => s.id === 'silence');
  return p.skills.flatMap((slot) => {
    const skill = data.skillById.get(slot.skillId);
    if (!skill) return [];
    const cost = skill.cost ?? 0;
    let reason: string | null = null;
    if (silenced) reason = '沈黙中';
    else if (slot.cooldown > 0) reason = `CT ${slot.cooldown}`;
    else if (p.sp < cost) reason = 'SP不足';
    return [{ skill, sourceMemoryId: slot.sourceMemoryId, cooldown: slot.cooldown, cost, usable: reason === null, reason }];
  });
}

export function rewriteAvailability(state: BattleState, data: GameData): RewriteAvailability {
  const skill = state.rewrite.skillId ? (data.skillById.get(state.rewrite.skillId) ?? null) : null;
  if (!skill) return { skill: null, usable: false, reason: 'メインMemoryにREWRITEがありません' };
  if (state.rewrite.used) return { skill, usable: false, reason: '使用済み' };
  const p = playerUnit(state);
  if (p.statuses.some((s) => s.id === 'silence')) return { skill, usable: false, reason: '沈黙中' };
  const c = skill.condition;
  let met = false;
  switch (c?.type) {
    case 'turn_at_least':
      met = state.round >= (c.value ?? 1);
      break;
    case 'self_hp_below':
      met = p.hp / p.maxHp <= (c.value ?? 0.5);
      break;
    case 'enemies_with_status_at_least':
      met = state.units.filter((u) => u.side === 'enemy' && u.alive && u.statuses.length > 0).length >= (c.value ?? 1);
      break;
    case 'units_down_at_least':
      met = state.downCount >= (c.value ?? 1);
      break;
    default:
      met = false;
  }
  return { skill, usable: met, reason: met ? null : `条件: ${skill.conditionText ?? '不明'}` };
}

export function usableItems(state: BattleState, data: GameData) {
  return Object.entries(state.items)
    .filter(([, n]) => n > 0)
    .flatMap(([id, n]) => {
      const item = data.itemById.get(id);
      return item && item.battle ? [{ item, count: n }] : [];
    });
}

function validateCommand(state: BattleState, cmd: BattleCommand, data: GameData): { ok: true } | { ok: false; error: string } {
  switch (cmd.type) {
    case 'attack':
    case 'defend':
    case 'retreat':
      return { ok: true };
    case 'skill': {
      const a = skillAvailability(state, data).find((s) => s.skill.id === cmd.skillId);
      if (!a) return { ok: false, error: 'そのスキルは装備されていません' };
      if (!a.usable) return { ok: false, error: `スキルを使用できません（${a.reason}）` };
      return { ok: true };
    }
    case 'item': {
      const item = data.itemById.get(cmd.itemId);
      if (!item || !item.battle) return { ok: false, error: '戦闘で使えないアイテムです' };
      if ((state.items[cmd.itemId] ?? 0) <= 0) return { ok: false, error: 'アイテムを所持していません' };
      return { ok: true };
    }
    case 'rewrite': {
      const r = rewriteAvailability(state, data);
      return r.usable ? { ok: true } : { ok: false, error: `REWRITEを発動できません（${r.reason}）` };
    }
  }
}

// ---------------------------------------------------------------- flow

function beginRound(ctx: BattleCtx): void {
  const s = ctx.state;
  s.round++;
  if (s.round > BATTLE_RULES.maxRounds) {
    s.phase = 'defeat';
    s.endReason = 'timeout';
    ctx.emit('end', '接続時間の上限に達した。流出反応を見失った……');
    return;
  }
  ctx.emit('round', `— ROUND ${s.round} —`);
  for (const u of ctx.living()) triggerPassives(ctx, u, 'turn_start');
  // SPD 順（同速は乱数）
  const order = ctx.living().map((u) => ({ uid: u.uid, key: ctx.stat(u, 'spd') + ctx.random() * 0.5 }));
  order.sort((a, b) => b.key - a.key);
  s.queue = order.map((o) => o.uid);
}

function checkEnd(ctx: BattleCtx): boolean {
  const s = ctx.state;
  if (s.phase === 'victory' || s.phase === 'defeat' || s.phase === 'retreat') return true;
  if (!ctx.player.alive) {
    s.phase = 'defeat';
    s.endReason = 'down';
    ctx.emit('end', 'DEFEAT —— 記録の同期が途切れた');
    return true;
  }
  if (ctx.living('enemy').length === 0) {
    s.phase = 'victory';
    s.endReason = 'clear';
    ctx.emit('end', 'VICTORY —— 流出反応を鎮静化した');
    return true;
  }
  return false;
}

function runUntilInput(ctx: BattleCtx): void {
  const s = ctx.state;
  for (let guard = 0; guard < 1000; guard++) {
    if (checkEnd(ctx)) return;
    if (s.queue.length === 0) {
      beginRound(ctx);
      continue;
    }
    const uid = s.queue.shift()!;
    const u = ctx.unit(uid);
    if (!u.alive) continue;
    s.activeUid = uid;
    u.defending = false;

    if (u.side === 'player') {
      u.sp = Math.min(u.maxSp, u.sp + BATTLE_RULES.spRegen);
    }
    // 停止: この手番をスキップ（停止は消費される）
    const stun = u.statuses.find((x) => x.id === 'stun');
    if (stun) {
      u.statuses = u.statuses.filter((x) => x !== stun);
      ctx.emit('skip', `${u.name}は停止していて動けない`, { actor: u.uid });
      endOwnTurn(ctx, u);
      s.activeUid = null;
      continue;
    }
    if (u.side === 'player') {
      s.phase = 'awaiting_input';
      return;
    }
    enemyAct(ctx, u);
    endOwnTurn(ctx, u);
    s.activeUid = null;
  }
  throw new Error('battle loop guard exceeded');
}

function tickCooldowns(u: BattleUnit, used?: { skillId: string; cooldown: number }): void {
  for (const slot of u.skills) if (slot.cooldown > 0) slot.cooldown--;
  if (used) {
    const slot = u.skills.find((x) => x.skillId === used.skillId);
    if (slot) slot.cooldown = used.cooldown;
  }
}

function performAttack(ctx: BattleCtx, u: BattleUnit, requested?: string): void {
  const target = chooseSingleTarget(ctx, u, requested);
  ctx.emit('action', `${u.name}の${u.attack.name}！`, { actor: u.uid, target });
  if (!target) return;
  const t = ctx.unit(target);
  for (let h = 0; h < u.attack.hits; h++) {
    if (!t.alive || !u.alive) break;
    dealDamage(ctx, u, t, u.attack.scale, u.attack.power, u.attribute);
  }
}

function performSkill(ctx: BattleCtx, u: BattleUnit, skill: SkillDefinition, requested?: string, label = ''): void {
  const single = !skill.target || skill.target === 'enemy_single';
  const primary = single ? chooseSingleTarget(ctx, u, requested) : requested;
  ctx.emit('action', `${u.name}の${label}『${skill.name}』！`, { actor: u.uid, target: primary, skillId: skill.id });
  applyEffects(ctx, skill.effects, {
    actor: u,
    target: skill.target,
    primary,
    attribute: skill.attribute ?? u.attribute,
    source: `skill:${skill.id}`,
  });
}

function executePlayerCommand(ctx: BattleCtx, p: BattleUnit, cmd: BattleCommand): void {
  const s = ctx.state;
  switch (cmd.type) {
    case 'attack':
      performAttack(ctx, p, cmd.target);
      tickCooldowns(p);
      return;
    case 'defend':
      p.defending = true;
      p.sp = Math.min(p.maxSp, p.sp + BATTLE_RULES.spDefendBonus);
      ctx.emit('action', `${p.name}は防御態勢をとった（SP +${BATTLE_RULES.spDefendBonus}）`, { actor: p.uid });
      tickCooldowns(p);
      return;
    case 'skill': {
      const skill = ctx.skill(cmd.skillId)!;
      p.sp -= skill.cost ?? 0;
      performSkill(ctx, p, skill, cmd.target, 'MEMORY SKILL ');
      tickCooldowns(p, { skillId: skill.id, cooldown: skill.cooldown ?? 0 });
      return;
    }
    case 'item': {
      const item = ctx.data.itemById.get(cmd.itemId)!;
      s.items[item.id] = (s.items[item.id] ?? 0) - 1;
      s.itemsUsed[item.id] = (s.itemsUsed[item.id] ?? 0) + 1;
      ctx.emit('action', `${p.name}は${item.name}を使った`, { actor: p.uid });
      applyEffects(ctx, item.effects, { actor: p, target: item.target ?? 'self', primary: cmd.target, attribute: p.attribute, source: `item:${item.id}` });
      tickCooldowns(p);
      return;
    }
    case 'rewrite': {
      const skill = ctx.skill(s.rewrite.skillId!)!;
      s.rewrite.used = true;
      ctx.emit('rewrite', `REWRITE —— ${skill.name}`, { actor: p.uid, skillId: skill.id });
      const single = skill.target === 'enemy_single';
      const primary = single ? chooseSingleTarget(ctx, p, cmd.target) : cmd.target;
      applyEffects(ctx, skill.effects, { actor: p, target: skill.target, primary, attribute: skill.attribute ?? p.attribute, source: `rewrite:${skill.id}` });
      tickCooldowns(p);
      return;
    }
    case 'retreat':
      return;
  }
}

// ---------------------------------------------------------------- enemy AI

function aiConditionMet(ctx: BattleCtx, u: BattleUnit, rule: EnemyAiRule): boolean {
  const w = rule.when;
  if (!w) return true;
  switch (w.type) {
    case 'hp_below':
      return u.hp / u.maxHp <= w.value;
    case 'hp_above':
      return u.hp / u.maxHp > w.value;
    case 'turn_at_least':
      return ctx.state.round >= w.value;
  }
}

function enemyAct(ctx: BattleCtx, u: BattleUnit): void {
  const silenced = ctx.hasStatus(u, 'silence');
  const candidates = u.ai.filter((rule) => {
    if (!aiConditionMet(ctx, u, rule)) return false;
    if (rule.action === 'attack') return true;
    if (silenced) return false;
    const slot = u.skills.find((s) => s.skillId === rule.action);
    return Boolean(slot && slot.cooldown === 0);
  });
  const rule = candidates.length ? ctx.weighted(candidates) : { action: 'attack', weight: 1 };
  if (rule.action === 'attack') {
    performAttack(ctx, u);
    tickCooldowns(u);
    return;
  }
  const skill = ctx.skill(rule.action);
  if (!skill) {
    performAttack(ctx, u);
    tickCooldowns(u);
    return;
  }
  performSkill(ctx, u, skill);
  tickCooldowns(u, { skillId: skill.id, cooldown: skill.cooldown ?? 0 });
}
