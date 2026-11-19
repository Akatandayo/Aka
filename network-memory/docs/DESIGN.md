# 設計書 — NETWORK - Memory: Re:Collection

## 1. 設計方針

| 方針 | 実装上の決まりごと |
| --- | --- |
| ロジックと UI の分離 | ゲームルールは `src/core/` の純粋関数に置く。React コンポーネントはそれを呼ぶだけ。PHASE 2 の Battle Engine も `core/battle/` に UI 非依存で実装する |
| データ駆動 | Memory・スキル・記録・WORLD は JSON（将来は DB）。コードに埋め込まない。シナリオ（PHASE 3）も同様 |
| 壊れても止まらない | マスターデータもセーブデータも読み込み時に検証し、不正箇所だけを除外/補正してゲームを継続する |
| 単一の更新経路 | セーブデータの変更はすべて `state/gameReducer.ts` → `core/` の関数を通す。通貨は必ず `core/player/economy.ts` を経由する |
| ローカルファースト | オフラインで全機能が動く。オンライン（PHASE 5）は同期と「報酬が絡む処理のサーバー検証」を担う |
| 未実装を偽らない | 未実装の画面・設定は「未実装 · PHASE n」と明示し、ダミー動作をさせない |

## 2. アーキテクチャ

```
 JSON (src/data/*)  ─┐
                     ├─► core/data/gameData.ts ── 検証・参照整合性チェック ──► GameData（読み取り専用）
 Supabase (PHASE 5) ─┘                                                         │
                                                                               ▼
 UI (screens/*) ──dispatch(action)──► state/gameReducer.ts ──► core/player/*, core/memory/*（純粋関数）
       ▲                                       │
       └──────── save（PlayerSave） ◄───────────┘
                                               │ 自動保存（400ms デバウンス + 画面非表示時）
                                               ▼
                              core/save/storage.ts（KeyValueStore: localStorage / memory）
```

- **ルーティング**: ハッシュルーター（`#/memory/…`）。戻るボタン・リロード・静的ホスティングのサブパスに対応。
- **画面登録**: `app/screens.ts` の `MENU` が LOBBY の 8 メニューを定義。`status: 'planned'` の画面は `PlannedScreen` で予定機能を表示する。
- **演出設定**: `settings.fx` が `<html data-fx>` に反映され、`reduced` で全アニメーションを抑制（OS の「視差効果を減らす」にも追従）。

## 3. データ設計

仕様書 13 章のテーブルと、本実装の対応。

| 仕様のデータ | ローカル（PHASE 1） | Supabase（PHASE 5） |
| --- | --- | --- |
| Users | — | `auth.users`（Supabase Auth） |
| PlayerProfiles | `PlayerSave.profile` / `wallet` / `settings` | `player_profiles` |
| Memories | `src/data/memories/*.json` → `MemoryDefinition` | `memories` |
| PlayerMemories | `PlayerSave.memories[]`（`PlayerMemory`） | `player_memories` |
| MemorySkills | `src/data/skills/*.json` → `SkillDefinition` | `memory_skills` + `memory_skill_assignments` |
| Worlds | `src/data/worlds.json` | `worlds` |
| WorldProgress | （PHASE 4） | `world_progress` |
| Quests | （PHASE 4） | `quests` |
| StoryChapters | （PHASE 3） | `story_chapters` |
| StoryChoices | （PHASE 3） | `story_choices` |
| BattleRecords | （PHASE 2/5） | `battle_records` |
| PlayerTeams | `PlayerSave.teams[]` | `player_teams` |
| Rankings | — | `rankings` |
| Inventory | `PlayerSave.inventory` | `inventory` |
| Transactions | `PlayerSave.transactions[]`（直近200件） | `transactions` |

追加: Memory 固有の記録（ストーリー断片）は `src/data/records/*.json` / `memory_stories`。

### 3.1 Memory（マスター）

型: `src/types/memory.ts`。仕様の必須項目（id, name, category, rarity, description, illustration, hp, atk, def, spd, tec, res, skills, passiveSkills, acquisitionMethod, relatedMemories, storyId）に加え、戦闘の属性相性に必要な `attribute`、REWRITE 用の `rewrite`、表示用の `nameEn` / `title` / `quote`、出現世界 `worldId`、`tags` を持つ。

- **ステータス**: 基礎値（Lv1）を保持。実数値は `core/memory/stats.ts` で `基礎値 × (1 + 0.05 × (Lv−1)) × (1 + 0.05 × 限界突破)`。
- **最大レベル**: COMMON 30 / UNCOMMON 40 / RARE 50 / EPIC 60 / LEGEND 70 / IRREGULAR 80、限界突破 1 段階につき +10（最大 4 段階）。
- **イラスト**: 画像パスを指定すれば画像を表示。`gen:<motif>` の場合は ID をシードにした手続き生成 SVG（画像が無い間の代替）。

