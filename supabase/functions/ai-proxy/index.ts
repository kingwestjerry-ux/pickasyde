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
BLOCK (respond with allowed:false):
- Personal attacks on other users (e.g. "you're an idiot", "people like you are stupid")
- Hate speech, racial slurs, ethnic slurs, religious slurs, homophobic/transphobic language, ableist slurs
- Discriminatory statements targeting race, ethnicity, gender, sexuality, religion, disability, or national origin
- Threats, harassment, or calls for violence
- Explicit sexual content or graphic descriptions of violence
- Spam, marketing, or promotional language
- Doxxing or sharing personal information
- HTML tags, script injection, or code snippets intended to manipulate the interface
ALLOW (respond with allowed:true):
- Strong disagreement that targets ideas, policies, or positions — not people's identity
- Mild emphasis language ("BS", "damn", "that's ridiculous")
- Blunt, sarcastic, or heated takes that stay on topic
- Hyperbole or strong metaphors that are clearly not literal threats`;

const SEED_SYSTEM = `Generate a realistic human comment for a debate forum. Sound like a real person NOT an AI.
- 2-3 sentences, under 55 words
- Casual internet tone: "imo","tbh","lol","ngl","tho","bc","ur","u"
- 1-2 natural typos ("alot", missing apostrophe, lowercase where uppercase expected)
- Concrete personal example or observation
- Opinionated and direct
- Output ONLY the comment text, nothing else`;

// ─── Fallback comment templates (used when Anthropic API is unavailable) ──────
// Generic enough to fit any debate side, sounds like real users.
const FALLBACK_TEMPLATES_PRO = [
  "honestly been saying this for years and nobody wants to hear it lol. once u actually try it you realize there's no going back. it's just the better option, no contest.",
  "grew up with this and it's literally shaped how i think about everything. my whole family does it this way too so maybe im biased but ngl i think the data backs it up.",
  "people who disagree probably havent given it a real chance tbh. spent 3 months on the other side and it was fine but this just hits different. not even close for me.",
  "the way some people act like this is even a debate lmao. been doing this for like 5 years now and my quality of life is genuinely better. science agrees with me on this one.",
  "ok hot take but this side is objectively correct and im tired of pretending it isnt. my coworkers make fun of me for it but i stand by it 100%.",
  "switched over about 2 years ago and never looked back. the convenience alone is worth it but the results speak for themselves too. why would u go back after experiencing this.",
  "ngl i used to be on the fence but after doing alot of research i landed firmly here. the evidence is pretty clear if ur willing to look at it honestly.",
  "this just makes more sense from every angle — practical, financial, long term. idk how people are still debating this in 2025 tbh.",
];

const FALLBACK_TEMPLATES_CON = [
  "i get why people like the other side but hear me out — this one actually has way more going for it than people realize. done my research and the answer is pretty obvious.",
  "tried both for extended periods and came back to this every time. there's a reason it's stood the test of time. some things just work and this is one of em.",
  "my whole friend group switched and within 6 months half of them regretted it lol. sometimes the contrarian take is right and this is one of those times.",
  "people overcomplicate this so much. tried the popular option, gave it a fair shot, came back here and havent thought about it since. just better.",
  "the mainstream opinion on this is just wrong and i'll die on this hill. talked to alot of people who actually know what theyre talking about and they agree with me.",
  "hot take: everyone defending the other side has never actually committed to this one. give it 30 days and u will not go back. personal experience talking here.",
  "look i used to think the same way as everyone else but then i actually tried this and it changed my mind completely. the other side is overhyped fr.",
  "been doing this since before it was cool and watching everyone slowly come around is so satisfying lol. knew it was right from the start honestly.",
];

function getRandomFallback(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)];
}

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
      try {
        const raw = await callClaude(MODERATION_SYSTEM, `Topic: "${question}"\nComment: "${text}"`, 200, apiKey);
        const cleaned = raw.replace(/```json|```/g, '').trim();
        return new Response(JSON.parse(cleaned) ? cleaned : '{"allowed":true,"reason":""}', {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch (moderateErr) {
        // Fail open — if moderation is down, allow the comment through
        console.error('moderation fallback triggered:', moderateErr);
        return new Response(JSON.stringify({ allowed: true, reason: '' }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'generate') {
      // Try Anthropic first, fall back to pre-written templates if unavailable
      try {
        const sideLabel = side === 'A' ? labelA : labelB;
        const result = await callClaude(SEED_SYSTEM, `Debate: "${question}"\nArgue for: ${sideLabel}`, 120, apiKey);
        return new Response(JSON.stringify({ text: result.trim() }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch (generateErr) {
        // Fallback to pre-written human-sounding templates
        console.error('generate fallback triggered:', generateErr);
        const templates = side === 'A' ? FALLBACK_TEMPLATES_PRO : FALLBACK_TEMPLATES_CON;
        const fallbackText = getRandomFallback(templates);
        return new Response(JSON.stringify({ text: fallbackText, fallback: true }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: CORS });
  } catch (err) {
    console.error('ai-proxy error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
