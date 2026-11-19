-- =====================================================================
-- NETWORK - Memory: ReCollection  初期スキーマ（PHASE 1 で設計・GDD Ver.2 / SYSTEM SPEC Ver.3 で改訂 / PHASE 5 で接続）
-- ※ 未適用のため、Ver.3（完全同期型 MEMORY SYNC・世界修復・ARCHIVE・STORY ENGINE・PvP 共通ルール）に合わせて直接改訂している。
--    PHASE 5 で本番適用した後の変更は、必ず新しいマイグレーションファイルで行うこと。
-- =====================================================================
-- 方針
--  * マスターデータ（memories / memory_skills / worlds / quests / story_chapters）は全員が読み取り専用。
--  * プレイヤーデータは本人のみ参照可（RLS）。
--  * 通貨・Memory入手・戦闘結果・ランキングなど「報酬に関わる書き込み」はクライアントから直接行えない。
--    Edge Functions（service_role）がサーバー側で検証したうえで書き込む。
--  * クライアントが直接更新できるのは外見・紹介文・装備などゲームバランスに影響しない列のみ。
--  * MEMORY SYNC（Memory の入手）・戦闘結果・経験値・流出反応の進行はサーバーで検証して書き込む。
--    戦闘はシード + コマンド列から Battle Engine（core/battle）をサーバーで再実行して検証する。
--  * 世界修復（world_progress）は所持 Memory から refresh_world_progress() が算出する（Memory 回収時にトリガーで更新）。
--  * 対人戦（PvP）は開始時の装備スナップショットで戦い、開始後の Memory 変更はできない（battle_records の固定トリガー）。
--  * Users は Supabase Auth の auth.users を使用する。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 列挙値（CHECK 制約で管理し、追加時はこのマイグレーションに追記する）
-- ---------------------------------------------------------------------
create domain memory_category as text check (value in ('HUMAN','CREATURE','CONCEPT','OBJECT','LOCATION','EVENT','UNKNOWN'));
create domain memory_rarity   as text check (value in ('COMMON','UNCOMMON','RARE','EPIC','LEGEND','IRREGULAR'));
create domain memory_attribute as text check (value in ('DATA','VOID','ERROR','LIFE','CHAOS','ORDER'));
create domain currency_code   as text check (value in ('DATA','FRAGMENT','CORE','CREDIT'));
create domain restoration_kind as text check (value in ('npc','area','event','object','ecosystem','function','anomaly'));
create domain archive_category as text check (value in ('character','world','event','term','fragment'));

-- =====================================================================
-- マスターデータ
-- =====================================================================

