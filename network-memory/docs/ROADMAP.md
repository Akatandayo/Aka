# 開発ロードマップ（GDD Ver.2 + SYSTEM SPECIFICATION Ver.3）

| PHASE | 内容 | 状態 |
| --- | --- | --- |
| 1 | 基礎システム（構成・データ設計・LOBBY・MEMORY・保存） | **完了** |
| 2 | Memory SYNC・戦闘 | **完了**（Ver.3 の完全同期型・SYNC ENERGY・REWRITE GAUGE に移行済み） |
| 3 | ストーリー・演出・ARCHIVE・世界修復の表示 | **完了**（PROLOGUE・CHAPTER 1・INTERLUDE。章は今後データで追加） |
| 4 | 世界探索（WORLD-001〜005 のエリア探索、NPC、サブクエスト、ボス） | 未着手（世界修復の仕組みと表示は実装済み） |
| 5 | オンライン（Supabase 接続、アカウント、対人戦、ランキング） | 共通ルールとスキーマのみ設計・検証済み |
| 6 | 拡張（SHOP、育成の拡張 ほか） | 未着手 |

---

## Ver.3 対応報告（SYSTEM SPECIFICATION UPDATE Ver.3）

### 仕様との対応

| Ver.3 | 実装 |
| --- | --- |
| §1 基本方針 | 主人公はオリジナルの探索者。Memory は仲間ではなく完全同期する能力。メインストーリーは一本道 |
| §2 MEMORY SYNC | 完全同期型: メイン Memory の固有ステータスが戦闘の基本ステータス。主人公の共通成長は倍率で別管理。所持は永続、同期先はいつでも変更可・戦闘中は不可。Memory ごとの同期演出（色・ログ） |
| §3 LOADOUT | メイン 1（能力・ステータス・外見を決定）/ サブ 3（補助スキルのみ）/ パッシブ 2（パッシブ + 能力補正）。メインの能力体系は崩れない |
| §4 Memory データ | `id` `name` `category` `rarity` `attribute` `description` `illustration` `baseStats` `skills` `passive` `syncEffects` `acquisitionMethod` `worldId` `storyRecords` `unlockConditions`。JSON・DB どちらでも追加可 |
| §5 WORLD RESTORATION | WORLD ごとの修復状態（修復率・必要/回収済み Memory・復元された物体/NPC・解放されたエリア/イベント）。分類ごとの復元の種類。LOBBY と WORLD 画面で確認 |
| §6 MEMORY ARCHIVE | 6 分類（MEMORY / CHARACTER / WORLD / EVENT RECORD・TERMINOLOGY・FRAGMENT LOG）。未発見は伏せ字 + 解放条件 |
| §7 BATTLE | ATTACK / SKILL / DEFEND / ITEM / REWRITE。6 ステータス・6 属性。SYNC ENERGY・REWRITE GAUGE。REWRITE の効果は Memory ごと。ロジックは UI から独立 |
| §8 STORY ENGINE | データ駆動のシナリオ（会話・背景・立ち絵・表情・BGM・SE・画面演出・分岐）。所持 Memory による特殊会話。進行はセーブデータに保存 |
| §9 ONLINE | 共通ルール（1 人・メイン 1・開始後の変更禁止・サブは補助のみ・サーバー検証）と 5 モードを定義。DB で強制。通信対戦は PHASE 5 |
| §10 開発ルール | Memory 追加で Battle Engine は変更不要、WORLD 追加で既存 WORLD は変更不要、ストーリー・Memory・WORLD はデータ追加で拡張 |

### 追加した主な機能

**STORY（ノベル演出エンジン）**
- 章一覧（解放条件・読書中・クリア）、続きから / 最初から / もう一度読む
- 再生画面: 背景・立ち絵（3 位置・表情差分・話者の強調）・名前欄・文字送り・選択肢・タイトルカード
- 画面演出: フェードアウト/イン（旧画面を保持して切り替え）・揺れ・グリッチ・フラッシュ・ノイズ
- AUTO / SKIP（次の選択肢まで）/ LOG / 中断（自動保存・再開時に同じ場面を復元）、キーボード操作
- 章のクリア: 初回報酬・Memory の反応検出 → MEMORY SYNC へ・次の章の解放条件
- 収録: PROLOGUE「アカルア」、CHAPTER 1「灯りの消えた街」（選択肢 3 箇所、所持・発見した Memory による分岐 3 箇所）、INTERLUDE「目印」（独と紅葉の過去・ハルカとの出会い。選択肢 3 箇所）
- 重い話題を扱う章・記録には注意書き（`contentNote`）を表示。章は最初から読むときに確認画面を出す

**登場人物（何でも屋「アカルア」）**
- 白石ハルカ（店長）・電子 独・電子 紅葉。プロフィール・能力・表情差分（手続き生成の立ち絵）
- 独の過去（現世 → もうひとつの世界 → Network）と、紅葉（旧名・孤月紅葉）・ハルカとの関係を ARCHIVE の人物記録に段階的に収録（INTERLUDE のクリアで解放）

**WORLD**
- 全体と WORLD ごとの修復率、種類別の復元一覧（復元済みの描写 / 未復元の欠落の描写）、対象の Memory、流出反応への接続
- SYNC 完了時に「どの WORLD の何が復元されたか」と修復率の変化を表示

**ARCHIVE**
- 6 分類のタブ、解放数、NEW の印、記録の詳細（節ごとの解放・黒塗り・解放条件）、人物の立ち絵とプロフィール、関連 Memory / WORLD への移動
- 収録: 用語 9・人物 3・出来事 3・断片ログ 8 + Memory 16 件の個別記録・人物 Memory の人格記録・WORLD 5 件

**サウンド・設定**
- BGM 4 曲・SE 6 種（Web Audio による合成の仮音源）。ストーリーと戦闘で再生
- SETTINGS のテキスト速度・BGM 音量・SE 音量を有効化

**戦闘**
- SP → SYNC ENERGY、REWRITE を「行動で溜まる REWRITE GAUGE」方式に変更。スキル表示を SKILL に

**品質**
- 単体テスト 66 件（Ver.3 の同期モデル・世界修復・Story Engine・ARCHIVE・PvP ルールを追加）
- ブラウザでの E2E（スマートフォン / PC）: ストーリー（選択肢・LOG・中断と再開・SKIP・クリア）、ARCHIVE（伏せ字・NEW の既読化）、WORLD、戦闘 → SYNC → 修復率の変化、CHAPTER 1 の解放とクリア、設定。コンソールエラー 0、スマホで横スクロールなし
- Supabase スキーマ: PostgreSQL 16 で 40 項目を検証（世界修復の自動更新、読書位置のみ書き込み可、PvP の装備固定 など）

### 未実装（次フェーズ以降）

| 機能 | 予定 |
| --- | --- |
| CHAPTER 2 以降のシナリオ | データ追加で順次 |
| WORLD のエリア探索・NPC との会話・サブクエスト・探索能力（fieldAbilities）の使用 | PHASE 4 |
| アカウント・同期・対人戦（ARENA / RANKED / FRIEND / GHOST / RAID）・ランキング | PHASE 5 |
| SHOP、スキル強化・限界突破・融合・特殊形態 | PHASE 6 |
| 立ち絵・背景・Memory・敵のイラスト、BGM / SE の音声素材 | 素材が用意でき次第（データの差し替えのみ） |
| 戦闘中のリロード時の再開（現在は戦闘をやり直し） | 未定 |
