import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase.js';

/* ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
   PickASyde â FIFA World Cup 2026 Bracket Picker  v2.0
ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */

const TOURNAMENT_START = new Date('2026-06-11T14:00:00Z');
const isLocked = () => new Date() >= TOURNAMENT_START;

const FLAGS = {
  'USA':'ðºð¸','Mexico':'ð²ð½','Canada':'ð¨ð¦','Argentina':'ð¦ð·','Brazil':'ð§ð·',
  'Colombia':'ð¨ð´','Uruguay':'ðºð¾','Ecuador':'ðªð¨','Venezuela':'ð»ðª','Peru':'ðµðª',
  'France':'ð«ð·','England':'ð´ó §ó ¢ó ¥ó ®ó §ó ¿','Germany':'ð©ðª','Spain':'ðªð¸','Portugal':'ðµð¹',
  'Netherlands':'ð³ð±','Italy':'ð®ð¹','Belgium':'ð§ðª','Croatia':'ð­ð·','Denmark':'ð©ð°',
  'Switzerland':'ð¨ð­','Austria':'ð¦ð¹','Serbia':'ð·ð¸','Poland':'ðµð±','Turkey':'ð¹ð·',
  'Scotland':'ð´ó §ó ¢ó ³ó £ó ´ó ¿','Ukraine':'ðºð¦','Morocco':'ð²ð¦','Senegal':'ð¸ð³','Nigeria':'ð³ð¬',
  'Egypt':'ðªð¬','Cameroon':'ð¨ð²','South Africa':'ð¿ð¦','Ivory Coast':'ð¨ð®',
  'Algeria':'ð©ð¿','Ghana':'ð¬ð­','Japan':'ð¯ðµ','South Korea':'ð°ð·','Saudi Arabia':'ð¸ð¦',
  'Iran':'ð®ð·','Australia':'ð¦ðº','Qatar':'ð¶ð¦','Iraq':'ð®ð¶','Uzbekistan':'ðºð¿',
  'Honduras':'ð­ð³','Costa Rica':'ð¨ð·','Panama':'ðµð¦','New Zealand':'ð³ð¿',
};
const flag = t => FLAGS[t] || 'ð³';

const WC_GROUPS = [
  { id:'A', teams:['USA','Morocco','New Zealand'] },
  { id:'B', teams:['Mexico','Poland','Algeria'] },
  { id:'C', teams:['Canada','Senegal','Serbia'] },
  { id:'D', teams:['Argentina','Iran','Australia'] },
  { id:'E', teams:['France','Saudi Arabia','South Africa'] },
  { id:'F', teams:['England','Japan','Venezuela'] },
  { id:'G', teams:['Spain','South Korea','Costa Rica'] },
  { id:'H', teams:['Brazil','Croatia','Ghana'] },
  { id:'I', teams:['Germany','Colombia','Ukraine'] },
  { id:'J', teams:['Portugal','Ecuador','Panama'] },
  { id:'K', teams:['Netherlands','Ivory Coast','Qatar'] },
  { id:'L', teams:['Italy','Egypt','Honduras'] },
  { id:'M', teams:['Belgium','Uruguay','Iraq'] },
  { id:'N', teams:['Denmark','Cameroon','Peru'] },
  { id:'O', teams:['Switzerland','Nigeria','Uzbekistan'] },
  { id:'P', teams:['Austria','Turkey','Scotland'] },
];

const R32 = [
  ['r32_1','A1','B2'],['r32_2','B1','A2'],
  ['r32_3','C1','D2'],['r32_4','D1','C2'],
  ['r32_5','E1','F2'],['r32_6','F1','E2'],
  ['r32_7','G1','H2'],['r32_8','H1','G2'],
  ['r32_9','I1','J2'],['r32_10','J1','I2'],
  ['r32_11','K1','L2'],['r32_12','L1','K2'],
  ['r32_13','M1','N2'],['r32_14','N1','M2'],
  ['r32_15','O1','P2'],['r32_16','P1','O2'],
];
const R16 = [
  ['r16_1','r32_1','r32_2'],['r16_2','r32_3','r32_4'],
  ['r16_3','r32_5','r32_6'],['r16_4','r32_7','r32_8'],
  ['r16_5','r32_9','r32_10'],['r16_6','r32_11','r32_12'],
  ['r16_7','r32_13','r32_14'],['r16_8','r32_15','r32_16'],
];
const QF = [
  ['qf_1','r16_1','r16_2'],['qf_2','r16_3','r16_4'],
  ['qf_3','r16_5','r16_6'],['qf_4','r16_7','r16_8'],
];
const SF = [['sf_1','qf_1','qf_2'],['sf_2','qf_3','qf_4']];

const ROUND_LABELS = {r32:'Round of 32',r16:'Round of 16',qf:'Quarterfinals',sf:'Semifinals',final:'Final'};
const POINTS = {group:5,r32:10,r16:20,qf:40,sf:80,final:160,exact_score:320};

function resolveSlot(slot, gp={}, kp={}) {
  if(!slot) return null;
  if(/^[A-P][12]$/.test(slot)) {
    const g=slot[0], rank=parseInt(slot[1])-1;
    return gp[g]?.[rank]??null;
  }
  return kp[slot]??null;
}

function computePoints(entry, results={}) {
  if(!entry) return 0;
  const {groupPicks={},knockoutPicks={}}=entry;
  let pts=0;
  WC_GROUPS.forEach(({id})=>{
    const r=results[`group_${id}`];
    if(!r) return;
    const adv=Array.isArray(r)?r:(r.split?.(',')??[]);
    (groupPicks[id]||[]).forEach(t=>{if(adv.includes(t))pts+=POINTS.group;});
  });
  [...R32,...R16,...QF,...SF,[['final','sf_1','sf_2']]].forEach(p=>{
    const [mid]=Array.isArray(p[0])?p[0]:p;
    const roundKey=mid.replace(/_\d+$/,'');
    const ptVal=POINTS[roundKey]??0;
    const winner=results[mid];
    if(!winner) return;
    if(knockoutPicks[mid]===winner) pts+=ptVal;
  });
  if(results['final_score']&&entry.finalScore){
    const {a:ra,b:rb}=results['final_score'];
    if(entry.finalScore.a===ra&&entry.finalScore.b===rb) pts+=POINTS.exact_score;
  }
  return pts;
}

/* ââ CSS âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,700;0,9..40,900&display=swap');
*,*::before,*::after{box-sizing:border-box;}
body{margin:0;background:#050510;color:#eeeeff;font-family:'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
#root{min-height:100vh;}
button,a{-webkit-tap-highlight-color:transparent;cursor:pointer;}
html{scroll-behavior:smooth;}
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-thumb{background:#1e1e3a;border-radius:3px;}

.wc-app{min-height:100vh;background:#050510;background-image:
  radial-gradient(ellipse 90% 55% at 50% -5%,rgba(0,212,130,0.08) 0%,transparent 65%),
  radial-gradient(ellipse 60% 40% at 95% 60%,rgba(255,215,0,0.04) 0%,transparent 60%),
  linear-gradient(160deg,#060614 0%,#080818 60%,#050510 100%);}

/* Header */
.wc-header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;
  border-bottom:1px solid rgba(255,255,255,0.06);position:sticky;top:0;z-index:100;
  background:rgba(5,5,16,0.94);backdrop-filter:blur(14px);}