create table public.worlds (
  id          text primary key,                 -- 'WORLD-001'
  name        text not null,
  subtitle    text not null default '',
  description text not null default '',
  attribute   memory_attribute not null,
  unlock      jsonb not null default '{"type":"initial"}',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.memory_skills (
  id             text primary key,              -- 'SK-0001' / 'PS-0001' / 'RW-0001'
  name           text not null,
  name_en        text,
  kind           text not null check (kind in ('active','passive','rewrite')),
  attribute      memory_attribute,
  description    text not null,
  target         text,
  cooldown       int check (cooldown is null or cooldown >= 0),
  cost           int check (cost is null or cost >= 0),      -- 消費 SYNC ENERGY
  trigger        text,
  condition      jsonb,
  condition_text text,
  effects        jsonb not null default '[]',
  direction      jsonb,
  created_at     timestamptz not null default now(),
  check (kind <> 'passive' or trigger is not null)
);

create table public.memories (
  id            text primary key,               -- 'MEM-0001'
  name          text not null,
  name_en       text,
  title         text,
  category      memory_category  not null,
  rarity        memory_rarity    not null,
  attribute     memory_attribute not null,
  description   text not null,
  quote         text,
  illustration  text not null,
  -- 完全同期時の固有ステータス（Lv1 = baseStats）。メインに同期すると戦闘の基本ステータスになる（Ver.3 §2）
  hp  int not null check (hp  >= 0),
  atk int not null check (atk >= 0),
  def int not null check (def >= 0),
  spd int not null check (spd >= 0),
  tec int not null check (tec >= 0),
  res int not null check (res >= 0),
  -- 同期効果: {style（戦闘スタイル）, supportSkill（サブ枠で貸す補助スキル）, passiveBonus（パッシブ枠の能力補正 %）,
  --           rewrite（REWRITE）, direction（同期演出）, appearance（外見演出）}
  sync_effects       jsonb  not null check (jsonb_typeof(sync_effects) = 'object' and sync_effects ? 'style'),
  unlock_conditions  jsonb  not null default '[]',   -- MEMORY SYNC の同期条件（Condition[]）
  field_abilities    jsonb  not null default '[]',   -- 探索能力（戦闘能力を持たない Memory もある）
  persona            jsonb,                          -- 人物 Memory の人格・記憶
  acquisition_method jsonb  not null default '[]',
  related_memories   text[] not null default '{}',
  story_records text[] not null default '{}',    -- Memory固有の記録（memory_stories.id）
  world_id      text references public.worlds(id),
  tags          text[] not null default '{}',
  is_active     boolean not null default true,   -- 配信停止時は false（プレイヤーの所持データは残す）
  created_at    timestamptz not null default now()
);

-- Memory とスキルの紐付け（skills / passive / rewrite）。サブ枠の補助スキルは sync_effects.supportSkill（skills のいずれか）
create table public.memory_skill_assignments (
  memory_id  text not null references public.memories(id) on delete cascade,
  skill_id   text not null references public.memory_skills(id),
  slot       text not null check (slot in ('active','passive','rewrite')),
  sort_order int  not null default 0,
  primary key (memory_id, skill_id)
);
create unique index memory_one_rewrite on public.memory_skill_assignments (memory_id) where slot = 'rewrite';

-- Memory 固有の記録（ストーリー断片）
create table public.memory_stories (
  id        text primary key,                    -- 'REC-0001'
  memory_id text not null references public.memories(id) on delete cascade,
  fragments jsonb not null default '[]'           -- [{id,title,text,unlock,reveals?}]
);

-- 世界修復の対象（Ver.3 §5）。WORLD を追加しても既存の WORLD・Memory の行を書き換える必要はない
create table public.world_restorations (
  id               text primary key,             -- 'R001-LUX'
  world_id         text not null references public.worlds(id) on delete cascade,
  memory_id        text not null references public.memories(id),
  kind             restoration_kind,              -- null: Memory の分類から決定（HUMAN→npc / LOCATION→area / ...）
  name             text not null,
  description      text not null,
  lost_description text,
  sort_order       int not null default 0
);
create index world_restorations_world on public.world_restorations (world_id, sort_order);

create table public.items (
  id          text primary key,                  -- 'ITEM-0001'
  name        text not null,
  description text not null,
  kind        text not null check (kind in ('consumable','material','key')),
  battle      boolean not null default false,
  target      text,
  effects     jsonb not null default '[]',
  max_stack   int not null default 99 check (max_stack > 0)
);

create table public.enemies (
  id          text primary key,                  -- 'EN-0001'
  name        text not null,
  description text not null,
  attribute   memory_attribute not null,
  level       int not null check (level >= 1),
  boss        boolean not null default false,
  hp  int not null check (hp  >= 1),
  atk int not null check (atk >= 0),
  def int not null check (def >= 0),
  spd int not null check (spd >= 0),
  tec int not null check (tec >= 0),
  res int not null check (res >= 0),
  attack         jsonb not null,
  skills         text[] not null default '{}',
  passive_skills text[] not null default '{}',
  ai             jsonb not null default '[]'
);

create table public.encounters (
  id                text primary key,            -- 'ENC-001'
  world_id          text not null references public.worlds(id),
  name              text not null,
  description       text not null default '',
  recommended_level int not null default 1,
  boss              boolean not null default false,
  enemies           text[] not null check (cardinality(enemies) between 1 and 3),
  unlock            jsonb not null default '{"type":"initial"}',
  rewards           jsonb not null default '{}',
  first_clear       jsonb,
  sort_order        int not null default 0
);

create table public.quests (
  id          text primary key,
  world_id    text not null references public.worlds(id),
  kind        text not null check (kind in ('main','sub','event')),
  name        text not null,
  description text not null default '',
  requirements jsonb not null default '{}',
  rewards     jsonb not null default '[]',
  sort_order  int not null default 0
);

-- STORY ENGINE（Ver.3 §8）: 一本道のメインストーリー。シナリオは命令列（会話・背景・立ち絵・表情・BGM・SE・演出・分岐）
create table public.story_chapters (
  id          text primary key,                  -- 'CH-000'
  sort_order  int not null default 0,
  label       text not null,                     -- 'PROLOGUE' / 'CHAPTER 1'
  title       text not null,
  summary     text not null default '',
  unlock      jsonb not null default '[]',         -- Condition[]
  rewards     jsonb,                               -- 初回クリア報酬
  script      jsonb not null default '[]'
);

-- 登場人物（NPC）。立ち絵の画像が無い場合はクライアントが手続き生成する
create table public.story_characters (
  id          text primary key,                  -- 'CHR-HARUKA'
  name        text not null,
  reading     text,
  role        text not null,
  age         int,
  origin      text,
  color       text not null,
  hair        text,
  eyes        text,
  profile     text not null,
  abilities   jsonb not null default '[]',
  expressions text[] not null default '{normal}',
  portraits   jsonb                                -- 表情 ID → 画像パス
);

-- MEMORY ARCHIVE（Ver.3 §6）。MEMORY RECORD は memory_stories から、WORLD RECORD は worlds から生成する
create table public.archive_entries (
  id         text primary key,                   -- 'TERM-NETWORK' / 'CHR-REC-HARUKA' ...
  category   archive_category not null,
  title      text not null,
  subtitle   text,
  unlock     jsonb not null default '[]',          -- Condition[]（満たすまで内容を伏せる）
  sections   jsonb not null default '[]',          -- [{id,title,text,unlock?}]
  related    jsonb not null default '{}'
);

-- ONLINE（Ver.3 §9）: 対戦モードと共通ルール。PHASE 5 で enabled にする
create table public.pvp_modes (
  id          text primary key check (id in ('ARENA','RANKED','FRIEND','GHOST','RAID')),
  name        text not null,
  description text not null,
  rated       boolean not null default false,
  opponent    text not null check (opponent in ('player','friend','ghost','raid-boss')),
  rules       jsonb not null default '{"playersPerSide":1,"mainMemory":1,"lockLoadoutAfterStart":true,"subsSupportOnly":true,"serverVerified":true,"itemsAllowed":false}',
  enabled     boolean not null default false
);
insert into public.pvp_modes (id, name, description, rated, opponent) values
  ('ARENA',  'アリーナ',     '近いレートのプレイヤーとリアルタイムで対戦する。', true,  'player'),
  ('RANKED', 'ランクマッチ', 'シーズン制のランク戦。結果はランキングに記録される。', true,  'player'),
  ('FRIEND', 'フレンド対戦', 'フレンドと対戦する。レートは変動しない。', false, 'friend'),
  ('GHOST',  'ゴースト対戦', '他プレイヤーの装備スナップショット（AI 操作）と非同期で対戦する。', false, 'ghost'),
  ('RAID',   'レイド',       '期間限定の巨大流出体に挑む。各プレイヤーは 1 人で戦い、与えたダメージを全体で集計する。', false, 'raid-boss');

-- =====================================================================
-- プレイヤーデータ
-- =====================================================================

create table public.player_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  explorer_code text not null unique,            -- 'EX-XXXX-XXXX'
  name          text not null check (char_length(name) between 1 and 12),
  title         text not null default '新米探索者',
  level         int  not null default 1 check (level >= 1),
  exp           bigint not null default 0 check (exp >= 0),
  -- 通貨残高（増減は apply_currency_change() 経由のみ）
  data_balance     bigint not null default 0 check (data_balance     >= 0),
  fragment_balance bigint not null default 0 check (fragment_balance >= 0),
  core_balance     bigint not null default 0 check (core_balance     >= 0),
  credit_balance   bigint not null default 0 check (credit_balance   >= 0),
  avatar        jsonb not null default '{"preset":"explorer-01","color":"#3ee8ff"}',  -- 主人公の外見（将来拡張）
  bio           text not null default '' check (char_length(bio) <= 80),
  active_loadout_id text not null default 'LOADOUT-1',
  loadout_capacity  jsonb not null default '{"main":1,"sub":3,"passive":2}',  -- 装備枠（拡張はサーバーのみ）
  settings      jsonb not null default '{}',
  flags         jsonb not null default '{}',      -- ストーリー/イベント条件フラグ
  discovered_memory_ids text[] not null default '{}',
  read_fragment_ids     text[] not null default '{}',
  pending_sync_ids      text[] not null default '{}',  -- 検出済み・未同期の Memory
  read_archive_ids      text[] not null default '{}',  -- 閲覧済みの ARCHIVE 記録（NEW 表示用）
  created_at    timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.player_memories (
  instance_id   uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  memory_id     text not null references public.memories(id),
  level         int  not null default 1 check (level >= 1),
  exp           bigint not null default 0 check (exp >= 0),
  limit_break   int  not null default 0 check (limit_break between 0 and 4),
  skill_levels  jsonb not null default '{}',
  form          text,
  favorite      boolean not null default false,
  acquired_at   timestamptz not null default now(),
  acquired_from text not null default ''
);
create index player_memories_user on public.player_memories (user_id);

-- Memory 装備（GDD Ver.2 §6: メイン 1 / サブ 3 / パッシブ 2）
create table public.player_loadouts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  loadout_id text not null check (loadout_id in ('LOADOUT-1','LOADOUT-2','LOADOUT-3')),
  name       text not null check (char_length(name) between 1 and 16),
  main       uuid[] not null default array[null]::uuid[],
  sub        uuid[] not null default array[null,null,null]::uuid[],
  passive    uuid[] not null default array[null,null]::uuid[],
  updated_at timestamptz not null default now(),
  primary key (user_id, loadout_id)
);

