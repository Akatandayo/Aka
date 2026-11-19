import type { GameData } from '../data/gameData';
import { playerUnit, rewriteAvailability, skillAvailability, usableItems } from './engine';
import type { BattleCommand, BattleState, BattleUnit } from './types';
import type { SkillDefinition } from '../../types/skill';

/**
 * オート戦闘（AUTO ボタン・バランス検証用）の行動選択。
 * 単純な貪欲方針: 危険なら回復 → REWRITE → 期待ダメージ最大の行動。
 */

function damageScore(skill: Pick<SkillDefinition, 'effects' | 'target'>, p: BattleUnit, enemyCount: number): number {
  let score = 0;
  for (const e of skill.effects) {
    if (e.type !== 'damage') continue;
    const targets = (e.target ?? skill.target) === 'enemy_all' || (e.target ?? skill.target) === 'all' ? enemyCount : 1;
    score += p.stats[e.scale ?? 'atk'] * (e.power ?? 1) * (e.hits ?? 1) * targets;
  }
  return score;
}

export function chooseAutoCommand(state: BattleState, data: GameData): BattleCommand {
  const p = playerUnit(state);
  const enemies = state.units.filter((u) => u.side === 'enemy' && u.alive).sort((a, b) => a.hp - b.hp);
  const target = enemies[0]?.uid;
  const hpRate = p.hp / p.maxHp;
  const skills = skillAvailability(state, data).filter((s) => s.usable);
  const items = usableItems(state, data);

  if (hpRate < 0.35) {
    const healSkill = skills.find((s) => s.skill.effects.some((e) => e.type === 'heal' || e.type === 'heal_percent'));
    if (healSkill) return { type: 'skill', skillId: healSkill.skill.id };
    const patch = items.find((i) => i.item.effects.some((e) => e.type === 'heal_percent'));
    if (patch) return { type: 'item', itemId: patch.item.id };
  }
  if (p.statuses.some((s) => s.id === 'corrupt' || s.id === 'silence') && hpRate < 0.7) {
    const kit = items.find((i) => i.item.effects.some((e) => e.type === 'cleanse'));
    if (kit) return { type: 'item', itemId: kit.item.id };
  }
  const rw = rewriteAvailability(state, data);
  if (rw.usable) return { type: 'rewrite', target };

  let best: BattleCommand = { type: 'attack', target };
  let bestScore = p.stats[p.attack.scale] * p.attack.power * p.attack.hits;
  for (const s of skills) {
    let score = damageScore(s.skill, p, enemies.length);
    // 補助スキルは序盤に一度だけ価値を持たせる
    if (score === 0 && state.round <= 2 && !p.modifiers.some((m) => m.source === `skill:${s.skill.id}`)) {
      score = bestScore * 0.9;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { type: 'skill', skillId: s.skill.id, target };
    }
  }
  if (best.type === 'attack' && p.sp < 25 && hpRate < 0.5) return { type: 'defend' };
  return best;
}
