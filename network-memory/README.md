# NETWORK - Memory: ReCollection

あらゆる存在が「記録（Memory）」として刻まれる世界 **Network** を舞台にした、
ストーリー重視型・Memory 収集 RPG（ブラウザ / スマートフォン・PC 対応）。

主人公はオリジナルの探索者。Memory に触れることで、その記録に宿る能力を自分自身に **同期（MEMORY SYNC）** し、
装備した Memory の力で戦い、流出した記録を回収していく。

> 現在 **PHASE 2（Memory SYNC・戦闘）** まで実装済み。正式な基本設計は GDD Ver.2。
> 各フェーズの状況は [docs/ROADMAP.md](docs/ROADMAP.md)、設計は [docs/DESIGN.md](docs/DESIGN.md) を参照。

## すぐに遊ぶ（HTML ファイル 1 つ）

[`release/NETWORK-Memory-ReCollection.html`](release/NETWORK-Memory-ReCollection.html) をダウンロードして、ブラウザで開くだけで遊べます。
インストール・サーバー・ネット接続は不要です（フォント・画像もすべて 1 ファイルに埋め込み済み）。
進行状況はそのブラウザに自動保存されます。

この HTML は `npm run build:html` で作り直せます。

## 起動方法（開発）

```bash
cd network-memory
npm install
npm run dev          # http://localhost:5173 で起動（同一LANのスマホからも接続可）
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 型チェック + 本番ビルド（`dist/`。サブパス配置にも対応） |
| `npm run build:html` | すべてを埋め込んだ単一 HTML（`release/NETWORK-Memory-ReCollection.html`）を作成 |
| `npm run preview` | ビルド結果の確認 |
| `npm test` | ゲームロジック・Battle Engine・マスターデータのテスト（バランス検証を含む） |
| `npm run validate:data` | マスターデータ（JSON）の検証のみ |
| `npm run typecheck` | TypeScript の型チェック |

オンライン機能（Supabase）は未接続でも、すべてのローカル機能が動作します。
進行状況はブラウザの localStorage に自動保存され、SETTINGS から JSON で書き出し/読み込みできます。
PHASE 1 のセーブデータは自動的に新形式（v2）へ変換されます。

## 遊び方（PHASE 2）

1. **MEMORY › LOADOUT** で Memory を装備する（メイン 1 / サブ 3 / パッシブ 2）
2. **BATTLE** で流出反応に接続し、ATTACK / DEFEND / MEMORY SKILL / ITEM / REWRITE で戦う
3. 初回クリアで Memory の反応を検出 → **MEMORY SYNC** で接触・同期すると新しい能力が使えるようになる
4. 装備して戦った Memory は同期が深まってレベルが上がり、記録（ストーリー断片）が解放されていく

## 技術構成

- React 19 + TypeScript + Vite / CSS（デザイントークン方式、外部 UI ライブラリなし）
- Vitest（ロジック・Battle Engine・データ検証・キャンペーンのバランスシミュレーション）
- Supabase（PostgreSQL / Auth / Realtime / Edge Functions）… PHASE 5 で接続。スキーマは `supabase/migrations/` に設計・検証済み

## ディレクトリ構成

```
network-memory/
├── docs/                 設計書・ロードマップ
├── supabase/migrations/  DB スキーマ（PHASE 5 用・ローカル PostgreSQL で検証済み）
└── src/
    ├── app/              ルーティング・画面登録・エラーバウンダリ
    ├── types/            データ型（Memory / Skill / Record / World / Enemy / Item / Player）
    ├── core/             UI から独立したゲームロジック（純粋関数・テスト対象）
    │   ├── battle/       Battle Engine（決定的・リプレイ可能）・戦闘準備・結果反映・オート戦闘
    │   ├── data/         マスターデータの読み込み・検証
    │   ├── memory/       ステータス計算・検索/ソート・記録の解放判定
    │   ├── player/       主人公・装備・MEMORY SYNC・成長・通貨・発見
    │   └── save/         セーブの保存/読込・マイグレーション・修復
    ├── data/             マスターデータ（JSON）
    ├── state/            React 状態管理（GameProvider / reducer）
    ├── components/       共通 UI（カード・イラスト・主人公・敵・ダイアログ等）
    ├── screens/          画面（1画面 = 1ディレクトリ）
    └── styles/           デザイントークン・共通スタイル
```

## データの追加方法

コードの変更は不要です。JSON を追加して `npm run validate:data` で検証します。

| 追加するもの | 置き場所 |
| --- | --- |
| Memory | `src/data/memories/*.json` |
| スキル（Memory・敵・REWRITE） | `src/data/skills/*.json` |
| Memory 固有の記録（ストーリー断片） | `src/data/records/*.json` |
| 敵 | `src/data/enemies/*.json` |
| 流出反応（エンカウント） | `src/data/encounters/*.json` |
| アイテム | `src/data/items.json` |
| WORLD | `src/data/worlds.json` |

```jsonc
// Memory の例
{
  "id": "MEM-0017",
  "name": "名前",
  "category": "HUMAN",          // HUMAN / CREATURE / CONCEPT / OBJECT / LOCATION / EVENT / UNKNOWN
  "rarity": "RARE",             // COMMON / UNCOMMON / RARE / EPIC / LEGEND / IRREGULAR
  "attribute": "DATA",          // DATA / VOID / ERROR / LIFE / CHAOS / ORDER
  "description": "説明",
  "illustration": "gen:human",  // 画像パス（例 "assets/memories/MEM-0017.webp"）または手続き生成モチーフ
  "hp": 600, "atk": 70, "def": 60, "spd": 70, "tec": 70, "res": 60,   // 装備時のステータス補正（Lv1）
  "skills": ["SK-xxxx"], "passiveSkills": ["PS-xxxx"], "rewrite": "RW-xxxx",   // 戦闘能力が無い記録は空配列でよい
  "attackStyle": { "name": "斬撃", "scale": "atk", "power": 1.0, "hits": 1 },
  "syncCondition": [{ "type": "playerLevel", "value": 5 }],
  "fieldAbilities": [{ "id": "FA-xxxx", "name": "探索能力", "description": "…" }],
  "persona": { "personality": "人物の性格", "note": "記憶・口癖など" },
  "acquisitionMethod": [{ "type": "explore", "label": "NULL CITY 探索", "worldId": "WORLD-001" }],
  "relatedMemories": ["MEM-0001"],
  "storyId": "REC-0017"
}
```

不正なデータはゲームを止めずに除外され、開発時はコンソールと SETTINGS（開発者モード）に件数が表示されます。

## 既存ファイルについて

リポジトリ直下の `index.html`（VIRTUAL//ASCENSION）は別作品のため変更していません。本作はこの `network-memory/` ディレクトリで独立して動作します。
