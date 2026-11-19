import type { EnemyAiRule } from '../../types/enemy';
import type { Attribute, AttackStyle, StatBlock, StatKey } from '../../types/memory';
import type { StatusId } from '../../types/skill';

/**
 * Battle Engine の型。
 * BattleState は JSON 化可能（関数・クラスを含まない）に保つ。
 * → シード + コマンド列から完全に再現でき、PHASE 5 でサーバー側の再計算・検証に使える。
 */

export type Side = 'player' | 'enemy';

export interface Modifier {
  stat: StatKey;
  /** +0.2 = 20% 上昇 / -0.2 = 20% 低下 */
  value: number;
  /** 残りターン（-1 = 永続） */
  turns: number;
  source: string;
  /** 自分の手番中に付与された（その手番の終了時には減らさない） */
  fresh?: boolean;
}

export interface StatusState {
  id: StatusId;
  turns: number;
  fresh?: boolean;
}

export interface SkillSlot {
  skillId: string;
  /** 由来 Memory（REWRITE で解放されたスキルなどは null） */
  sourceMemoryId: string | null;
  cooldown: number;
}

export interface PassiveSlot {
  skillId: string;
  sourceMemoryId: string | null;
  stacks: number;
}

export interface BattleUnit {
  uid: string;
  side: Side;
  name: string;
  /** 敵 ID / 'PLAYER' */
  refId: string;
  level: number;
  attribute: Attribute;
  baseAttribute: Attribute;
  attributeTurns: number;
  stats: StatBlock;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  attack: AttackStyle;
  skills: SkillSlot[];
  passives: PassiveSlot[];
  modifiers: Modifier[];
  statuses: StatusState[];
  defending: boolean;
  immuneTurns: number;
  empower: { value: number; turns: number } | null;
  endureUsed: boolean;
  alive: boolean;
  boss: boolean;
  ai: EnemyAiRule[];
  /** 装備中 Memory の属性（パッシブ判定用） */
  equippedAttributes: Attribute[];
}

export type BattlePhase = 'running' | 'awaiting_input' | 'victory' | 'defeat' | 'retreat';

export type BattleCommand =
  | { type: 'attack'; target?: string }
  | { type: 'defend' }
  | { type: 'skill'; skillId: string; target?: string }
  | { type: 'item'; itemId: string; target?: string }
  | { type: 'rewrite'; target?: string }
  | { type: 'retreat' };

export interface BattleState {
  engineVersion: 1;
  encounterId: string;
  seed: number;
  rngState: number;
  round: number;
  phase: BattlePhase;
  /** 現在手番のユニット */
  activeUid: string | null;
  units: BattleUnit[];
  /** このラウンドで未行動のユニット（SPD 順） */
  queue: string[];
  rewrite: { skillId: string | null; memoryId: string | null; used: boolean };
  items: Record<string, number>;
  itemsUsed: Record<string, number>;
  downCount: number;
  commands: BattleCommand[];
  /** 'timeout' など終了理由 */
  endReason: string | null;
}

export interface UnitSnapshot {
  uid: string;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  alive: boolean;
  defending: boolean;
  attribute: Attribute;
  statuses: { id: StatusId; turns: number }[];
  modifiers: { stat: StatKey; value: number; turns: number }[];
  empowered: boolean;
}

export type BattleEventKind =
  | 'start'
  | 'round'
  | 'action'
  | 'damage'
  | 'heal'
  | 'nullify'
  | 'status'
  | 'resist'
  | 'modifier'
  | 'cleanse'
  | 'down'
  | 'endure'
  | 'skip'
  | 'rewrite'
  | 'info'
  | 'end';

export interface BattleEvent {
  kind: BattleEventKind;
  text: string;
  actor?: string;
  target?: string;
  amount?: number;
  crit?: boolean;
  affinity?: 'advantage' | 'disadvantage' | 'neutral';
  skillId?: string;
  /** 各イベント直後のユニット状態（UI の段階的な再生用） */
  snapshot: UnitSnapshot[];
}

export interface StepResult {
  state: BattleState;
  events: BattleEvent[];
}

export interface BattleSetup {
  encounterId: string;
  seed: number;
  player: BattleUnit;
  enemies: BattleUnit[];
  rewrite: { skillId: string | null; memoryId: string | null };
  items: Record<string, number>;
}
