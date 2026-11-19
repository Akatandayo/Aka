import type { Condition } from './condition';
import type { Currency } from './player';

/**
 * STORY ENGINE（GDD Ver.3 §8）のデータ型。
 * シナリオはコードに埋め込まず、src/data/story/*.json の命令列として記述する。
 */

/** 登場人物（NPC） */
export interface CharacterDefinition {
  id: string;
  name: string;
  reading?: string;
  /** 肩書き・所属 */
  role: string;
  age?: number;
  origin?: string;
  /** テーマ色（名前欄・立ち絵の差し色） */
  color: string;
  hair?: string;
  eyes?: string;
  profile: string;
  abilities?: { name: string; description: string }[];
  /** 立ち絵の表情 ID 一覧（画像が無い場合は手続き生成） */
  expressions: string[];
  /** 表情 ID → 画像パス（省略時は手続き生成の立ち絵） */
  portraits?: Record<string, string>;
}

export type StagePosition = 'left' | 'center' | 'right';
export type StoryFx = 'fade-out' | 'fade-in' | 'shake' | 'glitch' | 'flash' | 'noise';

export interface StoryChoiceOption {
  value: string;
  text: string;
  /** 選んだら移動するラベル */
  goto?: string;
  /** 選んだら立てるフラグ */
  set?: Record<string, boolean | number | string>;
}

export type StoryCommand =
  /** 背景（fade: フェード切替） */
  | { t: 'bg'; id: string; fx?: 'fade' | 'cut' }
  /** BGM（null で停止） */
  | { t: 'bgm'; id: string | null }
  | { t: 'se'; id: string }
  /** 立ち絵を表示 */
  | { t: 'show'; char: string; pos?: StagePosition; expr?: string }
  | { t: 'hide'; char: string }
  /** 台詞（char の表情を expr に変える） */
  | { t: 'say'; char: string; expr?: string; text: string }
  /** 地の文 */
  | { t: 'narr'; text: string }
  /** 章タイトル等のカード */
  | { t: 'title'; text: string; sub?: string }
  /** 画面演出 */
  | { t: 'fx'; type: StoryFx; ms?: number }
  | { t: 'choice'; id: string; options: StoryChoiceOption[] }
  | { t: 'label'; id: string }
  | { t: 'goto'; label: string }
  /** 条件分岐（所持 Memory による特殊会話など） */
  | { t: 'if'; cond: Condition[]; goto: string; else?: string }
  | { t: 'set'; flag: string; value: boolean | number | string }
  /** Memory の反応を検出する（章の終了後に MEMORY SYNC へ） */
  | { t: 'detect'; memoryId: string }
  | { t: 'wait'; ms: number }
  | { t: 'end' };

export interface StoryChapter {
  id: string;
  order: number;
  /** 'PROLOGUE' / 'CHAPTER 1' など */
  label: string;
  title: string;
  summary: string;
  unlock: Condition[];
  /** クリア時の報酬 */
  rewards?: { currencies?: Partial<Record<Currency, number>>; items?: Record<string, number> };
  script: StoryCommand[];
}
