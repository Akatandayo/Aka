import type { Route } from './router';

/**
 * LOBBY から遷移するメインメニューの定義。
 * 各画面は screens/ 以下の独立したコンポーネントとして実装する。
 * status が 'planned' の画面は「未実装」と明示した案内画面を表示する（動作しているように見せない）。
 */
export const MENU_SCREEN_IDS = ['STORY', 'WORLD', 'MEMORY', 'ARCHIVE', 'BATTLE', 'SHOP', 'PROFILE', 'SETTINGS'] as const;
export type MenuScreenId = (typeof MENU_SCREEN_IDS)[number];

export interface MenuEntry {
  id: MenuScreenId;
  code: string;
  ja: string;
  summary: string;
  status: 'available' | 'planned';
  /** 実装（予定）フェーズ */
  phase: number;
  /** 未実装画面で表示する予定機能 */
  plannedFeatures?: string[];
  route: Route;
}

export const MENU: MenuEntry[] = [
  {
    id: 'STORY',
    code: '01',
    ja: 'ストーリー',
    summary: '流出事件の真相を追うメインストーリー',
    status: 'planned',
    phase: 3,
    plannedFeatures: [
      'ノベル形式の会話エンジン（背景・立ち絵・表情差分・名前表示）',
      'テキスト速度調整・LOG・シナリオセーブ',
      'BGM / SE・フェード・グリッチ・画面揺れ演出',
      '選択肢による分岐、所持Memoryによる特殊会話',
    ],
    route: { name: 'planned', screen: 'STORY' },
  },
  {
    id: 'WORLD',
    code: '02',
    ja: 'ワールド',
    summary: 'Network各地の世界を探索する',
    status: 'planned',
    phase: 4,
    plannedFeatures: [
      'WORLD-001 NULL CITY 〜 WORLD-005 UNKNOWN の探索エリア',
      'メイン/サブクエスト・イベント・敵・ボス',
      'Memory入手ポイント・解放条件・クリア報酬',
      'ストーリー進行や所持Memoryで変化するイベント',
    ],
    route: { name: 'planned', screen: 'WORLD' },
  },
  {
    id: 'MEMORY',
    code: '03',
    ja: 'メモリー',
    summary: '所持Memoryの確認・検索・編成',
    status: 'available',
    phase: 1,
    route: { name: 'memory', tab: 'list' },
  },
  {
    id: 'ARCHIVE',
    code: '04',
    ja: 'アーカイブ',
    summary: '発見した記録の図鑑',
    status: 'planned',
    phase: 3,
    plannedFeatures: [
      'Memory・人物・世界・出来事・用語の図鑑',
      '発見済み／未発見の記録の管理',
      '関連Memoryの発見による追加情報の解放',
    ],
    route: { name: 'planned', screen: 'ARCHIVE' },
  },
  {
    id: 'BATTLE',
    code: '05',
    ja: 'バトル',
    summary: 'ターン制コマンドバトル',
    status: 'planned',
    phase: 2,
    plannedFeatures: [
      '最大3体 vs 3体のターン制コマンドバトル（SPD順）',
      '属性相性（DATA / VOID / ERROR / LIFE / CHAOS / ORDER）',
      'スキル・パッシブ・状態異常・バフ/デバフ・戦闘ログ',
      'REWRITE（条件を満たすと発動する固有の特殊能力）',
      'オンライン対戦（ARENA / RANKED / FRIEND / GHOST / RAID）は PHASE 5',
    ],
    route: { name: 'planned', screen: 'BATTLE' },
  },
  {
    id: 'SHOP',
    code: '06',
    ja: 'ショップ',
    summary: '通貨とアイテムの交換',
    status: 'planned',
    phase: 2,
    plannedFeatures: ['DATA / FRAGMENT / CORE / CREDIT による交換', '育成素材・アイテムの購入'],
    route: { name: 'planned', screen: 'SHOP' },
  },
  {
    id: 'PROFILE',
    code: '07',
    ja: 'プロフィール',
    summary: '探索者情報と記録の統計',
    status: 'available',
    phase: 1,
    route: { name: 'profile' },
  },
  {
    id: 'SETTINGS',
    code: '08',
    ja: 'セッティング',
    summary: '演出・セーブデータの管理',
    status: 'available',
    phase: 1,
    route: { name: 'settings' },
  },
];

export const MENU_BY_ID: Record<MenuScreenId, MenuEntry> = Object.fromEntries(MENU.map((m) => [m.id, m])) as Record<
  MenuScreenId,
  MenuEntry
>;
