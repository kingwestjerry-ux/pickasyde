// Supabase Edge Function: close-debate
// Runs every day at midnight EST via a pg_cron or Supabase scheduled trigger.
// Sets is_closed = true and calculates final_pct_a on yesterday's debate.
//
// Deploy with:
//   supabase functions deploy close-debate --project-ref YOUR_PROJECT_REF
//
// Schedule via Supabase Dashboard → Database → Extensions → pg_cron:
//   SELECT cron.schedule('close-debate', '0 5 * * *', $$
//     SELECT net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/close-debate',
//       headers := '{"Authorization": "Bearer <service-role-key>"}'
//     );
//   $$);
//
// Note: '0 5 * * *' = 5:00 AM UTC = midnight EST (UTC-5).
// Adjust to '0 4 * * *' when observing EDT (UTC-4) in summer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Get yesterday's date in EST
  const nowEST = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  const yesterday = new Date(nowEST);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`close-debate: processing debate for ${yesterdayStr}`);

  // Fetch yesterday's debate (if not already closed)
  const { data: debate, error: fetchErr } = await supabase
    .from('debates')
    .select('id, base_seed_a, base_seed_b')
    .eq('date', yesterdayStr)
    .eq('is_closed', false)
    .maybeSingle();

  if (fetchErr) {
    console.error('Fetch error:', fetchErr);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  if (!debate) {
    console.log('No open debate found for yesterday — already closed or none scheduled.');
    return new Response(JSON.stringify({ ok: true, message: 'Nothing to close' }), { status: 200 });
  }

  // Count votes to calculate final_pct_a
  const { data: votes, error: voteErr } = await supabase
    .from('votes')
    .select('side')
    .eq('debate_id', debate.id);

  if (voteErr) {
    console.error('Votes fetch error:', voteErr);
    return new Response(JSON.stringify({ error: voteErr.message }), { status: 500 });
  }

  // Count boosted comments
  const { data: comments, error: commentErr } = await supabase
    .from('comments')
    .select('side, upvote_count')
    .eq('debate_id', debate.id);

  if (commentErr) {
    console.error('Comments fetch error:', commentErr);
    return new Response(JSON.stringify({ error: commentErr.message }), { status: 500 });
  }

  const countA = (votes ?? []).filter(v => v.side === 'A').length;
  const countB = (votes ?? []).filter(v => v.side === 'B').length;

  const boostA = (comments ?? []).filter(c => c.side === 'A' && c.upvote_count >= 5).length * 0.5;
  const boostB = (comments ?? []).filter(c => c.side === 'B' && c.upvote_count >= 5).length * 0.5;

  const totalA = countA + (debate.base_seed_a ?? 45) + boostA;
  const totalB = countB + (debate.base_seed_b ?? 45) + boostB;
  const finalPctA = Math.round((totalA / (totalA + totalB)) * 100);

  console.log(`Closing debate ${debate.id}: A=${totalA}, B=${totalB}, final_pct_a=${finalPctA}`);

  // Update the debate row
  const { error: updateErr } = await supabase
    .from('debates')
    .update({ is_closed: true, final_pct_a: finalPctA })
    .eq('id', debate.id);

  if (updateErr) {
    console.error('Update error:', updateErr);
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, debateId: debate.id, finalPctA, date: yesterdayStr }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
