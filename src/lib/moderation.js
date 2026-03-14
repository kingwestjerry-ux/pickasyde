// ─── AI via Supabase Edge Function (ai-proxy) ────────────────────────────────
// The Anthropic API key lives in Supabase secrets — never in the browser bundle.
// Edge Function: supabase/functions/ai-proxy/index.ts

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

async function callProxy(body) {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ai-proxy ${res.status}`);
  return res.json();
}

/**
 * Moderate a comment before posting.
 * Returns { allowed: boolean, reason: string }
 */
export async function moderateComment(text, question) {
  try {
    const data = await callProxy({ action: 'moderate', text, question });
    // data may be a parsed object or a JSON string depending on Edge Function response
    if (typeof data === 'string') return JSON.parse(data);
    return data;
  } catch (err) {
    console.error('moderateComment error:', err);
    return { allowed: true, reason: '' }; // fail open
  }
}

/**
 * Generate a realistic AI seed comment for a debate.
 * Returns the comment text string.
 */
export async function generateAIComment(side, labelA, labelB, question) {
  const data = await callProxy({ action: 'generate', side, labelA, labelB, question });
  return (data.text || '').trim();
}
