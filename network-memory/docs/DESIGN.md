# 設計書 — NETWORK - Memory: ReCollection

正式な設計: **GAME DESIGN DOCUMENT Ver.2** + **SYSTEM SPECIFICATION UPDATE Ver.3**（Ver.3 が優先）。本書はその実装上の設計をまとめる。

## 1. 設計方針（Ver.3 §1・§10）

| 方針 | 実装上の決まりごと |
| --- | --- |
| モジュールの独立 | ゲームルールは `src/core/` の純粋関数。Battle Engine・Story Engine・世界修復・ARCHIVE・PvP ルールは互いに UI から独立 |
| データ駆動 | Memory・スキル・記録・敵・遭遇・アイテム・WORLD・シナリオ・登場人物・ARCHIVE は JSON（将来は DB）。コードに埋め込まない |
| 追加でコードを変えない | Memory を追加しても Battle Engine は変更不要。WORLD を追加しても既存 WORLD のデータは書き換えない（修復対象は WORLD 側が持つ） |
| 共通の条件式 | 同期条件・ARCHIVE の解放条件・シナリオの分岐・章の解放は同じ `Condition` 型（`core/conditions.ts`）で書く |
| 決定的な戦闘 | 「シード + コマンド列」から完全に再現できる。PHASE 5 でサーバーが再計算して結果・報酬を検証する |
| 壊れても止まらない | マスターデータもセーブデータも読み込み時に検証し、不正箇所だけを除外/補正して継続する |
| 単一の更新経路 | セーブデータの変更はすべて `state/gameReducer.ts` → `core/` の関数を通す |
| 未実装を偽らない | 未実装の画面・機能は「未実装 · PHASE n」と明示し、ダミー動作をさせない |
| 互換性の維持 | セーブデータは `version` + マイグレーションで旧形式を自動変換する（v1 → v2 → v3） |

## 2. アーキテクチャ

```
 JSON (src/data/*) ──► core/data/gameData.ts（検証・参照整合性チェック）──► GameData（読み取り専用）
                                                                               │
 UI (screens/*) ──dispatch(action)──► state/gameReducer.ts ──► core/player/* · core/story/progress · core/battle/result
       ▲                                       │                        └─► core/world/restoration（修復状態の更新）
       │                                       └─► PlayerSave ──自動保存──► localStorage
       │
       ├── BattleRunScreen ── core/battle/engine.ts（BattleState + BattleEvent[] を UI が段階的に再生）
       ├── StoryPlayer ────── core/story/engine.ts（StoryRun / StoryView を描画、advance() で進める）
       └── audio/audio.ts ─── シナリオ・戦闘から ID で BGM / SE を再生
```

## 3. MEMORY SYNC（Ver.3 §2）

- Memory は仲間ではなく、主人公が **完全同期** して使う能力。所持した Memory は永続的に保持し、同期先（装備）はいつでも変更できる。ただし **戦闘中は変更できない**（戦闘は開始時の装備スナップショットで行う）。
- メインに同期した Memory が戦闘の **基本ステータス** を決める。主人公の共通成長（レベル）は別管理で、倍率として掛かる。

```
最終ステータス = メイン Memory の固有ステータス（Memory のレベル反映）× (1 + 共通成長 3%/Lv + Σ パッシブ補正)
メイン未装備時は UNSYNCED（HP 600 / 他 60）
```

- 同期の流れ（`core/player/sync.ts` / `screens/Sync`）: 発見 → 接触 → 接触演出（Memory 固有の色とログ = `syncEffects.direction`）→ 同期条件の判定 → 能力解放 → 一覧登録 → **世界修復の反映**（何が復元されたかを表示）。
- 条件を満たさない場合は SYNC REJECTED。PENDING SYNC から再接触できる。

## 4. LOADOUT（Ver.3 §3）

| 枠 | 数 | 役割 |
| --- | --- | --- |
| メイン | 1 | 能力・ステータス・外見（オーラ）・属性・戦闘スタイル・REWRITE を決定（完全同期） |
| サブ | 3 | 補助スキル（`syncEffects.supportSkill`）を 1 つずつ追加するだけ。他の Memory の完全同期は発生しない |
| パッシブ | 2 | パッシブ能力 + 能力値の割合補正（`syncEffects.passiveBonus`） |

メイン Memory の能力体系（スキル・REWRITE・攻撃スタイル）はサブ・パッシブによって置き換わらない。枠数はセーブデータの `loadoutCapacity` で管理する。

## 5. Memory データ（Ver.3 §4）

型: `src/types/memory.ts`。JSON でも DB（`memories` テーブル）でも同じ項目で追加できる。