create table public.encounter_progress (
  user_id          uuid not null references auth.users(id) on delete cascade,
  encounter_id     text not null references public.encounters(id),
  clears           int not null default 1 check (clears >= 1),
  best_rounds      int not null check (best_rounds >= 1),
  first_cleared_at timestamptz not null default now(),
  primary key (user_id, encounter_id)
);

-- 世界修復の状態（Ver.3 §5）。refresh_world_progress() が所持 Memory から算出して書き込む（クライアントは読み取りのみ）
create table public.world_progress (
  user_id            uuid not null references auth.users(id) on delete cascade,
  world_id           text not null references public.worlds(id),
  restoration_rate   numeric(5,4) not null default 0 check (restoration_rate between 0 and 1),
  required_memories  text[] not null default '{}',
  recovered_memories text[] not null default '{}',
  restored_objects   text[] not null default '{}',
  restored_npcs      text[] not null default '{}',
  unlocked_areas     text[] not null default '{}',
  unlocked_events    text[] not null default '{}',
  exploration        jsonb not null default '{}',     -- エリア探索・クエスト進行（PHASE 4）
  updated_at         timestamptz not null default now(),
  primary key (user_id, world_id)
);

-- メインストーリーの進行（Ver.3 §8）。章のクリア（報酬あり）はサーバーが記録し、読書中の位置はクライアントが更新できる
create table public.story_progress (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  completed_chapters text[] not null default '{}',
  current_chapter_id text references public.story_chapters(id),
  current_index      int check (current_index is null or current_index >= 0),
  updated_at         timestamptz not null default now(),
  check ((current_chapter_id is null) = (current_index is null))
);

