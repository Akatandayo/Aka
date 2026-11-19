# 設計書 — NETWORK - Memory: ReCollection

正式な基本設計: **GAME DESIGN DOCUMENT Ver.2**。本書はその実装上の設計をまとめる。

## 1. 設計方針

| 方針 | 実装上の決まりごと |
| --- | --- |
| ロジックと UI の分離 | ゲームルールは `src/core/` の純粋関数に置く。Battle Engine（`core/battle`）は React から完全に独立 |
| データ駆動 | Memory・スキル・記録・敵・遭遇・アイテム・WORLD は JSON（将来は DB）。コードに埋め込まない |
| 決定的な戦闘 | 戦闘は「シード + コマンド列」から完全に再現できる。PHASE 5 でサーバーが再計算して結果・報酬を検証する |
| 壊れても止まらない | マスターデータもセーブデータも読み込み時に検証し、不正箇所だけを除外/補正してゲームを継続する |
| 単一の更新経路 | セーブデータの変更はすべて `state/gameReducer.ts` → `core/` の関数を通す。通貨は必ず `applyCurrencyChanges()` を経由 |
| ローカルファースト | オフラインで全機能が動く。オンライン（PHASE 5）は同期と「報酬が絡む処理のサーバー検証」を担う |
| 未実装を偽らない | 未実装の画面・機能は「未実装 · PHASE n」と明示し、ダミー動作をさせない |
| 互換性の維持 | セーブデータは `version` + マイグレーションで旧形式を自動変換する（v1 → v2 実装済み） |

## 2. アーキテクチャ

```
 JSON (src/data/*) ──► core/data/gameData.ts（検証・参照整合性チェック）──► GameData（読み取り専用）
                                                                               │
 UI (screens/*) ──dispatch(action)──► state/gameReducer.ts ──► core/player/*, core/battle/result.ts
       ▲                                       │
       │                                       └─► PlayerSave ──自動保存──► localStorage（KeyValueStore）
       │
       └── BattleRunScreen ── startBattle / submitCommand（core/battle/engine.ts）
                               └─ BattleState（JSON 化可能）+ BattleEvent[]（UI が段階的に再生）
```

## 3. 主人公と MEMORY SYNC（GDD §3・§4）

- 主人公はプレイヤー自身が操作する唯一の戦闘キャラクター。名前・外見カラー・紹介文を設定できる（`profile.avatar` は将来の外見カスタマイズ用に preset を持つ）。
- 主人公の基礎ステータスはレベルで成長する（`core/player/character.ts`）。
- **MEMORY SYNC の流れ**（`core/player/sync.ts` / `screens/Sync`）
  1. 発見: 戦闘の初回クリアなどで Memory の反応を検出 → `archive.pendingSyncIds`
  2. 接触: SYNC 画面で「接触する」
  3. 接触演出: スキャン・同期ログ・進行バー
  4. 同期条件の判定（`syncCondition`: 探索者 Lv / 特定 Memory の同期済み / ストーリーフラグ / 不明）
  5. 能力が使用可能になる（装備できる）
  6. Memory 一覧に登録
- 条件を満たさない場合は「SYNC REJECTED」となり、MEMORY › PENDING SYNC から後で再接触できる。
- 既に同期済みの Memory を再検出した場合は FRAGMENT に変換される。

## 4. Memory データ（GDD §5）

型: `src/types/memory.ts`。

| GDD の項目 | フィールド |
| --- | --- |
| ID / 名前 / 分類 / レアリティ / イラスト / 説明文 | `id` `name` `category` `rarity` `illustration` `description` |
| ステータス補正 | `hp` `atk` `def` `spd` `tec` `res`（Lv1 の補正値。Memory のレベルで成長） |
| 固有スキル / パッシブ効果 | `skills` / `passiveSkills` / `rewrite` |
| 同期条件 | `syncCondition` |
| 入手方法 / 関連 Memory | `acquisitionMethod` / `relatedMemories` |
| 個別ストーリー / 記録の解放条件 | `storyId` → `src/data/records`（断片ごとに `unlock`） |
| （人物の記憶・性格） | `persona` |
| （探索能力） | `fieldAbilities` |

