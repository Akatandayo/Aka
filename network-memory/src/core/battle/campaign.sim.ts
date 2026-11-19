import { gameData } from '../data/gameData';
import { analyzeLoadout, playerPower } from '../player/character';
import { autoLoadout, getActiveLoadout } from '../player/loadout';
import { createNewSave } from '../player/newGame';
import { checkSyncConditions, syncMemory } from '../player/sync';
import type { PlayerSave } from '../../types/player';
import { chooseAutoCommand } from './autoplay';
import { startBattle, submitCommand } from './engine';
import { applyBattleOutcome, outcomeFromState } from './result';
import { createBattleSetup } from './setup';

/**
 * 1 周分のキャンペーン（ENC-001〜008）をオート戦闘で進めるシミュレーション。
 * バランス調整用。テストからも呼び出す。
 */
export interface CampaignLog {
  encounterId: string;
  attempts: number;
  level: number;
  power: number;
  rounds: number;
  hpLeft: number;
}

export function simulateCampaign(seedBase: number, maxAttempts = 15): { logs: CampaignLog[]; save: PlayerSave; cleared: boolean } {
  const at = '2026-11-20T00:00:00.000Z';
  let save = createNewSave('SIM', gameData, at);
  const logs: CampaignLog[] = [];
  let seed = seedBase;
  for (const enc of gameData.encounters) {
    let attempts = 0;
    let won = false;
    let rounds = 0;
    let hpLeft = 0;
    while (!won && attempts < maxAttempts) {
      attempts++;
      const s = createBattleSetup(save, gameData, enc.id, seed++);
      if (!s.ok) throw new Error(s.error);
      let step = startBattle(s.setup, gameData);
      while (step.state.phase === 'awaiting_input') step = submitCommand(step.state, chooseAutoCommand(step.state, gameData), gameData);
      const outcome = outcomeFromState(step.state, s.loadoutId);
      won = outcome.result === 'victory';
      rounds = outcome.rounds;
      const p = step.state.units.find((u) => u.side === 'player')!;
      hpLeft = Math.round((p.hp / p.maxHp) * 100);
      save = applyBattleOutcome(save, gameData, outcome, at).save;
      // 同期可能になった Memory を同期し、装備を組み直す
      for (const id of [...save.archive.pendingSyncIds]) {
        if (checkSyncConditions(save, gameData, id).ok) {
          const r = syncMemory(save, gameData, id, at);
          if (r.ok) save = r.save;
        }
      }
      const a = autoLoadout(save, gameData, save.activeLoadoutId);
      if (a.ok) save = a.save;
    }
    logs.push({
      encounterId: enc.id,
      attempts,
      level: save.profile.level,
      power: playerPower(analyzeLoadout(save, gameData, getActiveLoadout(save))),
      rounds,
      hpLeft,
    });
    if (!won) return { logs, save, cleared: false };
  }
  return { logs, save, cleared: true };
}
