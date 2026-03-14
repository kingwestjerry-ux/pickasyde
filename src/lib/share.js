// ─── Share utilities ──────────────────────────────────────────────────────────

const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://pickasyde.com';

/**
 * Format a debate date for display (e.g. "Fri, Mar 07").
 * Uses EST so the date matches what the user saw.
 */
function formatDateEST(dateStr) {
  // dateStr is YYYY-MM-DD; parse at noon to avoid timezone boundary issues
  const dt = new Date(dateStr + 'T12:00:00');
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Build the full share text for a debate result.
 *
 * @param {object} debate   — Debate row from DB
 * @param {'A'|'B'} vote    — Which side the user voted for
 * @param {string|null} commentText — The user's own comment text (optional)
 * @param {number} pct      — The percentage for the user's side (0-100)
 * @returns {string} Formatted share text
 */
export function generateShareText(debate, vote, commentText, pct) {
  const sideLabel = vote === 'A' ? debate.label_a : debate.label_b;
  const sideEmoji = vote === 'A' ? '✨' : '🎲';
  const barFilled = Math.round(pct / 10);
  const bar = '█'.repeat(barFilled) + '░'.repeat(10 - barFilled);

  const commentLine =
    commentText && commentText.trim()
      ? `"${commentText.slice(0, 80)}${commentText.length > 80 ? '...' : ''}"\n\n`
      : '';

  return `⚡ PICKASYDE · ${formatDateEST(debate.date)}

"${debate.question}"

I picked: ${sideLabel} ${sideEmoji}
${commentLine}${bar} ${pct}% agree

Pick a side → ${APP_URL}`;
}

/**
 * Build the X (Twitter) share URL for a given share text.
 *
 * @param {string} text — The share text
 * @returns {string} URL to open in a new tab
 */
export function getXShareUrl(text) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