| 項目 | フィールド |
| --- | --- |
| id / name / category / rarity / attribute / description / illustration | 同名 |
| baseStats | `baseStats {hp, atk, def, spd, tec, res}`（完全同期時の固有ステータス、Lv1） |
| skills / passive | `skills`（固有スキル）/ `passive`（パッシブ） |
| syncEffects | `{ style, supportSkill, passiveBonus, rewrite, direction, appearance }` |
| acquisitionMethod | 入手方法 |
| worldId | 所属 WORLD |
| storyRecords | Memory 固有の記録（`src/data/records`） |
| unlockConditions | 同期条件（`Condition[]`） |
| （任意） | `fieldAbilities`（探索能力）/ `persona`（人物の人格）/ `relatedMemories` / `tags` |

戦闘能力を持たない Memory（`skills` も `passive` も空）は装備できず、ストーリー・探索・世界修復に使われる（例: MEM-0006『はじめての接続』）。

## 6. 世界修復（Ver.3 §5）

`core/world/restoration.ts`。WORLD ごとに `restorations`（修復対象）を持ち、対象の Memory を回収すると復元される。復元の種類は Memory の分類で決まる（個別に `kind` で上書き可）。

| 分類 | 復元されるもの | kind |
| --- | --- | --- |
| HUMAN | NPC の帰還 | `npc` |
| LOCATION | 建造物・エリア | `area` |
| EVENT | 歴史・イベント | `event` |
| OBJECT | 物体・機能 | `object` |
| CREATURE | 生物・生態系 | `ecosystem` |
| CONCEPT | 世界の特殊な機能 | `function` |

- WORLD の状態: `restorationRate` / `requiredMemories` / `recoveredMemories` / `restoredObjects` / `restoredNPCs` / `unlockedAreas` / `unlockedEvents`。所持 Memory から決定的に算出し、Memory の回収時に `save.worlds` を更新する。
- 確認できる場所: LOBBY（WORLD RESTORATION）、WORLD 画面（世界ごとの修復率・種類別の復元一覧・未復元は「？？？」と欠落の描写）、SYNC 完了画面、ARCHIVE の WORLD RECORD。
- NULL CITY の背景（ストーリー・WORLD 画面）は修復率に応じて灯る窓が増える。
- エリア探索・NPC との会話・サブクエストは PHASE 4（WORLD 画面に未実装と明示）。

## 7. MEMORY ARCHIVE（Ver.3 §6）

`core/archive/archive.ts` / `screens/Archive`。

| 分類 | 内容 | 出典 |
| --- | --- | --- |
| MEMORY RECORD | Memory ごとの個別記録 | `src/data/records`（Memory の `storyRecords`） |
| CHARACTER RECORD | 人物（アカルアの三人・人物 Memory の人格） | `src/data/archive` / Memory の `persona` |
| WORLD RECORD | 世界の概要と修復の記録 | WORLD データ + 修復状態 |
| EVENT RECORD | 出来事 | `src/data/archive` |
| TERMINOLOGY | 用語 | `src/data/archive` |
| FRAGMENT LOG | 流出反応から拾った断片ログ | `src/data/archive` |

- 記録とその節（セクション）は `Condition[]` で解放される（関連 Memory の発見・同期、ストーリー進行、遭遇のクリア等）。
- 未発見の記録はタイトル・内容を伏せ（「？？？」と黒塗り）、解放条件をヒントとして表示する。新しく読める記録には NEW の印。

## 8. 戦闘（Ver.3 §7）

`src/core/battle/`（UI から完全に独立）。

- 主人公 1 人 vs 敵最大 3 体のターン制。コマンド: **ATTACK / SKILL / DEFEND / ITEM / REWRITE**（+ 撤退）。
- ステータス: HP / ATK / DEF / SPD / TEC / RES。属性: DATA / VOID / ERROR / LIFE / CHAOS / ORDER（DATA → VOID → LIFE → ERROR → DATA、ORDER ⇄ CHAOS）。
- **SYNC ENERGY**: スキル共通の消費リソース（最大 100、開始 30、手番ごと +15、DEFEND で +20）。
- **REWRITE GAUGE**: 行動で蓄積（攻撃 +9 / スキル +11 / 防御 +7 / アイテム +3 / 1 ヒットごと +3 / 被ダメージ / 撃破 +10）。最大で REWRITE が使用可能になり、使用すると 0 に戻る。効果はメイン Memory ごとに設定（`syncEffects.rewrite` → スキルデータ）。追加の発動条件を持つ REWRITE もある。
- ダメージ: `攻撃値 × 威力 × K / (K + 防御値)` × 属性相性 × 強化 × クリティカル × 乱数幅。状態異常 5 種、パッシブの発動タイミング 7 種、敵 AI はデータ駆動。
- 演出: REWRITE のカットイン、ダメージ・回復のポップアップ、ゲージ表示、SE（打撃・REWRITE）。
- バランス検証: `core/battle/campaign.sim.ts` がオート戦闘で全遭遇を通しプレイして検証する。

