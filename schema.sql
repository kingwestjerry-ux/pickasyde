-- ─────────────────────────────────────────────────────────────────────────────
-- VERSUS — Supabase Schema v1.0
-- Run this entire file in your Supabase SQL Editor (Database → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── debates ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debates (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  date               date UNIQUE NOT NULL,          -- YYYY-MM-DD, one per day
  question           text NOT NULL,
  label_a            text NOT NULL,                 -- e.g. "CREATED"
  label_b            text NOT NULL,                 -- e.g. "RANDOM"
  base_seed_a        integer NOT NULL DEFAULT 45,   -- starting vote weight for side A
  base_seed_b        integer NOT NULL DEFAULT 45,   -- starting vote weight for side B
  sponsor_name       text,                          -- nullable
  sponsor_logo_letter text,                         -- single char, nullable
  sponsor_color      text,                          -- hex, nullable
  sponsor_tagline    text,                          -- nullable
  is_closed          boolean NOT NULL DEFAULT false,
  final_pct_a        integer,                       -- locked in by edge function at midnight
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Allow anyone to read debates (public)
ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "debates are public" ON debates FOR SELECT USING (true);
-- Only service role (edge function / admin) can insert/update
CREATE POLICY "service role can manage debates" ON debates FOR ALL
  USING (auth.role() = 'service_role');

-- ─── user_profiles ────────────────────────────────────────────────────────────
-- Mirrors auth.users, extended with streak tracking.
-- Created automatically via trigger on first sign-in.
CREATE TABLE IF NOT EXISTS user_profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     text NOT NULL DEFAULT 'Anonymous',
  is_ai_seed       boolean NOT NULL DEFAULT false,
  current_streak   integer NOT NULL DEFAULT 0,
  last_voted_date  date,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
-- Anyone can read profiles (for display names / avatars)
CREATE POLICY "profiles are public" ON user_profiles FOR SELECT USING (true);
-- Users can only update their own profile
CREATE POLICY "update own profile" ON user_profiles FOR UPDATE
  USING (auth.uid() = id);
-- Service role can do anything (for AI seed creation & streak updates)
CREATE POLICY "service role full access profiles" ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');
-- Users can insert their own profile (handled by trigger, but allow as fallback)
CREATE POLICY "insert own profile" ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Anonymous')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── votes ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  debate_id  uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side       char(1) NOT NULL CHECK (side IN ('A', 'B')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (debate_id, user_id)   -- one vote per user per debate
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
-- Anyone can read vote counts (but not who voted — handled in query layer)
CREATE POLICY "votes are public" ON votes FOR SELECT USING (true);
-- Users can only insert their own votes
CREATE POLICY "insert own vote" ON votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- Users can update their own vote only if debate is still open
CREATE POLICY "update own vote if open" ON votes FOR UPDATE
  USING (
    auth.uid() = user_id AND
    (SELECT is_closed FROM debates WHERE id = debate_id) = false
  );

-- ─── comments ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  debate_id     uuid NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side          char(1) NOT NULL CHECK (side IN ('A', 'B')),
  text          text NOT NULL,
  upvote_count  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
  -- Comments are immutable once the debate is closed (enforced via RLS)
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
-- Anyone can read comments
CREATE POLICY "comments are public" ON comments FOR SELECT USING (true);
-- Users can insert comments only on open debates
CREATE POLICY "comment on open debates" ON comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    (SELECT is_closed FROM debates WHERE id = debate_id) = false
  );
-- Comments cannot be updated or deleted by regular users (immutable)
-- Service role can update upvote_count via trigger
CREATE POLICY "service role update comments" ON comments FOR UPDATE
  USING (auth.role() = 'service_role');

-- ─── upvotes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS upvotes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id  uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)  -- one upvote per user per comment
);

ALTER TABLE upvotes ENABLE ROW LEVEL SECURITY;
-- Anyone can read upvotes
CREATE POLICY "upvotes are public" ON upvotes FOR SELECT USING (true);
-- Users can insert their own upvotes (insert only, no delete)
CREATE POLICY "upvote once" ON upvotes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── Trigger: keep comments.upvote_count in sync ───────────────────────────
CREATE OR REPLACE FUNCTION increment_upvote_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE comments SET upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_upvote_insert ON upvotes;
CREATE TRIGGER on_upvote_insert
  AFTER INSERT ON upvotes
  FOR EACH ROW EXECUTE FUNCTION increment_upvote_count();

-- ─── Trigger: update streak in user_profiles when a vote is cast ───────────
CREATE OR REPLACE FUNCTION update_streak_on_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  debate_date date;
  profile     user_profiles%ROWTYPE;
BEGIN
  SELECT date INTO debate_date FROM debates WHERE id = NEW.debate_id;
  SELECT * INTO profile FROM user_profiles WHERE id = NEW.user_id;

  IF profile.last_voted_date IS NULL THEN
    -- First vote ever
    UPDATE user_profiles SET current_streak = 1, last_voted_date = debate_date WHERE id = NEW.user_id;
  ELSIF debate_date = profile.last_voted_date + INTERVAL '1 day' THEN
    -- Consecutive day
    UPDATE user_profiles SET current_streak = current_streak + 1, last_voted_date = debate_date WHERE id = NEW.user_id;
  ELSIF debate_date > profile.last_voted_date THEN
    -- Streak broken (gap > 1 day)
    UPDATE user_profiles SET current_streak = 1, last_voted_date = debate_date WHERE id = NEW.user_id;
  END IF;
  -- If same day (e.g. vote change), do nothing
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_vote_insert ON votes;
CREATE TRIGGER on_vote_insert
  AFTER INSERT ON votes
  FOR EACH ROW EXECUTE FUNCTION update_streak_on_vote();

-- ─── AI Seed persona accounts ──────────────────────────────────────────────
-- These are inserted directly into user_profiles with placeholder UUIDs.
-- In production, create matching auth.users rows via Supabase service role,
-- then update these IDs. Or use the seeder IDs as-is if you only seed via admin UI.
-- The frontend checks is_ai_seed to render the persona name instead of a real user name.
--
-- To insert real AI seed profiles, run:
-- INSERT INTO user_profiles (id, display_name, is_ai_seed) VALUES
--   ('<uuid>', 'Marcus_Delray', true),
--   ('<uuid>', 'jess.thornton', true),
--   ...
-- (IDs must match existing auth.users rows)

-- ─── Sample debate row (replace / delete before going live) ───────────────
INSERT INTO debates (date, question, label_a, label_b, base_seed_a, base_seed_b, sponsor_name, sponsor_logo_letter, sponsor_color, sponsor_tagline)
VALUES (
  CURRENT_DATE,
  'Is luck random or created?',
  'CREATED',
  'RANDOM',
  45, 45,
  'Gatorade', 'G', '#f7941d', 'Win from within.'
)
ON CONFLICT (date) DO NOTHING;
