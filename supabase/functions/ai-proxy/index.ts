// ─── Pick A Syde — AI Proxy Edge Function ─────────────────────────────────────
// Handles: comment moderation + AI comment generation
// The Anthropic API key lives here as a Supabase secret — never in the browser.
//
// Deploy: supabase functions deploy ai-proxy --no-verify-jwt
// Set secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODERATION_SYSTEM = `You are a content moderator for a civil debate platform. Respond ONLY with JSON: {"allowed":true/false,"reason":"one sentence"}.
BLOCK: personal attacks on other users, hate speech, slurs, threats, explicit content, spam/marketing language, doxxing.
ALLOW: strong disagreement targeting ideas not people, mild emphasis swearing ("BS","damn"), blunt or sarcastic but civil takes.`;

const SEED_SYSTEM = `Generate a realistic human comment for a debate forum. Sound like a real person NOT an AI.
- 2-3 sentences, under 55 words
- Casual internet tone: "imo","tbh","lol","ngl","tho","bc","ur","u"
- 1-2 natural typos ("alot", missing apostrophe, lowercase where uppercase expected)
- Concrete personal example or observation
- Opinionated and direct
- Output ONLY the comment text, nothing else`;

async function callClaude(system: string, userMessage: string, maxTokens: number, apiKey: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic error ${res.status}: ${(err as any).error?.message ?? 'unknown'}`);
  }
  const data = await res.json();
  return (data as any).content?.[0]?.text ?? '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: CORS });

  try {
    const { action, text, question, side, labelA, labelB } = await req.json();

    if (action === 'moderate') {
      const raw = await callClaude(MODERATION_SYSTEM, `Topic: "${question}"\nComment: "${text}"`, 200, apiKey);
      const cleaned = raw.replace(/```json|```/g, '').trim();
      return new Response(JSON.parse(cleaned) ? cleaned : '{"allowed":true,"reason":""}', {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'generate') {
      const sideLabel = side === 'A' ? labelA : labelB;
      const result = await callClaude(SEED_SYSTEM, `Debate: "${question}"\nArgue for: ${sideLabel}`, 120, apiKey);
      return new Response(JSON.stringify({ text: result.trim() }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
  } catch (err) {
    console.error('ai-proxy error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
