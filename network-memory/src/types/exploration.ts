import type { Condition } from './condition';
import type { Currency } from './player';
import type { StoryCommand } from './story';

/**
 * WORLD 探索（PHASE 4）のデータ型。
 * WORLD ごとに src/data/areas/*.json にエリアを置く（WORLD を追加しても既存の WORLD のデータは変更不要）。
 * エリアの中の「地点」で、調べる・話す・流出反応への接続・イベントを行う。
 */

export interface Rewards {
  currencies?: Partial<Record<Currency, number>>;
  items?: Record<string, number>;
}

export const POINT_TYPES = ['search', 'talk', 'signal', 'event'] as const;
export type PointType = (typeof POINT_TYPES)[number];

export interface AreaPoint {
  id: string;
  type: PointType;
  name: string;
  description: string;
  /** 表示される条件（満たすまで地点自体が現れない） */
  visible?: Condition[];
  /** 調べる・話すための条件（満たすまで「？」で表示） */
  unlock?: Condition[];
  /** 必要な探索能力（その能力を持つ Memory を所持していること） */
  fieldAbility?: string;
  /** signal: 接続する流出反応 */
  encounterId?: string;
  /** talk / event: 再生するイベント */
  eventId?: string;
  /** talk の相手（名前欄・一覧表示用） */
  npc?: string;
  /** search: 調べた結果の文章 */
  resultText?: string;
  /** search: 一度だけ得られる報酬 */
  rewards?: Rewards;
  /** search: 調べると立つフラグ */
  setFlags?: string[];
  /** search: 存在を発見する Memory */
  discover?: string[];
  /** search: 反応を検出する Memory（MEMORY SYNC へ） */
  detect?: string[];
}

export interface AreaDefinition {
  id: string;
  worldId: string;
  name: string;
  description: string;
  /** 背景 ID（SceneBackground） */
  bg: string;
  /** マップ上の位置（0〜100） */
  pos: { x: number; y: number };
  /** つながっているエリア（同じ WORLD 内） */
  links: string[];
  /** 入るための条件 */
  unlock: Condition[];
  /** true の場合、解放されるまでマップに表示しない */
  hidden?: boolean;
  /** hidden でもこの探索能力があればマップに位置だけ表示する */
  revealedBy?: string;
  /** WORLD に入って最初に着くエリア */
  entry?: boolean;
  points: AreaPoint[];
}

/** 探索中に再生する短いシナリオ（会話・出来事）。命令はストーリーと同じ */
export interface EventDefinition {
  id: string;
  title: string;
  /** 初回のみの報酬 */
  rewards?: Rewards;
  script: StoryCommand[];
}

export interface QuestDefinition {
  id: string;
  worldId: string;
  title: string;
  /** 依頼人（キャラクター ID） */
  giver: string;
  description: string;
  /** 受注できるようになる条件 */
  unlock: Condition[];
  /** 達成条件（すべて満たすと報告できる）。label で表示名を上書きできる */
  objectives: { label: string; cond: Condition }[];
  rewards: Rewards;
  /** 報告時のひとこと */
  completeText?: string;
}
