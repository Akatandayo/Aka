import type { SkillEffect, SkillTarget } from './skill';

/** アイテム（ITEM コマンド・報酬）。効果はスキルと同じ SkillEffect で表現する */
export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  kind: 'consumable' | 'material' | 'key';
  /** 戦闘中に ITEM コマンドで使用できるか */
  battle: boolean;
  target?: SkillTarget;
  effects: SkillEffect[];
  /** 所持上限 */
  maxStack: number;
}
