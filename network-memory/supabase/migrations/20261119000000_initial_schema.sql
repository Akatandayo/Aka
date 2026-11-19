-- =====================================================================
-- NETWORK - Memory: Re:Collection  初期スキーマ（PHASE 1 で設計 / PHASE 5 で接続）
-- =====================================================================
-- 方針
--  * マスターデータ（memories / memory_skills / worlds / quests / story_chapters）は全員が読み取り専用。
--  * プレイヤーデータは本人のみ参照可（RLS）。
--  * 通貨・Memory入手・戦闘結果・ランキングなど「報酬に関わる書き込み」はクライアントから直接行えない。
--    Edge Functions（service_role）がサーバー側で検証したうえで書き込む。
--  * クライアントが直接更新できるのは見た目・編成などゲームバランスに影響しない列のみ。
--  * Users は Supabase Auth の auth.users を使用する。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 列挙値（CHECK 制約で管理し、追加時はこのマイグレーションに追記する）
-- ---------------------------------------------------------------------
create domain memory_category as text check (value in ('HUMAN','CREATURE','CONCEPT','OBJECT','LOCATION','EVENT','UNKNOWN'));
create domain memory_rarity   as text check (value in ('COMMON','UNCOMMON','RARE','EPIC','LEGEND','IRREGULAR'));
create domain memory_attribute as text check (value in ('DATA','VOID','ERROR','LIFE','CHAOS','ORDER'));
create domain currency_code   as text check (value in ('DATA','FRAGMENT','CORE','CREDIT'));

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
  trigger        text,
  condition      jsonb,
  condition_text text,
  effects        jsonb not null default '[]',
  direction      jsonb,
  created_at     timestamptz not null default now(),
  check (kind <> 'passive' or trigger is not null),
  check (kind <> 'rewrite' or condition is not null)
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
  hp  int not null check (hp  >= 0),
  atk int not null check (atk >= 0),
  def int not null check (def >= 0),
  spd int not null check (spd >= 0),
  tec int not null check (tec >= 0),
  res int not null check (res >= 0),
  acquisition_method jsonb  not null default '[]',
  related_memories   text[] not null default '{}',
  story_id      text,                            -- Memory固有の記録（memory_stories.id）
  world_id      text references public.worlds(id),
  tags          text[] not null default '{}',
  is_active     boolean not null default true,   -- 配信停止時は false（プレイヤーの所持データは残す）
  created_at    timestamptz not null default now()
);

-- Memory とスキルの紐付け（skills / passiveSkills / rewrite）
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
alter table public.memories
  add constraint memories_story_fk foreign key (story_id) references public.memory_stories(id) deferrable initially deferred;

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

create table public.story_chapters (
  id          text primary key,                  -- 'CH-0001'
  world_id    text references public.worlds(id),
  title       text not null,
  sort_order  int not null default 0,
  unlock      jsonb not null default '{}',
  script      jsonb not null default '[]'          -- シナリオ（ノベルエンジン用データ）
);

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
  active_team_id   text not null default 'TEAM-1',
  settings      jsonb not null default '{}',
  flags         jsonb not null default '{}',      -- ストーリー/イベント条件フラグ
  discovered_memory_ids text[] not null default '{}',
  read_fragment_ids     text[] not null default '{}',
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

create table public.player_teams (
  user_id    uuid not null references auth.users(id) on delete cascade,
  team_id    text not null check (team_id in ('TEAM-1','TEAM-2','TEAM-3')),
  name       text not null check (char_length(name) between 1 and 16),
  slots      uuid[] not null default array[null,null,null]::uuid[] check (cardinality(slots) = 3),
  updated_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

create table public.world_progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  world_id   text not null references public.worlds(id),
  status     text not null default 'locked' check (status in ('locked','open','cleared')),
  progress   jsonb not null default '{}',          -- エリア・クエスト進行
  cleared_at timestamptz,
  primary key (user_id, world_id)
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
  mode        text not null check (mode in ('STORY','ARENA','RANKED','FRIEND','GHOST','RAID')),
  player_id   uuid not null references auth.users(id) on delete cascade,
  opponent_id uuid references auth.users(id) on delete set null,
  result      text check (result in ('WIN','LOSE','DRAW','ABORTED')),
  seed        bigint not null,                      -- サーバーが発行する乱数シード（再現検証用）
  teams       jsonb not null,                       -- 開始時点の編成スナップショット
  commands    jsonb not null default '[]',          -- クライアント入力（サーバーで再計算）
  log         jsonb,
  verified    boolean not null default false,       -- サーバー再計算で検証済みか
  created_at  timestamptz not null default now(),
  finished_at timestamptz
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

-- 編成: 自分の所持 Memory のみ・同一インスタンス/同一 Memory の重複不可
create or replace function public.validate_player_team() returns trigger
language plpgsql as $$
declare
  ids uuid[] := array(select s from unnest(new.slots) s where s is not null);
  owned int;
  distinct_memories int;
begin
  if cardinality(ids) <> (select count(distinct s) from unnest(ids) s) then
    raise exception 'duplicate instance in team';
  end if;
  select count(*), count(distinct memory_id) into owned, distinct_memories
    from public.player_memories where user_id = new.user_id and instance_id = any(ids);
  if owned <> cardinality(ids) then
    raise exception 'team contains memories not owned by player';
  end if;
  if distinct_memories <> owned then
    raise exception 'same memory twice in team';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger player_teams_validate before insert or update on public.player_teams
  for each row execute function public.validate_player_team();

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

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.worlds                   enable row level security;
alter table public.memory_skills            enable row level security;
alter table public.memories                 enable row level security;
alter table public.memory_skill_assignments enable row level security;
alter table public.memory_stories           enable row level security;
alter table public.quests                   enable row level security;
alter table public.story_chapters           enable row level security;
alter table public.player_profiles          enable row level security;
alter table public.player_memories          enable row level security;
alter table public.player_teams             enable row level security;
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
create policy "master read" on public.quests                   for select using (true);
create policy "master read" on public.story_chapters           for select using (true);

-- プレイヤーデータ: 本人のみ参照
create policy "own read" on public.player_profiles for select using (auth.uid() = user_id);
create policy "own read" on public.player_memories for select using (auth.uid() = user_id);
create policy "own read" on public.player_teams    for select using (auth.uid() = user_id);
create policy "own read" on public.world_progress  for select using (auth.uid() = user_id);
create policy "own read" on public.story_choices   for select using (auth.uid() = user_id);
create policy "own read" on public.inventory       for select using (auth.uid() = user_id);
create policy "own read" on public.transactions    for select using (auth.uid() = user_id);
create policy "own read" on public.battle_records  for select using (auth.uid() = player_id or auth.uid() = opponent_id);
create policy "public read" on public.rankings     for select using (true);

-- クライアントが直接書き込める範囲（バランスに影響しないもの）
create policy "own update" on public.player_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own update" on public.player_memories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own write"  on public.player_teams    for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own insert" on public.story_choices   for insert with check (auth.uid() = user_id);

-- 列単位の権限: 通貨・レベル等は更新させない
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant update (name, title, settings, active_team_id, last_login_at) on public.player_profiles to authenticated;
grant update (favorite) on public.player_memories to authenticated;
grant insert, update, delete on public.player_teams to authenticated;
grant insert on public.story_choices to authenticated;
