import { supabase } from './supabase.js';

// ─── Admin check ──────────────────────────────────────────────────────────────
// Change this list to grant admin access to real accounts.
const ADMIN_EMAILS = ['admin@pickasyde.com', 'kingwest.jerry@gmail.com'];

export function isAdmin(user) {
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Returns today's date as YYYY-MM-DD in Eastern Time (EST/EDT).
function getTodayEST() {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // en-CA gives YYYY-MM-DD
}

// ─── Debates ──────────────────────────────────────────────────────────────────

/**
 * Fetch today's debate (matched by EST date).
 * Returns the debate row, or null if none is scheduled for today.
 */
export async function getTodayDebate() {
  const today = getTodayEST();
  const { data, error } = await supabase
    .from('debates')
    .select('*')
    .eq('date', today)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = "no rows" — not an error we need to throw
    console.error('getTodayDebate error:', error);
    throw error;
  }
  return data ?? null;
}

/**
 * Fetch all closed debates, newest first (for the Archive screen).
 */
export async function getArchive() {
  const { data, error } = await supabase
    .from('debates')
    .select('*')
    .eq('is_closed', true)
    .order('date', { ascending: false });

  if (error) {
    console.error('getArchive error:', error);
    throw error;
  }
  return data ?? [];
}

// ─── Votes ────────────────────────────────────────────────────────────────────

/**
 * Get the current user's vote for a specific debate.
 * Returns 'A', 'B', or null.
 */
export async function getUserVote(debateId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('votes')
    .select('id, side')
    .eq('debate_id', debateId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('getUserVote error:', error);
    throw error;
  }
  return data ?? null; // { id, side } or null
}

/**
 * Get total vote counts for a debate (for the vote bar).
 * Returns { countA, countB }.
 */
export async function getVoteCounts(debateId) {
  const { data, error } = await supabase
    .from('votes')
    .select('side')
    .eq('debate_id', debateId);

  if (error) {
    console.error('getVoteCounts error:', error);
    throw error;
  }
  const countA = data.filter(v => v.side === 'A').length;
  const countB = data.filter(v => v.side === 'B').length;
  return { countA, countB };
}

/**
 * Cast a new vote for the current user.
 * Returns the created vote row.
 * Throws a user-friendly error string on unique constraint violation.
 */
export async function castVote(debateId, side) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('votes')
    .insert({ debate_id: debateId, user_id: user.id, side })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Unique violation — user already voted in this debate
      throw new Error('You have already voted in this debate. Use changeVote() to change it.');
    }
    console.error('castVote error:', error);
    throw error;
  }
  return data;
}

/**
 * Change an existing vote to a new side.
 * voteId is the UUID of the existing vote row.
 */
export async function changeVote(voteId, side) {
  const { data, error } = await supabase
    .from('votes')
    .update({ side })
    .eq('id', voteId)
    .select()
    .single();

  if (error) {
    if (error.code === '42501') {
      throw new Error('Cannot change vote — debate is closed.');
    }
    console.error('changeVote error:', error);
    throw error;
  }
  return data;
}

/**
 * Execute a full side switch:
 *  1. Update vote (new side + increment switch_count to 1)
 *  2. Mark user's existing active comment as 'historical'
 *  3. Insert a side_switch_event record
 * Returns { voteRow, switchEvent }
 */
export async function executeSideSwitch({ voteId, debateId, previousSide, newSide, persuadingCommentId, switchReasonText }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // 1. Update vote
  const { data: voteRow, error: vErr } = await supabase
    .from('votes')
    .update({ side: newSide, switch_count: 1 })
    .eq('id', voteId)
    .select()
    .single();
  if (vErr) { console.error('executeSideSwitch vote error:', vErr); throw vErr; }

  // 2. Mark any active comment on old side as historical
  await supabase
    .from('comments')
    .update({ comment_status: 'historical' })
    .eq('debate_id', debateId)
    .eq('user_id', user.id)
    .eq('comment_status', 'active');

  // 3. Insert side_switch_event
  const { data: switchEvent, error: sErr } = await supabase
    .from('side_switch_events')
    .insert({
      user_id: user.id,
      debate_id: debateId,
      previous_side: previousSide,
      new_side: newSide,
      persuading_comment_id: persuadingCommentId || null,
      switch_reason_text: switchReasonText || null,
    })
    .select()
    .single();
  if (sErr) { console.error('executeSideSwitch event error:', sErr); throw sErr; }

  return { voteRow, switchEvent };
}

/**
 * Check if the current user has already used their one side switch for a debate.
 * Returns true if they have.
 */
export async function hasUserSwitched(debateId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from('side_switch_events')
    .select('id')
    .eq('debate_id', debateId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('hasUserSwitched error:', error); return false; }
  return !!data;
}

/**
 * Log a persuasion signal (user tapped "This changed my mind").
 * Called BEFORE the confirmation modal — every tap is captured for analytics.
 */
export async function logPersuasionSignal(debateId, commentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('persuasion_signal_events')
    .insert({ user_id: user.id, debate_id: debateId, comment_id: commentId });

  if (error && error.code !== '23505') {
    console.error('logPersuasionSignal error:', error);
  }
}

/**
 * Fetch comments including comment_status (active vs historical).
 * Use this instead of getComments going forward.
 */
