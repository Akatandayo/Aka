# NETWORK - Memory: Re:Collection

あらゆる存在が「記録（Memory）」として刻まれる世界 **Network** を舞台にした、
Memory 収集型のストーリー RPG（ブラウザ / スマートフォン・PC 対応）。

> 現在 **PHASE 1（基礎システム）** まで実装済み。各フェーズの状況は [docs/ROADMAP.md](docs/ROADMAP.md) を参照。

## 起動方法

```bash
cd network-memory
npm install
npm run dev          # http://localhost:5173 で起動（同一LANのスマホからも接続可）
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` | 型チェック + 本番ビルド（`dist/`。サブパス配置にも対応） |
| `npm run preview` | ビルド結果の確認 |
| `npm test` | ゲームロジックとマスターデータのテスト |
| `npm run validate:data` | マスターデータ（JSON）の検証のみ |
| `npm run typecheck` | TypeScript の型チェック |

オンライン機能（Supabase）は未接続でも、すべてのローカル機能が動作します。
進行状況はブラウザの localStorage に自動保存され、SETTINGS から JSON で書き出し/読み込みできます。

## 技術構成

- React 19 + TypeScript + Vite
- CSS（デザイントークン方式、外部 UI ライブラリなし）
- Vitest（ロジック・データ検証）
- Supabase（PostgreSQL / Auth / Realtime / Edge Functions）… PHASE 5 で接続。スキーマは `supabase/migrations/` に設計済み

## ディレクトリ構成

```
network-memory/
├── docs/                 設計書・ロードマップ
├── supabase/migrations/  DB スキーマ（PHASE 5 用・検証済み）
├── public/               静的ファイル（favicon、将来の画像・音声）
└── src/
    ├── app/              ルーティング・画面登録・エラーバウンダリ
    ├── types/            データ型定義（Memory / Skill / Record / World / Player）
    ├── core/             UI から独立したゲームロジック（純粋関数・テスト対象）
    │   ├── data/         マスターデータの読み込み・検証
    │   ├── memory/       ステータス計算・検索/ソート・記録の解放判定
    │   ├── player/       新規開始・入手・編成・通貨・発見
    │   └── save/         セーブの保存/読込・マイグレーション・修復
    ├── data/             マスターデータ（JSON）
    ├── state/            React 状態管理（GameProvider / reducer）
    ├── components/       共通 UI（カード・イラスト・ダイアログ等）
    ├── screens/          画面（1画面 = 1ディレクトリ）
    └── styles/           デザイントークン・共通スタイル
```

## Memory の追加方法

コードの変更は不要です。

1. `src/data/memories/` に JSON を追加（既存ファイルへの追記、または新規ファイル。1ファイルに配列でも単体でも可）
2. スキルを `src/data/skills/`、記録（ストーリー断片）を `src/data/records/` に追加
3. `npm run validate:data` で検証（ID 重複・存在しない参照・不正な値を検出）

```jsonc
{
  "id": "MEM-0013",
  "name": "名前",
  "category": "HUMAN",          // HUMAN / CREATURE / CONCEPT / OBJECT / LOCATION / EVENT / UNKNOWN
  "rarity": "RARE",             // COMMON / UNCOMMON / RARE / EPIC / LEGEND / IRREGULAR
  "attribute": "DATA",          // DATA / VOID / ERROR / LIFE / CHAOS / ORDER
  "description": "説明",
  "illustration": "gen:human",  // 画像パス（例 "assets/memories/MEM-0013.webp"）または手続き生成モチーフ
  "hp": 600, "atk": 70, "def": 60, "spd": 70, "tec": 70, "res": 60,
  "skills": ["SK-xxxx"], "passiveSkills": ["PS-xxxx"], "rewrite": "RW-xxxx",
  "acquisitionMethod": [{ "type": "explore", "label": "NULL CITY 探索", "worldId": "WORLD-001" }],
  "relatedMemories": ["MEM-0001"],
  "storyId": "REC-0013"
}
```

不正なデータはゲームを止めずに除外され、開発時はコンソールと SETTINGS（開発者モード）に件数が表示されます。

## 既存ファイルについて

リポジトリ直下の `index.html`（VIRTUAL//ASCENSION）は別作品のため変更していません。本作はこの `network-memory/` ディレクトリで独立して動作します。
