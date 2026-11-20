# NETWORK - Memory: ReCollection

あらゆる存在が「記録（Memory）」として刻まれる世界 **Network** を舞台にした、
ストーリー重視型・Memory 収集 RPG（ブラウザ / スマートフォン・PC 対応）。

主人公はオリジナルの探索者。Memory に触れることで、その記録に宿る能力を自分自身に **完全同期（MEMORY SYNC）** し、
その力で戦い、流出した記録を回収して世界を修復していく。物語は何でも屋「アカルア」の三人
（白石ハルカ・電子 独・電子 紅葉）とともに進む。

> 現在 **PHASE 4（WORLD 探索・サブクエスト）** まで実装済み。正式な設計は GDD Ver.2 + SYSTEM SPECIFICATION Ver.3。
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
以前のセーブデータは自動的に新形式（v3）へ変換されます。

## 遊び方

1. **STORY** で PROLOGUE を読む（何でも屋「アカルア」との出会い）
2. **MEMORY › LOADOUT** で Memory を装備する（メイン 1 = 完全同期 / サブ 3 = 補助スキル / パッシブ 2）
3. **BATTLE** で流出反応に接続し、ATTACK / SKILL / DEFEND / ITEM / REWRITE で戦う（スキルは SYNC ENERGY を消費、REWRITE は行動で溜まる REWRITE GAUGE が最大のとき）
4. 初回クリアで Memory の反応を検出 → **MEMORY SYNC** で同期すると能力が使えるようになり、**WORLD** が修復される
5. **WORLD** でエリアを探索する。調べる・話す・流出反応に接続する。同期した Memory の探索能力で新しい場所が開く
6. 依頼（サブクエスト）を受けて達成し、依頼人に報告する
7. 条件を満たすと次の章が読めるようになる。発見した記録は **ARCHIVE** で読める

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
    ├── audio/            BGM / SE（ID で呼び出し。現在は Web Audio の合成音）
    ├── core/             UI から独立したゲームロジック（純粋関数・テスト対象）
    │   ├── battle/       Battle Engine（決定的・リプレイ可能）・戦闘準備・結果反映・オート戦闘
    │   ├── story/        Story Engine（シナリオの状態機械）・進行の保存
    │   ├── world/        世界修復（修復状態の算出・接続状態）
    │   ├── archive/      MEMORY ARCHIVE（6 分類の記録の組み立て）
    │   ├── online/       PvP 共通ルール（PHASE 5 でサーバーと共有）
    │   ├── conditions.ts 共通の条件式（同期・解放・分岐）
    │   ├── data/         マスターデータの読み込み・検証
    │   ├── memory/       ステータス計算・検索/ソート・記録の解放判定
    │   ├── player/       主人公・装備・MEMORY SYNC・成長・通貨・発見
    │   └── save/         セーブの保存/読込・マイグレーション・修復
    ├── data/             マスターデータ（JSON）
    ├── state/            React 状態管理（GameProvider / reducer）
    ├── components/       共通 UI（カード・イラスト・主人公・敵・立ち絵・背景・ダイアログ等）
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
| WORLD・修復対象 | `src/data/worlds.json`（`restorations`） |
| ストーリーの章（シナリオ） | `src/data/story/*.json` |
| 探索エリア・地点 | `src/data/areas/*.json`（WORLD ごとに 1 ファイル） |
| 探索イベント（会話・出来事） | `src/data/events/*.json` |
| サブクエスト | `src/data/quests/*.json` |
| 登場人物（NPC） | `src/data/characters/*.json`（`formerName` で旧名も持てる） |
| 立ち絵画像 | `src/assets/portraits/` に置き、キャラクターの `portraits` に `{ "normal": "portraits/ファイル名.png", "smile": ... }` と書く |
| ARCHIVE の記録（人物・出来事・用語・断片ログ） | `src/data/archive/*.json` |

```jsonc
// Memory の例（SYSTEM SPECIFICATION Ver.3 §4）
{
  "id": "MEM-0017",
  "name": "名前",
  "category": "HUMAN",          // HUMAN / CREATURE / CONCEPT / OBJECT / LOCATION / EVENT / UNKNOWN（世界修復で復元されるものが決まる）
  "rarity": "RARE",             // COMMON / UNCOMMON / RARE / EPIC / LEGEND / IRREGULAR
  "attribute": "DATA",          // DATA / VOID / ERROR / LIFE / CHAOS / ORDER
  "description": "説明",
  "illustration": "gen:human",  // 画像パス（例 "assets/memories/MEM-0017.webp"）または手続き生成モチーフ
  "baseStats": { "hp": 2400, "atk": 120, "def": 100, "spd": 110, "tec": 120, "res": 100 },  // 完全同期時の固有ステータス（Lv1）
  "skills": ["SK-xxxx", "SK-yyyy"],   // 固有スキル（戦闘能力が無い記録は空配列でよい）
  "passive": ["PS-xxxx"],
  "syncEffects": {
    "style": { "name": "斬撃", "scale": "atk", "power": 1.0, "hits": 1 },   // 戦闘スタイル（通常攻撃）
    "supportSkill": "SK-yyyy",                     // サブ枠で貸す補助スキル（skills のいずれか）
    "passiveBonus": { "def": 0.06 },              // パッシブ枠での能力補正（割合）
    "rewrite": "RW-xxxx",                          // メイン同期時の REWRITE
    "direction": { "color": "#4dffa6", "lines": ["同期ログ"] },   // 同期演出
    "appearance": { "aura": "#4dffa6", "label": "外見の名称" }
  },
  "acquisitionMethod": [{ "type": "explore", "label": "NULL CITY 探索", "worldId": "WORLD-001" }],
  "worldId": "WORLD-001",
  "storyRecords": ["REC-0017"],
  "unlockConditions": [{ "type": "playerLevel", "value": 5 }],
  "persona": { "personality": "人物の性格", "note": "記憶・口癖など" },   // 任意
  "relatedMemories": ["MEM-0001"]
}
```

シナリオは命令の列で書きます（会話・背景・立ち絵・表情・BGM・SE・画面演出・選択肢・条件分岐）。

```jsonc
{ "t": "show", "char": "CHR-HARUKA", "pos": "center", "expr": "smile" },
{ "t": "say", "char": "CHR-HARUKA", "expr": "smile", "text": "{player}さん、ね。素敵な名前。" },
{ "t": "if", "cond": [{ "type": "ownedMemory", "memoryId": "MEM-0013" }], "goto": "drone-talk", "else": "join" },
{ "t": "fx", "type": "glitch", "ms": 600 }, { "t": "se", "id": "glitch" }, { "t": "bgm", "id": "akarua" }
```

不正なデータはゲームを止めずに除外され、開発時はコンソールと SETTINGS（開発者モード）に件数が表示されます。

## 既存ファイルについて

リポジトリ直下の `index.html`（VIRTUAL//ASCENSION）は別作品のため変更していません。本作はこの `network-memory/` ディレクトリで独立して動作します。