export async function getCommentsWithStatus(debateId) {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      id,
      debate_id,
      user_id,
      side,
      text,
      upvote_count,
      created_at,
      comment_status,
      user_profiles ( display_name, is_ai_seed )
    `)
    .eq('debate_id', debateId)
    .order('created_at', { ascending: false });

  if (error) { console.error('getCommentsWithStatus error:', error); throw error; }
  return data ?? [];
}

// ─── Comments ─────────────────────────────────────────────────────────────────

/**
 * Fetch all comments for a debate, newest first.
 * Joins user_profiles to get display names.
 */
export async function getComments(debateId) {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      id,
      debate_id,
      user_id,
      side,
      text,
      upvote_count,
      created_at,
      user_profiles ( display_name, is_ai_seed )
    `)
    .eq('debate_id', debateId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getComments error:', error);
    throw error;
  }
  return data ?? [];
}

/**
 * Post a new comment. The user must have voted before calling this.
 * text — raw comment string (should be moderated before calling).
 * Returns the created comment row.
 */
export async function postComment(debateId, side, text) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('comments')
    .insert({ debate_id: debateId, user_id: user.id, side, text })
    .select(`
      id,
      debate_id,
      user_id,
      side,
      text,
      upvote_count,
      created_at,
      user_profiles ( display_name, is_ai_seed )
    `)
    .single();

  if (error) {
    console.error('postComment error:', error);
    throw error;
  }
  return data;
}

// ─── Upvotes ──────────────────────────────────────────────────────────────────

/**
 * Upvote a comment. The DB trigger will increment comments.upvote_count.
 * Returns the created upvote row.
 * Throws a user-friendly error on duplicate upvote.
 */
export async function upvoteComment(commentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('upvotes')
    .insert({ comment_id: commentId, user_id: user.id })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('You have already upvoted this comment.');
    }
    console.error('upvoteComment error:', error);
    throw error;
  }
  return data;
}

/**
 * Get the set of comment IDs the current user has upvoted for a given debate.
 * Returns a Set of comment UUIDs.
 */
export async function getUserUpvotes(debateId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  // Get all comment IDs for this debate first
  const { data: commentIds, error: cErr } = await supabase
    .from('comments')
    .select('id')
    .eq('debate_id', debateId);

  if (cErr || !commentIds?.length) return new Set();

  const ids = commentIds.map(c => c.id);
  const { data, error } = await supabase
    .from('upvotes')
    .select('comment_id')
    .eq('user_id', user.id)
    .in('comment_id', ids);

  if (error) {
    console.error('getUserUpvotes error:', error);
    return new Set();
  }
  return new Set(data.map(u => u.comment_id));
}

// ─── User profile ─────────────────────────────────────────────────────────────

/**
 * Fetch the current user's profile (streak, display name, etc.).
 */
export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('getUserProfile error:', error);
    return null;
  }
  return data;
}

/**
 * Update the current user's display name.
 */
export async function updateDisplayName(name) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_profiles')
    .update({ display_name: name })
    .eq('id', user.id);

  if (error) throw error;
}

// ─── Real-time subscription ───────────────────────────────────────────────────

/**
 * Subscribe to new comments for a debate.
 * onNewComment receives a fully-shaped comment object.
 * Returns the channel — call channel.unsubscribe() on cleanup.
 */
export function subscribeToComments(debateId, onNewComment) {
  const channel = supabase
    .channel(`comments:${debateId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `debate_id=eq.${debateId}`,
      },
      async (payload) => {
        // Fetch the full comment with joined profile so it matches getCommentsWithStatus() shape
        const { data } = await supabase
          .from('comments')
          .select(`
            id,
            debate_id,
            user_id,
            side,
            text,
            upvote_count,
            created_at,
            comment_status,
            user_profiles ( display_name, is_ai_seed )
          `)
          .eq('id', payload.new.id)
          .single();

        if (data) onNewComment(data);
      }
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to upvote_count changes on comments for a debate.
 * onUpdate receives { commentId, newCount }.
 */
export function subscribeToUpvotes(debateId, onUpdate) {
  const channel = supabase
    .channel(`upvotes:${debateId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'comments',
        filter: `debate_id=eq.${debateId}`,
      },
      (payload) => {
        onUpdate({ commentId: payload.new.id, newCount: payload.new.upvote_count });
      }
    )
    .subscribe();

  return channel;
}

/**
 * Update the text of an existing comment (owner only, open debates).
 * Returns the updated comment row.
 */
export async function updateComment(commentId, newText) {
  const { data, error } = await supabase
    .from('comments')
    .update({ text: newText })
    .eq('id', commentId)
    .select(`
      id,
      debate_id,
      user_id,
      side,
      text,
      upvote_count,
      created_at,
      user_profiles ( display_name, is_ai_seed )
    `)
    .single();

  if (error) {
    console.error('updateComment error:', error);
    throw error;
  }
  return data;
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from('comments').delete().eq('id', commentId);
  if (error) { console.error('deleteComment error:', error); throw error; }
}

// ─── AI Seed (admin only) ─────────────────────────────────────────────────────

/**
 * Seed an AI-generated comment into the DB under a random AI persona.
 * The text should already be generated by moderation.js / generateAIComment().
 * aiPersonas is the array of { id, name } seed users stored in user_profiles.
 */
export async function seedAIComment(debateId, side, text, aiPersonaId) {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      debate_id: debateId,
      user_id: aiPersonaId,
      side,
      text,
    })
    .select(`
      id,
      debate_id,
      user_id,
      side,
      text,
      upvote_count,
      created_at,
      user_profiles ( display_name, is_ai_seed )
    `)
    .single();

  if (error) {
    console.error('seedAIComment error:', error);
    throw error;
  }
  return data;
}

/**
 * Fetch all AI persona profiles.
 */
export async function getAIPersonas() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name')
    .eq('is_ai_seed', true);

  if (error) {
    console.error('getAIPersonas error:', error);
    return [];
  }
  return data ?? [];
}
