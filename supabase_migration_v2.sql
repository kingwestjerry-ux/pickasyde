-- ============================================================
-- Pick A Syde — v2 Schema Migration
-- Run AFTER supabase_migration_v1.sql
-- Changes: 2-switch support + upvote remove trigger
-- ============================================================

-- ── 1. Allow multiple side switches per user per debate ───────────────────────
-- Drop the unique constraint that limited users to 1 switch.
-- App logic now enforces a max of 2 switches.
DROP INDEX IF EXISTS public.side_switch_events_user_debate_idx;

-- ── 2. DB trigger to DECREMENT upvote_count when an upvote is deleted ─────────
-- We already have an INSERT trigger that increments it.
-- This DELETE trigger keeps the count accurate when users remove upvotes.

CREATE OR REPLACE FUNCTION public.handle_upvote_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.comments
    SET upvote_count = GREATEST(0, upvote_count - 1)
    WHERE id = OLD.comment_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_upvote_delete ON public.upvotes;
CREATE TRIGGER on_upvote_delete
  AFTER DELETE ON public.upvotes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_upvote_delete();

-- ── 3. RLS: allow users to delete their own upvotes ───────────────────────────
-- (Only needed if RLS is enabled on upvotes table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'upvotes' AND policyname = 'Users can delete their own upvotes'
  ) THEN
    CREATE POLICY "Users can delete their own upvotes"
      ON public.upvotes FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 4. Allow admins (service role) to delete any comment ─────────────────────
-- The app checks isAdmin() before calling deleteComment, but Supabase
-- anon key respects RLS. If you have a separate admin RLS policy, add it here.
-- For now the existing "Users can delete their own comments" policy applies.
-- If you want admins (kingwest.jerry) to delete any comment via the app,
-- add a policy like:
--   CREATE POLICY "Admins can delete any comment"
--     ON public.comments FOR DELETE
--     USING (true);  -- restricted by app-level check
-- NOTE: Only run the above if the app correctly restricts to admin users.

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Changes applied:
--   ✓ Removed unique constraint on side_switch_events (enables 2nd switch)
--   ✓ Added DELETE trigger on upvotes to decrement comments.upvote_count
--   ✓ Added RLS DELETE policy for upvotes