## 9. STORY ENGINE（Ver.3 §8）

`core/story/engine.ts`（純粋な状態機械）/ `core/story/progress.ts`（セーブへの反映）/ `screens/Story`。

- メインストーリーは一本道。章（`src/data/story/*.json`）は解放条件（`Condition[]`）と報酬を持つ。
- シナリオは命令列で、すべてデータから呼び出す。

| 命令 | 内容 |
| --- | --- |
| `bg` / `bgm` / `se` | 背景（フェード/カット）・BGM（null で停止）・効果音 |
| `show` / `hide` | 立ち絵（位置 left / center / right、表情） |
| `say` / `narr` / `title` | 台詞（表情の変更を含む）・地の文・タイトルカード（`{player}` は主人公の名前に置換） |
| `fx` | 画面演出（fade-out / fade-in / shake / glitch / flash / noise） |
| `choice` / `label` / `goto` | 選択肢と分岐 |
| `if` | 条件分岐（**所持 Memory による特殊会話** など） |
| `set` / `detect` / `wait` / `end` | フラグ・Memory の反応検出（章の後で MEMORY SYNC へ）・待機・終了 |

- 再生画面: 文字送り（SETTINGS のテキスト速度）、AUTO、SKIP（次の選択肢まで）、LOG、中断（位置は自動保存）。フェード中は旧画面を保持して切り替える。
- 進行の保存: `save.story`（クリア済みの章・中断位置・選択肢）。再開は保存した選択肢で先頭から決定的に早送りして復元する。
- 立ち絵・背景: 画像素材が無いため手続き生成（`components/story`）。人物ごとに髪型・目・服装・仕草を描き分ける（独と紅葉は作者の立ち絵が参考）。キャラクターデータの `portraits` に画像パスを入れると画像に切り替わる。
- 背景: network-void / null-city-rain（修復率で窓が灯る）/ akarua-office / akarua-night / archive-stacks。BGM: void / rain / akarua / tension / night / archive。
- BGM / SE: 音声素材が無いため Web Audio で合成（`audio/audio.ts`）。呼び出しは ID のみなので、素材が揃えばファイル再生に差し替えられる。

### 登場人物（何でも屋「アカルア」）

`src/data/characters/akarua.json`。

| ID | 名前 | 立ち位置 |
| --- | --- | --- |
| CHR-HARUKA | 白石ハルカ | アカルアの店長。独と紅葉にとって母親のような、優しいお姉さんのような存在 |
| CHR-HITORI | 電子 独 | 現世から来た少年。【自我】が転生を経て完成した {Glitch} の使い手。一人称は「僕」 |
| CHR-MOMIJI | 電子 紅葉 | 現世では独の後輩（旧名・孤月紅葉）。独のそばにいる少女 |

- 人物の過去は ARCHIVE の CHARACTER RECORD に節ごとに収録し、ストーリーの進行（INTERLUDE「目印」・CHAPTER 2 のクリア）で解放する。
- 独の能力: {Glitch}（かつての【自我】が転生を経て完成したもの・身体を削る諸刃の剣）と、{upset}【大番狂わせ】（呪いから魂を解き放った独が自分の意思で生み出した力。自分より上の存在にのみ使え、相手と対等になる）。
- 重い話題（自死・いじめ）を扱う章・節は `contentNote` で注意書きを出す。直接的な描写（方法など）は書かない。

## 10. ONLINE（PvP）共通ルール（Ver.3 §9）

`core/online/pvp.ts`（クライアントとサーバーで共有するルール）。通信対戦の実装は PHASE 5。

- 参加するプレイヤーは 1 人、完全同期するメイン Memory は 1 つ。
- バトル開始後は Memory の変更禁止（開始時の装備スナップショット `PvpLoadoutSnapshot` で戦う）。
- サブ Memory はメイン Memory の能力体系内での補助（補助スキル）としてのみ機能する。
- 結果はサーバー側で検証する（シード + コマンド列を Battle Engine で再計算）。対人戦ではアイテム不可。
- モード: **ARENA**（レート戦）/ **RANKED**（シーズン制）/ **FRIEND**（フレンド）/ **GHOST**（装備スナップショットと非同期対戦）/ **RAID**（各自 1 人で巨大流出体に挑み、ダメージを集計）。