create table public.story_choices (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  chapter_id text not null references public.story_chapters(id),
  choice_key text not null,
  value      text not null,
  chosen_at  timestamptz not null default now(),
  unique (user_id, chapter_id, choice_key)
);

create table public.inventory (
  user_id  uuid not null references auth.users(id) on delete cascade,
  item_id  text not null,
  quantity bigint not null check (quantity >= 0),
  primary key (user_id, item_id)
);

create table public.transactions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  currency      currency_code not null,
  amount        bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason        text not null,
  ref           jsonb not null default '{}',        -- 関連 ID（battle_record_id など）
  created_at    timestamptz not null default now()
);
create index transactions_user_time on public.transactions (user_id, created_at desc);

create table public.battle_records (
  id          uuid primary key default gen_random_uuid(),
  mode        text not null check (mode in ('PVE','STORY','ARENA','RANKED','FRIEND','GHOST','RAID')),
  encounter_id   text references public.encounters(id),
  engine_version int not null default 1,
  player_id   uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid references auth.users(id) on delete set null,
  result      text check (result in ('WIN','LOSE','DRAW','ABORTED')),
  seed        bigint not null,                      -- サーバーが発行する乱数シード（再現検証用）
  loadout_snapshot jsonb not null,                  -- 開始時点の装備・ステータスのスナップショット（開始後は変更不可）
  opponent_snapshot jsonb,                          -- 対戦相手のスナップショット（GHOST / 対人戦）
  commands    jsonb not null default '[]',          -- クライアント入力（サーバーで再計算）
  log         jsonb,
  verified    boolean not null default false,       -- サーバー再計算で検証済みか
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- 対人戦: メイン Memory 1 つのスナップショットが必須（PvP 共通ルール）
  check (mode in ('PVE','STORY') or (loadout_snapshot ? 'main' and jsonb_typeof(loadout_snapshot->'main') = 'object'))
);
create index battle_records_player on public.battle_records (player_id, created_at desc);