.wc-logo{font-size:1.3rem;font-weight:900;letter-spacing:-0.5px;background:linear-gradient(135deg,#00D4AA,#FFD700);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.wc-logo-sub{font-size:0.72rem;font-weight:500;-webkit-text-fill-color:#7788aa;display:block;margin-top:2px;letter-spacing:0.5px;}
.wc-auth-btn{background:rgba(0,212,170,0.1);border:1px solid rgba(0,212,170,0.3);color:#00D4AA;
  padding:7px 16px;border-radius:8px;font-size:0.82rem;font-weight:700;transition:all .2s;}
.wc-auth-btn:hover{background:rgba(0,212,170,0.2);border-color:#00D4AA;}
.wc-user-pill{display:flex;align-items:center;gap:8px;}
.wc-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#00D4AA,#FFD700);
  display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.75rem;color:#050510;}

/* Nav */
.wc-nav{display:flex;gap:2px;padding:10px 14px 0;border-bottom:1px solid rgba(255,255,255,0.06);overflow-x:auto;}
.wc-nav::-webkit-scrollbar{display:none;}
.wc-tab{padding:8px 18px;border-radius:8px 8px 0 0;font-size:0.84rem;font-weight:700;
  border:none;background:transparent;color:#667788;transition:all .2s;white-space:nowrap;}
.wc-tab.active{background:rgba(0,212,170,0.09);color:#00D4AA;border-bottom:2px solid #00D4AA;}
.wc-tab:hover:not(.active){color:#cce;background:rgba(255,255,255,0.04);}

/* Page */
.wc-page{max-width:1200px;margin:0 auto;padding:24px 16px 80px;}

/* Hero */
.wc-hero{text-align:center;padding:32px 16px 20px;}
.wc-trophy{font-size:3rem;margin-bottom:8px;}
.wc-hero-title{font-size:1.8rem;font-weight:900;background:linear-gradient(135deg,#00D4AA,#FFD700);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 8px;}
.wc-hero-sub{font-size:0.88rem;color:#7788aa;margin:0 auto;max-width:520px;line-height:1.6;}
.wc-lock{margin:14px auto;max-width:560px;background:rgba(255,215,0,0.07);border:1px solid rgba(255,215,0,0.2);
  border-radius:10px;padding:10px 16px;font-size:0.8rem;color:#c8aa44;text-align:center;}

/* View toggle */
.view-toggle{display:flex;gap:8px;justify-content:center;margin-bottom:24px;}
.view-btn{padding:8px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);
  background:transparent;color:#667788;font-weight:700;font-size:0.84rem;transition:all .2s;}
.view-btn.active{background:rgba(0,212,170,0.1);border-color:rgba(0,212,170,0.4);color:#00D4AA;}
.view-btn:hover:not(.active){border-color:rgba(255,255,255,0.2);color:#cce;}

/* Section header */
.section-header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;}
.section-title{font-size:0.95rem;font-weight:900;}
.pts-row{display:flex;gap:6px;flex-wrap:wrap;}
.pts-badge{background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.2);
  color:#FFD700;padding:3px 9px;border-radius:20px;font-size:0.7rem;font-weight:800;}

/* Progress */
.prog-bar{height:3px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;margin-bottom:8px;}
.prog-fill{height:100%;background:linear-gradient(90deg,#00D4AA,#FFD700);border-radius:3px;transition:width .5s ease;}
.prog-label{font-size:0.76rem;color:#7788aa;text-align:center;margin-bottom:18px;}

/* Groups */
.groups-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(195px,1fr));gap:10px;margin-bottom:32px;}
.group-card{background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.08);
  border-radius:14px;padding:14px;cursor:pointer;transition:all .2s;user-select:none;}
.group-card:hover{background:rgba(0,212,170,0.07);border-color:rgba(0,212,170,0.25);transform:translateY(-2px);}
.group-card.done{border-color:rgba(0,212,170,0.4);background:rgba(0,212,170,0.05);}
.group-label{font-size:0.68rem;font-weight:900;letter-spacing:1.2px;color:#FFD700;text-transform:uppercase;margin-bottom:10px;}
.group-team{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:0.86rem;font-weight:500;transition:all .15s;}
.group-team.picked{color:#00D4AA;font-weight:800;}
.group-team-adv{margin-left:auto;font-size:0.68rem;color:#00D4AA;font-weight:700;}
.group-footer{margin-top:8px;font-size:0.7rem;color:#556677;}
.group-footer.done{color:#00D4AA;}

/* Bracket */
.bracket-scroll{overflow-x:auto;padding-bottom:20px;margin:0 -4px;}
.bracket-grid{display:flex;min-width:860px;padding:0 4px;}
.bracket-round{display:flex;flex-direction:column;flex:1;min-width:130px;}
.br-label{text-align:center;font-size:0.66rem;font-weight:900;color:#FFD700;letter-spacing:1px;
  text-transform:uppercase;padding:8px 4px 14px;}
.br-slots{display:flex;flex-direction:column;flex:1;justify-content:space-around;padding:0 4px;gap:6px;}
.br-match{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;transition:all .2s;}
.br-match.can-pick{cursor:pointer;}
.bs-match.can-pick:hover{border-color:rgba(0,212,170,0.4);background:rgba(0,212,170,0.07);}
.br-team{display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:0.76rem;font-weight:600;}
.br-team+.br-team{border-top:1px solid rgba(255,255,255,0.05);}
.br-team.tbd{color:#334455;font-style:italic;}
.br-team.correct{color:#00D4AA;}
.br-team.wrong{color:#ff7777;text-decoration:line-through;}
.br-team.my-pick{color:#FFD700;}
.br-pts{margin-left:auto;font-size:0.62rem;color:#FFD700;font-weight:800;}

/* Final champion display */
.champion-display{text-align:center;margin-top:12px;padding:12px;background:rgba(255,215,0,0.06);
  border:1px solid rgba(255,215,0,0.2);border-radius:12px;}
.champion-label{font-size:0.68rem;color:#7788aa;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;}
.champion-name{font-size:1.1rem;font-weight:900;color:#FFD700;}
.champion-score{font-size:0.72rem;color:#557766;margin-top:4px;}

/* Modals */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,10,0.85);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;z-index:200;padding:16px;}
.modal-box{background:#0c0c20;border:1px solid rgba(255,255,255,0.1);border-radius:20px;
  padding:26px;width:100%;max-width:400px;position:relative;animation:fadeIn .25s ease;}
.modal-title{font-size:1.05rem;font-weight:900;margin-bottom:3px;}
.modal-sub{font-size:0.8rem;color:#7788aa;margin-bottom:18px;line-height:1.5;}
.modal-close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.08);
  border:none;color:#aaa;width:28px;height:28px;border-radius:50%;font-size:0.95rem;
  display:flex;align-items:center;justify-content:center;}

/* Pick buttons */
.pick-btn{display:flex;align-items:center;gap:12px;width:100%;padding:13px 15px;
  border:2px solid rgba(255,255,255,0.08);border-radius:12px;background:rgba(255,255,255,0.03);
  color:#eeeeff;font-size:0.92rem;font-weight:600;margin-bottom:8px;transition:all .2s;text-align:left;}
.pick-btn:hover{border-color:rgba(0,212,170,0.35);background:rgba(0,212,170,0.07);}
.pick-btn.sel{border-color:#00D4AA;background:rgba(0,212,170,0.12);color:#00D4AA;}
.pick-btn-flag{font-size:1.35rem;}
.pick-btn-check{margin-left:auto;font-size:0.85rem;}
.pick-rank{margin-left:auto;font-size:0.68rem;color:#00D4AA;font-weight:700;}

/* Save button */
.save-btn{width:100%;margin-top:14px;padding:13px;border-radius:12px;border:none;
  background:linear-gradient(135deg,#00D4AA,#00b89a);color:#050510;font-size:0.92rem;
  font-weight:900;transition:all .2s;}
.save-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,212,170,0.28);}
.save-btn:disabled{opacity:.38;cursor:not-allowed;}

/* Final score */
.score-row{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:14px;}
.score-in{width:56px;text-align:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);
  border-radius:8px;padding:8px 4px;font-size:1.1rem;font-weight:900;color:#eeeeff;}
.score-in:focus{outline:none;border-color:#00D4AA;}

/* Auth */
.auth-in{width:100%;padding:11px 14px;border-radius:10px;background:rgba(255,255,255,0.06);
  border:1px solid rgba(255,255,255,0.12);color:#eeeeff;font-size:0.9rem;margin-bottom:10px;}
.auth-in:focus{outline:none;border-color:#00D4AA;}
.auth-btn-main{width:100%;padding:12px;border-radius:11px;border:none;
  background:linear-gradient(135deg,#00D4AA,#00b89a);color:#050510;font-size:0.92rem;font-weight:900;transition:all .2s;}
.auth-btn-main:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,212,170,0.28);}
.auth-toggle{text-align:center;margin-top:12px;font-size:0.8rem;color:#7788aa;}
.auth-toggle button{background:none;border:none;color:#00D4AA;font-weight:700;}
.auth-err{background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.25);border-radius:8px;
  padding:7px 12px;font-size:0.78rem;color:#ff9999;margin-bottom:10px;}

/* Wagers */
.wager-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:18px;}
.new-wager-btn{background:linear-gradient(135deg,#FFD700,#ffaa00);color:#050510;border:none;
  padding:10px 22px;border-radius:10px;font-weight:900;font-size:0.86rem;transition:all .2s;}
.new-wager-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,215,0,0.3);}
.filter-tabs{display:flex;gap:6px;}
.filter-tab{padding:7px 14px;border-radius:8px;font-size:0.78rem;font-weight:700;
  border:1px solid rgba(255,255,255,0.1);background:transparent;color:#7788aa;transition:all .15s;}
.filter-tab.active{background:rgba(255,215,0,0.1);border-color:rgba(255,215,0,0.3);color:#FFD700;}
.wagers-list{display:flex;flex-direction:column;gap:10px;}
.wager-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
  border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;transition:all .2s;}
.wager-card.open{border-color:rgba(255,215,0,0.18);}
.wager-card.accepted{border-color:rgba(0,212,170,0.2);}
.wager-card.settled{opacity:.6;}
.wager-info{flex:1;min-width:200px;}
.wager-match-lbl{font-size:0.68rem;color:#556677;margin-bottom:3px;}
.wager-matchup{font-size:0.9rem;font-weight:700;}
.wager-backing{font-size:0.76rem;margin-top:4px;color:#7788aa;}
.wager-backing .team{color:#00D4AA;font-weight:700;}
.wager-winner{font-size:0.76rem;color:#88ee88;font-weight:700;margin-top:4px;}
.wager-amt{font-size:1.15rem;font-weight:900;color:#FFD700;white-space:nowrap;}
.wager-amt span{font-size:0.68rem;color:#7788aa;display:block;text-align:center;font-weight:400;}
.status-badge{padding:4px 9px;border-radius:20px;font-size:0.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;}
.status-badge.open{background:rgba(255,215,0,0.12);color:#FFD700;}
.status-badge.accepted{background:rgba(0,212,170,0.12);color:#00D4AA;}
.status-badge.settled{background:rgba(100,220,100,0.12);color:#88ee88;}
.status-badge.cancelled{background:rgba(255,100,100,0.1);color:#ff8888;}
.accept-btn{padding:8px 16px;border-radius:8px;border:1px solid rgba(0,212,170,0.35);
  background:rgba(0,212,170,0.09);color:#00D4AA;font-weight:700;font-size:0.8rem;transition:all .2s;}
.accept-btn:hover{background:rgba(0,212,170,0.18);}
.cancel-btn{padding:8px 16px;border-radius:8px;border:1px solid rgba(255,100,100,0.25);
  background:transparent;color:#ff8888;font-weight:700;font-size:0.8rem;transition:all .2s;}
.cancel-btn:hover{background:rgba(255,100,100,0.07);}

/* Wager create modal */
.wager-select{width:100%;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.1);color:#eeeeff;font-size:0.86rem;margin-bottom:12px;}
.wager-select:focus{outline:none;border-color:#00D4AA;}
.wager-select option{background:#0c0c20;}
.field-label{font-size:0.7rem;color:#7788aa;font-weight:800;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px;}
.amt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:10px;}
.amt-btn{padding:9px 4px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);
  background:rgba(255,255,255,0.04);color:#cce;font-weight:700;font-size:0.86rem;transition:all .15s;}
.amt-btn.active{border-color:#FFD700;background:rgba(255,215,0,0.1);color:#FFD700;}
.amt-btn:hover:not(.active){border-color:rgba(255,215,0,0.25);}
.custom-amt{width:100%;padding:9px 12px;border-radius:9px;background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.1);color:#eeeeff;font-size:0.88rem;margin-bottom:10px;}
.custom-amt:focus{outline:none;border-color:#FFD700;}
.team-pick-row{display:flex;gap:8px;margin-bottom:10px;}
.team-pick-btn{flex:1;padding:11px 6px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);
  background:rgba(255,255,255,0.04);color:#eeeeff;font-weight:700;font-size:0.82rem;transition:all .2s;}
.team-pick-btn.sel{border-color:#FFD700;background:rgba(255,215,0,0.1);color:#FFD700;}
.team-pick-btn:hover:not(.sel){border-color:rgba(255,215,0,0.25);}
.stripe-note{background:rgba(255,215,0,0.05);border:1px solid rgba(255,215,0,0.12);border-radius:9px;
  padding:10px 12px;font-size:0.73rem;color:#aa9944;margin-bottom:12px;line-height:1.5;}
.submit-wager-btn{width:100%;padding:12px;border-radius:11px;border:none;
  background:linear-gradient(135deg,#FFD700,#ffaa00);color:#050510;font-size:0.92rem;font-weight:900;transition:all .2s;}
.submit-wager-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,215,0,0.28);}
.submit-wager-btn:disabled{opacity:.38;cursor:not-allowed;}

/* Leaderboard */
.lb-list{display:flex;flex-direction:column;gap:8px;}
.lb-row{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.04);
  border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:11px 15px;transition:all .2s;}
.lb-row.me{border-color:rgba(0,212,170,0.3);background:rgba(0,212,170,0.05);}
.lb-rank{font-size:0.82rem;font-weight:900;color:#445566;width:24px;text-align:center;}
.lb-rank.top{color:#FFD700;font-size:1rem;}
.lb-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#1a2a4c,#2a1a4c);
  display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.78rem;color:#8899cc;flex-shrink:0;}
.lb-name{flex:1;font-weight:700;font-size:0.88rem;}
.lb-pts{font-size:1.05rem;font-weight:900;color:#FFD700;}
.lb-pts span{font-size:0.62rem;color:#7788aa;font-weight:400;display:block;text-align:right;}

/* Admin */
.admin-section{margin-bottom:28px;}
.admin-title{font-size:0.72rem;font-weight:900;color:#FFD700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;}
.admin-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
  border-radius:12px;padding:13px 15px;margin-bottom:7px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.admin-lbl{flex:1;font-size:0.86rem;font-weight:700;min-width:180px;}
.admin-in{width:46px;text-align:center;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
  border-radius:8px;padding:6px 4px;font-size:0.88rem;font-weight:700;color:#eeeeff;}
.admin-in:focus{outline:none;border-color:#00D4AA;}
.admin-sel{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
  color:#eeeeff;padding:7px 9px;border-radius:8px;font-size:0.8rem;}
.admin-sel:focus{outline:none;border-color:#00D4AA;}
.admin-sel option{background:#0c0c20;}
.admin-save{padding:7px 15px;border-radius:8px;background:rgba(0,212,170,0.12);
  border:1px solid rgba(0,212,170,0.28);color:#00D4AA;font-weight:700;font-size:0.8rem;transition:all .15s;}
.admin-save:hover{background:rgba(0,212,170,0.22);}
.admin-done{font-size:0.72rem;color:#00D4AA;margin-top:3px;}
.group-adv-btn{padding:5px 11px;border-radius:7px;font-size:0.78rem;font-weight:700;transition:all .15s;cursor:pointer;}

/* Empty / toast */
.empty{text-align:center;padding:48px 24px;color:#445566;}
.empty .e{font-size:2.5rem;display:block;margin-bottom:10px;}
.empty p{margin:0;font-size:0.88rem;line-height:1.5;}
.toast{position:fixed;bottom:22px;right:22px;background:#0c1522;border:1px solid rgba(0,212,170,0.3);
  border-radius:12px;padding:11px 17px;font-size:0.84rem;font-weight:600;color:#00D4AA;
  z-index:999;animation:fadeIn .3s ease;box-shadow:0 8px 24px rgba(0,0,0,0.4);}
.toast.err{border-color:rgba(255,100,100,0.3);color:#ff9999;}
.spinner{width:22px;height:22px;border:2px solid rgba(0,212,170,0.2);border-top-color:#00D4AA;
  border-radius:50%;animation:spin .7s linear infinite;margin:40px auto;}
.divider{border:none;border-top:1px solid rgba(255,255,255,0.06);margin:18px 0;}
.pts-explainer{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);
  border-radius:11px;padding:10px 14px;display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-bottom:20px;}
.pts-item{text-align:center;}
.pts-item-val{font-size:0.95rem;font-weight:900;color:#FFD700;}
.pts-item-lbl{font-size:0.62rem;color:#7788aa;text-transform:uppercase;letter-spacing:.5px;}

@keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
@keyframes spin{to{transform:rotate(360deg);}}
.fade-in{animation:fadeIn .35s ease forwards;}

@media(max-width:600px){
  .wc-header{padding:10px 12px;}
  .wc-page{padding:14px 10px 70px;}
  .groups-grid{grid-template-columns:repeat(2,1fr);gap:7px;}
  .wc-hero-title{font-size:1.4rem;}
  .wager-card{gap:10px;}
  .bracket-grid{min-width:720px;}
}
`;

/* ââ DB helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
const db={
  async loadEntry(uid){const{data}=await supabase.from('wc_entries').select('*').eq('user_id',uid).maybeSingle();return data;},
  async saveEntry(uid,entryData,pts){return supabase.from('wc_entries').upsert({user_id:uid,entry_data:entryData,total_points:pts,last_updated:new Date().toISOString()},{onConflict:'user_id'});},
  async loadResults(){const{data}=await supabase.from('wc_results').select('*');const m={};(data||[]).forEach(r=>{if(r.match_id.startsWith('group_'))m[r.match_id]=r.winner?r.winner.split(','):[];else m[r.match_id]=r.winner;if(r.match_id==='final'&&r.score_a!=null)m['final_score']={a:r.score_a,b:r.score_b};});return m;},
  async saveResult(mid,winner,sA,sB){return supabase.from('wc_results').upsert({match_id:mid,winner,score_a:sA??null,score_b:sB??null},{onConflict:'match_id'});},
  async loadWagers(filter,uid){let q=supabase.from('wc_wagers').select('*').order('created_at',{ascending:false});if(filter==='open')q=q.eq('status','open');else if(filter==='mine'&&uid)q=q.or(`creator_id.eq.${uid},taker_id.eq.${uid}`);const{data}=await q;return data||[];},
  async createWager(creatorId,mid,desc,creatorTeam,takerTeam,cents){return supabase.from('wc_wagers').insert({creator_id:creatorId,match_id:mid,match_desc:desc,creator_team:creatorTeam,taker_team:takerTeam,amount_cents:cents,status:'open'}).select().single();},
  async acceptWager(wid,tid){return supabase.from('wc_wagers').update({taker_id:tid,status:'accepted'}).eq('id',wid).eq('status','open').select().single();},
  async cancelWager(wid,uid){return supabase.from('wc_wagers').update({status:'cancelled'}).eq('id',wid).eq('creator_id',uid).eq('status','open');},
  async leaderboard(){const{data}=await supabase.from('wc_entries').select('user_id,total_points').order('total_points',{ascending:false}).limit(100);return data||[];},
  async isAdmin(uid){const{data}=await supabase.from('user_profiles').select('is_admin').eq('id',uid).maybeSingle();return data?.is_admin===true;},
};

function useToast(){
  const[toast,setToast]=useState(null);
  const show=useCallback((msg,type='ok')=>{setToast({msg,type});setTimeout(()=>setToast(null),3200);},[]);
  return{toast,show};
}

/* ââ Auth Modal ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function AuthModal({onClose,onAuth}){
  const[mode,setMode]=useState('login');
  const[email,setEmail]=useState('');
  const[pw,setPw]=useState('');
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState('');
  async function go(e){
    e.preventDefault();setLoading(true);setErr('');
    try{
      if(mode==='login'){const{data,error}=await supabase.auth.signInWithPassword({email,password:pw});if(error)throw error;onAuth(data.user);}
      else{const{data,error}=await supabase.auth.signUp({email,password:pw});if(error)throw error;if(data.user)onAuth(data.user);else setErr('Check your email to confirm.');}
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  }
  return(
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box fade-in">
        <button className="modal-close" onClick={onClose}>â</button>
        <div className="modal-title">{mode==='login'?'Welcome back ð':'Join the bracket ð'}</div>
        <div className="modal-sub">{mode==='login'?'Sign in to pick teams and place wagers.':'Create a free account to enter your bracket.'}</div>
        {err&&<div className="auth-err">{err}</div>}
        <form onSubmit={go}>
          <input className="auth-in" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/>
          <input className="auth-in" type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} required/>
          <button className="auth-btn-main" type="submit" disabled={loading}>{loading?'â¦':mode==='login'?'Sign In':'Create Account'}</button>
        </form>
        <div className="auth-toggle">{mode==='login'?<>No account? <button onClick={()=>setMode('signup')}>Sign up free</button></>:<>Have one? <button onClick={()=>setMode('login')}>Sign in</button></>}</div>
      </div>
    </div>
  );
}

/* ââ Group Pick Modal ââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function GroupPickModal({group,current,onSave,onClose}){
  const[sel,setSel]=useState(current||[]);
  function toggle(t){setSel(p=>p.includes(t)?p.filter(x=>x!==t):p.length>=2?[p[1],t]:[...p,t]);}
  return(
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box fade-in">
        <button className="modal-close" onClick={onClose}>â</button>
        <div className="modal-title">â½ Group {group.id} â Pick 2 to Advance</div>
        <div className="modal-sub">Select the two teams you believe will qualify from this group. <strong style={{color:'#FFD700'}}>+{POINTS.group} pts each</strong>.</div>
        {group.teams.map(t=>(
          <button key={t} className={`pick-btn ${sel.includes(t)?'sel':''}`} onClick={()=>toggle(t)}>
            <span className="pick-btn-flag">{flag(t)}</span>
            <span>{t}</span>
            {sel.indexOf(t)===0&&<span className="pick-rank">1st</span>}
            {sel.indexOf(t)===1&&<span className="pick-rank" style={{color:'#7788aa'}}>2nd</span>}
            {sel.includes(t)&&<span className="pick-btn-check">â</span>}
          </button>
        ))}
        <button className="save-btn" disabled={sel.length<2} onClick={()=>onSave(group.id,sel)}>
          {sel.length<2?`Pick ${2-sel.length} more`:`Save Group ${group.id} â`}
        </button>
      </div>
    </div>
  );
}

/* ââ Knockout Pick Modal âââââââââââââââââââââââââââââââââââââââââââââââââââ */
function KnockoutModal({matchId,tA,tB,round,current,onSave,onClose}){
  const[pick,setPick]=useState(current||null);
  const[sA,setSA]=useState('');
  const[sB,setSB]=useState('');
  const rk=matchId.replace(/_\d+$/,'');
  const ptVal=POINTS[rk]??0;
  const isFinal=matchId==='final';
  const otherTeam=pick===tA?tB:tA;
  return(
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box fade-in">
        <button className="modal-close" onClick={onClose}>â</button>
        <div className="modal-title">{ROUND_LABELS[rk]||round} â Pick the Winner</div>
        <div className="modal-sub">Correct pick earns <strong style={{color:'#FFD700'}}>{ptVal} pts</strong>.</div>
        {[tA,tB].map(t=>(
          <button key={t} className={`pick-btn ${pick===t?'sel':''}`} onClick={()=>setPick(t)}>
            <span className="pick-btn-flag">{flag(t)}</span>
            <span>{t}</span>
            {pick===t&&<span className="pick-btn-check">â</span>}
          </button>
        ))}
        {isFinal&&pick&&(
          <>
            <hr className="divider"/>
            <div style={{fontSize:'0.82rem',fontWeight:700,marginBottom:10,color:'#FFD700'}}>ð¯ Tiebreaker â Predict the final score <span style={{color:'#7788aa',fontWeight:400}}>({POINTS.exact_score} bonus pts)</span></div>
            <div className="score-row">
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'0.68rem',color:'#7788aa',marginBottom:4}}>{flag(pick)} {pick}</div>
                <input className="score-in" type="number" min="0" max="20" placeholder="0" value={sA} onChange={e=>setSA(e.target.value)}/>
              </div>
              <span style={{fontSize:'1.2rem',color:'#334455',fontWeight:700}}>â</span>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'0.68rem',color:'#7788aa',marginBottom:4}}>{flag(otherTeam)} {otherTeam}</div>
                <input className="score-in" type="number" min="0" max="20" placeholder="0" value={sB} onChange={e=>setSB(e.target.value)}/>
              </div>
            </div>
          </>
        )}
        <button className="save-btn" disabled={!pick}
          onClick={()=>onSave(matchId,pick,isFinal&&sA!==''&&sB!==''?{a:parseInt(sA),b:parseInt(sB)}:null)}>
          {pick?`Lock in ${flag(pick)} ${pick}`:'Pick a team to continue'}
        </button>
      </div>
    </div>
  );
}

/* ââ Bracket Match Cell ââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function BrMatch({matchId,s1,s2,gp,kp,results,onPick,round}){
  const t1=resolveSlot(s1,gp,kp);
  const t2=resolveSlot(s2,gp,kp);
  const myPick=kp[matchId];
  const actual=results[matchId];
  const canPick=!isLocked()&&t1&&t2&&!actual;
  const rk=matchId.replace(/_\d+$/,'');
  const ptVal=POINTS[rk]??0;
  function TeamRow({t}){
    if(!t)return <div className="br-team tbd"><span style={{fontSize:'0.72rem'}}>TBD</span></div>;
    const isCorrect=actual&&t===actual;
    const isWrong=actual&&myPick===t&&!isCorrect;
    const isMyPick=!actual&&myPick===t;
    let cls='br-team';
    if(isCorrect)cls+=' correct';
    else if(isWrong)cls+=' wrong';
    else if(isMyPick)cls+=' my-pick';
    return(
      <div className={cls}>
        <span className="br-team-flag" style={{fontSize:'0.85rem'}}>{flag(t)}</span>
        <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t}</span>
        {isCorrect&&<span className="br-pts">â+{ptVal}</span>}
        {isMyPick&&<span className="br-pts">+{ptVal}?</span>}
      </div>
    );
  }
  return(
    <div className={`br-match ${canPick?'can-pick':''}`}
      onClick={()=>canPick&&onPick&&onPick(matchId,t1,t2,round)}
      title={canPick?`Click to pick: ${t1} vs ${t2}`:''}>
      <TeamRow t={t1}/><TeamRow t={t2}/>
    </div>
  );
}

/* ââ Bracket Tab âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function BracketTab({user,entry,onEntryChange,results,showToast}){
  const[groupModal,setGroupModal]=useState(null);
  const[koModal,setKoModal]=useState(null);
  const[view,setView]=useState('groups');
  const gp=entry?.groupPicks||{};
  const kp=entry?.knockoutPicks||{};
  const done=WC_GROUPS.filter(g=>(gp[g.id]||[]).length===2).length;
  const locked=isLocked();

  function saveGroup(gid,teams){
    const ne={...(entry||{}),groupPicks:{...gp,[gid]:teams},knockoutPicks:kp};
    const pts=computePoints(ne,results);
    onEntryChange(ne,pts);
    setGroupModal(null);
    showToast(`Group ${gid} picks saved! â`);
  }

  function saveKO(mid,winner,score){
    const nkp={...kp,[mid]:winner};
    const ne={...(entry||{}),groupPicks:gp,knockoutPicks:nkp};
    if(score)ne.finalScore=score;
    const pts=computePoints(ne,results);
    onEntryChange(ne,pts);
    setKoModal(null);
    showToast(`${flag(winner)} ${winner} locked in!`);
  }

  function handleKO(mid,t1,t2,round){
    if(!user){showToast('Sign in to make picks','err');return;}
    setKoModal({mid,tA:t1,tB:t2,round});
  }

  const mp={gp,kp,results,onPick:handleKO};

  return(
    <div>
      <div className="wc-hero">
        <div className="wc-trophy">ð</div>
        <h1 className="wc-hero-title">FIFA World Cup 2026</h1>
        <p className="wc-hero-sub">Pick which teams advance through every round. Score points for every correct call. The closer you get, the more points you rack up.</p>
        {locked&&<div className="wc-lock">ð Tournament has kicked off â picks are locked. Follow the bracket live!</div>}
      </div>

      <div className="view-toggle">
        {[['groups','â½ Group Stage'],['bracket','ð Knockout Bracket']].map(([v,l])=>(
          <button key={v} className={`view-btn ${view===v?'active':''}`} onClick={()=>setView(v)}>{l}</button>
        ))}
      </div>

      {view==='groups'&&(
        <>
          <div className="section-header">
            <div className="section-title">Group Stage â Pick 2 Teams to Advance</div>
            <span className="pts-badge">+{POINTS.group} pts each</span>
          </div>
          {!locked&&(
            <>
              <div className="prog-bar"><div className="prog-fill" style={{width:`${Math.round((done/16)*100)}%`}}/></div>
              <div className="prog-label">{done}/16 groups complete {!user&&'â sign in to save picks'}</div>
            </>
          )}
          <div className="groups-grid">
            {WC_GROUPS.map(g=>{
              const picks=gp[g.id]||[];
              const complete=picks.length===2;
              return(
                <div key={g.id} className={`group-card ${complete?'done':''}`}
                  onClick={()=>{if(!user){showToast('Sign in to pick','err');return;}if(locked)return;setGroupModal(g);}}>
                  <div className="group-label">Group {g.id}</div>
                  {g.teams.map(t=>(
                    <div key={t} className={`group-team ${picks.includes(t)?'picked':''}`}>
                      <span>{flag(t)}</span><span style={{flex:1}}>{t}</span>
                      {picks.includes(t)&&<span className="group-team-adv">{picks.indexOf(t)===0?'1st':'2nd'}</span>}
                    </div>
                  ))}
                  <div className={`group-footer ${complete?'done':''}`}>
                    {complete?`â ${picks[0]} & ${picks[1]}`:locked?'â':'Click to pick 2'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {view==='bracket'&&(
        <>
          <div className="pts-explainer">
            {[['R32',POINTS.r32],['R16',POINTS.r16],['QF',POINTS.qf],['SF',POINTS.sf],['Final',POINTS.final],['Exact Score',POINTS.exact_score]].map(([l,v])=>(
              <div className="pts-item" key={l}><div className="pts-item-val">+{v}</div><div className="pts-item-lbl">{l}</div></div>
            ))}
          </div>
          {!user&&<div className="empty fade-in"><span className="e">ð</span><p>Sign in to make your bracket picks and appear on the leaderboard.</p></div>}
          <div className="bracket-scroll">
            <div className="bracket-grid">
              <div className="bracket-round">
                <div className="br-label">Round of 32</div>
                <div className="br-slots">{R32.map(([mid,s1,s2])=><BrMatch key={mid} matchId={mid} s1={s1} s2={s2} round="r32" {...mp}/>)}</div>
              </div>
              <div className="bracket-round">
                <div className="br-label">Round of 16</div>
                <div className="br-slots">{R16.map(([mid,s1,s2])=><BrMatch key={mid} matchId={mid} s1={s1} s2={s2} round="r16" {...mp}/>)}</div>
              </div>
              <div className="bracket-round">
                <div className="br-label">Quarterfinals</div>
                <div className="br-slots">{QF.map(([mid,s1,s2])=><BrMatch key={mid} matchId={mid} s1={s1} s2={s2} round="qf" {...mp}/>)}</div>
              </div>
              <div className="bracket-round">
                <div className="br-label">Semifinals</div>
                <div className="br-slots">{SF.map(([mid,s1,s2])=><BrMatch key={mid} matchId={mid} s1={s1} s2={s2} round="sf" {...mp}/>)}</div>
              </div>
              <div className="bracket-round">
                <div className="br-label" style={{color:'#FFD700'}}>ð Final</div>
                <div className="br-slots" style={{justifyContent:'center'}}>
                  <BrMatch matchId="final" s1="sf_1" s2="sf_2" round="final" {...mp}/>
                  {kp['final']&&(
                    <div className="champion-display">
                      <div className="champion-label">Your Champion</div>
                      <div className="champion-name">{flag(kp['final'])} {kp['final']}</div>
                      {entry?.finalScore&&<div className="champion-score">Score pick: {entry.finalScore.a}â{entry.finalScore.b}</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {groupModal&&<GroupPickModal group={groupModal} current={gp[groupModal.id]} onSave={saveGroup} onClose={()=>setGroupModal(null)}/>}
      {koModal&&<KnockoutModal matchId={koModal.mid} tA={koModal.tA} tB={koModal.tB} round={koModal.round} current={kp[koModal.mid]} onSave={saveKO} onClose={()=>setKoModal(null)}/>}
    </div>
  );
}

/* ââ Wager Create Modal ââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function WagerCreateModal({user,entry,onClose,onDone}){
  const gp=entry?.groupPicks||{};
  const kp=entry?.knockoutPicks||{};
  const matchups=[];
  [...R32,...R16,...QF,...SF,[['final','sf_1','sf_2']]].forEach(p=>{
    const[mid,s1,s2]=Array.isArray(p[0])?p[0]:p;
    const t1=resolveSlot(s1,gp,kp),t2=resolveSlot(s2,gp,kp);
    if(t1&&t2){
      const rk=mid.replace(/_\d+$/,'');
      const label=`${ROUND_LABELS[rk]||rk}: ${flag(t1)} ${t1} vs ${flag(t2)} ${t2}`;
      matchups.push({mid,label,t1,t2});
    }
  });
  const[selMatch,setSelMatch]=useState(matchups[0]?.mid||'');
  const[selTeam,setSelTeam]=useState('');
  const[amt,setAmt]=useState(5);
  const[custom,setCustom]=useState('');
  const[loading,setLoading]=useState(false);
  const cur=matchups.find(m=>m.mid===selMatch);
  const finalAmt=custom?parseFloat(custom):amt;
  async function submit(){
    if(!cur||!selTeam||!finalAmt)return;
    setLoading(true);
    const other=selTeam===cur.t1?cur.t2:cur.t1;
    const{error}=await db.createWager(user.id,selMatch,cur.label,selTeam,other,Math.round(finalAmt*100));
    setLoading(false);
    if(error){alert(error.message);return;}
    onDone();onClose();
  }
  return(
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box fade-in" style={{maxWidth:430}}>
        <button className="modal-close" onClick={onClose}>â</button>
        <div className="modal-title">ð° Create a Side Wager</div>
        <div className="modal-sub">Back your team in a specific matchup. Other users can accept by taking the other side.</div>
        {matchups.length===0
          ?<p style={{color:'#7788aa',fontSize:'0.85rem'}}>Finish your group stage picks first so bracket matchups are populated.</p>
          :<>
            <div className="field-label">Select Match</div>
            <select className="wager-select" value={selMatch} onChange={e=>{setSelMatch(e.target.value);setSelTeam('');}}>
              {matchups.map(m=><option key={m.mid} value={m.mid}>{m.label}</option>)}
            </select>
            {cur&&<>
              <div className="field-label">I Back This Team to Win</div>
              <div className="team-pick-row">
                <button className={`team-pick-btn ${selTeam===cur.t1?'sel':''}`} onClick={()=>setSelTeam(cur.t1)}>{flag(cur.t1)} {cur.t1}</button>
                <button className={`team-pick-btn ${selTeam===cur.t2?'sel':''}`} onClick={()=>setSelTeam(cur.t2)}>{flag(cur.t2)} {cur.t2}</button>
              </div>
              <div className="field-label">Wager Amount</div>
              <div className="amt-grid">
                {[1,5,10,20].map(a=><button key={a} className={`amt-btn ${amt===a&&!custom?'active':''}`} onClick={()=>{setAmt(a);setCustom('');}}>${a}</button>)}
              </div>
              <input className="custom-amt" type="number" min="0.50" step="0.50" placeholder="Custom amount (e.g. 25)" value={custom} onChange={e=>{setCustom(e.target.value);setAmt(0);}}/>
              <div className="stripe-note">
                ð³ <strong>Payment:</strong> Wager amounts are tracked in-app. For automated escrow (funds held until match result), connect Stripe in Admin settings. Until then, wagers use the honor system â settle directly with your opponent via Venmo, Cash App, etc.
              </div>
              <button className="submit-wager-btn" disabled={!selTeam||!finalAmt||loading} onClick={submit}>
                {loading?'â¦':`Post Wager â ${selTeam?`${flag(selTeam)} ${selTeam} wins`:'Pick a team'} for $${finalAmt||'0'}`}
              </button>
            </>}
          </>
        }
      </div>
    </div>
  );
}

/* ââ Wagers Tab ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function WagersTab({user,entry,showToast}){
  const[wagers,setWagers]=useState([]);
  const[filter,setFilter]=useState('open');
  const[loading,setLoading]=useState(true);
  const[showCreate,setShowCreate]=useState(false);
  const fmt=c=>`$${(c/100).toFixed(2)}`;
  async function load(){setLoading(true);setWagers(await db.loadWagers(filter,user?.id));setLoading(false);}
  useEffect(()=>{load();},[filter,user]);
  async function accept(w){
    if(!user){showToast('Sign in to accept wagers','err');return;}
    if(w.creator_id===user.id){showToast("Can't accept your own wager",'err');return;}
    const{error}=await db.acceptWager(w.id,user.id);
    if(error){showToast(error.message,'err');return;}
    showToast(`Wager accepted! You're backing ${flag(w.taker_team)} ${w.taker_team} ð¤`);
    load();
  }
  async function cancel(w){
    await db.cancelWager(w.id,user.id);
    showToast('Wager cancelled.');load();
  }
  return(
    <div>
      <div className="wc-hero" style={{paddingBottom:8}}>
        <div style={{fontSize:'2rem',marginBottom:4}}>ð°</div>
        <h1 className="wc-hero-title" style={{fontSize:'1.5rem'}}>Side Wagers</h1>
        <p className="wc-hero-sub">Back your team in any matchup. Set a dollar amount, post it â another user takes the other side. Winner takes all. Funds settle automatically when match results are entered.</p>
      </div>
      <div className="wager-top">
        <div className="filter-tabs">
          {[['open','ð Open'],['mine','ð My Wagers']].map(([k,l])=>(
            <button key={k} className={`filter-tab ${filter===k?'active':''}`} onClick={()=>setFilter(k)}>{l}</button>
          ))}
        </div>
        {user&&<button className="new-wager-btn" onClick={()=>setShowCreate(true)}>+ New Wager</button>}
      </div>
      {loading?<div className="spinner"/>:wagers.length===0
        ?<div className="empty"><span className="e">{filter==='open'?'ð¯':'ð'}</span><p>{filter==='open'?'No open wagers yet. Be the first to post one!':'No wagers created or accepted yet.'}</p></div>
        :<div className="wagers-list">
          {wagers.map(w=>{
            const isCreator=user?.id===w.creator_id;
            const isTaker=user?.id===w.taker_id;
            return(
              <div key={w.id} className={`wager-card ${w.status} fade-in`}>
                <div className="wager-info">
                  <div className="wager-match-lbl">{w.match_desc}</div>
                  <div className="wager-matchup">{flag(w.creator_team)} {w.creator_team} vs {flag(w.taker_team)} {w.taker_team}</div>
                  <div className="wager-backing">
                    {isCreator?<><span>You</span> back <span className="team">{flag(w.creator_team)} {w.creator_team}</span></>
                    :<><span>User</span> backs <span className="team">{flag(w.creator_team)} {w.creator_team}</span></>}
                    {w.taker_id&&<span> Â· accepted {isTaker?'by you':'by user'}</span>}
                  </div>
                  {w.winner_team&&<div className="wager-winner">ð Winner: {flag(w.winner_team)} {w.winner_team}</div>}
                </div>
                <div className="wager-amt">{fmt(w.amount_cents)}<span>wager</span></div>
                <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
                  <span className={`status-badge ${w.status}`}>{w.status}</span>
                  {w.status==='open'&&!isCreator&&user&&<button className="accept-btn" onClick={()=>accept(w)}>Accept â {flag(w.taker_team)} {w.taker_team}</button>}
                  {w.status==='open'&&isCreator&&<button className="cancel-btn" onClick={()=>cancel(w)}>Cancel</button>}
                </div>
              </div>
            );
          })}
        </div>
      }
      {!user&&<div className="empty" style={{marginTop:24}}><span className="e">ð</span><p>Sign in to create and accept wagers.</p></div>}
      {showCreate&&<WagerCreateModal user={user} entry={entry} onClose={()=>setShowCreate(false)} onDone={()=>{load();showToast('Wager posted! ð¯');}}/>}
    </div>
  );
}

/* ââ Leaderboard Tab âââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function LeaderboardTab({user}){
  const[rows,setRows]=useState([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{setLoading(true);setRows(await db.leaderboard());setLoading(false);})();},[]);
  const rk=i=>i===0?'ð¥':i===1?'ð¥':i===2?'ð¥':i+1;
  const initials=id=>id?.slice(0,2).toUpperCase()||'?';
  return(
    <div>
      <div className="wc-hero" style={{paddingBottom:12}}>
        <div style={{fontSize:'2rem',marginBottom:4}}>ð</div>
        <h1 className="wc-hero-title" style={{fontSize:'1.5rem'}}>Leaderboard</h1>
        <p className="wc-hero-sub">Points awarded as real match results come in. The more you get right â and the deeper the round â the more you score.</p>
      </div>
      <div className="pts-explainer">
        {[['Group',POINTS.group],['R32',POINTS.r32],['R16',POINTS.r16],['QF',POINTS.qf],['SF',POINTS.sf],['Final',POINTS.final],['Exact Score',POINTS.exact_score]].map(([l,v])=>(
          <div className="pts-item" key={l}><div className="pts-item-val">+{v}</div><div className="pts-item-lbl">{l}</div></div>
        ))}
      </div>
      {loading?<div className="spinner"/>:rows.length===0
        ?<div className="empty"><span className="e">ð</span><p>No entries yet â be the first to submit your bracket!</p></div>
        :<div className="lb-list">
          {rows.map((r,i)=>{
            const isMe=user?.id===r.user_id;
            return(
              <div key={r.user_id} className={`lb-row ${isMe?'me':''} fade-in`}>
                <div className={`lb-rank ${i<3?'top':''}`}>{rk(i)}</div>
                <div className="lb-av">{initials(r.user_id)}</div>
                <div className="lb-name">Player {r.user_id.slice(0,8)}{isMe&&<span style={{color:'#00D4AA',marginLeft:6,fontSize:'0.7rem'}}>(you)</span>}</div>
                <div className="lb-pts">{r.total_points||0}<span>pts</span></div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

/* ââ Admin Tab âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
function AdminTab({results,onRefresh,showToast,entry}){
  const gp=entry?.groupPicks||{};
  const kp=entry?.knockoutPicks||{};
  const[saving,setSaving]=useState({});

  async function saveGroup(gid,advancers){
    setSaving(s=>({...s,[`g_${gid}`]:true}));
    await db.saveResult(`group_${gid}`,advancers.join(','),null,null);
    setSaving(s=>({...s,[`g_${gid}`]:false}));
    onRefresh();showToast(`Group ${gid} results saved!`);
  }

  function KoRow({matchId,s1,s2}){
    const t1=resolveSlot(s1,gp,kp),t2=resolveSlot(s2,gp,kp);
    const existing=results[matchId];
    const[winner,setWinner]=useState(existing||'');
    const[sA,setSA]=useState('');
    const[sB,setSB]=useState('');
    if(!t1||!t2)return null;
    const isFinal=matchId==='final';
    async function save(){
      setSaving(s=>({...s,[matchId]:true}));
      await db.saveResult(matchId,winner,sA!==''?parseInt(sA):null,sB!==''?parseInt(sB):null);
      if(winner){await supabase.from('wc_wagers').update({winner_team:winner,status:'settled'}).eq('match_id',matchId).in('status',['open','accepted']);}
      setSaving(s=>({...s,[matchId]:false}));
      onRefresh();showToast(`${matchId} result saved & wagers settled!`);
    }
    return(
      <div className="admin-card">
        <div className="admin-lbl">{flag(t1)} {t1} vs {flag(t2)} {t2} <span style={{color:'#334455',fontWeight:400,fontSize:'0.74rem'}}>({matchId})</span></div>
        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
          {isFinal&&<><input className="admin-in" type="number" min="0" placeholder="0" value={sA} onChange={e=>setSA(e.target.value)}/><span style={{color:'#334455'}}>â</span><input className="admin-in" type="number" min="0" placeholder="0" value={sB} onChange={e=>setSB(e.target.value)}/></>}
          <select className="admin-sel" value={winner} onChange={e=>setWinner(e.target.value)}>
            <option value="">â Winner â</option>
            <option value={t1}>{flag(t1)} {t1}</option>
            <option value={t2}>{flag(t2)} {t2}</option>
          </select>
          <button className="admin-save" disabled={!winner||!!saving[matchId]} onClick={save}>{saving[matchId]?'â¦':existing?'Update':'Save'}</button>
        </div>
        {existing&&<div className="admin-done">â {flag(existing)} {existing}</div>}
      </div>
    );
  }

  return(
    <div>
      <h2 style={{fontSize:'1.15rem',fontWeight:900,margin:'0 0 4px',color:'#FFD700'}}>âï¸ Admin Panel</h2>
      <p style={{fontSize:'0.8rem',color:'#7788aa',margin:'0 0 24px'}}>Enter match results to award bracket points and automatically settle all wagers for that match.</p>
      <div className="admin-section">
        <div className="admin-title">Group Stage â Select Advancers</div>
        {WC_GROUPS.map(g=>{
          const adv=Array.isArray(results[`group_${g.id}`])?results[`group_${g.id}`]:[];
          return(
            <div key={g.id} className="admin-card">
              <div className="admin-lbl">Group {g.id}</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {g.teams.map(t=>{
                  const isAdv=adv.includes(t);
                  return(
                    <button key={t} className="group-adv-btn"
                      style={{border:`1px solid ${isAdv?'#00D4AA':'rgba(255,255,255,0.1)'}`,background:isAdv?'rgba(0,212,170,0.1)':'transparent',color:isAdv?'#00D4AA':'#cce'}}
                      onClick={()=>{
                        let next=adv.includes(t)?adv.filter(x=>x!==t):adv.length<2?[...adv,t]:[adv[1],t];
                        saveGroup(g.id,next);
                      }}>{flag(t)} {t}</button>
                  );
                })}
              </div>
              {adv.length>0&&<div className="admin-done">â Advancing: {adv.join(', ')}</div>}
            </div>
          );
        })}
      </div>
      {[['Round of 32',R32],['Round of 16',R16],['Quarterfinals',QF],['Semifinals',SF]].map(([lbl,rounds])=>(
        <div key={lbl} className="admin-section">
          <div className="admin-title">{lbl}</div>
          {rounds.map(([mid,s1,s2])=><KoRow key={mid} matchId={mid} s1={s1} s2={s2}/>)}
        </div>
      ))}
      <div className="admin-section">
        <div className="admin-title">ð Final</div>
        <KoRow matchId="final" s1="sf_1" s2="sf_2"/>
      </div>
    </div>
  );
}

/* ââ Main App âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
export default function App(){
  const[user,setUser]=useState(null);
  const[admin,setAdmin]=useState(false);
  const[tab,setTab]=useState('bracket');
  const[showAuth,setShowAuth]=useState(false);
  const[entry,setEntry]=useState(null);
  const[results,setResults]=useState({});
  const{toast,show}=useToast();

  useEffect(()=>{
    const el=document.createElement('style');
    el.textContent=CSS;
    document.head.appendChild(el);
    return()=>el.remove();
  },[]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{if(session?.user)init(session.user);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      if(session?.user)init(session.user);
      else{setUser(null);setAdmin(false);setEntry(null);}
    });
    return()=>subscription.unsubscribe();
  },[]);

  async function init(u){
    setUser(u);
    const[ent,isAdm]=await Promise.all([db.loadEntry(u.id),db.isAdmin(u.id)]);
    setAdmin(isAdm);
    if(ent?.entry_data)setEntry(ent.entry_data);
  }

  async function loadResults(){setResults(await db.loadResults());}
  useEffect(()=>{loadResults();},[]);

  async function handleEntryChange(ne,pts){
    setEntry(ne);
    if(!user)return;
    const{error}=await db.saveEntry(user.id,ne,pts);
    if(error)show(error.message,'err');
  }

  const tabs=[
    {id:'bracket',label:'â½ Bracket'},
    {id:'wagers',label:'ð° Wagers'},
    {id:'leaderboard',label:'ð Leaderboard'},
    ...(admin?[{id:'admin',label:'âï¸ Admin'}]:[]),
  ];

  return(
    <div className="wc-app">
      <header className="wc-header">
        <div>
          <div className="wc-logo">PickASyde</div>
          <span className="wc-logo-sub">FIFA World Cup 2026</span>
        </div>
        {user
          ?<div className="wc-user-pill">
              <div className="wc-avatar">{user.email?.[0]?.toUpperCase()}</div>
              <button className="wc-auth-btn" onClick={()=>supabase.auth.signOut()}>Sign Out</button>
            </div>
          :<button className="wc-auth-btn" onClick={()=>setShowAuth(true)}>Sign In / Join</button>
        }
      </header>
      <nav className="wc-nav">
        {tabs.map(t=>(
          <button key={t.id} className={`wc-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <main className="wc-page">
        {tab==='bracket'&&<BracketTab user={user} entry={entry} onEntryChange={handleEntryChange} results={results} showToast={show}/>}
        {tab==='wagers'&&<WagersTab user={user} entry={entry} showToast={show}/>}
        {tab==='leaderboard'&&<LeaderboardTab user={user}/>}
        {tab==='admin'&&admin&&<AdminTab results={results} onRefresh={loadResults} showToast={show} entry={entry}/>}
      </main>
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onAuth={u=>{setShowAuth(false);init(u);}}/>}
      {toast&&<div className={`toast ${toast.type==='err'?'err':''}`}>{toast.msg}</div>}
    </div>
  );
}
