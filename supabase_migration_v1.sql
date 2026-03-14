-- ============================================================
-- Pick A Syde — v1 Schema Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── 1. Add comment_status + linked_switch_event_id to comments ──────────────
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS comment_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS linked_switch_event_id UUID;

-- comment_status values: 'active' | 'historical'
-- historical = comment was made before user switched sides

-- ── 2. Add switch_count to votes ─────────────────────────────────────────────
-- Tracks how many times the user has switched for this debate (max 1 enforced in app)
ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS switch_count INTEGER NOT NULL DEFAULT 0;

-- ── 3. Create side_switch_events table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.side_switch_events (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debate_id             UUID        NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  previous_side         TEXT        NOT NULL CHECK (previous_side IN ('A','B')),
  new_side              TEXT        NOT NULL CHECK (new_side IN ('A','B')),
  persuading_comment_id UUID        REFERENCES public.comments(id) ON DELETE SET NULL,
  switch_reason_text    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One switch per user per debate (enforced)
CREATE UNIQUE INDEX IF NOT EXISTS side_switch_events_user_debate_idx
  ON public.side_switch_events(user_id, debate_id);

-- RLS
ALTER TABLE public.side_switch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own switch events"
  ON public.side_switch_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own switch events"
  ON public.side_switch_events FOR SELECT
  USING (auth.uid() = user_id);

-- Admins / analytics can read all (optional — add if you have a service role)
-- CREATE POLICY "Service role can read all" ON public.side_switch_events FOR SELECT USING (true);

-- ── 4. Create persuasion_signal_events table ──────────────────────────────────
-- Logs every time a user taps "This changed my mind" (before confirming switch)
CREATE TABLE IF NOT EXISTS public.persuasion_signal_events (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debate_id  UUID        NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  comment_id UUID        NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.persuasion_signal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own persuasion signals"
  ON public.persuasion_signal_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own persuasion signals"
  ON public.persuasion_signal_events FOR SELECT
  USING (auth.uid() = user_id);

-- ── 5. user_profiles streak columns (add if not already present) ─────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS current_streak  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_vote_date  DATE;

-- ── 6. Helpful indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS comments_debate_status_idx
  ON public.comments(debate_id, comment_status);

CREATE INDEX IF NOT EXISTS sse_debate_idx
  ON public.side_switch_events(debate_id);

CREATE INDEX IF NOT EXISTS pse_comment_idx
  ON public.persuasion_signal_events(comment_id);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Tables created:
--   side_switch_events
--   persuasion_signal_events
-- Columns added:
--   comments.comment_status ('active' | 'historical')
--   comments.linked_switch_event_id
--   votes.switch_count
--   user_profiles.current_streak / longest_streak / last_vote_date
