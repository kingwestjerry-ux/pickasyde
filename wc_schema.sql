-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- PickASyde â FIFA World Cup 2026 Schema
-- Run this in Supabase SQL Editor (Database â SQL Editor â New query)
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

-- ââ User bracket entries ââââââââââââââââââââââââââââââââââââââââââââââââââ
-- entry_data JSONB shape:
--   {
--     groupPicks:    { A: ['USA','Morocco'], B: ['Mexico','Poland'], ... },
--     knockoutPicks: { r32_1: 'USA', r16_1: 'USA', qf_1: 'USA', ... },
--     finalScore:    { a: 2, b: 1 }   -- optional, for the Final tiebreaker
--   }
create table if not exists wc_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  entry_data    jsonb not null default '{}',
  total_points  int  not null default 0,
  last_updated  timestamptz not null default now(),
  constraint wc_entries_user_unique unique (user_id)
);

-- ââ Match results (admin-entered) âââââââââââââââââââââââââââââââââââââââââ
-- match_id examples:
--   group_A, group_B â¦ group_P    (group stage advancers)
--   r32_1 â¦ r32_16               (round of 32)
--   r16_1 â¦ r16_8                (round of 16)
--   qf_1  â¦ qf_4                 (quarterfinals)
--   sf_1, sf_2                   (semifinals)
--   final                        (the final)
--
-- For group matches:  winner = comma-sep team names e.g. 'USA,Morocco'
-- For knockout:       winner = single team name e.g. 'USA'
-- score_a / score_b used only for the Final (tiebreaker)
create table if not exists wc_results (
  id         serial primary key,
  match_id   text not null,
  winner     text not null,
  score_a    int,
  score_b    int,
  settled_at timestamptz not null default now(),
  constraint wc_results_match_unique unique (match_id)
);

-- ââ Side wagers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- status flow:  open â accepted â settled
--                   ââ cancelled  (creator cancels before anyone accepts)
create table if not exists wc_wagers (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references auth.users(id) on delete cascade,
  taker_id      uuid references auth.users(id) on delete set null,
  match_id      text not null,          -- e.g. 'r32_1'
  match_desc    text not null,          -- human-readable e.g. 'R32: ðºð¸ USA vs ðµð± Poland'
  creator_team  text not null,          -- team creator is backing
  taker_team    text not null,          -- other team (auto-set when wager is created)
  amount_cents  int  not null check (amount_cents > 0),
  status        text not null default 'open'
                  check (status in ('open','accepted','settled','cancelled')),
  winner_team   text,                   -- set when match result is entered
  -- Stripe fields (optional â for automated escrow)
  stripe_creator_pi  text,             -- Payment Intent ID for creator
  stripe_taker_pi    text,             -- Payment Intent ID for taker
  created_at    timestamptz not null default now()
);

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- Row Level Security
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

alter table wc_entries enable row level security;
alter table wc_results  enable row level security;
alter table wc_wagers   enable row level security;

-- wc_entries: users can read all (leaderboard), write only their own
create policy "wc_entries_select_all" on wc_entries for select using (true);
create policy "wc_entries_insert_own" on wc_entries for insert with check (auth.uid() = user_id);
create policy "wc_entries_update_own" on wc_entries for update using (auth.uid() = user_id);

-- wc_results: public read; only service role / admin can write
-- (Admin writes via Supabase dashboard or a service-role edge function)
create policy "wc_results_select_all" on wc_results for select using (true);
create policy "wc_results_admin_write" on wc_results for all
  using  (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));

-- wc_wagers: public read (marketplace); authenticated users can insert/update own
create policy "wc_wagers_select_all"  on wc_wagers for select using (true);
create policy "wc_wagers_insert_auth" on wc_wagers for insert with check (auth.uid() = creator_id);
create policy "wc_wagers_update_own"  on wc_wagers for update
  using (auth.uid() = creator_id or auth.uid() = taker_id);
create policy "wc_wagers_admin_settle" on wc_wagers for update
  using (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- Helpful indexes
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create index if not exists idx_wc_entries_points  on wc_entries (total_points desc);
create index if not exists idx_wc_wagers_match    on wc_wagers  (match_id);
create index if not exists idx_wc_wagers_status   on wc_wagers  (status);
create index if not exists idx_wc_wagers_creator  on wc_wagers  (creator_id);
create index if not exists idx_wc_wagers_taker    on wc_wagers  (taker_id);

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- NOTE: This schema assumes the existing user_profiles table from PickASyde v1
-- already exists (with columns: id, is_admin, username, email).
-- If starting fresh, also run your original schema.sql first.
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
