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
    summary: '一本道のメインストーリーで流出事件の真相を追う',
    status: 'planned',
    phase: 3,
    plannedFeatures: [
      '章単位のメインストーリー（シナリオ・会話・イベント・探索・戦闘・ボス・クリア条件・報酬）',
      'ノベル形式の演出エンジン（背景・立ち絵・表情差分・テキストアニメーション）',
      'BGM / SE・フェード・カメラ揺れ・グリッチ・ノイズ',
      'Memory同期演出・世界修復演出をシナリオデータから呼び出し',
    ],
    route: { name: 'planned', screen: 'STORY' },
  },
  {
    id: 'WORLD',
    code: '02',
    ja: 'ワールド',
    summary: 'Network各地を探索し、世界を修復する',
    status: 'planned',
    phase: 4,
    plannedFeatures: [
      'WORLD-001 NULL CITY 〜 WORLD-005 UNKNOWN の探索エリア',
      '世界修復システム（修復進行度・建物の復元・NPCの復帰・エリア解放）',
      'サブクエスト・イベント・敵・ボス・Memory入手ポイント',
      '現在 BATTLE から接続できる「流出反応」は、各WORLDの探索に統合予定',
    ],
    route: { name: 'planned', screen: 'WORLD' },
  },
  {
    id: 'MEMORY',
    code: '03',
    ja: 'メモリー',
    summary: '同期したMemoryの確認・装備・MEMORY SYNC',
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
    plannedFeatures: ['Memory図鑑・世界図鑑・キャラクター図鑑・用語集', 'LOG・関連記録', 'Memoryを集めることで関連情報が解放される仕組み'],
    route: { name: 'planned', screen: 'ARCHIVE' },
  },
  {
    id: 'BATTLE',
    code: '05',
    ja: 'バトル',
    summary: '流出反応に接続し、Memoryの力で戦う',
    status: 'available',
    phase: 2,
    route: { name: 'battle' },
  },
  {
    id: 'SHOP',
    code: '06',
    ja: 'ショップ',
    summary: '通貨とアイテムの交換',
    status: 'planned',
    phase: 6,
    plannedFeatures: ['DATA / FRAGMENT / CORE / CREDIT による交換', 'アイテムの購入'],
    route: { name: 'planned', screen: 'SHOP' },
  },
  {
    id: 'PROFILE',
    code: '07',
    ja: 'プロフィール',
    summary: '探索者（主人公）の情報と記録',
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
