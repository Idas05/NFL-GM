(function () {
'use strict';
const G = window.GM;
const app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(1) + 'M';
const ovrCls = o => o >= 90 ? 'o90' : o >= 80 ? 'o80' : o >= 70 ? 'o70' : o >= 60 ? 'o60' : 'o0';
const ovr = o => `<span class="ovr ${ovrCls(o)}">${o}</span>`;
const ht = h => `${Math.floor(h / 12)}'${h % 12}"`;
const rec = T => `${T.w}-${T.l}${T.t ? '-' + T.t : ''}`;
const ui = { tab: 'home', posF: 'ALL', sort: {}, view: null, modal: null, toast: null, mode: 'now', faPos: 'ALL', proPos: 'ALL', proFilter: 'all', leagueTeam: null, schedWeek: null, watch: {} };
let S = null;

function toast(msg) { ui.toast = msg; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; render(); }, 3200); }
function commit() { G.save(); render(); }
function setTheme() { const T = S && S.teams[S.userTeam]; if (T) { document.documentElement.style.setProperty('--team', T.c1); document.documentElement.style.setProperty('--team2', T.c2); } }

// --------- sortable table helper ---------
function table(id, cols, rows, opts = {}) {
  const st = ui.sort[id] || opts.sort || {};
  if (st.k) {
    const c = cols.find(c => c.k === st.k);
    if (c) rows = rows.slice().sort((a, b) => { const x = c.v(a), y = c.v(b); return (x < y ? -1 : x > y ? 1 : 0) * (st.d || 1); });
  }
  const head = cols.map(c => `<th data-sort="${id}|${c.k}" class="${c.num ? 'num' : ''}">${esc(c.t)}${st.k === c.k ? (st.d === 1 ? ' ▲' : ' ▼') : ''}</th>`).join('');
  const body = rows.slice(0, opts.limit || 9999).map(r => `<tr class="${opts.rowCls ? opts.rowCls(r) : ''}" ${opts.rowAttr ? opts.rowAttr(r) : ''}>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.h ? c.h(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('');
  return `<div class="scroll"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Nothing here.</td></tr>`}</tbody></table></div>`;
}
const posSeg = (key, extra = []) => `<div class="seg">${['ALL', ...G.POS, ...extra].map(p => `<button class="${ui[key] === p ? 'on' : ''}" data-act="seg" data-key="${key}" data-val="${p}">${p}</button>`).join('')}</div>`;

// --------- start screen ---------
function startScreen() {
  const has = (() => { try { return !!localStorage.getItem('gridiron_gm_save_v1'); } catch (e) { return false; } })();
  const D = window.NFL_DATA;
  // quick team ratings from data without starting a game
  const tmpS = G.state(); const temp = G.newGame('CHI', ui.mode); const R = {}; for (const t of window.TEAMS) R[t.abbr] = { r: G.teamRatings(t.abbr), T: temp.teams[t.abbr] };
  G.setState(tmpS);
  const groups = {};
  for (const t of window.TEAMS) (groups[`${t.conf} ${t.div}`] = groups[`${t.conf} ${t.div}`] || []).push(t);
  return `<div class="wrap"><div class="hero">
    <div class="muted cond" style="font-size:16px;letter-spacing:.12em;text-transform:uppercase">Front office sim · ${D.meta.cap ? 'Cap $' + D.meta.cap + 'M' : ''}</div>
    <h1>Gridiron GM</h1>
    <p class="muted" style="max-width:640px">Take over an NFL franchise as head coach and general manager. Hire scouts, run the draft, battle for free agents under the salary cap, and play your season one game at a time. Rosters are the real 2026 rosters as of Week ${D.meta.roster_week}.</p>
    ${has ? `<div class="row" style="margin:14px 0"><button class="primary big" data-act="continue">Continue saved game</button><span class="muted">or start a new one below (this replaces your save)</span></div>` : ''}
    <div class="card" style="margin:14px 0">
      <h3>How do you want to start?</h3>
      <div class="row">
        <div class="seg"><button class="${ui.mode === 'now' ? 'on' : ''}" data-act="mode" data-val="now">Take over now (Week ${D.meta.played_through + 0}, real records)</button><button class="${ui.mode === 'fresh' ? 'on' : ''}" data-act="mode" data-val="fresh">Replay 2026 from Week 1</button></div>
      </div>
      <p class="muted" style="margin:8px 0 0">${ui.mode === 'now' ? `Real results through Week ${D.meta.played_through} are kept. You coach the rest of the season, then head into the offseason.` : 'Every team starts 0-0 with the real 2026 schedule.'}</p>
    </div>
    <h2 style="margin:22px 0 10px">Pick your team</h2>
    ${Object.entries(groups).map(([g, L]) => `<h3 class="muted" style="margin:14px 0 8px">${g}</h3><div class="teamgrid">${L.map(t => `
      <button class="teambtn" data-act="pickteam" data-team="${t.abbr}"><span class="sw" style="background:linear-gradient(${t.c1} 65%,${t.c2} 65%)"></span>
      <span style="flex:1"><b>${esc(t.city)} ${esc(t.nick)}</b><br><span class="muted">${ui.mode === 'now' ? rec(R[t.abbr].T) + ' · ' : ''}OFF ${R[t.abbr].r.off} · DEF ${R[t.abbr].r.def}</span></span>${ovr(R[t.abbr].r.ovr)}</button>`).join('')}</div>`).join('')}
    <div class="foot">Roster, snap and stat data: nflverse (rosters_weekly_2026, snap_counts, stats_player, schedules). Ratings and contracts are this game's own estimates, not official figures. The 2027 draft class's top prospects are real college players from public big boards (Athlon Sports, NFL Draft Countdown); later rounds and future classes are generated. Not affiliated with the NFL or any game publisher.</div>
  </div></div>`;
}

// --------- shell ---------
const TABS = [['home', 'Home'], ['roster', 'Roster'], ['scouting', 'Scouting'], ['draft', 'Draft'], ['fa', 'Free agency'], ['resign', 'Re-sign'], ['standings', 'Standings'], ['schedule', 'Schedule'], ['league', 'League'], ['news', 'News'], ['settings', 'Save']];
function shell(inner) {
  const T = S.teams[S.userTeam]; const r = G.teamRatings(S.userTeam);
  const tabs = TABS.filter(([k]) => (k !== 'resign' || S.phase === 'resign') && (k !== 'draft' || ['draft', 'preseason'].includes(S.phase) || S.draft));
  return `<header class="top"><div class="wrap">
    <div class="topbar">
      <div class="teamtag"><span class="swatch"></span><div><div class="brand">${esc(T.city)} ${esc(T.nick)}</div><div class="muted" style="font-size:12px">${S.season} · ${esc(G.phaseLabel())}</div></div></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Record</div><div class="v">${rec(T)}</div></div>
        <div class="kpi"><div class="l">Team OVR</div><div class="v">${r.ovr} <span class="muted" style="font-size:13px">O${r.off}/D${r.def}</span></div></div>
        <div class="kpi"><div class="l">Cap space ${G.capYear()}</div><div class="v ${G.capSpace(S.userTeam) < 0 ? 'bad' : ''}">${money(G.capSpace(S.userTeam))}</div></div>
        <div class="kpi"><div class="l">Roster</div><div class="v ${S.phase === 'preseason' && G.roster(S.userTeam).length > G.ROSTER_MAX ? 'warn' : ''}">${G.roster(S.userTeam).length}${S.phase === 'preseason' ? '/' + G.ROSTER_MAX : ''}</div></div>
      </div>
    </div>
    <nav class="tabs">${tabs.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
  </div></header>
  <main><div class="wrap">${inner}</div></main>`;
}

// --------- home ---------
function teamLabel(a) { const t = S.teams[a]; return `<span title="${esc(t.city + ' ' + t.nick)}">${esc(t.abbr)}</span>`; }
function boxscore(g) {
  if (!g || g.as == null) return '';
  const T = a => S.teams[a];
  const side = (a, box) => `<div><b>${esc(T(a).nick)}</b>${(box || []).map(b => `<div style="font-size:13px"><span class="muted">${b.pos}</span> <a href="#" data-act="player" data-id="${b.id}">${esc(b.name)}</a> · ${esc(b.line)}</div>`).join('')}</div>`;
  return `<div class="scoreboard" style="margin:6px 0 12px">
    <div><div class="tm">${esc(T(g.a).nick)}</div><div class="muted">${rec(T(g.a))}</div></div>
    <div><span class="sc ${g.as > g.hs ? '' : 'muted'}">${g.as}</span> <span class="vs">–</span> <span class="sc ${g.hs > g.as ? '' : 'muted'}">${g.hs}</span>${g.ot ? '<div class="muted">OT</div>' : '<div class="muted">Final</div>'}</div>
    <div><div class="tm">${esc(T(g.h).nick)}</div><div class="muted">${rec(T(g.h))}</div></div></div>
    ${g.box ? `<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${side(g.a, g.box.a)}${side(g.h, g.box.h)}</div>` : ''}`;
}
function gamePlan() {
  const opt = (k, v, l) => `<button class="${S.plan[k] === v ? 'on' : ''}" data-act="plan" data-k="${k}" data-v="${v}">${l}</button>`;
  return `<div class="row" style="margin-top:10px"><span class="muted" style="width:70px">Offense</span><div class="seg">${opt('off', 'run', 'Run heavy')}${opt('off', 'balanced', 'Balanced')}${opt('off', 'pass', 'Air it out')}</div></div>
  <div class="row" style="margin-top:6px"><span class="muted" style="width:70px">Defense</span><div class="seg">${opt('def', 'contain', 'Contain')}${opt('def', 'balanced', 'Balanced')}${opt('def', 'blitz', 'Blitz')}</div></div>
  <p class="muted" style="font-size:12px;margin:6px 0 0">Run heavy pays off when your RB and line beat their front; Air it out when your QB and receivers beat their secondary. Blitzing is high-variance and works against weak pass protection.</p>`;
}
function phaseCard() {
  const T = S.teams[S.userTeam];
  if (S.phase === 'regular') {
    const g = G.userGameThisWeek();
    if (!g) return `<div class="card"><h3>Week ${S.week}: bye week</h3><p class="muted">Your team is off this week. The rest of the league plays, and your scouts keep working.</p><button class="primary big" data-act="playweek">Continue to Week ${S.week + 1}</button></div>`;
    const home = g.h === S.userTeam; const opp = home ? g.a : g.h; const O = S.teams[opp];
    const rO = G.teamRatings(opp), rU = G.teamRatings(S.userTeam);
    const wp = G.winProb(g); const myWp = home ? wp : 1 - wp;
    return `<div class="card"><div class="row"><h3>Week ${S.week}: ${home ? 'vs' : '@'} ${esc(O.city)} ${esc(O.nick)}</h3><span class="sp"></span><span class="chip">${rec(O)}</span></div>
      <div class="grid g3" style="margin:8px 0">
        <div><div class="muted" style="font-size:12px">Your offense vs their defense</div><b>${rU.off}</b> vs <b>${rO.def}</b></div>
        <div><div class="muted" style="font-size:12px">Your defense vs their offense</div><b>${rU.def}</b> vs <b>${rO.off}</b></div>
        <div><div class="muted" style="font-size:12px">Projected win chance</div><b>${Math.round(myWp * 100)}%</b><div class="bar"><i style="width:${Math.round(myWp * 100)}%"></i></div></div>
      </div>
      ${gamePlan()}
      <div class="row" style="margin-top:14px"><button class="primary big" data-act="playweek">Play Week ${S.week} game</button><span class="muted">Only this week is played. Nothing simulates ahead.</span></div></div>`;
  }
  if (S.phase === 'playoffs') {
    const P = S.playoffs;
    if (P.champ) return `<div class="card"><h3>${esc(G.tname(P.champ))} are champions</h3><p class="muted">${P.champ === S.userTeam ? 'You won it all. Time to defend the title.' : 'The season is over.'} Next up: re-sign your players, then free agency and the draft.</p><button class="primary big" data-act="offseason">Begin the offseason</button></div>`;
    const alive = G.userInPlayoffs();
    const mine = P.games.find(g => g.round === P.round && g.as == null && (g.a === S.userTeam || g.h === S.userTeam));
    return `<div class="card"><h3>Playoffs · ${G.ROUNDS[P.round]} round</h3>
      ${mine ? `<p>You ${mine.h === S.userTeam ? 'host' : 'visit'} the <b>${esc(G.tname(mine.h === S.userTeam ? mine.a : mine.h))}</b>.</p>${gamePlan()}` : `<p class="muted">${alive ? 'You have a first-round bye.' : 'You are out of the playoffs. Your scouts keep working while the playoffs finish.'}</p>`}
      <div class="row" style="margin-top:12px"><button class="primary big" data-act="playoffround">${mine ? 'Play playoff game' : 'Play next round'}</button></div></div>`;
  }
  if (S.phase === 'resign') {
    const ex = G.expiring(S.userTeam);
    return `<div class="card"><h3>Re-signing period</h3><p>${ex.length} of your players have expiring contracts. Re-sign the ones you want before free agency opens; the rest hit the open market.</p>
      <div class="row"><button data-act="tab" data-tab="resign">Review expiring contracts</button><button class="primary big" data-act="openfa">Open free agency</button></div></div>`;
  }
  if (S.phase === 'freeagency') {
    const mine = G.pendingOffers(S.userTeam);
    return `<div class="card"><h3>Free agency · Day ${S.faDay} of 21 (Week ${Math.ceil(S.faDay / 7)} of 3)</h3>
      <div class="bar" style="margin:6px 0 10px"><i style="width:${S.faDay / 21 * 100}%"></i></div>
      <p>Make offers on the Free agency tab. Players weigh money, years, how good your team is and whether they'd start. Top players decide in the first few days; asking prices drop after day 5.</p>
      <p class="muted">You have ${mine.length} pending offer${mine.length === 1 ? '' : 's'}.</p>
      <div class="row"><button data-act="tab" data-tab="fa">Go to free agency</button><button class="primary" data-act="faday">Advance 1 day</button><button data-act="faweek">Advance to end of week</button></div></div>`;
  }
  if (S.phase === 'draft') {
    const pk = G.onClock();
    return `<div class="card"><h3>Draft day</h3><p>${pk ? `Pick #${pk.n} (Round ${pk.r}): <b>${esc(G.tname(pk.team))}</b> ${pk.team === S.userTeam ? '— <span class="good">you are on the clock</span>' : 'on the clock'}.` : ''}</p><button class="primary big" data-act="tab" data-tab="draft">Go to the draft room</button></div>`;
  }
  const n = G.roster(S.userTeam).length;
  return `<div class="card"><h3>Preseason</h3><p>Get down to ${G.ROSTER_MAX} players and stay under the cap. Unsigned free agents can still be signed at their asking price.</p>
    <p>${n > G.ROSTER_MAX ? `<span class="warn">You have ${n} players — cut ${n - G.ROSTER_MAX}.</span>` : `<span class="good">Roster is ${n}/${G.ROSTER_MAX}.</span>`}</p>
    <div class="row">${n > G.ROSTER_MAX ? `<button data-act="autocut">Auto-cut to ${G.ROSTER_MAX}</button>` : ''}<button data-act="tab" data-tab="roster">Manage roster</button><button class="primary big" data-act="startseason">Start the ${S.season + 1} season</button></div></div>`;
}
function divMini() {
  const T = S.teams[S.userTeam]; const L = G.divisions()[`${T.conf} ${T.div}`];
  return `<div class="card"><h3>${T.conf} ${T.div}</h3>${table('divmini', [
    { k: 't', t: 'Team', v: t => t.abbr, h: t => `${esc(t.city)} ${esc(t.nick)}` },
    { k: 'r', t: 'W-L', v: t => t.w, h: t => rec(t), num: 1 }, { k: 'd', t: 'Diff', v: t => t.pf - t.pa, num: 1 }, { k: 's', t: 'Strk', v: t => t.streak, num: 1 }],
    L, { rowCls: t => t.abbr === S.userTeam ? 'me' : '' })}</div>`;
}
function newsList(n) { return `<ul class="news">${S.news.slice(0, n).map(x => `<li class="${x.kind === 'good' ? '' : ''}"><span class="t">${x.s} ${esc(x.ph)}</span><span class="${x.kind === 'good' ? 'good' : x.kind === 'bad' ? 'bad' : ''}" style="${x.kind === 'big' ? 'font-weight:600' : ''}">${esc(x.msg)}</span></li>`).join('')}</ul>`; }
function home() {
  let last = '';
  if (S.lastGame && S.phase === 'regular') last = `<div class="card"><h3>Last game · Week ${S.lastGame.w}</h3>${boxscore(S.schedule[S.lastGame.gid])}</div>`;
  if (S.phase === 'playoffs' && S.playoffs) { const g = [...S.playoffs.games].reverse().find(g => g.as != null && (g.a === S.userTeam || g.h === S.userTeam)); if (g) last = `<div class="card"><h3>Last game · ${G.ROUNDS[g.round]}</h3>${boxscore(g)}</div>`; }
  const scoutsIdle = S.scouts.filter(s => !s.assign).length;
  return `<div class="grid g2"><div class="grid">${phaseCard()}${last}${S.phase === 'playoffs' ? bracket() : ''}</div>
    <div class="grid">${scoutsIdle && ['regular', 'playoffs', 'freeagency'].includes(S.phase) ? `<div class="card"><b>${scoutsIdle} scout${scoutsIdle > 1 ? 's are' : ' is'} idle.</b> <a href="#" data-act="tab" data-tab="scouting">Assign them to prospects</a> so they report back each week.</div>` : ''}
    ${['regular', 'playoffs'].includes(S.phase) ? divMini() : ''}<div class="card"><h3>League news</h3>${newsList(30)}</div></div></div>`;
}
function bracket() {
  const P = S.playoffs; if (!P) return '';
  const col = r => P.games.filter(g => g.round === r).map(g => `<div class="bg"><div class="${g.as != null && g.as > g.hs ? 'w' : ''}">${g.conf !== 'NFL' ? '#' + (P.seeds[g.conf].indexOf(g.a) + 1) + ' ' : ''}${teamLabel(g.a)} ${g.as != null ? g.as : ''}</div><div class="${g.hs != null && g.hs > g.as ? 'w' : ''}">${g.conf !== 'NFL' ? '#' + (P.seeds[g.conf].indexOf(g.h) + 1) + ' ' : ''}${teamLabel(g.h)} ${g.hs != null ? g.hs : ''}</div></div>`).join('') || '<div class="muted">TBD</div>';
  return `<div class="card"><h3>Playoff bracket</h3><div class="bracket">${[0, 1, 2, 3].map(r => `<div><div class="muted" style="font-size:12px;margin-bottom:6px">${G.ROUNDS[r]}</div>${col(r)}</div>`).join('')}</div>
  <p class="muted" style="font-size:12px">Byes: ${['AFC', 'NFC'].map(c => P.seeds[c][0]).join(', ')}</p></div>`;
}

// --------- roster ---------
function playerCols(opts = {}) {
  const c = [
    { k: 'name', t: 'Name', v: p => p.name, h: p => `<a href="#" data-act="player" data-id="${p.id}">${esc(p.name)}</a>${p.inj ? ` <span class="chip bad">Inj ${p.inj}w</span>` : ''}${p.rookie && p.exp === 0 ? ' <span class="chip">R</span>' : ''}` },
    { k: 'pos', t: 'Pos', v: p => G.POS.indexOf(p.pos), h: p => p.pos },
    { k: 'age', t: 'Age', v: p => p.age, num: 1 },
    { k: 'ovr', t: 'OVR', v: p => p.ovr, h: p => ovr(p.ovr), num: 1 },
    { k: 'pot', t: 'POT', v: p => p.pot, num: 1 },
  ];
  if (opts.team) c.push({ k: 'team', t: 'Team', v: p => p.team });
  if (opts.contract !== false) c.push({ k: 'sal', t: '$/yr', v: p => p.sal, h: p => money(p.sal), num: 1 }, { k: 'yl', t: 'Yrs', v: p => p.yl, num: 1 });
  return c;
}
function roster(abbr, readonly) {
  abbr = abbr || S.userTeam; const mine = abbr === S.userTeam && !readonly;
  let L = G.roster(abbr); if (ui.posF !== 'ALL') L = L.filter(p => p.pos === ui.posF);
  const cols = playerCols();
  cols.push({ k: 'st', t: 'Season stats', v: p => 0, h: p => statLine(p) });
  if (mine) cols.push({ k: 'act', t: '', v: () => 0, h: p => S.phase === 'regular' || S.phase === 'playoffs' || S.phase === 'preseason' || S.phase === 'freeagency' || S.phase === 'draft' || S.phase === 'resign' ? `<button class="sm danger" data-act="release" data-id="${p.id}">${ui.confirm === p.id ? `Confirm (${money(G.releaseCost(p))} dead)` : 'Release'}</button>` : '' });
  const r = G.teamRatings(abbr);
  const T = S.teams[abbr];
  return `<div class="card"><div class="row" style="margin-bottom:10px"><h3>${esc(T.city)} ${esc(T.nick)} roster</h3><span class="sp"></span><span class="muted">OVR ${r.ovr} · OFF ${r.off} · DEF ${r.def} · Payroll ${money(G.payroll(abbr))}</span></div>
  <div style="margin-bottom:10px">${posSeg('posF')}</div>
  ${table('roster', cols, L, { sort: { k: 'pos', d: 1 } })}
  <p class="muted" style="font-size:12px">Starters are your top players by OVR at each spot (QB1, RB1, WR3, TE1, OT2, IOL3, EDGE2, DT2, LB2, CB3, S2, K, P). Injured players sit automatically.</p></div>`;
}
function statLine(p) {
  const s = p.stats && p.stats[S.season]; if (!s) return '<span class="muted">—</span>';
  const parts = [];
  if (s.pyd) parts.push(`${s.pyd} pass yds, ${s.ptd} TD, ${s.int || 0} INT`);
  if (s.ryd) parts.push(`${s.ryd} rush yds, ${s.rtd || 0} TD`);
  if (s.recyd) parts.push(`${s.rec} rec, ${s.recyd} yds, ${s.rectd || 0} TD`);
  if (s.sk) parts.push(`${s.sk} sacks`);
  if (s.fg) parts.push(`${s.fg} FG`);
  return `<span class="muted">${s.gp || 0} GP${parts.length ? ' · ' : ''}</span>${esc(parts.join(' · '))}`;
}

// --------- player modal ---------
function playerModal(id) {
  const p = S.players[id] || S.prospects.find(x => x.id === id); if (!p) return '';
  const isPros = !S.players[id];
  if (isPros) return prospectModal(p);
  const at = G.attrs(p);
  const T = S.teams[p.team];
  return `<div class="modal" data-act="closemodal"><div class="card" data-stop="1">
    <div class="row"><div><h2>${esc(p.name)}</h2><div class="muted">${p.pos} · ${T ? esc(T.city + ' ' + T.nick) : p.team === 'FA' ? 'Free agent' : esc(p.team)} · Age ${p.age} · ${ht(p.ht)}, ${p.wt} lb · ${esc(p.col)}</div></div><span class="sp"></span>${ovr(p.ovr)}<span class="muted">POT ${p.pot}</span></div>
    <div style="margin:14px 0">${at.map(([n, v]) => `<div class="attr"><span class="muted">${esc(n)}</span><div class="bar"><i style="width:${v}%"></i></div><b>${v}</b></div>`).join('')}</div>
    <div class="grid g3"><div><div class="muted" style="font-size:12px">Contract</div>${p.team === 'FA' ? `Asking ${money(p.ask || 0)} · ${p.askY || 1} yr` : `${money(p.sal)}/yr · ${p.yl} yr left`}</div>
    <div><div class="muted" style="font-size:12px">Experience</div>${p.exp} yr${p.exp === 1 ? '' : 's'}</div>
    <div><div class="muted" style="font-size:12px">Draft</div>${p.dn ? `${p.dy} · pick #${p.dn}` : 'Undrafted'}</div></div>
    <div style="margin-top:12px"><div class="muted" style="font-size:12px">${S.season} season</div>${statLine(p)}</div>
    <div class="row" style="margin-top:14px">${p.team === 'FA' ? `<button class="primary" data-act="offerdlg" data-id="${p.id}">Make offer</button>` : ''}<span class="sp"></span><button data-act="closemodal">Close</button></div></div></div>`;
}
function rangeTxt(r) { return r ? (r[0] === r[1] ? `<span class="rng">${r[0]}</span>` : `<span class="rng">${r[0]}–${r[1]}</span>`) : '<span class="muted">?</span>'; }
function prospectModal(p) {
  const v = G.scoutView(p);
  const at = v.attrs ? G.attrs({ id: p.id, pos: p.pos, ovr: p.ovr }) : null;
  return `<div class="modal" data-act="closemodal"><div class="card" data-stop="1">
    <div class="row"><div><h2>${esc(p.name)}</h2><div class="muted">${p.pos} · ${esc(p.col)} · Age ${p.age} · ${ht(p.ht)}, ${p.wt} lb${p.combine ? ` · 40yd ${p.forty}s` : ''}</div></div><span class="sp"></span><span class="chip">${p.real ? 'Consensus' : 'Media'} rank #${p.rank} · proj. ${G.projRound(p)}</span></div>
    <div class="grid g3" style="margin:14px 0"><div><div class="muted" style="font-size:12px">Scouting</div>${G.scoutLevelNames[p.lvl]}${p.lvl < 3 ? ` <span class="progress"><i style="width:${p.sp}%"></i></span>` : ''}</div>
    <div><div class="muted" style="font-size:12px">Current OVR</div>${rangeTxt(v.ovr)}</div><div><div class="muted" style="font-size:12px">Potential</div>${rangeTxt(v.pot)}</div></div>
    ${at ? at.map(([n, x]) => { const lo = v.exact ? x : Math.max(20, x - 6); return `<div class="attr"><span class="muted">${esc(n)}</span><div class="bar"><i style="width:${lo}%"></i></div><b>${v.exact ? x : '~' + (Math.round(x / 5) * 5)}</b></div>`; }).join('') : `<p class="muted">Attributes unlock at the "Cross-checked" scouting level. Assign a scout on the Scouting tab.</p>`}
    ${p.drafted ? `<p>Drafted by <b>${esc(G.tname(p.drafted.team))}</b>, round ${p.drafted.r}, pick #${p.drafted.n}.</p>` : ''}
    <div class="row" style="margin-top:14px">${S.phase === 'draft' && G.onClock() && G.onClock().team === S.userTeam && !p.drafted ? `<button class="primary" data-act="draftpick" data-id="${p.id}">Draft ${esc(p.name)}</button>` : ''}<span class="sp"></span><button data-act="closemodal">Close</button></div></div></div>`;
}

// --------- scouting ---------
function scouting() {
  const pool = S.prospects;
  let L = pool.filter(p => !p.drafted);
  if (ui.proPos !== 'ALL') L = L.filter(p => p.pos === ui.proPos);
  if (ui.proFilter === 'scouted') L = L.filter(p => p.lvl > 0);
  if (ui.proFilter === 'watch') L = L.filter(p => ui.watch[p.id]);
  const spend = G.scoutSpend();
  const assignOpts = s => `<select data-act="assign" data-sid="${s.id}"><option value="">— idle —</option>${pool.filter(p => !p.drafted && p.lvl < 3).sort((a, b) => a.rank - b.rank).map(p => `<option value="${p.id}" ${s.assign === p.id ? 'selected' : ''}>#${p.rank} ${p.pos} ${esc(p.name)} (${G.scoutLevelNames[p.lvl]})</option>`).join('')}</select>`;
  const staff = `<div class="card"><div class="row"><h3>Your scouts</h3><span class="sp"></span><span class="muted">Budget ${money(spend)} of ${money(G.SCOUT_BUDGET)} · ${S.scouts.length}/${G.MAX_SCOUTS} scouts</span></div>
    ${S.scouts.length ? S.scouts.map(s => { const p = pool.find(x => x.id === s.assign); return `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="min-width:180px"><b>${esc(s.name)}</b> <span class="stars">${'★'.repeat(s.skill)}${'☆'.repeat(5 - s.skill)}</span><div class="muted" style="font-size:12px">${s.spec} specialist · ${money(s.salary)}/yr</div></div>
      <div class="sp">${assignOpts(s)}${p ? ` <span class="muted" style="font-size:12px">+${G.scoutRate(s, p)}% per week</span>` : ''}</div><button class="sm" data-act="firescout" data-id="${s.id}">Let go</button></div>`; }).join('') : '<p class="muted">You have no scouts. Hire one below.</p>'}
    <p class="muted" style="font-size:12px;margin-bottom:0">Each week (and each week of free agency) a scout adds progress to the prospect they're assigned to. 100% unlocks the next level: Area report (rough OVR range) → Cross-checked (tighter ranges, potential, attributes) → Fully scouted (exact grades). Better scouts work faster and give tighter ranges; specialists are faster on their side of the ball.</p></div>`;
  const hire = `<div class="card"><h3>Scouts available to hire</h3>${table('pool', [
    { k: 'n', t: 'Name', v: s => s.name }, { k: 'sk', t: 'Skill', v: s => s.skill, h: s => `<span class="stars">${'★'.repeat(s.skill)}${'☆'.repeat(5 - s.skill)}</span>` },
    { k: 'sp', t: 'Focus', v: s => s.spec }, { k: 'sal', t: 'Salary', v: s => s.salary, h: s => money(s.salary), num: 1 },
    { k: 'a', t: '', v: () => 0, h: s => `<button class="sm primary" data-act="hirescout" data-id="${s.id}">Hire</button>` }], S.scoutPool, { sort: { k: 'sk', d: -1 } })}</div>`;
  return `<div class="grid g2">${staff}${hire}</div><div class="card" style="margin-top:14px"><div class="row" style="margin-bottom:10px"><div><h3>${pool[0] ? pool[0].year : ''} draft class</h3>${pool.some(p => p.real) ? `<div class="muted" style="font-size:12px">Top ${pool.filter(p => p.real).length} are real college players, ranked by a consensus of ${window.DRAFT_2027.sources.join(' and ')}. Their grades are hidden until scouted. Height, weight and 40 times are estimates; later-round players are fictional.</div>` : '<div class="muted" style="font-size:12px">Future classes are generated.</div>'}</div><span class="sp"></span>
    <div class="seg">${[['all', 'All'], ['scouted', 'Scouted'], ['watch', 'Watchlist']].map(([k, l]) => `<button class="${ui.proFilter === k ? 'on' : ''}" data-act="seg" data-key="proFilter" data-val="${k}">${l}</button>`).join('')}</div></div>
    <div style="margin-bottom:10px">${posSeg('proPos')}</div>${prospectTable(L, false)}</div>`;
}
function prospectTable(L, draftMode) {
  const cols = [
    { k: 'w', t: '★', v: p => ui.watch[p.id] ? 0 : 1, h: p => `<a href="#" data-act="watch" data-id="${p.id}" title="Watchlist" style="text-decoration:none">${ui.watch[p.id] ? '★' : '☆'}</a>` },
    { k: 'rank', t: 'Rank', v: p => p.rank, num: 1 },
    { k: 'name', t: 'Name', v: p => p.name, h: p => `<a href="#" data-act="player" data-id="${p.id}">${esc(p.name)}</a>${p.real ? ' <span class="chip" title="Real college prospect">Real</span>' : ''}` },
    { k: 'pos', t: 'Pos', v: p => G.POS.indexOf(p.pos), h: p => p.pos },
    { k: 'col', t: 'College', v: p => p.col },
    { k: 'size', t: 'Size', v: p => p.wt, h: p => `${ht(p.ht)} ${p.wt}` },
    { k: 'forty', t: '40', v: p => p.combine ? p.forty : 9, h: p => p.combine ? p.forty : '<span class="muted">—</span>', num: 1 },
    { k: 'lvl', t: 'Scouting', v: p => p.lvl * 100 + p.sp, h: p => `${G.scoutLevelNames[p.lvl]}${p.lvl < 3 && p.sp ? ` <span class="progress"><i style="width:${p.sp}%"></i></span>` : ''}${S.scouts.some(s => s.assign === p.id) ? ' <span class="chip">scouting</span>' : ''}` },
    { k: 'ovr', t: 'OVR', v: p => { const v = G.scoutView(p); return v.ovr ? (v.ovr[0] + v.ovr[1]) / 2 : 0; }, h: p => rangeTxt(G.scoutView(p).ovr), num: 1 },
    { k: 'pot', t: 'POT', v: p => { const v = G.scoutView(p); return v.pot ? (v.pot[0] + v.pot[1]) / 2 : 0; }, h: p => rangeTxt(G.scoutView(p).pot), num: 1 },
    { k: 'proj', t: 'Proj.', v: p => p.rank, h: p => G.projRound(p) },
  ];
  if (draftMode) cols.push({ k: 'a', t: '', v: () => 0, h: p => G.onClock() && G.onClock().team === S.userTeam ? `<button class="sm primary" data-act="draftpick" data-id="${p.id}">Draft</button>` : '' });
  else if (S.scouts.length) cols.push({ k: 'a', t: '', v: () => 0, h: p => p.lvl < 3 ? `<select data-act="assignp" data-pid="${p.id}"><option value="">Send scout…</option>${S.scouts.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : '' });
  return table(draftMode ? 'draftboard' : 'prospects', cols, L, { sort: { k: 'rank', d: 1 }, limit: 400 });
}

// --------- draft ---------
function draftRoom() {
  if (!S.draft) return `<div class="card"><h3>The draft</h3><p class="muted">The draft happens after free agency. Use the Scouting tab to build your board before then.</p></div>`;
  const pk = G.onClock(); const D = S.draft;
  const mine = D.picks.filter(p => p.team === S.userTeam);
  let L = G.available(); if (ui.proPos !== 'ALL') L = L.filter(p => p.pos === ui.proPos);
  if (ui.proFilter === 'watch') L = L.filter(p => ui.watch[p.id]);
  if (ui.proFilter === 'scouted') L = L.filter(p => p.lvl > 0);
  const recent = D.picks.slice(Math.max(0, D.cur - 12), D.cur).reverse();
  const pr = id => S.prospects.find(x => x.id === id);
  return `<div class="grid gdraft"><div class="card">
    ${pk ? `<div class="row"><h3>Round ${pk.r}, pick #${pk.n}: ${esc(G.tname(pk.team))}</h3></div>
      ${pk.team === S.userTeam ? `<p class="good"><b>You are on the clock.</b> Pick from the board below or open a player.</p><div class="row"><button data-act="autopick">Let my staff pick</button></div>` :
      `<div class="row"><button class="primary" data-act="simtopick">Sim to my next pick</button><button data-act="simone">Sim one pick</button></div>`}` : `<h3>The draft is complete</h3><p class="muted">Rookies have joined their teams. Finish your preseason moves on the Home tab.</p>`}
    <div style="margin-top:10px">${posSeg('proPos')} <div class="seg" style="margin-top:6px">${[['all', 'All'], ['scouted', 'Scouted'], ['watch', 'Watchlist']].map(([k, l]) => `<button class="${ui.proFilter === k ? 'on' : ''}" data-act="seg" data-key="proFilter" data-val="${k}">${l}</button>`).join('')}</div></div>
    <div style="margin-top:10px">${prospectTable(L, true)}</div></div>
  <div class="grid"><div class="card"><h3>Your picks</h3>${mine.map(p => `<div style="padding:4px 0;border-bottom:1px solid var(--line)">Rd ${p.r} · #${p.n} ${p.pid ? `— <b>${esc(pr(p.pid).pos)} ${esc(pr(p.pid).name)}</b> ${ovr(pr(p.pid).ovr)}` : '<span class="muted">pending</span>'}</div>`).join('')}</div>
  <div class="card"><h3>Recent picks</h3>${recent.map(p => `<div style="padding:3px 0;font-size:13px">#${p.n} <b>${esc(p.team)}</b> ${esc(pr(p.pid).pos)} ${esc(pr(p.pid).name)} <span class="muted">(${esc(pr(p.pid).col)}, rank #${pr(p.pid).rank})</span></div>`).join('') || '<p class="muted">No picks yet.</p>'}</div></div></div>`;
}

// --------- free agency ---------
function freeAgency() {
  let L = G.freeAgents(); if (ui.faPos !== 'ALL') L = L.filter(p => p.pos === ui.faPos);
  const myOffers = G.pendingOffers(S.userTeam);
  const cols = playerCols({ contract: false });
  cols.push({ k: 'prev', t: 'Last team', v: p => p.prevTeam || '' },
    { k: 'ask', t: 'Asking', v: p => p.ask || 0, h: p => `${money(p.ask || 0)} · ${p.askY || 1}y`, num: 1 },
    { k: 'int', t: 'Suitors', v: p => (S.fa.offers[p.id] || []).length, h: p => { const n = (S.fa.offers[p.id] || []).filter(o => o.team !== S.userTeam).length; return n ? `${n} team${n > 1 ? 's' : ''}` : '<span class="muted">—</span>'; }, num: 1 },
    { k: 'dec', t: 'Decides', v: p => p.decide || 0, h: p => S.phase !== 'freeagency' ? 'Now' : (p.decide || 0) <= S.faDay ? 'Any day' : `Day ${p.decide}`, num: 1 },
    { k: 'o', t: '', v: p => myOffers.some(o => o.id === p.id) ? 1 : 0, h: p => { const o = myOffers.find(o => o.id === p.id); return o ? `<span class="chip">Offered ${money(o.amt)}×${o.years}</span> <button class="sm" data-act="offerdlg" data-id="${p.id}">Edit</button>` : `<button class="sm primary" data-act="offerdlg" data-id="${p.id}">${S.phase === 'freeagency' ? 'Offer' : 'Sign'}</button>`; } });
  const head = S.phase === 'freeagency' ? `<div class="row"><h3>Free agency · Day ${S.faDay} of 21</h3><span class="sp"></span><button class="primary" data-act="faday">Advance 1 day</button><button data-act="faweek">Advance to end of week</button></div>
    <p class="muted">Offers are binding until the player decides. Cap space shown in the header must cover all your pending offers.</p>`
    : `<h3>Free-agent pool</h3><p class="muted">Outside the free-agency window, a player signs instantly if your offer meets his ask and you have cap space.</p>`;
  return `<div class="card">${head}
    ${myOffers.length ? `<div style="margin:6px 0 12px"><b>Your pending offers:</b> ${myOffers.map(o => `<span class="chip">${esc(S.players[o.id].name)} ${money(o.amt)}×${o.years} <a href="#" data-act="withdraw" data-id="${o.id}">✕</a></span>`).join(' ')}</div>` : ''}
    <div style="margin-bottom:10px">${posSeg('faPos')}</div>${table('fa', cols, L, { sort: { k: 'ovr', d: -1 }, limit: 300 })}</div>`;
}
function offerModal(id) {
  const p = S.players[id]; const ex = G.pendingOffers(S.userTeam).find(o => o.id === id);
  const amt = ex ? ex.amt : p.ask, yrs = ex ? ex.years : p.askY;
  const interest = G.interest(p, S.userTeam);
  return `<div class="modal" data-act="closemodal"><div class="card" data-stop="1"><h2>Offer: ${esc(p.name)}</h2>
    <div class="muted">${p.pos} · ${p.age} yrs · OVR ${p.ovr} / POT ${p.pot} · Asking ${money(p.ask)} for ${p.askY} yr</div>
    <p>Fit with your team: <b class="${interest >= 1.05 ? 'good' : interest < 0.97 ? 'bad' : ''}">${interest >= 1.05 ? 'Excited' : interest >= 0.97 ? 'Open to it' : 'Lukewarm'}</b> <span class="muted">(team quality and whether he'd start)</span></p>
    <div class="row"><label>Years <select id="offY">${[1, 2, 3, 4, 5].map(y => `<option ${y === yrs ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
    <label>$M per year <input id="offA" type="number" step="0.1" min="0.9" value="${amt.toFixed(1)}" style="width:100px"></label></div>
    <p class="muted" style="font-size:12px">Cap space ${money(G.capSpace(S.userTeam))}. Older players value extra years; younger players prefer shorter deals.</p>
    <div class="row"><button class="primary" data-act="sendoffer" data-id="${p.id}">${S.phase === 'freeagency' ? 'Submit offer' : 'Sign player'}</button><span class="sp"></span><button data-act="closemodal">Cancel</button></div></div></div>`;
}

// --------- re-sign ---------
function resign() {
  const L = G.expiring(S.userTeam);
  const cols = playerCols({ contract: false });
  cols.push({ k: 'cur', t: 'Old $/yr', v: p => p.sal, h: p => money(p.sal), num: 1 },
    { k: 'ask', t: 'Asking', v: p => p.ask, h: p => `${money(p.ask)} × ${p.askY}y`, num: 1 },
    { k: 'mood', t: 'Mood', v: p => p.testFA ? 1 : 0, h: p => p.testFA ? '<span class="pill-no">Testing the market</span>' : '<span class="pill-ok">Willing to re-sign</span>' },
    { k: 'a', t: '', v: () => 0, h: p => p.testFA ? '' : `<button class="sm primary" data-act="resign" data-id="${p.id}">Re-sign</button>` });
  return `<div class="card"><div class="row"><h3>Expiring contracts</h3><span class="sp"></span><button class="primary" data-act="openfa">Done — open free agency</button></div>
    <p class="muted">Ratings already reflect offseason development. Players marked "Testing the market" will go to free agency; you can still bid on them there against other teams.</p>${table('resign', cols, L, { sort: { k: 'ovr', d: -1 } })}</div>`;
}

// --------- standings / schedule / league ---------
function standings() {
  const D = G.divisions();
  const seeds = { AFC: G.seeds('AFC'), NFC: G.seeds('NFC') };
  return ['AFC', 'NFC'].map(c => `<h2 style="margin:8px 0 10px">${c}</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">${['East', 'North', 'South', 'West'].map(d => `<div class="card"><h3>${c} ${d}</h3>${table('st' + c + d, [
    { k: 't', t: 'Team', v: t => t.abbr, h: t => `${esc(t.city)} ${esc(t.nick)}${seeds[c].indexOf(t.abbr) < 7 && (t.w + t.l) ? ` <span class="chip">${seeds[c].indexOf(t.abbr) + 1}</span>` : ''}` },
    { k: 'w', t: 'W', v: t => t.w, num: 1 }, { k: 'l', t: 'L', v: t => t.l, num: 1 }, { k: 'pf', t: 'PF', v: t => t.pf, num: 1 }, { k: 'pa', t: 'PA', v: t => t.pa, num: 1 },
    { k: 'dv', t: 'Div', v: t => t.dw, h: t => `${t.dw}-${t.dl}`, num: 1 }, { k: 's', t: 'Strk', v: t => t.streak }],
    D[`${c} ${d}`], { rowCls: t => t.abbr === S.userTeam ? 'me' : '' })}</div>`).join('')}</div>`).join('') + `<p class="muted" style="font-size:12px">Chip = current playoff seed. Tiebreakers here are simplified: win %, division record, conference record, point differential.</p>`;
}
function schedule() {
  const mine = G.teamGames(S.userTeam).sort((a, b) => a.w - b.w);
  const wk = ui.schedWeek || (S.phase === 'regular' ? Math.max(1, S.week - 1) : 18);
  const wg = S.schedule.filter(g => g.w === wk);
  const res = g => { if (g.as == null) return '<span class="muted">—</span>'; const home = g.h === S.userTeam; const us = home ? g.hs : g.as, th = home ? g.as : g.hs; return `<b class="${us > th ? 'good' : us < th ? 'bad' : ''}">${us > th ? 'W' : us < th ? 'L' : 'T'}</b> ${us}-${th}${g.ot ? ' OT' : ''}`; };
  const weeks = [...new Set(S.schedule.map(g => g.w))].sort((a, b) => a - b);
  return `<div class="grid g2"><div class="card"><h3>${S.season} schedule</h3>${table('sched', [
    { k: 'w', t: 'Wk', v: g => g.w, num: 1 }, { k: 'o', t: 'Opponent', v: g => g.a === S.userTeam ? g.h : g.a, h: g => `${g.a === S.userTeam ? '@ ' : 'vs '}${esc(G.tname(g.a === S.userTeam ? g.h : g.a))}` },
    { k: 'r', t: 'Result', v: g => g.as == null ? 0 : 1, h: res },
    { k: 'b', t: '', v: () => 0, h: g => g.box ? `<a href="#" data-act="box" data-gid="${S.schedule.indexOf(g)}">Box</a>` : '' }], mine, { sort: { k: 'w', d: 1 } })}
    <p class="muted" style="font-size:12px">${weeks.filter(w => !mine.some(g => g.w === w)).map(w => `Bye: Week ${w}`).join(', ')}</p></div>
  <div class="card"><div class="row"><h3>Week</h3><select data-act="schedweek">${weeks.map(w => `<option ${w === wk ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
    ${wg.map(g => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span style="width:44px">${teamLabel(g.a)}</span><b style="width:30px;text-align:right">${g.as == null ? '' : g.as}</b><span class="muted">@</span><span style="width:44px">${teamLabel(g.h)}</span><b style="width:30px;text-align:right">${g.hs == null ? '' : g.hs}</b><span class="sp"></span>${g.box ? `<a href="#" data-act="box" data-gid="${S.schedule.indexOf(g)}">Box</a>` : ''}</div>`).join('')}</div></div>`;
}
function league() {
  if (ui.leagueTeam) return `<div class="row" style="margin-bottom:10px"><button data-act="leagueteam" data-team="">← All teams</button></div>${roster(ui.leagueTeam, true)}`;
  const rows = Object.values(S.teams).map(t => ({ ...t, r: G.teamRatings(t.abbr), cap: G.capSpace(t.abbr) }));
  return `<div class="card"><h3>League</h3>${table('league', [
    { k: 'n', t: 'Team', v: t => t.city, h: t => `<a href="#" data-act="leagueteam" data-team="${t.abbr}">${esc(t.city)} ${esc(t.nick)}</a>` },
    { k: 'c', t: 'Div', v: t => t.conf + t.div, h: t => `${t.conf} ${t.div}` },
    { k: 'w', t: 'Record', v: t => G.pct(t), h: t => rec(t), num: 1 },
    { k: 'o', t: 'OVR', v: t => t.r.ovr, h: t => ovr(t.r.ovr), num: 1 }, { k: 'off', t: 'OFF', v: t => t.r.off, num: 1 }, { k: 'def', t: 'DEF', v: t => t.r.def, num: 1 },
    { k: 'cap', t: 'Cap space', v: t => t.cap, h: t => money(t.cap), num: 1 }], rows, { sort: { k: 'o', d: -1 }, rowCls: t => t.abbr === S.userTeam ? 'me' : '' })}</div>
    <div class="card" style="margin-top:14px"><h3>Top players</h3>${table('topp', playerCols({ team: true }), Object.values(S.players).filter(p => S.teams[p.team]).sort((a, b) => b.ovr - a.ovr).slice(0, 60), { sort: { k: 'ovr', d: -1 } })}</div>`;
}
function settings() {
  return `<div class="card"><h3>Save & settings</h3><p class="muted">The game autosaves in this browser after every action.</p>
    <div class="row"><button data-act="export">Export save</button><label class="row"><span>Load save file</span><input type="file" id="importFile" accept=".json,application/json"></label></div>
    <details style="margin-top:10px"><summary>Load from text</summary><textarea id="pasteText" placeholder="Paste an exported save here"></textarea><button style="margin-top:6px" data-act="pastesave">Load this save</button></details>
    <div class="row" style="margin-top:14px"><span>Theme</span><div class="seg">${['auto', 'light', 'dark'].map(t => `<button class="${(document.documentElement.dataset.theme || 'auto') === t ? 'on' : ''}" data-act="theme" data-val="${t}">${t}</button>`).join('')}</div></div>
    <div class="row" style="margin-top:20px"><button class="danger" data-act="newgame">${ui.confirm === 'newgame' ? 'Click again to erase this save and start over' : 'Start a new game'}</button></div>
    ${S.history.length ? `<h3 style="margin-top:20px">Your history</h3>${table('hist', [{ k: 's', t: 'Season', v: h => h.season }, { k: 'r', t: 'Record', v: h => h.w, h: h => `${h.w}-${h.l}${h.t ? '-' + h.t : ''}` }, { k: 'x', t: 'Result', v: h => h.result }, { k: 'c', t: 'Champion', v: h => h.champ }], S.history)}` : ''}
    <div class="foot">Data: real 2026 rosters (status as of Week ${S.meta.roster_week}), 2025–26 snap counts and stats, and the 2026 schedule, all from the open nflverse project. Player ratings are calculated by this game from playing time, production and draft pedigree. Contracts are estimates (no public contract feed was available). The top of the 2027 draft class uses real prospects from public big boards; their ratings are this game's estimates. Later rounds, future classes and scouts are fictional.</div></div>`;
}
function newsTab() { return `<div class="card"><h3>News</h3>${newsList(400)}</div>`; }
function boxModal(gid) { const g = S.schedule[gid]; return `<div class="modal" data-act="closemodal"><div class="card" data-stop="1"><h3>Week ${g.w}</h3>${boxscore(g)}<div class="row"><span class="sp"></span><button data-act="closemodal">Close</button></div></div></div>`; }

// --------- render ---------
function render() {
  S = G.state();
  if (!S || ui.view === 'start') { app.innerHTML = startScreen() + (ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ''); return; }
  setTheme();
  const views = { home, roster: () => roster(), scouting, draft: draftRoom, fa: freeAgency, resign, standings, schedule, league, news: newsTab, settings };
  if (ui.tab === 'resign' && S.phase !== 'resign') ui.tab = 'home';
  let html = shell((views[ui.tab] || home)());
  if (ui.modal) {
    if (ui.modal.t === 'player') html += playerModal(ui.modal.id);
    if (ui.modal.t === 'offer') html += offerModal(ui.modal.id);
    if (ui.modal.t === 'box') html += boxModal(ui.modal.gid);
    if (ui.modal.t === 'export') html += `<div class="modal" data-act="closemodal"><div class="card" data-stop="1"><h3>Your save</h3><p class="muted">If a download didn't start, copy this text and keep it somewhere safe. Paste it under Save → Load from text to restore.</p><textarea id="saveText" readonly>${esc(ui.modal.txt)}</textarea><div class="row" style="margin-top:10px"><button class="primary" data-act="copysave">Copy</button><span class="sp"></span><button data-act="closemodal">Close</button></div></div></div>`;
  }
  if (ui.toast) html += `<div class="toast">${esc(ui.toast)}</div>`;
  const y = window.scrollY; app.innerHTML = html; window.scrollTo(0, y);
}

// --------- events ---------
app.addEventListener('click', e => {
  const stop = e.target.closest('[data-stop]'); const el = e.target.closest('[data-act],[data-sort]');
  if (!el) return;
  if (el.dataset.act === 'closemodal' && stop && el.classList.contains('modal')) return;
  if (el.dataset.sort) { const [id, k] = el.dataset.sort.split('|'); const cur = ui.sort[id] || {}; ui.sort[id] = { k, d: cur.k === k ? -(cur.d || 1) : (k === 'name' || k === 'pos' || k === 'rank' || k === 'w' ? 1 : -1) }; render(); return; }
  e.preventDefault();
  const a = el.dataset.act, id = el.dataset.id;
  if (a !== 'release' && a !== 'newgame') ui.confirm = null;
  switch (a) {
    case 'mode': ui.mode = el.dataset.val; render(); break;
    case 'continue': G.load(); ui.view = null; ui.tab = 'home'; render(); break;
    case 'pickteam': G.newGame(el.dataset.team, ui.mode); ui.view = null; ui.tab = 'home'; commit(); break;
    case 'tab': ui.tab = el.dataset.tab; ui.modal = null; render(); window.scrollTo(0, 0); break;
    case 'seg': ui[el.dataset.key] = el.dataset.val; render(); break;
    case 'plan': S.plan[el.dataset.k] = el.dataset.v; commit(); break;
    case 'playweek': { const r = G.playWeek(); commit(); if (r && r.game) toast(`Final: ${r.game.a} ${r.game.as}, ${r.game.h} ${r.game.hs}`); break; }
    case 'playoffround': G.playPlayoffRound(); commit(); break;
    case 'offseason': G.startOffseason(); ui.tab = 'resign'; commit(); break;
    case 'resign': { const err = G.resign(id); if (err) toast(err); commit(); break; }
    case 'openfa': G.startFreeAgency(); ui.tab = 'fa'; commit(); break;
    case 'faday': G.advanceFADay(); if (S.phase === 'draft') ui.tab = 'draft'; commit(); break;
    case 'faweek': { const end = Math.ceil(S.faDay / 7) * 7; while (S.phase === 'freeagency' && S.faDay <= end) { const d = S.faDay; G.advanceFADay(); if (S.faDay === d) break; } if (S.phase === 'draft') ui.tab = 'draft'; commit(); break; }
    case 'offerdlg': ui.modal = { t: 'offer', id }; render(); break;
    case 'sendoffer': { const y = +document.getElementById('offY').value, amt = +document.getElementById('offA').value; const err = G.makeOffer(id, y, amt); if (err) { toast(err); } else { ui.modal = null; toast(S.phase === 'freeagency' ? 'Offer submitted.' : `Signed ${S.players[id].name}!`); } commit(); break; }
    case 'withdraw': G.withdrawOffer(id); commit(); break;
    case 'player': ui.modal = { t: 'player', id }; render(); break;
    case 'box': ui.modal = { t: 'box', gid: +el.dataset.gid }; render(); break;
    case 'closemodal': ui.modal = null; render(); break;
    case 'release': if (ui.confirm === id) { G.release(id); ui.confirm = null; commit(); } else { ui.confirm = id; render(); } break;
    case 'autocut': { const c = G.autoCutUser(); toast(`Released ${c.length} players.`); commit(); break; }
    case 'startseason': { const err = G.startSeason(); if (err) toast(err); else { ui.tab = 'home'; } commit(); break; }
    case 'hirescout': { const err = G.hireScout(id); if (err) toast(err); commit(); break; }
    case 'firescout': G.fireScout(id); commit(); break;
    case 'watch': ui.watch[id] = !ui.watch[id]; S.watch = ui.watch; commit(); break;
    case 'draftpick': { ui.modal = null; const err = G.makePick(id); if (err) toast(err); commit(); break; }
    case 'simtopick': G.simToUserPick(); commit(); break;
    case 'simone': G.simToUserPick(true); commit(); break;
    case 'autopick': G.autoPickUser(); commit(); break;
    case 'leagueteam': ui.leagueTeam = el.dataset.team || null; render(); break;
    case 'theme': { const v = el.dataset.val; if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; try { localStorage.setItem('gridiron_theme', v); } catch (e) {} render(); break; }
    case 'export': { const txt = JSON.stringify(S); ui.modal = { t: 'export', txt }; render(); try { const blob = new Blob([txt], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = `gridiron-gm-${S.userTeam}-${S.season}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); } catch (x) {} break; }
    case 'copysave': { const ta = document.getElementById('saveText'); try { navigator.clipboard.writeText(ta.value).then(() => toast('Save copied to clipboard.'), () => { ta.select(); toast('Press Ctrl/Cmd+C to copy.'); }); } catch (x) { ta.select(); } break; }
    case 'pastesave': { const ta = document.getElementById('pasteText'); try { const s = JSON.parse(ta.value); if (!s.teams || !s.players) throw 0; G.setState(s); ui.watch = s.watch || {}; ui.view = null; ui.tab = 'home'; ui.modal = null; commit(); toast('Save loaded.'); } catch (x) { toast('That text is not a Gridiron GM save.'); } break; }
    case 'newgame': if (ui.confirm === 'newgame') { G.clearSave(); G.setState(null); ui.view = 'start'; ui.confirm = null; render(); } else { ui.confirm = 'newgame'; render(); } break;
  }
});
app.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.act === 'assign') { G.assignScout(el.dataset.sid, el.value); commit(); }
  if (el.dataset.act === 'assignp' && el.value) { G.assignScout(el.value, el.dataset.pid); toast('Scout assigned.'); commit(); }
  if (el.dataset.act === 'schedweek') { ui.schedWeek = +el.value; render(); }
  if (el.id === 'importFile' && el.files[0]) {
    el.files[0].text().then(t => { try { const s = JSON.parse(t); if (!s.teams || !s.players) throw 0; G.setState(s); ui.watch = s.watch || {}; ui.view = null; ui.tab = 'home'; commit(); toast('Save loaded.'); } catch (x) { toast('That file is not a Gridiron GM save.'); } });
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.modal) { ui.modal = null; render(); } });

try { const th = localStorage.getItem('gridiron_theme'); if (th && th !== 'auto') document.documentElement.dataset.theme = th; } catch (e) {}
const saved = G.load();
if (saved) { ui.watch = saved.watch || {}; ui.view = 'start'; } else ui.view = 'start';
G.setState(saved || null);
render();
})();
