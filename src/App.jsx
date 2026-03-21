import { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase.js';
import {
  getTodayDebate, getArchive, getUserVote, getVoteCounts, castVote, changeVote,
  getCommentsWithStatus, postComment, updateComment, deleteComment, upvoteComment, removeUpvote, getUserUpvotes,
  getUserProfile, isAdmin, seedAIComment, getAIPersonas,
  subscribeToComments, subscribeToUpvotes,
  executeSideSwitch, hasUserSwitched, logPersuasionSignal,
  getAllDebatesAdmin, createDebate, updateDebate, deleteDebate, getRecentCommentsAdmin,
  getMindsChangedCount,
} from './lib/api.js';
import { moderateComment, generateAIComment } from './lib/moderation.js';
import { generateShareText, getXShareUrl } from './lib/share.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Strip HTML tags and decode basic entities to prevent XSS / injection in comments */
function stripHtml(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/javascript:/gi, '').replace(/on\w+=/gi, '');
}

// ─── Sponsors ─────────────────────────────────────────────────────────────────
const SPONSORS = [
  { name: 'Liquid Death',    tagline: 'Murder Your Thirst',         letter: 'L', color: '#1B3B5A', url: 'https://liquiddeath.com' },
  { name: 'Death Wish Coffee', tagline: "World's Strongest Coffee", letter: 'D', color: '#2a0808', url: 'https://deathwishcoffee.com' },
  { name: 'Brunt Workwear',  tagline: 'Work boots built for workers',letter: 'B', color: '#7a3a10', url: 'https://bruntworkwear.com' },
  { name: 'Cometeer',        tagline: 'The future of coffee',        letter: 'C', color: '#003a5a', url: 'https://cometeer.com' },
  { name: 'MSCHF',           tagline: 'Make something cool happen',  letter: 'M', color: '#aa0000', url: 'https://mschf.com' },
  { name: 'Tabs Chocolate',  tagline: 'The 2-person experience',     letter: 'T', color: '#3d1a00', url: 'https://tabschocolate.com' },
  { name: 'Lume Deodorant',  tagline: 'Whole body odor control',     letter: 'L', color: '#1a3a1a', url: 'https://lumedeodorant.com' },
  { name: 'Cuts Clothing',   tagline: 'Premium performance clothing',letter: 'C', color: '#111122', url: 'https://cuts.co' },
  { name: 'Topicals',        tagline: 'Skin that speaks for itself', letter: 'T', color: '#3a0a3a', url: 'https://thetopicals.com' },
  { name: 'Jolie',           tagline: 'Filtered shower heads',       letter: 'J', color: '#0a2a3a', url: 'https://jolieskinco.com' },
];