すべての Memory が戦闘能力を持つ必要はない。`skills` と `passiveSkills` が空の Memory は装備できず、探索能力・ストーリー進行に使われる（例: MEM-0006『はじめての接続』）。

## 5. Memory 装備（GDD §6）

| 枠 | 数 | ステータス補正 | アクティブスキル | パッシブ | 属性・通常攻撃・REWRITE |
| --- | --- | --- | --- | --- | --- |
| メイン | 1 | 100% | ○ | ○ | ○（戦闘スタイルを決定） |
| サブ | 3 | 30% | ○ | — | — |
| パッシブ | 2 | 50% | — | ○ | — |

- 枠の数はセーブデータの `loadoutCapacity` で管理し、将来の拡張に対応する（上限は `MAX_LOADOUT_CAPACITY`）。
- 同じ Memory は 1 つの装備に 1 回まで。メイン・サブはアクティブスキル、パッシブ枠はパッシブスキルを持つ Memory のみ。
- 装備プリセットは 3 つ。「この装備で戦う」で戦闘に使う装備を選ぶ。
- 最終ステータス = 主人公の基礎値 + Σ（Memory 補正 × 枠の倍率）。

## 6. 戦闘システム（GDD §7・§8）

`src/core/battle/`。

- 主人公 1 人 vs 敵最大 3 体のターン制。毎ラウンド SPD 順に行動（同速はシード乱数）。
- コマンド: **ATTACK**（メイン Memory の通常攻撃）/ **DEFEND**（被ダメージ半減・SP 回復）/ **MEMORY SKILL**（SP 消費・クールダウン）/ **ITEM** / **REWRITE**（+ 撤退）。
- リソース: SP（初期 30、手番ごとに +15、DEFEND で +20、最大 100）とクールダウン。
- ダメージ: `攻撃値 × 威力 × K / (K + 防御値)`（ATK 参照は DEF、TEC 参照は RES で軽減）× 属性相性 × 強化 × クリティカル × 乱数幅。
- 属性相性: **DATA → VOID → LIFE → ERROR → DATA**（4すくみ）、**ORDER ⇄ CHAOS**（互いに有利）。有利 ×1.5 / 不利 ×0.75。
- 状態異常: 侵食（継続ダメージ）/ 停止（次の行動をスキップ）/ 沈黙（スキル・REWRITE 不可）/ 混線（対象がランダム）/ 施錠（パッシブ無効）。持続は「自分の手番」単位で減る。
- パッシブの発動タイミング: 常時 / 戦闘開始時 / ターン開始時 / 被ダメージ時 / 致死時 / 状態異常時 / 敵撃破時。
- **REWRITE**: メイン Memory 固有。発動条件（ターン数・HP・状態異常の数・撃破数）を満たすと 1 戦闘 1 回使用可能。効果は GDD の例に対応する効果タイプで表現する。

| GDD の効果例 | 効果タイプ | 例 |
| --- | --- | --- |
| スキル強化 | `empower` | RW-0007 例外処理 |
| 属性変化 | `attribute_shift` | RW-0007 例外処理（→ ORDER） |
| ステータス変化 | `buff` / `debuff` | RW-0007、RW-0005 |
| 敵の能力への干渉 | `dispel` / `status`(seal) / `special: swap_modifiers` | RW-0001、RW-0004、RW-0005 |
| 特殊スキル解放 | `grant_skill` | RW-0003 → SK-0101『ノーフェイス』 |

- 専用演出: スキルの `direction`（カットイン文・グリッチ・画面揺れ・色）を戦闘画面のオーバーレイで再生する。
- 敵 AI: 敵データの `ai`（行動の重み + HP・ターン条件）から決定的に選択する。
- 戦闘結果（`core/battle/result.ts`）: 経験値・装備 Memory の同期経験値・通貨・アイテム・初回クリア報酬（Memory 検出）・戦闘記録（シード + コマンド列）。使用したアイテムは勝敗に関わらず消費。
- **バランス検証**: `core/battle/campaign.sim.ts` がオート戦闘で全 8 遭遇を通しプレイし、テストで「クリア可能」「戦闘の長さ」を検証する。

