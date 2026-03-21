// ─── Pick A Syde — Daily Debate Email ─────────────────────────────────────────
// Sends the day's debate question to all users who have opted in to emails.
//
// Schedule via Supabase cron (Dashboard → Database → Cron Jobs):
//   select cron.schedule('daily-debate-email', '30 13 * * *',  -- 9:30 AM EST = 13:30 UTC
//     $$select net.http_post(
//       url := 'https://sgpjuwnxxtwprsulfecq.supabase.co/functions/v1/daily-email',
//       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
//       body := '{}'::jsonb
//     )$$
//   );
//
// Deploy: supabase functions deploy daily-email --no-verify-jwt
// Required secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Returns today's date as YYYY-MM-DD in Eastern Time
function getTodayEST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function formatDateFriendly(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function buildEmailHtml(debate: { question: string; label_a: string; label_b: string; date: string }): string {
  const friendlyDate = formatDateFriendly(debate.date);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Today's Debate — PickASyde</title>
</head>
<body style="margin:0;padding:0;background:#07071a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07071a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#0e0e22;border-radius:16px;border:1px solid #1a1a33;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 0;text-align:center;">
              <div style="font-size:28px;font-weight:900;letter-spacing:-0.5px;color:#ffffff;">
                Pick<span style="color:#e8635a;">A</span><span style="font-style:italic;color:#ffffff;">Syde</span>
              </div>
              <div style="font-size:12px;color:#4a4a70;font-weight:700;letter-spacing:1.5px;margin-top:6px;text-transform:uppercase;">Today's Debate · ${friendlyDate}</div>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:20px 32px 0;"><div style="height:1px;background:linear-gradient(90deg,transparent,#2a2a44,transparent);"></div></td></tr>

          <!-- Question -->
          <tr>
            <td style="padding:28px 32px;">
              <div style="font-size:26px;font-weight:900;color:#ffffff;line-height:1.25;text-align:center;letter-spacing:-0.3px;">
                ${debate.question}
              </div>
            </td>
          </tr>

          <!-- Side buttons -->
          <tr>
            <td style="padding:0 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="padding-right:8px;">
                    <a href="https://www.pickasyde.com" style="display:block;text-align:center;padding:16px 12px;background:transparent;border:2px solid #4fc4b8;border-radius:12px;color:#4fc4b8;font-size:15px;font-weight:900;text-decoration:none;letter-spacing:0.3px;">
                      ✦ ${debate.label_a}
                    </a>
                  </td>
                  <td width="4%" style="text-align:center;color:#33334a;font-size:11px;font-weight:700;">VS</td>
                  <td width="48%" style="padding-left:8px;">
                    <a href="https://www.pickasyde.com" style="display:block;text-align:center;padding:16px 12px;background:transparent;border:2px solid #e8635a;border-radius:12px;color:#e8635a;font-size:15px;font-weight:900;text-decoration:none;letter-spacing:0.3px;">
                      🎯 ${debate.label_b}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <a href="https://www.pickasyde.com" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#4fc4b8,#38a89d);border-radius:10px;color:#07071a;font-size:15px;font-weight:900;text-decoration:none;letter-spacing:0.3px;">
                Cast Your Vote →
              </a>
              <div style="margin-top:14px;font-size:12px;color:#33334a;">Drop your take in the comments. Change someone's mind. 🔥</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #12122a;text-align:center;">
              <div style="font-size:11px;color:#2a2a44;line-height:1.8;">
                You're receiving this because you signed up at <a href="https://www.pickasyde.com" style="color:#4a4a7a;text-decoration:none;">pickasyde.com</a><br/>
                <a href="https://www.pickasyde.com" style="color:#2a2a44;text-decoration:underline;">Unsubscribe</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string, resendApiKey: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PickASyde <debates@pickasyde.com>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const resendApiKey   = Deno.env.get('RESEND_API_KEY');
  const supabaseUrl    = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!resendApiKey)   return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500, headers: CORS });
  if (!supabaseUrl)    return new Response(JSON.stringify({ error: 'SUPABASE_URL not set' }), { status: 500, headers: CORS });
  if (!serviceRoleKey) return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }), { status: 500, headers: CORS });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const today = getTodayEST();

  try {
    // 1. Fetch today's debate
    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id, question, label_a, label_b, date')
      .eq('date', today)
      .single();

    if (debateError || !debate) {
      console.log('No debate found for today:', today, debateError?.message);
      return new Response(JSON.stringify({ message: 'No debate scheduled for today', date: today }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch all confirmed user emails
    // We use the admin API to get auth users (only confirmed emails)
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw usersError;

    const emails = (users ?? [])
      .filter(u => u.email && u.email_confirmed_at)
      .map(u => u.email as string);

    if (emails.length === 0) {
      return new Response(JSON.stringify({ message: 'No confirmed users to email', debate: debate.question }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Build the email
    const subject = `Today's debate: ${debate.question}`;
    const html = buildEmailHtml(debate);

    // 4. Send to each user (sequential to respect rate limits)
    const results: { email: string; status: string }[] = [];
    for (const email of emails) {
      try {
        await sendEmail(email, subject, html, resendApiKey);
        results.push({ email, status: 'sent' });
      } catch (err) {
        console.error(`Failed to send to ${email}:`, err);
        results.push({ email, status: 'failed: ' + String(err) });
      }
    }

    const sent   = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status !== 'sent').length;

    console.log(`Daily email: sent=${sent}, failed=${failed}, debate="${debate.question}"`);
    return new Response(JSON.stringify({ sent, failed, debate: debate.question, date: today }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('daily-email error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