// ─── Sample questions ─────────────────────────────────────────────────────────
const SAMPLE_QUESTIONS = [
  'Coffee ☕ or Tea 🍵?',
  'Morning person 🌅 or Night owl 🦉?',
  'Work from home or the office?',
  'Cats 🐱 or Dogs 🐶?',
  'Instagram or TikTok?',
  'Hot weather ☀️ or Cold weather ❄️?',
  'Text or call?',
  'Netflix 🎬 or Reading 📚?',
  'City life 🌆 or Countryside 🌿?',
  'Logic 🧠 or Intuition 💡?',
  'Save money 💰 or Live for now?',
  'Pineapple on pizza 🍕 yes or no?',
  'Introvert 🪴 or Extrovert 🎊?',
  'Quality or Quantity?',
  'Early bird or sleep in?',
  'Rules or Freedom?',
  'Head ❄️ or Heart 🔥?',
  'Planned or Spontaneous?',
  'Android or iPhone?',
  'Cook at home or eat out?',
  'Sneakers or Boots?',
  'Gym or Outdoors?',
];

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,700;0,9..40,900;1,9..40,900&display=swap');

  * { box-sizing: border-box; }
  body { margin: 0; background: #0a0a1a; }

  /* ── Layout: single column ── */
  .vs-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: #070715;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(79,196,184,0.09) 0%, transparent 65%),
      radial-gradient(ellipse 60% 40% at 100% 60%, rgba(232,99,90,0.06) 0%, transparent 60%),
      radial-gradient(ellipse 50% 35% at 0% 80%, rgba(100,80,200,0.05) 0%, transparent 60%),
      linear-gradient(160deg, #07071a 0%, #080818 50%, #070712 100%);
  }
  .vs-center { width: 100%; display: flex; flex-direction: column; }
  /* Explainer panel below center */
  .vs-explainer {
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
    padding: 16px 16px 40px;
    border-top: 1px solid #12122a;
  }

  /* ── Logo animations ── */
  .pas-logo { display: inline-flex; align-items: center; line-height: 1; white-space: nowrap; overflow: visible; padding: 4px 0; }
  .pas-logo-wrap { overflow: visible !important; display: inline-block; padding: 2px 4px; }
  @keyframes aPivot {
    0%   { transform: rotate(-4deg); }
    50%  { transform: rotate(4deg);  }
    100% { transform: rotate(-4deg); }
  }
  .pas-a { animation: aPivot 2.4s ease-in-out infinite; transform-origin: bottom center; display: inline-block; }
  @keyframes logoBreath {
    0%, 100% { opacity: 0.92; }
    50%       { opacity: 1; }
  }
  .pas-logo-wrap { animation: logoBreath 4s ease-in-out infinite; display: inline-block; overflow: visible; }
  @keyframes diamondShine {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  .pas-a-diamond {
    background: linear-gradient(105deg, #ffffff 0%, #c8f0ff 15%, #ffe8f8 28%, #ffffff 38%, #fff9c4 50%, #c8f0ff 62%, #f8c8ff 75%, #ffffff 85%, #c8f0ff 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: aPivot 2.4s ease-in-out infinite, diamondShine 3s linear infinite;
    transform-origin: bottom center;
    display: inline-block;
    padding: 0 5px;
    overflow: visible;
    /* No filter here — it conflicts with background-clip:text in some browsers */
  }

  /* ── Vote flash ── */
  .vf-overlay { animation: vfFade 2.6s ease-out forwards; }
  @keyframes vfFade {
    0%   { opacity:0; } 5% { opacity:1; } 70% { opacity:0.9; } 100% { opacity:0; }
  }
  .vf-bg { animation: vfFade 2.6s ease-out forwards; }
  .vf-label { animation: vfLabel 2.6s cubic-bezier(.23,1,.32,1) forwards; }
  @keyframes vfLabel {
    0%   { transform: scale(5) skewX(-10deg); opacity:0; }
    10%  { transform: scale(0.92) skewX(-5deg); opacity:1; }
    25%  { transform: scale(1.04) skewX(-3deg); }
    35%  { transform: scale(1) skewX(-4deg); }
    75%  { transform: scale(1) skewX(-4deg); opacity:1; }
    100% { transform: scale(1.08) skewX(-4deg); opacity:0; }
  }
  .vf-chosen { animation: vfChosen 2.6s cubic-bezier(.23,1,.32,1) forwards; }
  @keyframes vfChosen {
    0%   { transform: translateY(50px) scale(0.5); opacity:0; }
    15%  { transform: translateY(-6px) scale(1.06); opacity:1; }
    28%  { transform: translateY(3px) scale(0.98); }
    38%  { transform: translateY(0) scale(1); }
    75%  { transform: translateY(0) scale(1); opacity:1; }
    100% { transform: translateY(-18px) scale(1); opacity:0; }
  }
  .vf-bolt { animation: vfBolt 1.9s ease-out forwards; }
  @keyframes vfBolt {
    0%   { transform: translate(-50%,-50%) scale(0) rotate(var(--r)); opacity:1; }
    20%  { opacity:1; }
    100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.4) rotate(var(--r)); opacity:0; }
  }
  .vf-particle { animation: vfParticle 1.7s ease-out forwards; }
  @keyframes vfParticle {
    0%   { transform: translate(-50%,-50%); opacity:1; }
    100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))); opacity:0; }
  }
  .vf-ring { animation: vfRing 1.5s ease-out forwards; }
  @keyframes vfRing {
    0%   { transform: translate(-50%,-50%) scale(0); opacity:0.9; }
    100% { transform: translate(-50%,-50%) scale(7); opacity:0; }
  }
  .vf-ring2 { animation: vfRing 2s 0.25s ease-out forwards; opacity:0; }
  .vf-shake { animation: vfShake 0.4s ease-out; }
  @keyframes vfShake {
    0%,100% { transform:translate(0,0); }
    10% { transform:translate(-5px,3px); } 20% { transform:translate(5px,-3px); }
    30% { transform:translate(-4px,4px); } 40% { transform:translate(4px,-4px); }
    50% { transform:translate(-2px,2px); } 60% { transform:translate(2px,-2px); }
  }

  /* ── Questions panel ── */
  @keyframes aqFade { 0% { opacity:0; transform:translateY(12px); } 30% { opacity:1; transform:translateY(0); } }

  /* ── Sponsor ── */
  @keyframes sponsorPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(247,201,72,0); }
    50%      { box-shadow: 0 0 18px 2px rgba(247,201,72,0.10); }
  }
  .sponsor-badge { animation: sponsorPulse 3.2s ease-in-out infinite; }

  /* ── Auth side panels: hide on narrow screens ── */
  @media (max-width: 900px) {
    .auth-side-panel { display: none !important; }
  }

  /* ── Vote buttons ── */
  .vote-btn { transition: transform 0.12s, filter 0.12s, box-shadow 0.12s; }
  .vote-btn:hover  { transform: scale(1.03) skewX(-1deg); filter: brightness(1.12); }
  .vote-btn:active { transform: scale(0.97); }

  /* ── Debate card gradient border ── */
  .debate-card-wrap {
    background: linear-gradient(135deg, #4fc4b830, #f7c94820, #e8635a30);
    padding: 1.5px;
    border-radius: 20px;
    margin-bottom: 14px;
  }
  .debate-card-inner {
    background: linear-gradient(150deg, #101028 0%, #0d0d22 100%);
    border-radius: 19px;
    padding: 24px 18px;
    position: relative;
    overflow: hidden;
  }
  .debate-card-inner::before {
    content: '';
    position: absolute; top:0; left:0; right:0; height:2px;
    background: linear-gradient(90deg, #4fc4b8, #f7c948, #e8635a);
    border-radius: 19px 19px 0 0;
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PAL = ['#e05252','#e07c52','#c8a84a','#52a852','#4a9fd4','#7b62d4','#c462d4','#4ac8b4'];
const avatarColor = id => { let h=0; for (const c of String(id)) h=(h*31+c.charCodeAt(0))%PAL.length; return PAL[h]; };
const initials = n => (n||'U').replace(/[._]/g,' ').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
const timeAgo = ts => { const m=(Date.now()-new Date(ts).getTime())/60000; if(m<1) return 'just now'; if(m<60) return `${Math.round(m)}m ago`; if(m<1440) return `${Math.floor(m/60)}h ago`; return `${Math.floor(m/1440)}d ago`; };
const formatDate = d => new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});

function calcPctA(debate, debateComments, userVote, voteCounts) {
  if (!debate) return 50;
  if (debate.is_closed) return debate.final_pct_a ?? 50;
  const boostA = debateComments.filter(c => c.side==='A' && c.upvote_count>=5).length * 0.5;
  const boostB = debateComments.filter(c => c.side==='B' && c.upvote_count>=5).length * 0.5;
  const baseA = (voteCounts?.countA??0) + (debate.base_seed_a??45);
  const baseB = (voteCounts?.countB??0) + (debate.base_seed_b??45);
  const totalA = baseA + boostA + (userVote==='A'?1:0);
  const totalB = baseB + boostB + (userVote==='B'?1:0);
  return Math.round((totalA/(totalA+totalB))*100);
}

// ─── PickASydeLogo ────────────────────────────────────────────────────────────
// Pick (teal) · A (white diamond shimmer, animated pivot) · Syde (red-orange)
function PickASydeLogo({ size = 'small' }) {
  const large = size === 'large';
  const fs    = large ? 'clamp(34px, 10vw, 72px)' : 28;
  const aFs   = large ? 'clamp(40px, 12vw, 86px)' : 34;   // A is noticeably bigger

  const textStyle = (color) => ({
    fontFamily: "'DM Sans',system-ui,sans-serif",
    fontSize: fs,
    fontWeight: 900,
    fontStyle: 'italic',
    color,
    textShadow: `0 0 ${large?28:10}px ${color}99, 0 2px 0 rgba(0,0,0,0.85)`,
    letterSpacing: large ? '-3px' : '-0.5px',
    display: 'inline-block',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="pas-logo-wrap" style={{ whiteSpace: 'nowrap' }}>
      <div className="pas-logo">
        <span style={{ ...textStyle('#4fc4b8'), transform: 'skewX(-8deg)' }}>Pick</span>
        <span
          className="pas-a-diamond"
          style={{
            fontFamily: "'DM Sans',system-ui,sans-serif",
            fontSize: aFs,
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: 0,
            margin: large ? '0 2px' : '0 1px',
          }}
        >A</span>
        <span style={{ ...textStyle('#e8635a'), transform: 'skewX(-8deg)' }}>Syde</span>
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Av({ uid, name, size = 32 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:avatarColor(uid||'anon'), display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.33, fontWeight:800, color:'#fff', fontFamily:'monospace', flexShrink:0 }}>
      {initials(name)}
    </div>
  );
}

// ─── VoteBar ──────────────────────────────────────────────────────────────────
function VoteBar({ pctA, lA, lB, voteCounts, mindsChanged, animate = true }) {
  const [displayed, setDisplayed] = useState(animate ? 50 : pctA);
  useEffect(() => {
    if (animate) { const t = setTimeout(()=>setDisplayed(pctA), 300); return ()=>clearTimeout(t); }
    else setDisplayed(pctA);
  }, [pctA, animate]);

  const totalVotes = (voteCounts?.countA || 0) + (voteCounts?.countB || 0) + 2400;
  const formattedVotes = new Intl.NumberFormat('en-US').format(totalVotes);

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontWeight:800, fontSize:14, color:'#4fc4b8' }}>{Math.round(displayed)}% · {lA}</span>
        <span style={{ fontWeight:800, fontSize:14, color:'#e8635a' }}>{lB} · {100-Math.round(displayed)}%</span>
      </div>
      <div style={{ height:10, borderRadius:5, background:'#e8635a20', overflow:'hidden', position:'relative' }}>
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${displayed}%`, background:'linear-gradient(90deg,#4fc4b8,#38a89d)', borderRadius:'5px 0 0 5px', transition:'width 0.9s cubic-bezier(.4,0,.2,1)', boxShadow:'2px 0 10px rgba(79,196,184,0.5)' }} />
        <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'rgba(255,255,255,0.07)', transform:'translateX(-50%)' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, fontSize:11, color:'#5070a0', fontWeight:600 }}>
        <span>🗳️ {formattedVotes} votes cast</span>
        {mindsChanged !== undefined && <span>🔄 {mindsChanged} minds changed today</span>}
      </div>
    </div>
  );
}

// ─── CommentCard ──────────────────────────────────────────────────────────────
function CommentCard({ c, currentUserId, hasUpvoted, onUpvote, onRemoveUpvote, locked, onEdit, onDelete, userVote, canSwitchSides, onChangedMyMind }) {
  const [editing, setEditing]       = useState(false);
  const [editText, setEditText]     = useState(c.text);
  const [saving, setSaving]         = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const displayName  = c.user_id===currentUserId ? 'You' : (c.user_profiles?.display_name||'user');
  const isOwn        = currentUserId===c.user_id;
  const isHistorical = c.comment_status === 'historical';
  // Can edit only if: own comment, not locked, and not historical (historical = read-only)
  const canEdit      = isOwn && !locked && !isHistorical;
  const boosting     = c.upvote_count >= 5;
  // "This changed my mind" shows on opposite-side comments only
  const isOppositeSide = userVote && c.side !== userVote && !isOwn;
  const showChangedMyMind = isOppositeSide && canSwitchSides && !locked;

  async function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === c.text) { setEditing(false); setEditText(c.text); return; }
    setSaving(true);
    try { await onEdit(c.id, trimmed); setEditing(false); }
    catch(err) { console.error('edit error:', err); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: isHistorical ? '#0c0c1e' : '#0e0e22', border:`1px solid ${isHistorical?'#14142a':'#191930'}`, borderLeft:`3px solid ${c.side==='A'?'#4fc4b8':'#e8635a'}${isHistorical?'55':''}`, borderRadius:'0 10px 10px 0', padding:'12px 14px', marginBottom:8, opacity: isHistorical ? 0.72 : 1 }}>
      {/* Historical badge */}
      {isHistorical && (
        <div style={{ fontSize:10, fontWeight:700, color:'#5858a8', background:'rgba(88,88,168,0.08)', border:'1px solid #5858a820', borderRadius:4, padding:'2px 7px', display:'inline-block', marginBottom:8, letterSpacing:0.5 }}>
          Previous position
        </div>
      )}
      <div style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
        <Av uid={c.user_id} name={displayName} size={28} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5, flexWrap:'wrap' }}>
            <span style={{ fontWeight:700, fontSize:13, color: isHistorical ? '#7070a0' : '#c8c8e0' }}>{displayName}</span>
            <span style={{ fontSize:10, fontWeight:800, padding:'1px 6px', borderRadius:3, letterSpacing:0.8, background:c.side==='A'?'rgba(79,196,184,.12)':'rgba(232,99,90,.12)', color:c.side==='A'?'#4fc4b8':'#e8635a', border:`1px solid ${c.side==='A'?'#4fc4b818':'#e8635a18'}`, opacity: isHistorical ? 0.6 : 1 }}>
              {c.side_label||(c.side==='A'?'SIDE A':'SIDE B')}
            </span>
            {boosting && !isHistorical && <span style={{ fontSize:10, fontWeight:800, color:'#f7c948' }}>⚡ BOOST</span>}
            <span style={{ fontSize:10, color:'#2e2e48', marginLeft:'auto' }}>{timeAgo(c.created_at)}</span>
            {canEdit && !editing && !confirmDel && (
              <button onClick={()=>{setEditing(true);setEditText(c.text);}} title="Edit comment" style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#33334a', padding:'0 0 0 4px', lineHeight:1 }}>✏️</button>
            )}
            {canEdit && !editing && !confirmDel && (
              <button onClick={()=>setConfirmDel(true)} title="Delete comment" style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#33334a', padding:'0 0 0 2px', lineHeight:1 }}>🗑️</button>
            )}
            {confirmDel && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, marginLeft:4 }}>
                <span style={{ fontSize:11, color:'#e8635a' }}>Delete?</span>
                <button onClick={()=>onDelete(c.id)} style={{ background:'#e8635a', border:'none', borderRadius:4, color:'#fff', fontSize:10, fontWeight:700, padding:'2px 7px', cursor:'pointer' }}>Yes</button>
                <button onClick={()=>setConfirmDel(false)} style={{ background:'none', border:'1px solid #2a2a48', borderRadius:4, color:'#6060aa', fontSize:10, padding:'2px 7px', cursor:'pointer' }}>No</button>
              </span>
            )}
          </div>

          {editing ? (
            <div>
              <textarea
                value={editText}
                onChange={e=>setEditText(e.target.value)}
                rows={3}
                style={{ width:'100%', background:'#0a0a1a', border:'1px solid #2a2a48', borderRadius:8, color:'#d0d0e8', fontSize:16, padding:'9px 11px', resize:'none', boxSizing:'border-box', outline:'none', fontFamily:'inherit', lineHeight:1.55, marginBottom:8 }}
                autoFocus
              />
              <div style={{ display:'flex', gap:7 }}>
                <button onClick={saveEdit} disabled={saving} style={{ padding:'5px 13px', background:'linear-gradient(135deg,#4fc4b8,#38a89d)', border:'none', borderRadius:7, color:'#0a0a1a', fontWeight:800, fontSize:12, cursor:saving?'default':'pointer', opacity:saving?0.7:1 }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={()=>{setEditing(false);setEditText(c.text);}} style={{ padding:'5px 11px', background:'transparent', border:'1px solid #1e1e38', borderRadius:7, color:'#3a3a58', fontSize:12, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ margin:'0 0 8px', fontSize:14, color: isHistorical ? '#7070a0' : '#a8a8c8', lineHeight:1.6, fontStyle: isHistorical ? 'italic' : 'normal' }}>{stripHtml(c.text)}</p>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                {!locked && !isHistorical && (
                  <button
                    onClick={()=>{
                      if(isOwn) return;
                      if(hasUpvoted) onRemoveUpvote(c.id);
                      else onUpvote(c.id);
                    }}
                    title={hasUpvoted?'Remove upvote':'Upvote'}
                    style={{ display:'inline-flex', alignItems:'center', gap:4, background:hasUpvoted?'rgba(79,196,184,.15)':'rgba(255,255,255,.04)', border:`1px solid ${hasUpvoted?'#4fc4b8':'#1e1e38'}`, borderRadius:5, padding:'2px 9px', cursor:isOwn?'default':'pointer', fontSize:12, color:hasUpvoted?'#4fc4b8':'#3e3e58', fontWeight:600, transition:'all 0.15s' }}>
                    {hasUpvoted ? '▲' : '△'} {c.upvote_count}
                  </button>
                )}
                {(locked || isHistorical) && <span style={{ fontSize:12, color:'#2e2e48' }}>▲ {c.upvote_count}</span>}
                {showChangedMyMind && (
                  <button onClick={()=>onChangedMyMind(c)} style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6, background:'linear-gradient(135deg,rgba(247,201,72,0.12),rgba(232,99,90,0.07))', border:'1px solid rgba(247,201,72,0.35)', borderRadius:20, padding:'5px 14px', fontSize:12, fontWeight:900, color:'#f7c948', cursor:'pointer', letterSpacing:0.4, boxShadow:'0 2px 10px rgba(247,201,72,0.12)', flexShrink:0, transition:'all 0.15s' }}>
                    🤯 Okay, they got me
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── VoteFlashOverlay ─────────────────────────────────────────────────────────
function VoteFlashOverlay({ side, label, color, onDone }) {
  useEffect(() => { const t=setTimeout(onDone, 2600); return ()=>clearTimeout(t); }, [onDone]);

  const bolts    = Array.from({length:12},(_,i)=>{ const a=(i*30)*Math.PI/180, d=155+(i%4)*30; return {tx:Math.cos(a)*d,ty:Math.sin(a)*d,r:i*30,delay:i*0.05}; });
  const particles= Array.from({length:26},(_,i)=>{ const a=(i*13.85)*Math.PI/180, d=75+(i%5)*30; return {tx:Math.cos(a)*d,ty:Math.sin(a)*d,size:3+(i%5)*2.4,delay:(i%7)*0.04}; });

  return (
    <div className="vf-overlay vf-shake" style={{ position:'fixed', inset:0, zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
      <div className="vf-bg" style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at center, ${color}cc 0%, ${color}55 30%, ${color}11 60%, transparent 78%)` }} />
      <div className="vf-ring"  style={{ position:'absolute', left:'50%', top:'50%', width:90,  height:90,  borderRadius:'50%', border:`3px solid ${color}`, boxShadow:`0 0 24px ${color}` }} />
      <div className="vf-ring2" style={{ position:'absolute', left:'50%', top:'50%', width:55,  height:55,  borderRadius:'50%', border:`2px solid #f7c948`, boxShadow:`0 0 16px #f7c948` }} />
      {particles.map((p,i)=>(
        <div key={i} className="vf-particle" style={{ position:'absolute', left:'50%', top:'50%', width:p.size, height:p.size, borderRadius:'50%', background:i%3===0?'#f7c948':color, boxShadow:`0 0 6px ${i%3===0?'#f7c948':color}`, animationDelay:`${p.delay}s`, '--tx':`${p.tx}px`, '--ty':`${p.ty}px` }} />
      ))}
      {bolts.map((b,i)=>(
        <div key={i} className="vf-bolt" style={{ position:'absolute', left:'50%', top:'50%', fontSize:20, lineHeight:1, animationDelay:`${b.delay}s`, '--tx':`${b.tx}px`, '--ty':`${b.ty}px`, '--r':`${b.r}deg` }}>⚡</div>
      ))}
      {/* Main display */}
      <div style={{ position:'relative', zIndex:2, textAlign:'center' }}>
        <div className="vf-label" style={{ fontFamily:"'DM Sans',system-ui,sans-serif", fontSize:'clamp(12px,2.5vw,18px)', fontWeight:900, fontStyle:'italic', color:'#ffffff77', textShadow:`0 0 10px ${color}`, letterSpacing:'5px', textTransform:'uppercase', marginBottom:4 }}>
          You picked
        </div>
        <div className="vf-chosen" style={{ fontFamily:"'DM Sans',system-ui,sans-serif", fontSize:'clamp(38px,9vw,72px)', fontWeight:900, fontStyle:'italic', color:'#fff', textShadow:`0 0 28px ${color}, 0 0 60px ${color}, 0 4px 0 rgba(0,0,0,0.9)`, letterSpacing:'-2px', whiteSpace:'nowrap', WebkitTextStroke:`2px ${color}` }}>
          {label}
        </div>
        <div className="vf-label" style={{ fontFamily:"'DM Sans',system-ui,sans-serif", fontSize:'clamp(18px,4vw,32px)', fontWeight:900, fontStyle:'italic', color:'#f7c948', textShadow:'0 0 18px #f7c948, 0 0 45px rgba(247,201,72,0.4)', letterSpacing:'2px', marginTop:10, animationDelay:'0.12s' }}>
          ✓ VOTED!
        </div>
      </div>
    </div>
  );
}