### 3.2 スキル / REWRITE

型: `src/types/skill.ts`。`kind` は `active` / `passive` / `rewrite`。効果は `effects[]` の宣言的データで、PHASE 2 の Battle Engine が解釈する。

- passive は `trigger`（常時・戦闘開始時・被ダメージ時…）を持つ。
- rewrite は `condition`（機械判定用）と `conditionText`（表示用）、演出指定 `direction`（カットイン・グリッチ・画面揺れ・色）を持つ。Memory ごとに固有の効果と演出を設定できる。
- 状態異常: 侵食 / 停止 / 沈黙 / 混線 / 施錠。

### 3.3 記録（Memory 固有のストーリー）と発見

「集めることに意味がある」ための中核。

- 各 Memory は 3 つ前後の記録断片を持ち、断片ごとに解放条件を持つ: `owned`（所持）/ `level` / `limitBreak` / `relatedOwned`（関連 Memory を所持）/ `flag`（ストーリー進行。PHASE 3）。
- 断片は `reveals` で他の Memory を「発見済み」にできる。所持していない Memory の存在が記録を読むことで判明する。
- Memory の状態は 3 段階: **所持** / **発見済み（未所持・シルエット表示）** / **未発見（??? 表示）**。ARCHIVE（PHASE 3）はこの仕組みを図鑑として拡張する。

現在のデータでの例: 『雨の止まない交差点』の記録 #2（『点灯夫ルクス』所持で解放）を読むと『白紙の少女』の存在が判明する。

### 3.4 セーブデータ（PlayerSave）

型: `src/types/player.ts`。

- `version` + `core/save/migrations.ts` で後方互換を保つ。新しいバージョンのデータは読み込みを拒否する。
- 読み込み時に `core/save/sanitize.ts` で全項目を検証・補正（負の通貨、上限超えのレベル、存在しない編成メンバー、重複など）。
- 解析できないデータは削除せず `network-memory:backup:<時刻>` に退避してから新規開始する。
- localStorage が使えない環境（プライベートモード等）ではメモリ保存に切り替え、画面に警告を出す。

### 3.5 編成

- 3 プリセット × 最大 3 体。1 チームに同じインスタンス・同じ Memory（memoryId）は 1 体まで。
- スロット 1 がリーダー（LOBBY のパートナー表示に使用）。「出撃チーム」が BATTLE（PHASE 2）で使われる。

### 3.6 通貨・取引

- DATA / FRAGMENT / CORE / CREDIT。
- `applyCurrencyChanges()` が唯一の変更経路: 整数のみ・残高不足/上限超過を拒否・複数変更はアトミック・すべて Transaction として記録。
- サーバー側は `apply_currency_change()`（service_role 専用）が同じ役割を担い、クライアントから残高列は更新不可（列権限 + RLS）。

## 4. オンライン（PHASE 5）のセキュリティ設計

`supabase/migrations/20261119000000_initial_schema.sql` で定義済み。ローカルの PostgreSQL 16 上で、JSON マスターデータの投入と以下の挙動を検証済み。

- マスターデータは全員読み取り専用。プレイヤーデータは本人のみ参照可能（RLS）。
- クライアントが直接更新できるのは名前・設定・お気に入り・編成など、報酬に影響しない列のみ。
- 通貨・Memory 入手・レベル・戦闘結果・ランキングの書き込みは Edge Functions（service_role）のみ。
- 編成はトリガーで「自分の所持 Memory か」「重複が無いか」を検証。
- 戦闘はサーバーが乱数シードを発行し、クライアントの入力（commands）からサーバーで再計算して勝敗・報酬を確定する設計（`battle_records.seed / commands / verified`）。

## 5. 拡張の手引き

| 追加したいもの | 作業 |
| --- | --- |
| Memory・スキル・記録 | JSON を追加 → `npm run validate:data` |
| 画面 | `screens/<Name>/` を作成 → `app/router.ts` にルート追加 → `app/screens.ts` の `status` を `available` に |
| セーブ項目 | `types/player.ts` に追加 → `SAVE_VERSION` を上げる → `migrations.ts` と `sanitize.ts` に追記 |
| 通貨の増減を伴う機能 | `applyCurrencyChanges()` を使い、`TransactionReason` に理由を追加 |
| WORLD | `src/data/worlds.json`（エリア・クエスト等の構造は PHASE 4 で追加） |