create table public.rankings (
  season     text not null,
  mode       text not null check (mode in ('ARENA','RANKED','RAID')),
  user_id    uuid not null references auth.users(id) on delete cascade,
  rating     int  not null default 1000,
  wins       int  not null default 0 check (wins >= 0),
  losses     int  not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now(),
  primary key (season, mode, user_id)
);
create index rankings_board on public.rankings (season, mode, rating desc);

-- =====================================================================
-- 整合性チェック
-- =====================================================================

-- 装備: 自分の所持 Memory のみ・同一インスタンス/同一 Memory の重複不可・スロットに装備できる Memory のみ
create or replace function public.validate_player_loadout() returns trigger
language plpgsql as $$
declare
  cap jsonb;
  all_ids uuid[];
  owned int;
  distinct_memories int;
begin
  select loadout_capacity into cap from public.player_profiles where user_id = new.user_id;
  cap := coalesce(cap, '{"main":1,"sub":3,"passive":2}');
  if cardinality(new.main) <> (cap->>'main')::int or cardinality(new.sub) <> (cap->>'sub')::int
     or cardinality(new.passive) <> (cap->>'passive')::int then
    raise exception 'loadout size does not match capacity';
  end if;
  all_ids := array(select x from unnest(new.main || new.sub || new.passive) x where x is not null);
  if cardinality(all_ids) <> (select count(distinct x) from unnest(all_ids) x) then
    raise exception 'duplicate instance in loadout';
  end if;
  select count(*), count(distinct memory_id) into owned, distinct_memories
    from public.player_memories where user_id = new.user_id and instance_id = any(all_ids);
  if owned <> cardinality(all_ids) then
    raise exception 'loadout contains memories not owned by player';
  end if;
  if distinct_memories <> owned then
    raise exception 'same memory twice in loadout';
  end if;
  -- メイン: 固有スキルを持つ Memory（完全同期）/ サブ: 補助スキルを持つ Memory / パッシブ: パッシブ能力か能力補正を持つ Memory
  if exists (
    select 1 from public.player_memories pm
    where pm.instance_id = any(array(select x from unnest(new.main) x where x is not null))
      and not exists (select 1 from public.memory_skill_assignments a where a.memory_id = pm.memory_id and a.slot = 'active')
  ) or exists (
    select 1 from public.player_memories pm join public.memories m on m.id = pm.memory_id
    where pm.instance_id = any(array(select x from unnest(new.sub) x where x is not null))
      and coalesce(m.sync_effects->>'supportSkill', '') = ''
  ) or exists (
    select 1 from public.player_memories pm join public.memories m on m.id = pm.memory_id
    where pm.instance_id = any(array(select x from unnest(new.passive) x where x is not null))
      and not exists (select 1 from public.memory_skill_assignments a where a.memory_id = pm.memory_id and a.slot = 'passive')
      and coalesce(m.sync_effects->'passiveBonus', '{}'::jsonb) = '{}'::jsonb
  ) then
    raise exception 'memory cannot be equipped in this slot';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger player_loadouts_validate before insert or update on public.player_loadouts
  for each row execute function public.validate_player_loadout();