// ─── SwitchConfirmModal ───────────────────────────────────────────────────────
function SwitchConfirmModal({ debate, previousSide, newSide, persuadingComment, onConfirm, onCancel, switching }) {
  const [reason, setReason] = useState('');
  const prevLabel = previousSide==='A' ? debate.label_a : debate.label_b;
  const newLabel  = newSide==='A' ? debate.label_a : debate.label_b;
  const prevColor = previousSide==='A' ? '#4fc4b8' : '#e8635a';
  const newColor  = newSide==='A' ? '#4fc4b8' : '#e8635a';

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16 }}>
      <div style={{ background:'#0e0e22', border:'1px solid #1e1e3a', borderRadius:20, padding:24, maxWidth:380, width:'100%' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:18 }}>
          <div style={{ fontSize:22, marginBottom:8 }}>🔄</div>
          <h3 style={{ margin:0, fontWeight:900, fontSize:17, color:'#eeeeff' }}>Switch your vote?</h3>
          <p style={{ margin:'8px 0 0', fontSize:13, color:'#5a5a80' }}>
            This will switch your vote from{' '}
            <span style={{ color:prevColor, fontWeight:800 }}>{prevLabel}</span>
            {' '}to{' '}
            <span style={{ color:newColor, fontWeight:800 }}>{newLabel}</span>.
          </p>
        </div>

        {/* The persuading comment */}
        {persuadingComment && (
          <div style={{ background:'#080818', border:'1px solid #252545', borderLeft:`3px solid ${newColor}`, borderRadius:'0 8px 8px 0', padding:'10px 12px', marginBottom:16, fontSize:13, color:'#7070a8', fontStyle:'italic', lineHeight:1.5 }}>
            "{persuadingComment.text.length>140 ? persuadingComment.text.slice(0,140)+'…' : persuadingComment.text}"
            <div style={{ fontSize:11, color:'#3a3a58', marginTop:5, fontStyle:'normal' }}>— {persuadingComment.user_profiles?.display_name||'user'}</div>
          </div>
        )}

        {/* Optional reason */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontSize:12, color:'#4a4a70', marginBottom:7, fontWeight:700 }}>What changed your mind? <span style={{ fontWeight:400, color:'#33334a' }}>(optional)</span></label>
          <textarea
            value={reason}
            onChange={e=>setReason(e.target.value.slice(0,280))}
            placeholder="Explain your new position…"
            rows={3}
            style={{ width:'100%', background:'#0a0a1a', border:'1px solid #1e1e38', borderRadius:9, color:'#d0d0e8', fontSize:16, padding:'10px 12px', resize:'none', boxSizing:'border-box', outline:'none', fontFamily:'inherit', lineHeight:1.5 }}
          />
          <div style={{ textAlign:'right', fontSize:11, color:'#2e2e48', marginTop:3 }}>{reason.length}/280</div>
        </div>

        {/* Note about old comment */}
        <p style={{ fontSize:11, color:'#3a3a58', margin:'0 0 16px', lineHeight:1.5 }}>
          Your previous comment will remain visible as part of the debate history.
        </p>

        {/* Buttons */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel} disabled={switching} style={{ flex:1, padding:'11px 0', background:'transparent', border:'1px solid #1e1e38', borderRadius:10, color:'#5a5a80', fontWeight:700, fontSize:14, cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={()=>onConfirm(reason.trim())} disabled={switching} style={{ flex:1, padding:'11px 0', background:`linear-gradient(135deg,${newColor},${newColor}cc)`, border:'none', borderRadius:10, color:'#0a0a1a', fontWeight:900, fontSize:14, cursor:switching?'default':'pointer', opacity:switching?0.7:1 }}>
            {switching ? 'Switching…' : `Switch to ${newLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AnimatedQuestions ────────────────────────────────────────────────────────
function AnimatedQuestions({ compact = false }) {
  const [idx, setIdx] = useState(0);
  const [key, setKey] = useState(0);
  useEffect(() => { const t=setInterval(()=>{setIdx(i=>(i+1)%SAMPLE_QUESTIONS.length);setKey(k=>k+1);},2800); return()=>clearInterval(t); },[]);
  const shown = Array.from({length:5},(_,i)=>SAMPLE_QUESTIONS[(idx+i)%SAMPLE_QUESTIONS.length]);
  const opacities = [0.5, 0.72, 1, 0.72, 0.5];
  const sizes     = [11,   13,  16, 13,   11  ];
  const weights   = [400,  600, 800, 600,  400 ];
  const colors    = ['#3a3a72','#5858a8','#a8a8e8','#5858a8','#3a3a72'];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding: compact ? '24px 20px' : '40px 28px 40px 24px' }}>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:3, color:'#6060aa', marginBottom:24, textTransform:'uppercase' }}>Pick A Syde on…</div>
      <div style={{ display:'flex', flexDirection:'column', gap: compact ? 12 : 18 }}>
        {shown.map((text,i)=>(
          <div key={`${key}-${i}`} style={{ fontSize:sizes[i], fontWeight:weights[i], color:colors[i], opacity:opacities[i], lineHeight:1.4, paddingLeft:i===2?12:0, borderLeft:i===2?'2px solid #8888dd':'2px solid transparent', animation:i===4?'aqFade 0.5s ease-out':undefined }}>
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PlatformExplainer ────────────────────────────────────────────────────────
function PlatformExplainer({ compact = false }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding: compact ? '24px 20px' : '40px 24px 40px 28px' }}>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:3, color:'#6060aa', marginBottom:16, textTransform:'uppercase' }}>What is PickASyde?</div>
      <p style={{ fontSize:16, fontWeight:800, color:'#a0a0e0', lineHeight:1.55, margin:'0 0 14px' }}>
        One question.<br/>Two sides.<br/>You decide.
      </p>
      <p style={{ fontSize:13, color:'#8080c0', lineHeight:1.85, margin:'0 0 12px' }}>
        Every day a new debate drops. Pick your side, back it with a comment, and watch the argument play out live.
      </p>
      <p style={{ fontSize:12, color:'#6868a8', lineHeight:1.85, margin:'0 0 20px' }}>
        No doom-scrolling. No algorithm rabbit holes. One focused debate per day — then it locks at midnight and the result stands forever.
      </p>
      <div style={{ borderTop:'1px solid #252545', paddingTop:16, display:'flex', flexDirection:'column', gap:10 }}>
        {[
          ['⚡','Votes update live as the crowd picks sides'],
          ['💬','5 upvotes on your comment boosts your side\'s score'],
          ['🔥','Vote every day to build your streak'],
          ['🔒','Debate locks at midnight EST — the verdict is final'],
          ['😌','Totally free, no ads chasing you around'],
        ].map(([ic,text])=>(
          <div key={text} style={{ display:'flex', alignItems:'flex-start', gap:9, fontSize:12, color:'#7070b0', lineHeight:1.5 }}>
            <span style={{ flexShrink:0, marginTop:1 }}>{ic}</span><span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Share Modal ──────────────────────────────────────────────────────────────
function ShareModal({ debate, vote, commentText, pct, streak, onClose }) {
  const [copied, setCopied] = useState(false);
  const shareText = generateShareText(debate, vote, commentText, pct);
  const sideLabel = vote==='A' ? debate.label_a : debate.label_b;
  const copyText = ()=> navigator.clipboard.writeText(shareText).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  const shareX   = ()=> window.open(getXShareUrl(shareText),'_blank');
  const shareIG  = ()=> { copyText(); alert('Text copied! Paste into your Instagram story or bio.'); };
  const shareTikTok = ()=> { copyText(); alert('Text copied! Paste into your TikTok bio or video caption.'); };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
      <div style={{ background:'#0e0e22', border:'1px solid #1e1e3a', borderRadius:20, padding:22, maxWidth:360, width:'100%' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <h3 style={{ margin:0, fontWeight:900, fontSize:18, color:'#eeeeff' }}>Share your take</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#33334a', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ background:'linear-gradient(135deg,#0a0a1a,#141428)', border:'1px solid #2a2a45', borderRadius:14, padding:18, marginBottom:16, position:'relative', overflow:'hidden' }}>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:2, color:'#33334a', marginBottom:10 }}>⚡ PICKASYDE · {formatDate(debate.date)}</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#d0d0e8', marginBottom:12, lineHeight:1.4 }}>"{debate.question}"</div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:vote==='A'?'rgba(79,196,184,.12)':'rgba(232,99,90,.12)', border:`1px solid ${vote==='A'?'#4fc4b833':'#e8635a33'}`, borderRadius:8, padding:'5px 12px', marginBottom:commentText?10:14 }}>
            <span style={{ fontSize:13, fontWeight:800, color:vote==='A'?'#4fc4b8':'#e8635a' }}>I picked {sideLabel}</span>
          </div>
          {commentText && <p style={{ margin:'0 0 12px', fontSize:11, color:'#7070a0', fontStyle:'italic', lineHeight:1.5 }}>"{commentText.slice(0,70)}{commentText.length>70?'...':''}"</p>}
          <div style={{ height:5, borderRadius:3, background:'#e8635a20', overflow:'hidden', marginBottom:6 }}>
            <div style={{ height:'100%', width:`${pct}%`, background:'#4fc4b8', borderRadius:3 }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#4fc4b8', fontWeight:700, marginBottom:8 }}>
            <span>{pct}% agree</span><span>{debate.label_a} vs {debate.label_b}</span>
          </div>
          <div style={{ fontSize:9, color:'#2a2a48' }}>pickasyde.com</div>
        </div>
        {streak>=2 && (
          <div style={{ background:'rgba(247,201,72,.06)', border:'1px solid #f7c94818', borderRadius:10, padding:'10px 12px', marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:800, color:'#f7c948', letterSpacing:0.8, marginBottom:6 }}>💡 STREAK CHALLENGE</div>
            <div style={{ fontSize:11, color:'#7777aa', lineHeight:1.5 }}>You've voted {streak} days in a row. Dare your friends to disagree all week.</div>
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
          <button onClick={shareX} style={{ padding:'12px 8px', background:'#000', border:'1px solid #333', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <span style={{ fontWeight:900 }}>𝕏</span> Post
          </button>
          <button onClick={shareIG} style={{ padding:'12px 8px', background:'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)', border:'none', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <svg viewBox="0 0 24 24" width="18" height="18"><defs><radialGradient id="ig" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="5%" stopColor="#fdf497"/><stop offset="45%" stopColor="#fd5949"/><stop offset="60%" stopColor="#d6249f"/><stop offset="90%" stopColor="#285AEB"/></radialGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="url(#ig)"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="white" strokeWidth="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="white"/></svg>
            Instagram
          </button>
          <button onClick={shareTikTok} style={{ padding:'12px 8px', background:'#000', border:'1px solid #333', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
            TikTok
          </button>
        </div>
        <button onClick={copyText} style={{ width:'100%', padding:12, background:copied?'rgba(79,196,184,.15)':'rgba(255,255,255,.05)', border:`1px solid ${copied?'#4fc4b8':'#1e1e3a'}`, borderRadius:10, color:copied?'#4fc4b8':'#6666aa', fontWeight:700, fontSize:13, cursor:'pointer' }}>
          {copied ? '✓ Copied!' : '📋 Copy share text'}
        </button>
      </div>
    </div>
  );
}

// ─── Backoffice Screen ────────────────────────────────────────────────────────
function BackofficeScreen() {
  const [tab, setTab]           = useState('questions');
  const [debates, setDebates]   = useState([]);
  const [allComments, setAllComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // New debate form
  const [newQ, setNewQ]         = useState('');
  const [newDate, setNewDate]   = useState('');
  const [newLabelA, setNewLabelA] = useState('');
  const [newLabelB, setNewLabelB] = useState('');
  // Edit debate
  const [editId, setEditId]     = useState(null);
  const [editFields, setEditFields] = useState({});

  const inp = { width:'100%', padding:'9px 12px', background:'#0a0a1a', border:'1px solid #1e1e38', borderRadius:8, color:'#d0d0e8', fontSize:14, marginBottom:8, boxSizing:'border-box', outline:'none', fontFamily:'inherit' };

  useEffect(()=>{ loadData(); },[tab]);

  async function loadData() {
    setLoading(true);
    try {
      if(tab==='questions') {
        const data = await getAllDebatesAdmin();
        setDebates(data);
      } else {
        const data = await getRecentCommentsAdmin(80);
        setAllComments(data);
      }
    } catch(err){ console.error(err); }
    finally{ setLoading(false); }
  }

  async function handleCreate() {
    if(!newQ.trim()||!newDate||!newLabelA.trim()||!newLabelB.trim()) { alert('Fill in all fields'); return; }
    setSubmitting(true);
    try {
      await createDebate({ question:newQ.trim(), date:newDate, label_a:newLabelA.trim(), label_b:newLabelB.trim() });
      setNewQ(''); setNewDate(''); setNewLabelA(''); setNewLabelB('');
      loadData();
    } catch(err){ alert('Error: '+err.message); }
    finally{ setSubmitting(false); }
  }

  async function handleDeleteDebateRow(id) {
    if(!window.confirm('Delete this debate and all its votes/comments? This cannot be undone.')) return;
    try { await deleteDebate(id); loadData(); }
    catch(err){ alert('Error: '+err.message); }
  }

  async function handleSaveEdit(id) {
    try {
      await updateDebate(id, editFields);
      setEditId(null); setEditFields({});
      loadData();
    } catch(err){ alert('Error: '+err.message); }
  }

  async function handleDeleteCommentRow(id) {
    try {
      await deleteComment(id);
      setAllComments(prev=>prev.filter(c=>c.id!==id));
    } catch(err){ alert('Error: '+err.message); }
  }

  const today = new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'16px 14px 80px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <div style={{ fontSize:20 }}>🛠️</div>
        <div>
          <div style={{ fontWeight:900, fontSize:18, color:'#d0d0e8' }}>Backoffice</div>
          <div style={{ fontSize:11, color:'#33334a' }}>Admin only — manage debates &amp; comments</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:20, borderBottom:'1px solid #1a1a30', paddingBottom:12 }}>
        {[['questions','📅 Questions'],['comments','💬 Comments']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:'6px 16px', background:tab===k?'#1a1a35':'transparent', border:`1px solid ${tab===k?'#2a2a55':'#1a1a30'}`, borderRadius:20, color:tab===k?'#d0d0e8':'#33334a', fontWeight:tab===k?800:500, fontSize:13, cursor:'pointer' }}>{l}</button>
        ))}
      </div>

      {/* ── Questions Tab ── */}
      {tab==='questions' && (
        <div>
          {/* Add new debate form */}
          <div style={{ background:'#0e0e22', border:'1px solid #191930', borderRadius:14, padding:18, marginBottom:20 }}>
            <div style={{ fontWeight:800, fontSize:14, color:'#8888c8', marginBottom:14 }}>➕ Schedule a Debate</div>
            <input style={inp} placeholder="Debate question (e.g. Remote work or office?)" value={newQ} onChange={e=>setNewQ(e.target.value)}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
              <input style={{...inp,marginBottom:0}} type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}/>
              <input style={{...inp,marginBottom:0}} placeholder="Side A label" value={newLabelA} onChange={e=>setNewLabelA(e.target.value)}/>
              <input style={{...inp,marginBottom:0}} placeholder="Side B label" value={newLabelB} onChange={e=>setNewLabelB(e.target.value)}/>
            </div>
            <button onClick={handleCreate} disabled={submitting} style={{ marginTop:8, padding:'9px 20px', background:'linear-gradient(135deg,#4fc4b8,#38a89d)', border:'none', borderRadius:9, color:'#0a0a1a', fontWeight:900, fontSize:13, cursor:submitting?'default':'pointer', opacity:submitting?0.7:1 }}>
              {submitting?'Saving…':'Add to Queue'}
            </button>
          </div>

          {/* Debate list */}
          {loading ? <div style={{ color:'#33334a', textAlign:'center', padding:32 }}>Loading…</div> : debates.map(d=>{
            const isPast   = d.date < today;
            const isToday  = d.date === today;
            const isFuture = d.date > today;
            const statusColor = d.is_closed?'#e8635a55':isToday?'#4fc4b8':isFuture?'#f7c948':'#33334a';
            const statusLabel = d.is_closed?'🔒 Closed':isToday?'🔴 Live':isFuture?'📅 Upcoming':'⌛ Past';
            return (
              <div key={d.id} style={{ background:'#0e0e22', border:'1px solid #191930', borderRadius:12, padding:'12px 14px', marginBottom:8 }}>
                {editId===d.id ? (
                  <div>
                    <input style={inp} value={editFields.question??d.question} onChange={e=>setEditFields(f=>({...f,question:e.target.value}))} placeholder="Question"/>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                      <input style={{...inp,marginBottom:0}} type="date" value={editFields.date??d.date} onChange={e=>setEditFields(f=>({...f,date:e.target.value}))}/>
                      <input style={{...inp,marginBottom:0}} placeholder="Side A" value={editFields.label_a??d.label_a} onChange={e=>setEditFields(f=>({...f,label_a:e.target.value}))}/>
                      <input style={{...inp,marginBottom:0}} placeholder="Side B" value={editFields.label_b??d.label_b} onChange={e=>setEditFields(f=>({...f,label_b:e.target.value}))}/>
                    </div>
                    <div style={{ display:'flex', gap:7, marginTop:10 }}>
                      <button onClick={()=>handleSaveEdit(d.id)} style={{ padding:'6px 14px', background:'linear-gradient(135deg,#4fc4b8,#38a89d)', border:'none', borderRadius:7, color:'#0a0a1a', fontWeight:800, fontSize:12, cursor:'pointer' }}>Save</button>
                      <button onClick={()=>{setEditId(null);setEditFields({});}} style={{ padding:'6px 12px', background:'transparent', border:'1px solid #1e1e38', borderRadius:7, color:'#3a3a58', fontSize:12, cursor:'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:6 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:10, fontWeight:800, color:statusColor, letterSpacing:0.5 }}>{statusLabel}</span>
                          <span style={{ fontSize:10, color:'#33334a' }}>{d.date}</span>
                        </div>
                        <div style={{ fontSize:14, fontWeight:700, color:'#d0d0e8', lineHeight:1.35 }}>{d.question}</div>
                        <div style={{ fontSize:11, color:'#33334a', marginTop:4 }}>
                          <span style={{ color:'#4fc4b8' }}>{d.label_a}</span> vs <span style={{ color:'#e8635a' }}>{d.label_b}</span>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                        {!d.is_closed && <button onClick={()=>{setEditId(d.id);setEditFields({});}} style={{ padding:'4px 10px', background:'rgba(255,255,255,.04)', border:'1px solid #1e1e38', borderRadius:6, color:'#6060aa', fontSize:11, cursor:'pointer' }}>✏️</button>}
                        {(isFuture||!d.is_closed) && <button onClick={()=>handleDeleteDebateRow(d.id)} style={{ padding:'4px 10px', background:'rgba(232,99,90,.06)', border:'1px solid #e8635a22', borderRadius:6, color:'#e8635a', fontSize:11, cursor:'pointer' }}>🗑️</button>}
                      </div>
                    </div>
                    {d.final_pct_a!=null && <div style={{ fontSize:11, color:'#33334a' }}>Final: {d.final_pct_a}% {d.label_a}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Comments Tab ── */}
      {tab==='comments' && (
        <div>
          <div style={{ fontSize:11, color:'#33334a', marginBottom:14 }}>Showing the 80 most recent comments across all debates.</div>
          {loading ? <div style={{ color:'#33334a', textAlign:'center', padding:32 }}>Loading…</div> : allComments.map(c=>(
            <div key={c.id} style={{ background:'#0e0e22', border:'1px solid #191930', borderLeft:`3px solid ${c.side==='A'?'#4fc4b844':'#e8635a44'}`, borderRadius:'0 10px 10px 0', padding:'10px 14px', marginBottom:7 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, color:'#33334a', marginBottom:4 }}>
                    <span style={{ color:c.side==='A'?'#4fc4b8':'#e8635a', fontWeight:700 }}>{c.side==='A'?(c.debates?.label_a??'A'):(c.debates?.label_b??'B')}</span>
                    {' · '}{c.user_profiles?.display_name||'user'}
                    {c.user_profiles?.is_ai_seed&&<span style={{ marginLeft:5, fontSize:9, color:'#5050a0', fontWeight:800 }}>AI</span>}
                    {' · '}{c.debates?.question?.slice(0,40)+'…'}
                    {' · '}{c.debates?.date}
                  </div>
                  <div style={{ fontSize:13, color:'#a8a8c8', lineHeight:1.5 }}>{c.text}</div>
                  {c.comment_status==='historical'&&<div style={{ fontSize:10, color:'#5858a8', marginTop:4 }}>⌛ historical</div>}
                </div>
                <button onClick={()=>handleDeleteCommentRow(c.id)} style={{ flexShrink:0, padding:'4px 9px', background:'rgba(232,99,90,.06)', border:'1px solid #e8635a22', borderRadius:6, color:'#e8635a', fontSize:11, cursor:'pointer' }}>🗑️</button>
              </div>
            </div>
          ))}
          {!loading&&allComments.length===0&&<div style={{ color:'#33334a', textAlign:'center', padding:32 }}>No comments found.</div>}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard Screen ──────────────────────────────────────────────────────
function LeaderboardScreen() {
  const [tab, setTab] = useState('voices');

  const topVoices = [
    { rank: 1, name: 'Tyrell W.', stat: '847 takes dropped', emoji: '👑' },
    { rank: 2, name: 'Sofia M.', stat: '634 takes', emoji: '🥈' },
    { rank: 3, name: 'Marcus T.', stat: '521 takes', emoji: '🥉' },
    { rank: 4, name: 'Priya R.', stat: '489 takes', emoji: null },
    { rank: 5, name: 'Derek C.', stat: '412 takes', emoji: null },
    { rank: 6, name: 'Josh K.', stat: '398 takes', emoji: null },
    { rank: 7, name: 'Anika J.', stat: '356 takes', emoji: null },
    { rank: 8, name: 'Chloe B.', stat: '301 takes', emoji: null },
    { rank: 9, name: 'Mike D.', stat: '287 takes', emoji: null },
    { rank: 10, name: 'Zoe P.', stat: '241 takes', emoji: null },
  ];

  const mostPersuasive = [
    { rank: 1, name: 'Sofia M.', stat: '127 minds changed', emoji: '👑' },
    { rank: 2, name: 'Anika J.', stat: '94 minds changed', emoji: '🥈' },
    { rank: 3, name: 'Tyrell W.', stat: '88 minds changed', emoji: '🥉' },
    { rank: 4, name: 'Priya R.', stat: '71 minds changed', emoji: null },
    { rank: 5, name: 'Josh K.', stat: '65 minds changed', emoji: null },
    { rank: 6, name: 'Marcus T.', stat: '58 minds changed', emoji: null },
    { rank: 7, name: 'Derek C.', stat: '44 minds changed', emoji: null },
    { rank: 8, name: 'Chloe B.', stat: '39 minds changed', emoji: null },
    { rank: 9, name: 'Zoe P.', stat: '31 minds changed', emoji: null },
    { rank: 10, name: 'Mike D.', stat: '27 minds changed', emoji: null },
  ];

  const streakKings = [
    { rank: 1, name: 'Marcus T.', stat: '47-day streak', emoji: '👑' },
    { rank: 2, name: 'Derek C.', stat: '38-day streak', emoji: '🥈' },
    { rank: 3, name: 'Priya R.', stat: '31-day streak', emoji: '🥉' },
    { rank: 4, name: 'Josh K.', stat: '28-day streak', emoji: null },
    { rank: 5, name: 'Tyrell W.', stat: '24-day streak', emoji: null },
    { rank: 6, name: 'Anika J.', stat: '19-day streak', emoji: null },
    { rank: 7, name: 'Sofia M.', stat: '17-day streak', emoji: null },
    { rank: 8, name: 'Chloe B.', stat: '14-day streak', emoji: null },
    { rank: 9, name: 'Mike D.', stat: '11-day streak', emoji: null },
    { rank: 10, name: 'Zoe P.', stat: '9-day streak', emoji: null },
  ];

  const data = tab === 'voices' ? topVoices : tab === 'persuasive' ? mostPersuasive : streakKings;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 14px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 20 }}>🏆</div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#d0d0e8' }}>Leaderboard</div>
          <div style={{ fontSize: 11, color: '#33334a' }}>Top debaters and influencers</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #1a1a30', paddingBottom: 12 }}>
        {[['voices', 'Top Voices'], ['persuasive', 'Most Persuasive'], ['streaks', 'Streak Kings']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '6px 14px',
              background: tab === k ? '#1a1a35' : 'transparent',
              border: `1px solid ${tab === k ? '#2a2a55' : '#1a1a30'}`,
              borderRadius: 20,
              color: tab === k ? '#d0d0e8' : '#33334a',
              fontWeight: tab === k ? 800 : 500,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <div>
        {data.map((item) => (
          <div
            key={item.rank}
            style={{
              background: '#0e0e22',
              border: '1px solid #191930',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: 18,
                color: item.emoji ? '#f7c948' : '#33334a',
                minWidth: 40,
                textAlign: 'center',
              }}
            >
              {item.emoji || `#${item.rank}`}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#d0d0e8', marginBottom: 3 }}>
                {item.name}
              </div>
              <div style={{ fontSize: 12, color: '#7070a0' }}>
                {tab === 'streaks' ? `🔥 ${item.stat}` : item.stat}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────
function BottomNav({ screen, onToday, onArchive, onShare, onLeaderboard, onBackoffice, isAdmin }) {
  const tabs = [
    ['🏠','Today','today',onToday],
    ['📅','Archive','archive',onArchive],
    ['🏆','Top','leaderboard',onLeaderboard],
    ['📤','Share','share',onShare],
  ];
  if(isAdmin) tabs.push(['🛠️','Admin','backoffice',onBackoffice]);
  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'rgba(8,8,20,0.97)', borderTop:'1px solid #1a1a33', backdropFilter:'blur(12px)', padding:'10px 0 16px', display:'flex', justifyContent:'space-around', zIndex:50 }}>
      {tabs.map(([ic,lab,key,fn])=>(
        <button key={lab} onClick={fn} style={{ background:'none', border:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:3, cursor:'pointer', color:screen===key?'#4fc4b8':'#33334a', fontSize:20, transition:'color 0.15s, transform 0.15s', transform:screen===key?'scale(1.1)':'scale(1)' }}>
          <span>{ic}</span>
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:0.5 }}>{lab}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Auth Screen — 3-column: panels left/right, login card centered ───────────
function AuthScreen() {
  const [mode, setMode]       = useState('login');
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [err, setErr]         = useState('');
  const [loading, setLoading] = useState(false);

  const inp = { width:'100%', padding:'13px 15px', background:'#0e0e22', border:'1px solid #1e1e3a', borderRadius:12, color:'#d0d0e8', fontSize:16, marginBottom:11, boxSizing:'border-box', outline:'none', fontFamily:'inherit' };

  async function handleGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:window.location.origin } });
    if (error) { setErr(error.message); setLoading(false); }
  }
  async function submit() {
    setErr('');
    if (!email||!pass) { setErr('All fields required'); return; }
    if (mode==='signup'&&name.trim().length<2) { setErr('Enter a display name (min 2 chars)'); return; }
    setLoading(true);
    if (mode==='signup') {
      const {error} = await supabase.auth.signUp({email,password:pass,options:{data:{full_name:name.trim()}}});
      if (error) setErr(error.message); else setErr('Check your email to confirm, then sign in.');
    } else {
      const {error} = await supabase.auth.signInWithPassword({email,password:pass});
      if (error) setErr(error.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a1a', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Login card — centered at top */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 20px 40px' }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:4, color:'#2a2a4a', marginBottom:18, textTransform:'uppercase' }}>Welcome to</div>
            <PickASydeLogo size="large" />
            <p style={{ color:'#5050a0', fontSize:14, marginTop:20, fontWeight:500 }}>One question. Two sides. You decide.</p>
          </div>

          {/* Google button */}
          <button onClick={handleGoogle} disabled={loading} style={{ width:'100%', padding:'14px 16px', background:'#fff', border:'none', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor:'pointer', fontSize:15, fontWeight:600, color:'#1a1a2e', marginBottom:16, boxShadow:'0 2px 16px rgba(0,0,0,.55)', opacity:loading?0.7:1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {loading ? 'Connecting…' : 'Continue with Google'}
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <div style={{ flex:1, height:1, background:'#1e1e3a' }}/><span style={{ color:'#252540', fontSize:12 }}>or</span><div style={{ flex:1, height:1, background:'#1e1e3a' }}/>
          </div>

          {mode==='signup' && <input placeholder="Display name" value={name} onChange={e=>setName(e.target.value)} style={inp}/>}
          <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} style={inp}/>
          <input placeholder="Password" type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} style={inp}/>
          {err && <p style={{ color:err.includes('Check your email')?'#4fc4b8':'#e8635a', fontSize:12, margin:'0 0 10px' }}>{err}</p>}

          <button onClick={submit} disabled={loading} style={{ width:'100%', padding:14, background:'linear-gradient(135deg,#4fc4b8,#38a89d)', border:'none', borderRadius:12, color:'#0a0a1a', fontWeight:900, fontSize:15, cursor:'pointer', opacity:loading?0.7:1 }}>
            {loading ? 'Loading…' : mode==='login' ? 'Sign In' : 'Create Account'}
          </button>
          <p style={{ textAlign:'center', color:'#252540', fontSize:13, marginTop:16 }}>
            {mode==='login' ? 'No account? ' : 'Have one? '}
            <span onClick={()=>{setMode(m=>m==='login'?'signup':'login');setErr('');}} style={{ color:'#4fc4b8', cursor:'pointer', fontWeight:600 }}>
              {mode==='login' ? 'Sign up free' : 'Sign in'}
            </span>
          </p>
        </div>
      </div>

      {/* Panels below login — side by side */}
      <div style={{ display:'flex', borderTop:'1px solid #12122a', background:'linear-gradient(180deg,#070712 0%,#0a0a1a 100%)' }}>
        <div style={{ flex:1, borderRight:'1px solid #12122a' }}>
          <AnimatedQuestions compact />
        </div>
        <div style={{ flex:1 }}>
          <PlatformExplainer compact />
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser]         = useState(null);
  const [userProfile, setUserProfile]   = useState(null);
  const [authLoading, setAuthLoading]   = useState(true);
  const [screen, setScreen]             = useState('today');
  const [archivedDebate, setArchivedDebate] = useState(null);
  const [todayDebate, setTodayDebate]   = useState(null);
  const [yesterdayDebate, setYesterdayDebate] = useState(null);
  const [debateLoading, setDebateLoading] = useState(true);
  const [archive, setArchive]           = useState([]);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [userVoteMap, setUserVoteMap]   = useState({});
  const [voteCounts, setVoteCounts]     = useState({countA:0,countB:0});
  const [mindsChanged, setMindsChanged]  = useState(0);
  const [comments, setComments]         = useState([]);
  const [commentText, setCommentText]   = useState('');
  const [modState, setModState]         = useState(null);
  const [filterSide, setFilterSide]     = useState('all');
  const [sortBy, setSortBy]             = useState('top');
  const [showBox, setShowBox]           = useState(false);
  const [showVoteButtons, setShowVoteButtons] = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [userUpvotes, setUserUpvotes]   = useState(new Set());
  const [aiLoading, setAiLoading]       = useState(null);
  const [aiPersonas, setAiPersonas]     = useState([]);
  const [showShare, setShowShare]       = useState(false);
  const [shareNudge, setShareNudge]     = useState(false);
  const [voteFlash, setVoteFlash]       = useState(null);
  const [sponsorIdx, setSponsorIdx]     = useState(0);
  // Side switch state (max 2 switches per debate)
  const [switchCount, setSwitchCount]   = useState(0);
  const [switchTarget, setSwitchTarget] = useState(null); // { comment } — the comment that triggered switch
  const [switchModal, setSwitchModal]   = useState(false);
  const [switching, setSwitching]       = useState(false);
  // Post-switch comment prompt
  const [showNewSidePrompt, setShowNewSidePrompt] = useState(false);
  const textRef = useRef(null);
  const commentChannelRef = useRef(null);
  const upvoteChannelRef  = useRef(null);

  useEffect(() => { const t=setInterval(()=>setSponsorIdx(i=>(i+1)%SPONSORS.length),9000); return()=>clearInterval(t); },[]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setAuthUser(session?.user??null);setAuthLoading(false);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>setAuthUser(session?.user??null));
    return()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(authUser) getUserProfile().then(p=>setUserProfile(p)).catch(console.error); else setUserProfile(null); },[authUser]);
  useEffect(()=>{ if(authUser) loadTodayDebate(); },[authUser]);

  async function loadTodayDebate() {
    setDebateLoading(true);
    try {
      const today = await getTodayDebate();
      setTodayDebate(today);
      if (today) {
        const [voteRow,counts,comms,upvs,switched,minds] = await Promise.all([getUserVote(today.id),getVoteCounts(today.id),getCommentsWithStatus(today.id),authUser?getUserUpvotes(today.id):Promise.resolve(new Set()),authUser?hasUserSwitched(today.id):Promise.resolve(false),getMindsChangedCount(today.id)]);
        if(voteRow) setUserVoteMap(m=>({...m,[today.id]:voteRow}));
        setVoteCounts(counts);
        setMindsChanged(minds + 47);
        setComments(addSideLabels(comms,today));
        setUserUpvotes(upvs);
        setSwitchCount(switched||0);
        if(commentChannelRef.current) commentChannelRef.current.unsubscribe();
        commentChannelRef.current = subscribeToComments(today.id, nc=>{
          setComments(prev=>prev.find(c=>c.id===nc.id)?prev:[addSideLabel(nc,today),...prev]);
        });
        if(upvoteChannelRef.current) upvoteChannelRef.current.unsubscribe();
        upvoteChannelRef.current = subscribeToUpvotes(today.id,({commentId,newCount})=>{
          setComments(prev=>prev.map(c=>c.id===commentId?{...c,upvote_count:newCount}:c));
        });
      }
      const arch = await getArchive();
      if(arch.length>0) setYesterdayDebate(arch[0]);
    } catch(err){ console.error('loadTodayDebate error:',err); }
    finally { setDebateLoading(false); }
  }
  useEffect(()=>()=>{commentChannelRef.current?.unsubscribe();upvoteChannelRef.current?.unsubscribe();},[]);

  async function loadArchive() {
    if(archiveLoaded){setScreen('archive');return;}
    try {
      const data=await getArchive(); setArchive(data); setArchiveLoaded(true);
      await Promise.all(data.map(async d=>{ const v=await getUserVote(d.id); if(v) setUserVoteMap(m=>({...m,[d.id]:v})); }));
    } catch(err){console.error('loadArchive error:',err);}
    setScreen('archive');
  }
  async function loadArchivedDetail(debate) {
    setArchivedDebate(debate); setScreen('archived-detail');
    try { const [comms,upvs]=await Promise.all([getComments(debate.id),getUserUpvotes(debate.id)]); setComments(addSideLabels(comms,debate)); setUserUpvotes(upvs); }
    catch(err){console.error('loadArchivedDetail error:',err);}
  }
  function goToToday() { setScreen('today'); if(todayDebate) getComments(todayDebate.id).then(comms=>setComments(addSideLabels(comms,todayDebate))); }
  const addSideLabel  = (c,d) => ({...c,side_label:c.side==='A'?d.label_a:d.label_b});
  const addSideLabels = (cs,d) => cs.map(c=>addSideLabel(c,d));

  const debate    = screen==='archived-detail' ? archivedDebate : todayDebate;
  const isLocked  = debate?.is_closed ?? false;
  const userVoteRow = debate ? userVoteMap[debate.id] : null;
  const userVote  = userVoteRow?.side ?? null;
  const pctA      = calcPctA(debate, comments, userVote, screen==='today' ? voteCounts : null);

  useEffect(()=>{ if(authUser&&isAdmin(authUser)) getAIPersonas().then(setAiPersonas).catch(console.error); },[authUser]);

  async function handleVote(side) {
    if(!authUser||!debate||isLocked) return;
    const label = side==='A' ? debate.label_a : debate.label_b;
    const color = side==='A' ? '#4fc4b8' : '#e8635a';
    setUserVoteMap(m=>({...m,[debate.id]:{id:`optimistic_${Date.now()}`,side}}));
    setShowVoteButtons(false); setModState(null);
    setVoteFlash({side,label,color});
    // Auto-open comment box after voting (post-vote prompt)
    setShowBox(true);
    setShowNewSidePrompt(false);
    setTimeout(()=>textRef.current?.focus(),2800); // focus after flash animation
    try {
      const row = userVoteRow ? await changeVote(userVoteRow.id,side) : await castVote(debate.id,side);
      if(!userVoteRow) getUserProfile().then(p=>setUserProfile(p)).catch(console.error);
      setUserVoteMap(m=>({...m,[debate.id]:row}));
      getVoteCounts(debate.id).then(setVoteCounts).catch(console.error);
    } catch(err){console.error('handleVote error:',err);setUserVoteMap(m=>({...m,[debate.id]:userVoteRow??null}));}
  }

  async function handleSubmit() {
    if(!authUser||!userVote||submitting||isLocked||!debate) return;
    const text = commentText.trim();
    if(!text){setShowBox(false);setShowNewSidePrompt(false);return;}
    setSubmitting(true); setModState({status:'checking'});
    const result = await moderateComment(text,debate.question);
    if(!result.allowed){setModState({status:'blocked',reason:result.reason});setSubmitting(false);return;}
    setModState({status:'allowed'}); await new Promise(r=>setTimeout(r,600));
    try {
      const nc=await postComment(debate.id,userVote,text);
      setComments(prev=>[addSideLabel(nc,debate),...prev]); setCommentText(''); setModState(null); setShowBox(false); setShowNewSidePrompt(false);
    } catch(err){console.error('handleSubmit error:',err);setModState({status:'blocked',reason:'Failed to post. Please try again.'});}
    finally{setSubmitting(false);}
  }

  // Called when user taps "This changed my mind" on an opposite-side comment
  async function handleChangedMyMind(comment) {
    if(!debate||!userVote||switchCount>=2||isLocked) return;
    // Log the signal immediately (analytics — every tap captured)
    await logPersuasionSignal(debate.id, comment.id).catch(console.error);
    setSwitchTarget(comment);
    setSwitchModal(true);
  }

  // Called when user confirms the switch in the modal
  async function handleConfirmSwitch(reasonText) {
    if(!debate||!userVote||!userVoteRow||switching) return;
    const previousSide = userVote;
    const newSide = previousSide==='A' ? 'B' : 'A';
    setSwitching(true);
    try {
      const { voteRow } = await executeSideSwitch({
        voteId: userVoteRow.id,
        debateId: debate.id,
        previousSide,
        newSide,
        persuadingCommentId: switchTarget?.id || null,
        switchReasonText: reasonText || null,
      });
      // Update local state
      setUserVoteMap(m=>({...m,[debate.id]:voteRow}));
      setSwitchCount(c=>c+1);
      // Mark the user's old comment as historical in local state
      setComments(prev=>prev.map(c=>c.user_id===authUser.id&&c.side===previousSide&&c.comment_status==='active' ? {...c,comment_status:'historical'} : c));
      // Update vote counts
      getVoteCounts(debate.id).then(setVoteCounts).catch(console.error);
      // Close modal, clear target
      setSwitchModal(false); setSwitchTarget(null);
      // Prompt for new side comment — pre-fill with the reason they just typed (reduces double-entry friction)
      setCommentText(reasonText||'');
      setModState(null);
      setShowBox(true);
      setShowNewSidePrompt(true);
      setTimeout(()=>textRef.current?.focus(),200);
    } catch(err){console.error('handleConfirmSwitch error:',err);}
    finally{setSwitching(false);}
  }

  async function handleUpvote(commentId) {
    if(!authUser||isLocked) return;
    setComments(prev=>prev.map(c=>c.id===commentId?{...c,upvote_count:c.upvote_count+1}:c));
    setUserUpvotes(s=>new Set([...s,commentId]));
    try { await upvoteComment(commentId); }
    catch(err){ setComments(prev=>prev.map(c=>c.id===commentId?{...c,upvote_count:c.upvote_count-1}:c)); setUserUpvotes(s=>{const n=new Set(s);n.delete(commentId);return n;}); }
  }

  async function handleRemoveUpvote(commentId) {
    if(!authUser||isLocked) return;
    setComments(prev=>prev.map(c=>c.id===commentId?{...c,upvote_count:Math.max(0,c.upvote_count-1)}:c));
    setUserUpvotes(s=>{const n=new Set(s);n.delete(commentId);return n;});
    try { await removeUpvote(commentId); }
    catch(err){ setComments(prev=>prev.map(c=>c.id===commentId?{...c,upvote_count:c.upvote_count+1}:c)); setUserUpvotes(s=>new Set([...s,commentId])); }
  }

  async function handleEdit(commentId, newText) {
    const updated = await updateComment(commentId, newText);
    setComments(prev=>prev.map(c=>c.id===commentId?{...c,text:updated.text}:c));
  }
  async function handleDelete(commentId) {
    await deleteComment(commentId);
    setComments(prev=>prev.filter(c=>c.id!==commentId));
  }

  async function handleAIGenerate(side) {
    if(aiLoading||isLocked||!debate) return;
    setAiLoading(side);
    try {
      const text=await generateAIComment(side,debate.label_a,debate.label_b,debate.question);
      const persona=aiPersonas[Math.floor(Math.random()*aiPersonas.length)];
      if(!persona){alert('No AI persona accounts found.');return;}
      const nc=await seedAIComment(debate.id,side,text,persona.id);
      setComments(prev=>[addSideLabel(nc,debate),...prev]);
    } catch(err){console.error('handleAIGenerate error:',err);alert('AI seed failed: '+err.message);}
    finally{setAiLoading(null);}
  }

  async function handleSignOut() { await supabase.auth.signOut(); setUserVoteMap({}); setUserProfile(null); }

  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const userComment = comments.find(c=>c.user_id===authUser?.id);
  const visible = comments.filter(c=>c.text&&(filterSide==='all'||c.side===filterSide)).sort((a,b)=>sortBy==='top'?b.upvote_count-a.upvote_count:new Date(b.created_at)-new Date(a.created_at));
  const streak = userProfile?.current_streak??0;
  const adminUser = authUser&&isAdmin(authUser);
  const activeSponsor = debate?.sponsor_name ? {name:debate.sponsor_name,tagline:debate.sponsor_tagline,letter:debate.sponsor_logo_letter,color:debate.sponsor_color,url:'#'} : SPONSORS[sponsorIdx];

  if(authLoading) return <div style={{minHeight:'100vh',background:'#0a0a1a',display:'flex',alignItems:'center',justifyContent:'center'}}><PickASydeLogo size="large"/></div>;
  if(!authUser) return <AuthScreen/>;

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <div className="vs-layout" style={{ fontFamily:"'DM Sans',system-ui,sans-serif", color:'#d0d0e8' }}>

        {/* Side columns removed — panels live below center */}

        {/* CENTER ─────────────────────────────────────────────────────────── */}
        <div className="vs-center">

          {/* Header */}
          <div style={{ background:'rgba(9,9,22,0.97)', borderBottom:'1px solid #1a1a33', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50, backdropFilter:'blur(12px)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {(screen==='archived-detail'||screen==='backoffice') && <button onClick={()=>setScreen(screen==='archived-detail'?'archive':'today')} style={{ background:'none',border:'none',color:'#4fc4b8',cursor:'pointer',fontSize:18,padding:0 }}>←</button>}
              <PickASydeLogo size="small"/>
              {streak>=2 && <span style={{ fontSize:11,fontWeight:800,color:'#f7c948',background:'rgba(247,201,72,.1)',border:'1px solid #f7c94828',borderRadius:6,padding:'2px 8px' }}>{streak}🔥</span>}
            </div>
            <div style={{ display:'flex', gap:7, alignItems:'center' }}>
              {(screen==='archived-detail'||screen==='backoffice') && <button onClick={goToToday} style={{ background:'rgba(255,255,255,.04)',border:'1px solid #1e1e3a',borderRadius:7,padding:'4px 10px',fontSize:11,fontWeight:700,color:'#55557a',cursor:'pointer' }}>Today</button>}
              <div style={{ position:'relative' }}>
                <button onClick={()=>setShowProfileMenu(v=>!v)} title="Account" style={{ background:'none',border:'none',cursor:'pointer',padding:0 }}>
                  <Av uid={authUser.id} name={userProfile?.display_name||authUser.email} size={30}/>
                </button>
                {showProfileMenu && (
                  <>
                    <div onClick={()=>setShowProfileMenu(false)} style={{ position:'fixed',inset:0,zIndex:99 }}/>
                    <div style={{ position:'absolute',right:0,top:38,zIndex:100,background:'#12122a',border:'1px solid #1e1e3a',borderRadius:11,padding:'6px 0',minWidth:160,boxShadow:'0 8px 32px rgba(0,0,0,0.55)' }}>
                      <div style={{ padding:'8px 14px 6px',borderBottom:'1px solid #1a1a30' }}>
                        <div style={{ fontSize:12,fontWeight:700,color:'#d0d0e8' }}>{userProfile?.display_name||'Account'}</div>
                        <div style={{ fontSize:11,color:'#3a3a58',marginTop:2 }}>{authUser.email}</div>
                      </div>
                      <button onClick={()=>{setShowProfileMenu(false);handleSignOut();}} style={{ width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',padding:'9px 14px',fontSize:13,color:'#e8635a',fontWeight:700 }}>
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Backoffice (admin only) ── */}
          {screen==='backoffice' && adminUser && <BackofficeScreen/>}

          {/* ── Leaderboard ── */}
          {screen==='leaderboard' && <LeaderboardScreen/>}

          {/* ── Archive list ── */}
          {screen==='archive' && (
            <div style={{ maxWidth:580, margin:'0 auto', padding:'16px 14px 60px' }}>
              <p style={{ fontSize:13, color:'#3a3a58', marginBottom:16 }}>Past debates are read-only. Votes & comments lock at midnight EST.</p>
              {archive.map(d=>{
                const myVote=userVoteMap[d.id]; const pct=d.final_pct_a??50;
                return (
                  <div key={d.id} onClick={()=>loadArchivedDetail(d)}
                    style={{ background:'#0e0e22', border:'1px solid #191930', borderRadius:14, padding:'14px 16px', marginBottom:10, cursor:'pointer', transition:'border-color 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='#2a2a45'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='#191930'}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:10, color:'#33334a', fontWeight:700, letterSpacing:0.8, marginBottom:4 }}>{formatDate(d.date)}</div>
                        <div style={{ fontSize:15, fontWeight:700, color:'#d0d0e8', lineHeight:1.3 }}>{d.question}</div>
                      </div>
                      {myVote && <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:4, background:myVote.side==='A'?'rgba(79,196,184,.12)':'rgba(232,99,90,.12)', color:myVote.side==='A'?'#4fc4b8':'#e8635a', flexShrink:0, marginLeft:10 }}>I picked {myVote.side==='A'?d.label_a:d.label_b}</span>}
                    </div>
                    <VoteBar pctA={pct} lA={d.label_a} lB={d.label_b} animate={false}/>
                    {d.sponsor_name && <div style={{ marginTop:10, fontSize:10, color:'#33334a', display:'flex', alignItems:'center', gap:5 }}><div style={{ width:14, height:14, borderRadius:3, background:d.sponsor_color||'#888', display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, fontWeight:900, color:'#fff' }}>{d.sponsor_logo_letter}</div>Sponsored by {d.sponsor_name}</div>}
                  </div>
                );
              })}
              {archive.length===0 && <p style={{ textAlign:'center', color:'#33334a', padding:40, fontSize:13 }}>No archived debates yet. Come back tomorrow!</p>}
            </div>
          )}

          {/* ── Today / Archived-detail ── */}
          {screen!=='archive' && screen!=='backoffice' && screen!=='leaderboard' && (
            <div style={{ maxWidth:680, margin:'0 auto', padding:'0 16px 60px', width:'100%' }}>

              {debateLoading && screen==='today' && <div style={{ padding:48, textAlign:'center', color:'#33334a', fontSize:14 }}>Loading today's debate…</div>}

              {!debateLoading && screen==='today' && !todayDebate && (
                <div style={{ padding:48, textAlign:'center' }}>
                  <div style={{ fontSize:30, marginBottom:14 }}>🕐</div>
                  <div style={{ color:'#55557a', fontSize:15, fontWeight:600 }}>No debate scheduled for today.</div>
                  <div style={{ color:'#33334a', fontSize:13, marginTop:6 }}>Check back soon, or browse the archive.</div>
                </div>
              )}

              {debate && (<>

                {/* Yesterday banner */}
                {screen==='today' && yesterdayDebate && (
                  <div style={{ marginTop:14, marginBottom:12, background:'#0e0e22', border:'1px solid #191930', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, fontWeight:800, letterSpacing:0.8, color:'#33334a', marginBottom:3 }}>YESTERDAY'S RESULT · {formatDate(yesterdayDebate.date)}</div>
                      <div style={{ fontSize:13, color:'#7070a0', lineHeight:1.3 }}>{yesterdayDebate.question}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:20, fontWeight:900, color:'#4fc4b8' }}>{yesterdayDebate.final_pct_a??'?'}%</div>
                      <div style={{ fontSize:9, color:'#4fc4b8', fontWeight:700 }}>{yesterdayDebate.label_a} won</div>
                    </div>
                  </div>
                )}

                {/* Sponsor badge */}
                {activeSponsor && (
                  <a href={activeSponsor.url||'#'} target="_blank" rel="noopener noreferrer" className="sponsor-badge"
                    style={{ display:'flex', alignItems:'center', gap:12, marginTop:screen==='today'?20:14, marginBottom:14, padding:'13px 16px', background:'linear-gradient(135deg,rgba(247,201,72,0.09),rgba(247,201,72,0.04))', border:'1px solid rgba(247,201,72,0.25)', borderRadius:12, textDecoration:'none', cursor:'pointer', position:'relative', overflow:'hidden' }}
                  >
                    <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(247,201,72,0.5),transparent)' }}/>
                    <div style={{ width:38, height:38, borderRadius:9, flexShrink:0, background:activeSponsor.color||'#333', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:900, color:'#fff', boxShadow:`0 0 14px ${activeSponsor.color||'#333'}66` }}>
                      {activeSponsor.letter}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, color:'#f7c948', fontWeight:800, letterSpacing:1.2, textTransform:'uppercase', marginBottom:3 }}>✦ Sponsored by {activeSponsor.name}</div>
                      <div style={{ fontSize:12, color:'#7a7a55', fontWeight:600 }}>{activeSponsor.tagline}</div>
                    </div>
                    <span style={{ fontSize:11, color:'#3a3a30', fontWeight:600, flexShrink:0 }}>↗</span>
                  </a>
                )}

                {/* Locked banner */}
                {isLocked && <div style={{ background:'rgba(232,99,90,.06)', border:'1px solid #e8635a22', borderRadius:10, padding:'9px 14px', marginBottom:14, fontSize:13, color:'#e8635a66', fontWeight:600, textAlign:'center' }}>🔒 This debate is closed · {formatDate(debate.date)} · Votes & comments locked</div>}

                {/* ── Debate card — gradient border, prominent ── */}
                <div className="debate-card-wrap">
                  <div className="debate-card-inner">
                    <div style={{ fontSize:10, fontWeight:800, letterSpacing:1.5, color:'#7070c0', marginBottom:12, textTransform:'uppercase' }}>
                      {isLocked ? `Final Result · ${formatDate(debate.date)}` : `Today's Debate · ${formatDate(debate.date)}`}
                    </div>
                    <h1 style={{ margin:'0 0 22px', fontSize:'clamp(22px,5vw,30px)', fontWeight:900, lineHeight:1.25, color:'#f0f0ff', letterSpacing:'-.5px', fontStyle:'italic' }}>{debate.question}</h1>
                    <VoteBar pctA={pctA} lA={debate.label_a} lB={debate.label_b} voteCounts={voteCounts} mindsChanged={mindsChanged}/>

                    {/* Vote buttons */}
                    {!isLocked && (!userVote||showVoteButtons) && (
                      <div style={{ display:'flex', gap:10, marginTop:20 }}>
                        {[['A','#4fc4b8',debate.label_a,'✨'],['B','#e8635a',debate.label_b,'🎲']].map(([s,col,lab,ic])=>(
                          <button key={s} onClick={()=>handleVote(s)} className="vote-btn" style={{ flex:1, padding:'20px 12px', background:`linear-gradient(135deg,${col}22,${col}0a)`, border:`2px solid ${col}`, borderRadius:16, color:col, fontWeight:900, fontSize:'clamp(16px,4vw,20px)', cursor:'pointer', letterSpacing:0.5, fontFamily:"'DM Sans',system-ui,sans-serif", fontStyle:'normal', textShadow:`0 0 16px ${col}99`, boxShadow:`0 0 30px ${col}33`, fontVariantLigatures:'none' }}>
                            {ic} {lab}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Voted state */}
                    {!isLocked && userVote && !showVoteButtons && (
                      <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:9, flexWrap:'wrap' }}>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:userVote==='A'?'rgba(79,196,184,.12)':'rgba(232,99,90,.12)', border:`1px solid ${userVote==='A'?'#4fc4b844':'#e8635a44'}`, borderRadius:10, padding:'7px 13px', fontSize:13, color:userVote==='A'?'#4fc4b8':'#e8635a', fontWeight:700 }}>
                          ✓ {userVote==='A'?debate.label_a:debate.label_b}
                          {switchCount<2 && <span onClick={()=>{setShowVoteButtons(true);setShowBox(false);setModState(null);}} style={{ color:'#7070b0', cursor:'pointer', fontSize:11, borderLeft:'1px solid #3a3a58', paddingLeft:8, marginLeft:3, fontWeight:600 }}>change</span>}
                        </div>
                        <button onClick={()=>setShowShare(true)} style={{ background:'rgba(247,201,72,.08)', border:'1px solid #f7c94830', borderRadius:10, padding:'7px 13px', fontSize:12, fontWeight:700, color:'#f7c948', cursor:'pointer' }}>📤 Share</button>
                        {!showBox && !userComment && <button onClick={()=>setShowBox(true)} style={{ fontSize:12, color:'#33334a', background:'none', border:'1px solid #1a1a30', borderRadius:9, padding:'6px 12px', cursor:'pointer' }}>+ comment</button>}
                      </div>
                    )}

                    {/* Locked + voted */}
                    {isLocked && userVote && (
                      <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:userVote==='A'?'rgba(79,196,184,.08)':'rgba(232,99,90,.08)', border:`1px solid ${userVote==='A'?'#4fc4b822':'#e8635a22'}`, borderRadius:10, padding:'6px 12px', fontSize:12, color:userVote==='A'?'#4fc4b8':'#e8635a', fontWeight:700 }}>
                          You picked {userVote==='A'?debate.label_a:debate.label_b}
                        </div>
                        <button onClick={()=>setShowShare(true)} style={{ background:'rgba(247,201,72,.08)', border:'1px solid #f7c94828', borderRadius:9, padding:'6px 12px', fontSize:12, fontWeight:700, color:'#f7c948', cursor:'pointer' }}>📤 Share</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comment box — post-vote prompt or post-switch prompt */}
                {showBox && userVote && !isLocked && (
                  <div style={{ background:'#0e0e24', border:`1px solid ${userVote==='A'?'#4fc4b825':'#e8635a25'}`, borderRadius:13, padding:16, marginBottom:14 }}>
                    {showNewSidePrompt ? (
                      <p style={{ margin:'0 0 10px', fontSize:13, color:'#8888c8', fontWeight:700 }}>
                        You switched sides. Add a comment supporting your new position. <span style={{ color:'#33334a', fontWeight:400 }}>(optional)</span>
                      </p>
                    ) : (
                      <p style={{ margin:'0 0 10px', fontSize:12, color:'#3e3e5a' }}>
                        Why did you choose <span style={{ color:userVote==='A'?'#4fc4b8':'#e8635a', fontWeight:700 }}>{userVote==='A'?debate.label_a:debate.label_b}</span>? <span style={{ color:'#252540' }}>(optional — &gt;5 upvotes boosts your side ⚡)</span>
                      </p>
                    )}
                    <textarea ref={textRef} placeholder={showNewSidePrompt ? `Make the case for ${userVote==='A'?debate.label_a:debate.label_b}…` : `Why ${userVote==='A'?debate.label_a:debate.label_b}? Make your case…`} value={commentText} onChange={e=>{setCommentText(stripHtml(e.target.value).slice(0,280));if(modState?.status==='blocked')setModState(null);}} rows={3}
                      style={{ width:'100%', background:'#0a0a1a', border:'1px solid #1a1a30', borderRadius:9, color:'#d0d0e8', fontSize:16, padding:'11px 13px', resize:'none', boxSizing:'border-box', outline:'none', fontFamily:'inherit', lineHeight:1.55 }}/>
                    <div style={{ textAlign:'right', fontSize:11, color:'#2e2e48', marginTop:3 }}>{commentText.length}/280</div>
                    {modState && (
                      <div style={{ background:modState.status==='checking'?'#1a1a30':modState.status==='blocked'?'rgba(232,99,90,.1)':'rgba(79,196,184,.08)', border:`1px solid ${modState.status==='checking'?'#2a2a48':modState.status==='blocked'?'#e8635a22':'#4fc4b822'}`, borderRadius:8, padding:'7px 11px', fontSize:12, color:modState.status==='checking'?'#55557a':modState.status==='blocked'?'#e8635a':'#4fc4b8', display:'flex', alignItems:'center', gap:6, marginTop:9, fontWeight:600 }}>
                        <span>{modState.status==='checking'?'⏳':modState.status==='blocked'?'🚫':'✓'}</span>
                        <span>{modState.status==='checking'?'Reviewing comment…':modState.status==='blocked'?(modState.reason||"Comment blocked — personal attacks aren't allowed"):'Approved'}</span>
                      </div>
                    )}
                    <div style={{ display:'flex', gap:9, marginTop:11 }}>
                      <button onClick={handleSubmit} disabled={submitting} style={{ flex:1, padding:11, background:userVote==='A'?'linear-gradient(135deg,#4fc4b8,#38a89d)':'linear-gradient(135deg,#e8635a,#d44a40)', border:'none', borderRadius:9, color:'#0a0a1a', fontWeight:900, fontSize:13, cursor:submitting?'default':'pointer', opacity:submitting?0.7:1 }}>
                        {submitting ? 'Checking…' : 'Post Comment'}
                      </button>
                      <button onClick={()=>{setShowBox(false);setCommentText('');setModState(null);setShowNewSidePrompt(false);}} style={{ padding:'11px 14px', background:'transparent', border:'1px solid #1a1a30', borderRadius:9, color:'#3a3a58', cursor:'pointer', fontSize:13 }}>Skip</button>
                    </div>
                  </div>
                )}

                {/* AI seed — admin only */}
                {!isLocked && adminUser && (
                  <div style={{ display:'flex', gap:7, marginBottom:14 }}>
                    {[['A','#4fc4b8',debate.label_a],['B','#e8635a',debate.label_b]].map(([s,col,lab])=>(
                      <button key={s} onClick={()=>handleAIGenerate(s)} disabled={!!aiLoading} style={{ flex:1, padding:6, background:`${col}07`, border:`1px dashed ${col}44`, borderRadius:7, color:col, fontSize:10, fontWeight:700, cursor:aiLoading?'default':'pointer', letterSpacing:0.4, opacity:aiLoading===s?0.6:1 }}>
                        {aiLoading===s?'⏳ generating…':`🤖 Seed: ${lab}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* Filter bar */}
                <div style={{ display:'flex', gap:6, marginBottom:14, alignItems:'center' }}>
                  {[['all','All'],['A',debate.label_a],['B',debate.label_b]].map(([v,l])=>(
                    <button key={v} onClick={()=>setFilterSide(v)} style={{ padding:'5px 13px', background:filterSide===v?(v==='A'?'#4fc4b8':v==='B'?'#e8635a':'#4fc4b8'):'rgba(255,255,255,.03)', border:`1px solid ${filterSide===v?'transparent':'#1a1a30'}`, borderRadius:20, color:filterSide===v?'#0a0a1a':'#3e3e5a', fontSize:12, fontWeight:filterSide===v?800:500, cursor:'pointer' }}>{l}</button>
                  ))}
                  <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    {[['top','Top'],['new','New']].map(([v,l])=>(
                      <button key={v} onClick={()=>setSortBy(v)} style={{ padding:'5px 11px', background:sortBy===v?'#1a1a30':'transparent', border:'1px solid #1a1a30', borderRadius:20, color:sortBy===v?'#d0d0e8':'#2e2e48', fontSize:11, cursor:'pointer' }}>{l}</button>
                    ))}
                  </div>
                </div>

                {/* Comments */}
                {visible.length===0
                  ? <p style={{ textAlign:'center', color:'#252540', padding:36, fontSize:13 }}>No comments yet. {isLocked?'Debate is closed.':'Pick a side and start the conversation.'}</p>
                  : visible.map(c=><CommentCard key={c.id} c={c} currentUserId={authUser.id} hasUpvoted={userUpvotes.has(c.id)} onUpvote={handleUpvote} onRemoveUpvote={handleRemoveUpvote} locked={isLocked} onEdit={handleEdit} onDelete={handleDelete} userVote={userVote} canSwitchSides={!!userVote&&switchCount<2&&!isLocked} onChangedMyMind={handleChangedMyMind}/>)
                }
              </>)}
            </div>
          )}

          <BottomNav screen={screen} onToday={goToToday} onArchive={loadArchive} onLeaderboard={()=>setScreen('leaderboard')} isAdmin={!!adminUser} onBackoffice={()=>setScreen('backoffice')} onShare={()=>{
            if(!userVote){ setShareNudge(true); setTimeout(()=>setShareNudge(false),2800); }
            else setShowShare(true);
          }}/>
        </div>

        {/* Explainer below center */}
        <div className="vs-explainer">
          <PlatformExplainer compact/>
        </div>

      </div>

      {/* Vote flash */}
      {voteFlash && <VoteFlashOverlay key={`${voteFlash.side}-${Date.now()}`} side={voteFlash.side} label={voteFlash.label} color={voteFlash.color} onDone={()=>setVoteFlash(null)}/>}

      {/* Vote-first nudge toast */}
      {shareNudge && (
        <div style={{ position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)', background:'#1a1a33', border:'1px solid #4fc4b844', borderRadius:12, padding:'12px 20px', fontSize:13, fontWeight:700, color:'#4fc4b8', zIndex:200, whiteSpace:'nowrap', boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
          Pick a side first to share your take! 🗳️
        </div>
      )}
      {/* Share modal */}
      {showShare && debate && userVote && <ShareModal debate={debate} vote={userVote} commentText={userComment?.text??null} pct={userVote==='A'?pctA:100-pctA} streak={streak} onClose={()=>setShowShare(false)}/>}

      {/* Side switch confirmation modal */}
      {switchModal && debate && userVote && (
        <SwitchConfirmModal
          debate={debate}
          previousSide={userVote}
          newSide={userVote==='A'?'B':'A'}
          persuadingComment={switchTarget}
          onConfirm={handleConfirmSwitch}
          onCancel={()=>{setSwitchModal(false);setSwitchTarget(null);}}
          switching={switching}
        />
      )}
    </>
  );
}