## 11. データ設計

| データ | ローカル | Supabase（PHASE 5） |
| --- | --- | --- |
| PlayerProfiles | `profile` / `wallet` / `settings` / `archive` | `player_profiles` |
| Memories / Skills / 記録 | `src/data/memories` / `skills` / `records` | `memories` / `memory_skills` / `memory_skill_assignments` / `memory_stories` |
| PlayerMemories / 装備 | `memories[]` / `loadouts[]` | `player_memories` / `player_loadouts` |
| WORLD / 修復対象 / 修復状態 | `worlds.json` / `restorations` / `worlds` | `worlds` / `world_restorations` / `world_progress` |
| 章 / 登場人物 / 進行 / 選択肢 | `src/data/story` / `characters` / `story` | `story_chapters` / `story_characters` / `story_progress` / `story_choices` |
| ARCHIVE | `src/data/archive` / `archive.readEntryIds` | `archive_entries` / `player_profiles.read_archive_ids` |
| 敵 / 遭遇 / アイテム / 遭遇の進行 | `enemies` / `encounters` / `items.json` / `battle.encounters` | `enemies` / `encounters` / `items` / `encounter_progress` |
| BattleRecords / Rankings / PvP | `battle.records` / — / `core/online/pvp.ts` | `battle_records` / `rankings` / `pvp_modes` |
| Inventory / Transactions | `inventory` / `transactions[]` | `inventory` / `transactions` |

### セーブデータ

- **v2 → v3**: ストーリー進行（`story`）・WORLD の修復状態（`worlds`）・ARCHIVE の既読（`archive.readEntryIds`）を追加。修復状態は読み込み時に所持 Memory から算出する。
- 読み込み時に `core/save/sanitize.ts` で全項目を検証・補正し、修復状態を再計算する。

## 12. オンラインのセキュリティ設計

`supabase/migrations/20261119000000_initial_schema.sql`（未適用のため Ver.3 に合わせて改訂済み）。ローカル PostgreSQL 16 にマスターデータ全件（シナリオ・登場人物・ARCHIVE・修復対象を含む）を投入し、40 項目を検証済み。

- マスターデータは全員読み取り専用、プレイヤーデータは本人のみ参照（RLS）。
- クライアントが直接更新できるのは名前・外見・紹介文・設定・お気に入り・装備・ARCHIVE の既読・ストーリーの読書位置のみ（列単位の権限）。
- 装備はトリガーで検証（所持・重複・枠ごとの装備可否・枠の数）。サブ枠は補助スキルを持つ Memory のみ。
- 世界修復: `refresh_world_progress()` が所持 Memory から修復状態を算出し、Memory の回収（`player_memories` への追加）時にトリガーで更新。クライアントは書き込めない。
- 章のクリア・通貨・Memory の同期・遭遇の進行・戦闘結果・ランキングはサーバー（service_role）のみ。
- 対人戦: `battle_records` はメイン Memory を含む装備スナップショットが必須で、開始後はスナップショット・シードを変更できない（トリガー）。`pvp_modes` に 5 モードと共通ルール（PHASE 5 まで無効）。

## 13. 拡張の手引き

| 追加したいもの | 作業 |
| --- | --- |
| Memory・スキル・記録・敵・遭遇・アイテム | JSON を追加 → `npm run validate:data`。遭遇を追加したら `npm test` でバランス検証も確認 |
| WORLD・修復対象 | `worlds.json` に WORLD を追加（`restorations` に対象 Memory を列挙）。既存の WORLD・Memory は変更不要 |
| ストーリーの章 | `src/data/story/*.json` に章を追加（`order` で並ぶ）。参照する人物・Memory・ラベルは読み込み時に検証される |
| 登場人物・立ち絵 | `src/data/characters/*.json`。画像があれば `portraits` に表情ごとのパスを指定 |
| ARCHIVE の記録 | `src/data/archive/*.json`（分類・解放条件・節） |
| 背景・BGM・SE | `components/story/SceneBackground.tsx` / `audio/audio.ts` に ID を追加（素材ができたら画像・音声ファイルに差し替え） |
| 新しい効果・パッシブ | `types/skill.ts` の効果タイプ、または `special` の id を追加し `core/battle/effects.ts` に実装 |
| 画面 | `screens/<Name>/` を作成 → `app/router.ts` にルート追加 → `app/screens.ts` の `status` を `available` に |
| セーブ項目 | `types/player.ts` に追加 → `SAVE_VERSION` を上げる → `migrations.ts` と `sanitize.ts` に追記 |