-- 通貨の増減（サーバー専用）。残高更新と取引記録を同一トランザクションで行う。
create or replace function public.apply_currency_change(
  p_user uuid, p_currency currency_code, p_amount bigint, p_reason text, p_ref jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  new_balance bigint;
begin
  if p_amount = 0 then
    raise exception 'amount must not be zero';
  end if;
  update public.player_profiles set
    data_balance     = data_balance     + case when p_currency = 'DATA'     then p_amount else 0 end,
    fragment_balance = fragment_balance + case when p_currency = 'FRAGMENT' then p_amount else 0 end,
    core_balance     = core_balance     + case when p_currency = 'CORE'     then p_amount else 0 end,
    credit_balance   = credit_balance   + case when p_currency = 'CREDIT'   then p_amount else 0 end,
    updated_at = now()
  where user_id = p_user
  returning case p_currency
    when 'DATA' then data_balance when 'FRAGMENT' then fragment_balance
    when 'CORE' then core_balance else credit_balance end
  into new_balance;
  if new_balance is null then
    raise exception 'player not found';
  end if;
  -- 残高が負になる場合は CHECK 制約違反でトランザクションごと失敗する
  insert into public.transactions (user_id, currency, amount, balance_after, reason, ref)
  values (p_user, p_currency, p_amount, new_balance, p_reason, p_ref);
  return new_balance;
end $$;

-- Supabase は anon/authenticated に関数の実行権を既定付与するため、明示的に剥奪する
revoke all on function public.apply_currency_change(uuid, currency_code, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_currency_change(uuid, currency_code, bigint, text, jsonb) to service_role;

-- 世界修復（Ver.3 §5）: 所持 Memory から各 WORLD の修復状態を算出して保存する（サーバー専用）
create or replace function public.refresh_world_progress(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  with owned as (
    select distinct memory_id from public.player_memories where user_id = p_user
  ), targets as (
    select r.world_id, r.id, r.memory_id, r.sort_order,
           coalesce(r.kind, case m.category
             when 'HUMAN' then 'npc' when 'LOCATION' then 'area' when 'EVENT' then 'event' when 'OBJECT' then 'object'
             when 'CREATURE' then 'ecosystem' when 'CONCEPT' then 'function' else 'anomaly' end) as kind,
           exists (select 1 from owned o where o.memory_id = r.memory_id) as restored
      from public.world_restorations r join public.memories m on m.id = r.memory_id
  ), agg as (
    select w.id as world_id,
           array(select distinct t.memory_id from targets t where t.world_id = w.id order by 1) as req,
           array(select distinct t.memory_id from targets t where t.world_id = w.id and t.restored order by 1) as rec,
           array(select t.id from targets t where t.world_id = w.id and t.restored and t.kind in ('object','ecosystem','function','anomaly') order by t.sort_order) as objs,
           array(select t.id from targets t where t.world_id = w.id and t.restored and t.kind = 'npc'   order by t.sort_order) as npcs,
           array(select t.id from targets t where t.world_id = w.id and t.restored and t.kind = 'area'  order by t.sort_order) as areas,
           array(select t.id from targets t where t.world_id = w.id and t.restored and t.kind = 'event' order by t.sort_order) as events
      from public.worlds w
  )
  insert into public.world_progress as wp
    (user_id, world_id, restoration_rate, required_memories, recovered_memories, restored_objects, restored_npcs, unlocked_areas, unlocked_events, updated_at)
  select p_user, a.world_id,
         case when cardinality(a.req) = 0 then 0 else round(cardinality(a.rec)::numeric / cardinality(a.req), 4) end,
         a.req, a.rec, a.objs, a.npcs, a.areas, a.events, now()
    from agg a
  on conflict (user_id, world_id) do update set
    restoration_rate   = excluded.restoration_rate,
    required_memories  = excluded.required_memories,
    recovered_memories = excluded.recovered_memories,
    restored_objects   = excluded.restored_objects,
    restored_npcs      = excluded.restored_npcs,
    unlocked_areas     = excluded.unlocked_areas,
    unlocked_events    = excluded.unlocked_events,
    updated_at         = now()
  where wp.recovered_memories is distinct from excluded.recovered_memories
     or wp.required_memories  is distinct from excluded.required_memories;
end $$;
revoke all on function public.refresh_world_progress(uuid) from public, anon, authenticated;
grant execute on function public.refresh_world_progress(uuid) to service_role;

-- Memory の回収（同期）・削除で世界の状態を更新する
create or replace function public.player_memories_refresh_world() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_world_progress(coalesce(new.user_id, old.user_id));
  return null;
end $$;
revoke all on function public.player_memories_refresh_world() from public, anon, authenticated;
create trigger player_memories_world after insert or delete on public.player_memories
  for each row execute function public.player_memories_refresh_world();

-- 対人戦の共通ルール: バトル開始後は Memory（装備スナップショット）とシードを変更できない
create or replace function public.lock_battle_snapshot() returns trigger
language plpgsql as $$
begin
  if new.loadout_snapshot is distinct from old.loadout_snapshot or new.seed is distinct from old.seed
     or new.mode is distinct from old.mode or new.player_id is distinct from old.player_id then
    raise exception 'loadout is locked after battle start';
  end if;
  return new;
end $$;
create trigger battle_records_lock before update on public.battle_records
  for each row execute function public.lock_battle_snapshot();

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.worlds                   enable row level security;
alter table public.memory_skills            enable row level security;
alter table public.memories                 enable row level security;
alter table public.memory_skill_assignments enable row level security;
alter table public.memory_stories           enable row level security;
alter table public.items                    enable row level security;
alter table public.enemies                  enable row level security;
alter table public.encounters               enable row level security;
alter table public.quests                   enable row level security;
alter table public.story_chapters           enable row level security;
alter table public.world_restorations       enable row level security;
alter table public.story_characters         enable row level security;
alter table public.archive_entries          enable row level security;
alter table public.pvp_modes                enable row level security;
alter table public.story_progress           enable row level security;
alter table public.player_profiles          enable row level security;
alter table public.player_memories          enable row level security;
alter table public.player_loadouts          enable row level security;
alter table public.encounter_progress       enable row level security;
alter table public.world_progress           enable row level security;
alter table public.story_choices            enable row level security;
alter table public.inventory                enable row level security;
alter table public.transactions             enable row level security;
alter table public.battle_records           enable row level security;
alter table public.rankings                 enable row level security;

-- マスターデータ: 誰でも読み取りのみ
create policy "master read" on public.worlds                   for select using (true);
create policy "master read" on public.memory_skills            for select using (true);
create policy "master read" on public.memories                 for select using (true);
create policy "master read" on public.memory_skill_assignments for select using (true);
create policy "master read" on public.memory_stories           for select using (true);
create policy "master read" on public.items                    for select using (true);
create policy "master read" on public.enemies                  for select using (true);
create policy "master read" on public.encounters               for select using (true);
create policy "master read" on public.quests                   for select using (true);
create policy "master read" on public.story_chapters           for select using (true);
create policy "master read" on public.world_restorations       for select using (true);
create policy "master read" on public.story_characters         for select using (true);
create policy "master read" on public.archive_entries          for select using (true);
create policy "master read" on public.pvp_modes                for select using (true);

-- プレイヤーデータ: 本人のみ参照
create policy "own read" on public.player_profiles for select using (auth.uid() = user_id);
create policy "own read" on public.player_memories for select using (auth.uid() = user_id);
create policy "own read" on public.player_loadouts for select using (auth.uid() = user_id);
create policy "own read" on public.encounter_progress for select using (auth.uid() = user_id);
create policy "own read" on public.world_progress  for select using (auth.uid() = user_id);
create policy "own read" on public.story_choices   for select using (auth.uid() = user_id);
create policy "own read" on public.story_progress  for select using (auth.uid() = user_id);
create policy "own read" on public.inventory       for select using (auth.uid() = user_id);
create policy "own read" on public.transactions    for select using (auth.uid() = user_id);
create policy "own read" on public.battle_records  for select using (auth.uid() = player_id or auth.uid() = opponent_id);
create policy "public read" on public.rankings     for select using (true);

-- クライアントが直接書き込める範囲（バランスに影響しないもの）
create policy "own update" on public.player_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own update" on public.player_memories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own write"  on public.player_loadouts for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own insert" on public.story_choices   for insert with check (auth.uid() = user_id);
create policy "own update" on public.story_progress  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 列単位の権限: 通貨・レベル等は更新させない
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant update (name, title, avatar, bio, settings, active_loadout_id, last_login_at, read_archive_ids) on public.player_profiles to authenticated;
grant update (favorite) on public.player_memories to authenticated;
grant insert, update, delete on public.player_loadouts to authenticated;
grant insert on public.story_choices to authenticated;
grant update (current_chapter_id, current_index, updated_at) on public.story_progress to authenticated;