## 7. 成長

- 経験値曲線（主人公・Memory 共通）: 次のレベルまで `50 × Lv^1.5`。
- 主人公: 戦闘の経験値でレベルアップし、基礎ステータスが上がる。
- Memory: 装備して戦うと同期経験値を得てレベルアップし、補正値が成長する。レベル条件の記録断片が解放される。
- スキル強化・限界突破・融合・特殊形態は未実装（データ構造は用意済み）。

## 8. データ設計

| データ | ローカル | Supabase（PHASE 5） |
| --- | --- | --- |
| Users | — | `auth.users` |
| PlayerProfiles | `profile` / `wallet` / `settings` / `loadoutCapacity` | `player_profiles` |
| Memories / MemorySkills | `src/data/memories`, `src/data/skills` | `memories`, `memory_skills`, `memory_skill_assignments` |
| 記録 | `src/data/records` | `memory_stories` |
| PlayerMemories | `memories[]` | `player_memories` |
| Memory 装備（旧 PlayerTeams） | `loadouts[]` | `player_loadouts` |
| 敵 / 遭遇 / アイテム | `src/data/enemies`, `encounters`, `items.json` | `enemies`, `encounters`, `items` |
| 遭遇の進行 | `battle.encounters` | `encounter_progress` |
| BattleRecords | `battle.records`（直近20件） | `battle_records` |
| Worlds / WorldProgress | `src/data/worlds.json` / （PHASE 4） | `worlds` / `world_progress` |
| Quests / StoryChapters / StoryChoices | （PHASE 3・4） | `quests` / `story_chapters` / `story_choices` |
| Rankings | — | `rankings` |
| Inventory / Transactions | `inventory` / `transactions[]` | `inventory` / `transactions` |

### セーブデータ

- `version` + `core/save/migrations.ts`。**v1 → v2**: 3 体編成をメイン（1 体目）・サブ（2・3 体目）に変換、主人公の外見・紹介文・同期待ちリスト・戦闘記録を追加、初期アイテムを付与。装備できなくなった Memory は検証時に外れる。
- 読み込み時に `core/save/sanitize.ts` で全項目を検証・補正。解析できないデータは削除せずバックアップへ退避。

## 9. オンライン（PHASE 5）のセキュリティ設計

`supabase/migrations/20261119000000_initial_schema.sql`（未適用のため Ver.2 に合わせて改訂済み）。ローカル PostgreSQL 16 にマスターデータ全件を投入し、以下を検証済み。

- マスターデータは全員読み取り専用、プレイヤーデータは本人のみ参照（RLS）。
- クライアントが直接更新できるのは名前・外見・紹介文・設定・お気に入り・装備のみ（列単位の権限）。
- 装備はトリガーで「自分の所持 Memory か」「重複が無いか」「その枠に装備できるか」「枠の数が正しいか」を検証。
- 通貨・Memory の同期・レベル・遭遇の進行・戦闘結果・ランキングの書き込みはサーバー（service_role）のみ。
- 戦闘はサーバーがシードを発行し、クライアントのコマンド列から `replayBattle` で再計算して結果と報酬を確定する。
- 対人戦では、レアリティだけで勝敗が決まらないよう対人戦用のステータス補正を Battle Engine のルールとして追加する予定。

## 10. 拡張の手引き

| 追加したいもの | 作業 |
| --- | --- |
| Memory・スキル・記録・敵・遭遇・アイテム | JSON を追加 → `npm run validate:data`。遭遇を追加したら `npm test` でバランス検証も確認 |
| 新しい効果・パッシブ | `types/skill.ts` の効果タイプ、または `special` の id を追加し `core/battle/effects.ts` に実装 |
| 画面 | `screens/<Name>/` を作成 → `app/router.ts` にルート追加 → `app/screens.ts` の `status` を `available` に |
| セーブ項目 | `types/player.ts` に追加 → `SAVE_VERSION` を上げる → `migrations.ts` と `sanitize.ts` に追記 |
| 装備枠の拡張 | プレイヤーの `loadoutCapacity` を増やす（上限は `MAX_LOADOUT_CAPACITY`） |
