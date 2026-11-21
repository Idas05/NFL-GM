// Gridiron GM engine: league state, ratings, game sim, scouting, draft, free agency.
(function () {
'use strict';
const E = {};
const POS = ['QB','RB','WR','TE','OT','IOL','EDGE','DT','LB','CB','S','K','P','LS'];
const STARTERS = { QB:1, RB:1, WR:3, TE:1, OT:2, IOL:3, EDGE:2, DT:2, LB:2, CB:3, S:2, K:1, P:1, LS:1 };
const DEPTH_NEED = { QB:2, RB:3, WR:5, TE:3, OT:4, IOL:5, EDGE:4, DT:4, LB:4, CB:5, S:4, K:1, P:1, LS:1 };
const POSVAL = { QB:1.0, EDGE:.62, OT:.55, WR:.58, CB:.5, DT:.5, IOL:.4, S:.38, LB:.36, TE:.36, RB:.3, K:.1, P:.08, LS:.03 };
const ATTRS = {
  QB:['Arm','Accuracy','Decisions','Pocket','Mobility'], RB:['Speed','Vision','Power','Elusive','Hands'],
  WR:['Speed','Routes','Hands','Release','After catch'], TE:['Blocking','Hands','Routes','Speed','Strength'],
  OT:['Pass block','Run block','Footwork','Strength','Awareness'], IOL:['Pass block','Run block','Strength','Footwork','Awareness'],
  EDGE:['Pass rush','Bend','Power','Run stop','Motor'], DT:['Power','Run stop','Pass rush','Hands','Motor'],
  LB:['Tackling','Coverage','Pursuit','Instincts','Blitz'], CB:['Man cover','Zone cover','Speed','Ball skills','Press'],
  S:['Zone cover','Range','Tackling','Ball skills','Instincts'], K:['Leg','Accuracy','Clutch','Kickoff','Consistency'],
  P:['Leg','Hang time','Placement','Consistency','Hold'], LS:['Snap accuracy','Speed','Coverage','Blocking','Consistency'],
};
const MIN_SAL = 0.885, ROSTER_MAX = 53, CAP0 = 301.2, CAP_GROWTH = 1.06;
E.POS = POS; E.STARTERS = STARTERS; E.ATTRS = ATTRS; E.ROSTER_MAX = ROSTER_MAX;

// ---------- utils ----------
const rnd = Math.random;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
function gauss() { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }
E.util = { ri, clamp, pick, shuffle, hash };

let S = null; // state
E.state = () => S;
E.setState = s => { S = s; };
E.team = abbr => S.teams[abbr];
E.capFor = season => +(CAP0 * Math.pow(CAP_GROWTH, season - 2026)).toFixed(1);

// ---------- new game ----------
E.newGame = function (userTeam, mode) {
  const D = window.NFL_DATA;
  S = { v: 1, userTeam, season: 2026, phase: 'regular', week: 1, faDay: 0, news: [], history: [], nextId: 1,
        teams: {}, players: {}, schedule: [], playoffs: null, prospects: [], scouts: [], scoutPool: [], draft: null,
        fa: { offers: {} }, dead: {}, plan: { off: 'balanced', def: 'balanced' }, lastGame: null,
        meta: D.meta, mode };
  for (const t of window.TEAMS) S.teams[t.abbr] = { ...t, w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, cw: 0, cl: 0, streak: '' };
  const C = D.cols;
  for (const row of D.players) {
    const p = {}; C.forEach((c, i) => p[c] = row[i]);
    p.age = Math.floor(p.age); p.inj = p.ir ? ri(3, 12) : 0; delete p.ir;
    p.stats = {}; S.players[p.id] = p;
  }
  S.schedule = D.schedule.map(([w, a, h, as, hs]) => ({ w, a, h, as: mode === 'now' ? as : null, hs: mode === 'now' ? hs : null }));
  if (mode === 'now') {
    for (const g of S.schedule) if (g.as != null) recordResult(g);
    const unplayed = S.schedule.filter(g => g.as == null).map(g => g.w);
    S.week = Math.min(...unplayed);
    // players on IR heal faster if we're picking up mid-season? keep remaining weeks
  }
  genScoutPool(true);
  S.prospects = genProspects(S.season + 1);
  log(`You were named head coach & GM of the ${tname(userTeam)}.`, 'big');
  return S;
};

function tname(a) { const t = S.teams[a] || window.TEAMS.find(x => x.abbr === a); return t ? `${t.city} ${t.nick}` : a; }
E.tname = tname;
function log(msg, kind) { S.news.unshift({ s: S.season, ph: phaseLabel(), msg, kind: kind || '' }); if (S.news.length > 400) S.news.length = 400; }
E.log = log;
function phaseLabel() {
  if (S.phase === 'regular') return `Week ${S.week}`;
  if (S.phase === 'playoffs') return 'Playoffs';
  if (S.phase === 'resign') return 'Re-signing';
  if (S.phase === 'freeagency') return `FA day ${S.faDay}`;
  if (S.phase === 'draft') return 'Draft';
  return 'Preseason';
}
E.phaseLabel = phaseLabel;

// ---------- rosters & ratings ----------
E.roster = abbr => Object.values(S.players).filter(p => p.team === abbr);
E.healthy = abbr => E.roster(abbr).filter(p => !p.inj);
E.activeCount = abbr => E.roster(abbr).length;
E.attrs = function (p) {
  const names = ATTRS[p.pos] || ATTRS.LB;
  return names.map((n, i) => [n, clamp(Math.round(p.ovr + (hash(p.id + n) - 0.5) * 22 - (i === 4 ? 3 : 0)), 25, 99)]);
};
E.depth = function (abbr) {
  const by = {}; POS.forEach(x => by[x] = []);
  for (const p of E.roster(abbr)) by[p.pos].push(p);
  for (const k in by) by[k].sort((a, b) => (a.inj ? 1 : 0) - (b.inj ? 1 : 0) || b.ovr - a.ovr);
  return by;
};
function grp(by, pos) {
  const n = STARTERS[pos]; const L = by[pos].filter(p => !p.inj);
  let s = 0; for (let i = 0; i < n; i++) s += L[i] ? L[i].ovr : 40;
  return s / n;
}
E.teamRatings = function (abbr) {
  const by = E.depth(abbr);
  const off = grp(by,'QB')*.34 + grp(by,'WR')*.17 + grp(by,'OT')*.13 + grp(by,'IOL')*.13 + grp(by,'TE')*.08 + grp(by,'RB')*.09 + grp(by,'K')*.03 + grp(by,'P')*.03;
  const def = grp(by,'EDGE')*.24 + grp(by,'DT')*.16 + grp(by,'LB')*.14 + grp(by,'CB')*.28 + grp(by,'S')*.18;
  return { off: Math.round(off), def: Math.round(def), ovr: Math.round(off * .55 + def * .45), by };
};
E.payroll = function (abbr) { return E.roster(abbr).reduce((s, p) => s + (p.yl > 0 ? p.sal : 0), 0) + (S.dead[abbr] || 0); };
E.capSpace = abbr => +(E.capFor(S.season + (['resign','freeagency','draft','preseason'].includes(S.phase) ? 1 : 0)) - E.payroll(abbr)).toFixed(2);
E.capYear = () => S.season + (['resign','freeagency','draft','preseason'].includes(S.phase) ? 1 : 0);

// market value of a player (per-year $M) & ask
E.marketValue = function (p) {
  const o = p.ovr, v = POSVAL[p.pos] || .3, cap = E.capFor(E.capYear());
  let s;
  if (o < 62) s = MIN_SAL + 0.3 * hash(p.id + 'mv');
  else { const top = 55 * v * cap / CAP0; s = MIN_SAL + (top - MIN_SAL) * Math.pow((o - 60) / 39, 1.7); }
  if (p.age >= 31) s *= Math.max(0.45, 1 - 0.09 * (p.age - 30));
  if (p.pot > p.ovr + 4 && p.age <= 26) s *= 1.12;
  return +Math.max(MIN_SAL, s).toFixed(2);
};
E.askYears = p => p.age >= 32 ? 1 : p.age >= 29 ? 2 : p.ovr >= 80 ? 4 : 3;

// ---------- schedule helpers ----------
E.userGameThisWeek = function () {
  return S.schedule.find(g => g.w === S.week && (g.a === S.userTeam || g.h === S.userTeam));
};
E.teamGames = abbr => S.schedule.filter(g => g.a === abbr || g.h === abbr);

function recordResult(g) {
  const A = S.teams[g.a], H = S.teams[g.h];
  A.pf += g.as; A.pa += g.hs; H.pf += g.hs; H.pa += g.as;
  const sameDiv = A.conf === H.conf && A.div === H.div, sameConf = A.conf === H.conf;
  const res = (T, us, them) => {
    if (us > them) { T.w++; if (sameDiv) T.dw++; if (sameConf) T.cw++; T.streak = T.streak[0] === 'W' ? 'W' + (+T.streak.slice(1) + 1) : 'W1'; }
    else if (us < them) { T.l++; if (sameDiv) T.dl++; if (sameConf) T.cl++; T.streak = T.streak[0] === 'L' ? 'L' + (+T.streak.slice(1) + 1) : 'L1'; }
    else { T.t++; T.streak = 'T1'; }
  };
  res(A, g.as, g.hs); res(H, g.hs, g.as);
}

// ---------- game simulation ----------
const PLAN = {
  off: { run: { off: 0, var: -2, runTilt: 1 }, balanced: { off: 0, var: 0, runTilt: 0 }, pass: { off: 0.5, var: 3, runTilt: -1 } },
  def: { contain: { def: 0, var: -2, blitz: 0 }, balanced: { def: 0, var: 0, blitz: 0 }, blitz: { def: 0.5, var: 3, blitz: 1 } },
};
function expectedPts(atk, dfn, home, plan) {
  let e = 21.5 + (atk.off - dfn.def) * 0.85 + (home ? 1.3 : -0.3);
  if (plan) {
    const by = atk.by;
    // run plan helps when your run game & OL are strong; pass plan when QB/WR are strong
    const runEdge = (grp(by,'RB') + grp(by,'IOL')) / 2 - (grp(dfn.by,'DT') + grp(dfn.by,'LB')) / 2;
    const passEdge = (grp(by,'QB') + grp(by,'WR')) / 2 - (grp(dfn.by,'CB') + grp(dfn.by,'S')) / 2;
    if (plan.off === 'run') e += runEdge * 0.12;
    if (plan.off === 'pass') e += passEdge * 0.12;
  }
  return Math.max(6, e);
}
function genScore(exp, varBoost) {
  const sd = 1 + (varBoost || 0) * 0.04;
  const td = poisson(Math.max(0.3, exp * 0.62 / 7) * sd), fg = poisson(Math.max(0.2, exp * 0.38 / 3));
  let pts = td * 7 + fg * 3; for (let i = 0; i < td; i++) { const r = rnd(); if (r < 0.04) pts -= 1; else if (r < 0.07) pts += 1; }
  return { pts: Math.max(0, pts), td, fg };
}
function simGame(g, record = true) {
  const ra = E.teamRatings(g.a), rh = E.teamRatings(g.h);
  const ua = g.a === S.userTeam, uh = g.h === S.userTeam;
  const pa = ua ? S.plan : null, ph = uh ? S.plan : null;
  const dA = pa ? PLAN.def[pa.def] : null, dH = ph ? PLAN.def[ph.def] : null;
  let ea = expectedPts(ra, rh, false, pa), eh = expectedPts(rh, ra, true, ph);
  // blitz: reduces opponent points vs weak OL, risky vs strong QB
  if (dH && dH.blitz) eh += 0, ea += (grp(ra.by,'QB') - grp(rh.by,'EDGE')) * 0.12;
  if (dA && dA.blitz) eh += (grp(rh.by,'QB') - grp(ra.by,'EDGE')) * 0.12;
  if (dH && ph.def === 'contain') ea -= 0.8;
  if (dA && pa.def === 'contain') eh -= 0.8;
  const va = (pa ? PLAN.off[pa.off].var : 0) + (ph ? PLAN.def[ph.def].var : 0);
  const vh = (ph ? PLAN.off[ph.off].var : 0) + (pa ? PLAN.def[pa.def].var : 0);
  const A = genScore(ea, va), H = genScore(eh, vh);
  let as = A.pts, hs = H.pts, ot = false;
  if (as === hs) { ot = true; const r = rnd(); if (r < 0.04) {} else if (r < 0.52 + (rh.ovr - ra.ovr) * 0.01) hs += rnd() < 0.6 ? 3 : 6; else as += rnd() < 0.6 ? 3 : 6; }
  g.as = as; g.hs = hs; g.ot = ot;
  if (ua || uh) g.ev = [...scoringEvents(A, A.pts, as, 'a'), ...scoringEvents(H, H.pts, hs, 'h')].sort((x, y) => x.q - y.q || x.r - y.r);
  g.box = { a: boxFor(g.a, ra, A, as, rh), h: boxFor(g.h, rh, H, hs, ra) };
  if (record) recordResult(g);
  injuries(g.a); injuries(g.h);
  return g;
}
// split a team's points into quarter-by-quarter scoring plays for the game-day ticker
function scoringEvents(sc, reg, final, side) {
  const ev = [];
  for (let i = 0; i < sc.td; i++) ev.push({ s: side, q: ri(0, 3), p: 7, t: 'TD', r: rnd() });
  for (let i = 0; i < sc.fg; i++) ev.push({ s: side, q: ri(0, 3), p: 3, t: 'FG', r: rnd() });
  const diff = reg - ev.reduce((a, e) => a + e.p, 0);
  const lastTd = ev.filter(e => e.t === 'TD').pop(); if (lastTd) lastTd.p += diff;
  if (final > reg) ev.push({ s: side, q: 4, p: final - reg, t: final - reg >= 6 ? 'TD' : 'FG', r: 0 });
  return ev;
}
function boxFor(abbr, r, sc, pts, opp) {
  const by = r.by, out = [];
  const qb = by.QB.find(p => !p.inj), rb = by.RB.filter(p => !p.inj), wr = by.WR.filter(p => !p.inj), te = by.TE.find(p => !p.inj);
  const passTd = Math.max(0, Math.round(sc.td * (0.6 + (r.off - 75) * 0.005))), rushTd = Math.max(0, sc.td - passTd);
  const passYds = Math.max(60, Math.round(150 + (qb ? qb.ovr - 70 : -20) * 4 + pts * 3 + gauss() * 45));
  const att = ri(26, 40), cmp = Math.round(att * clamp(0.55 + (qb ? qb.ovr - 70 : 0) * 0.005 + gauss() * 0.05, 0.4, 0.82));
  const ints = poisson(clamp(0.9 - (qb ? qb.ovr - 70 : 0) * 0.02 + (opp.def - 75) * 0.02, 0.2, 2));
  if (qb) { out.push([qb, `${cmp}/${att}, ${passYds} yds, ${passTd} TD${ints ? `, ${ints} INT` : ''}`]); addStat(qb, { pyd: passYds, ptd: passTd, int: ints, cmp, att }); }
  const rushYds = Math.max(15, Math.round(95 + gauss() * 35 + (r.off - opp.def) * 1.2));
  if (rb[0]) { const y = Math.round(rushYds * 0.7), c = ri(12, 22); out.push([rb[0], `${c} car, ${y} yds${rushTd ? `, ${rushTd} TD` : ''}`]); addStat(rb[0], { ryd: y, rtd: rushTd, car: c }); }
  const targets = [...wr.slice(0, 3), te].filter(Boolean); let left = passYds, tdLeft = passTd;
  targets.forEach((p, i) => {
    const share = [0.34, 0.24, 0.16, 0.18][i] * (0.8 + rnd() * 0.4); const y = Math.round(passYds * share); left -= y;
    const td = tdLeft > 0 && rnd() < 0.45 + (p.ovr - 75) * 0.01 ? 1 : 0; tdLeft -= td;
    const rec = Math.max(1, Math.round(y / ri(9, 15)));
    addStat(p, { rec, recyd: y, rectd: td });
    if (i < 2) out.push([p, `${rec} rec, ${y} yds${td ? `, ${td} TD` : ''}`]);
  });
  const edge = by.EDGE.find(p => !p.inj); const sacks = poisson(clamp(2.3 + (r.def - opp.off) * 0.05, 0.5, 5));
  if (edge && sacks) { const s = Math.min(sacks, ri(0, 2)); if (s) { out.push([edge, `${s} sack${s > 1 ? 's' : ''}`]); addStat(edge, { sk: s }); } }
  const k = by.K[0]; if (k && sc.fg) { out.push([k, `${sc.fg}/${sc.fg + (rnd() < 0.2 ? 1 : 0)} FG`]); addStat(k, { fg: sc.fg }); }
  return out.map(([p, line]) => ({ id: p.id, name: p.name, pos: p.pos, line }));
}
function addStat(p, o) {
  const key = S.season; const st = p.stats[key] = p.stats[key] || { gp: 0 };
  for (const k in o) st[k] = (st[k] || 0) + o[k];
}
function injuries(abbr) {
  for (const p of E.roster(abbr)) {
    if (p.inj) continue;
    if (rnd() < 0.011) { p.inj = rnd() < 0.7 ? ri(1, 3) : ri(4, 10); if (abbr === S.userTeam && p.ovr >= 70) log(`${p.pos} ${p.name} injured — out ~${p.inj} wk${p.inj > 1 ? 's' : ''}.`, 'bad'); }
  }
}
function healWeek() { for (const p of Object.values(S.players)) if (p.inj) p.inj--; }

E.winProb = function (g) {
  const ra = E.teamRatings(g.a), rh = E.teamRatings(g.h);
  const diff = expectedPts(rh, ra, true) - expectedPts(ra, rh, false);
  return 1 / (1 + Math.exp(-diff / 7.5)); // home win prob
};

// Play one week: the user's game plus every other game that week.
E.playWeek = function () {
  if (S.phase !== 'regular') return null;
  const games = S.schedule.filter(g => g.w === S.week && g.as == null);
  let mine = null;
  for (const g of games) { simGame(g); if (g.a === S.userTeam || g.h === S.userTeam) mine = g; }
  for (const abbr in S.teams) for (const p of E.roster(abbr)) if (!p.inj && S.schedule.some(g => g.w === S.week && (g.a === abbr || g.h === abbr))) { const st = p.stats[S.season] = p.stats[S.season] || { gp: 0 }; st.gp++; }
  healWeek();
  scoutWeek();
  if (mine) {
    const us = mine.a === S.userTeam ? mine.as : mine.hs, them = mine.a === S.userTeam ? mine.hs : mine.as, opp = mine.a === S.userTeam ? mine.h : mine.a;
    log(`Week ${S.week}: ${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them} ${mine.a === S.userTeam ? '@' : 'vs'} ${opp}${mine.ot ? ' (OT)' : ''}`, us > them ? 'good' : us < them ? 'bad' : '');
  } else log(`Week ${S.week}: bye week.`);
  S.lastGame = mine ? { w: S.week, gid: S.schedule.indexOf(mine) } : null;
  const maxW = Math.max(...S.schedule.map(g => g.w));
  const result = { game: mine, week: S.week };
  if (S.week >= maxW) startPlayoffs(); else S.week++;
  return result;
};

// ---------- standings ----------
E.pct = T => (T.w + T.t * 0.5) / Math.max(1, T.w + T.l + T.t);
function sortTeams(list) {
  return list.sort((a, b) => E.pct(b) - E.pct(a) || (b.dw - b.dl) - (a.dw - a.dl) || (b.cw - b.cl) - (a.cw - a.cl) || (b.pf - b.pa) - (a.pf - a.pa) || hash(a.abbr + S.season) - hash(b.abbr + S.season));
}
E.sortTeams = sortTeams;
E.divisions = function () {
  const out = {};
  for (const t of Object.values(S.teams)) (out[`${t.conf} ${t.div}`] = out[`${t.conf} ${t.div}`] || []).push(t);
  for (const k in out) sortTeams(out[k]);
  return out;
};
E.seeds = function (conf) {
  const divs = E.divisions();
  const winners = sortTeams(Object.keys(divs).filter(k => k.startsWith(conf)).map(k => divs[k][0]));
  const rest = sortTeams(Object.values(S.teams).filter(t => t.conf === conf && !winners.includes(t)));
  return [...winners, ...rest].map(t => t.abbr);
};

// ---------- playoffs ----------
function startPlayoffs() {
  S.phase = 'playoffs';
  const seeds = { AFC: E.seeds('AFC').slice(0, 7), NFC: E.seeds('NFC').slice(0, 7) };
  S.playoffs = { seeds, round: 0, games: [], champ: null, elim: {} };
  setupRound();
  const inn = seeds.AFC.includes(S.userTeam) || seeds.NFC.includes(S.userTeam);
  log(inn ? `You clinched a playoff spot! The postseason begins.` : `Regular season over. You missed the playoffs.`, inn ? 'good' : 'bad');
}
const ROUNDS = ['Wild Card', 'Divisional', 'Conference', 'Championship'];
E.ROUNDS = ROUNDS;
function setupRound() {
  const P = S.playoffs, r = P.round, games = [];
  if (r < 3) {
    for (const conf of ['AFC', 'NFC']) {
      const alive = P.seeds[conf].filter(t => !P.elim[t]);
      let pairs = [];
      if (r === 0) pairs = [[1, 6], [2, 5], [3, 4]].map(([x, y]) => [P.seeds[conf][x], P.seeds[conf][y]]);
      else { const ord = alive.sort((x, y) => P.seeds[conf].indexOf(x) - P.seeds[conf].indexOf(y)); for (let i = 0; i < ord.length / 2; i++) pairs.push([ord[i], ord[ord.length - 1 - i]]); }
      for (const [h, a] of pairs) games.push({ round: r, conf, h, a, as: null, hs: null });
    }
  } else {
    const a = P.seeds.AFC.find(t => !P.elim[t]), n = P.seeds.NFC.find(t => !P.elim[t]);
    games.push({ round: 3, conf: 'NFL', h: a, a: n, as: null, hs: null, neutral: true });
  }
  P.games.push(...games);
}
E.playPlayoffRound = function () {
  const P = S.playoffs; if (!P || P.champ) return;
  let mine = null;
  for (const g of P.games.filter(g => g.round === P.round && g.as == null)) {
    simGame(g, false);
    if (g.as === g.hs) { g.hs += 3; g.ot = true; if (g.ev) g.ev.push({ s: 'h', q: 4, p: 3, t: 'FG', r: 0 }); }
    const loser = g.as > g.hs ? g.h : g.a; P.elim[loser] = P.round + 1;
    if (g.a === S.userTeam || g.h === S.userTeam) mine = g;
  }
  healWeek(); scoutWeek();
  if (mine) {
    const won = (mine.h === S.userTeam ? mine.hs > mine.as : mine.as > mine.hs);
    log(`${ROUNDS[P.round]}: ${won ? 'WON' : 'LOST'} ${mine.h === S.userTeam ? mine.hs : mine.as}-${mine.h === S.userTeam ? mine.as : mine.hs} vs ${mine.h === S.userTeam ? mine.a : mine.h}`, won ? 'good' : 'bad');
  }
  if (P.round === 3) {
    const g = P.games[P.games.length - 1]; P.champ = g.as > g.hs ? g.a : g.h;
    log(`${tname(P.champ)} win the championship!`, P.champ === S.userTeam ? 'big' : '');
    const T = S.teams[S.userTeam];
    S.history.push({ season: S.season, w: T.w, l: T.l, t: T.t, champ: P.champ, result: P.champ === S.userTeam ? 'Champions' : P.elim[S.userTeam] ? `Lost ${ROUNDS[P.elim[S.userTeam] - 1]}` : 'Missed playoffs' });
  } else { P.round++; setupRound(); }
  return mine;
};
E.userInPlayoffs = () => S.playoffs && [...S.playoffs.seeds.AFC, ...S.playoffs.seeds.NFC].includes(S.userTeam) && !S.playoffs.elim[S.userTeam];

// ---------- offseason: progression, contracts, re-signing ----------
E.startOffseason = function () {
  // draft order from final standings before anything resets
  S.draftOrder = draftOrder();
  // progression & aging
  for (const p of Object.values(S.players)) {
    if (p.team === 'RET') continue;
    p.age++; p.exp++; p.inj = 0;
    const g = p.pot - p.ovr, a = p.age;
    let d;
    if (a <= 24) d = Math.round(g * (0.2 + rnd() * 0.35)) + ri(-1, 1);
    else if (a <= 27) d = Math.round(g * (0.2 + rnd() * 0.3)) + ri(-1, 2);
    else if (a <= 30) d = ri(-3, 1);
    else if (a <= 32) d = ri(-5, 0);
    else d = ri(-8, -1);
    p.prev = p.ovr; p.ovr = clamp(p.ovr + d, 35, 99);
    if (a >= 28) p.pot = p.ovr; else p.pot = clamp(Math.max(p.pot + ri(-2, 1), p.ovr), 40, 99);
    p.yl--;
  }
  // retirements
  for (const p of Object.values(S.players)) {
    if (p.team === 'RET') continue;
    const r = p.age >= 37 ? 0.7 : p.age >= 35 ? 0.35 : p.age >= 33 && p.ovr < 72 ? 0.25 : 0;
    if (rnd() < r) { if (p.team === S.userTeam) log(`${p.pos} ${p.name} retired.`); p.team = 'RET'; }
  }
  S.dead = {};
  S.phase = 'resign';
  for (const t of Object.values(S.teams)) Object.assign(t, { w: 0, l: 0, t: 0, pf: 0, pa: 0, dw: 0, dl: 0, cw: 0, cl: 0, streak: '' });
  // who wants to test the market (decided now so the user sees it)
  for (const p of Object.values(S.players)) if (p.yl <= 0 && p.team !== 'RET' && p.team !== 'FA') {
    p.ask = E.marketValue(p); p.askY = E.askYears(p);
    const testChance = p.ovr >= 80 ? 0.3 : p.ovr >= 70 ? 0.22 : 0.12;
    p.testFA = rnd() < testChance;
  }
  log(`The ${S.season} season is over. Contracts expire — decide who to re-sign before free agency.`, 'big');
};
E.expiring = abbr => E.roster(abbr).filter(p => p.yl <= 0);
E.resign = function (id) {
  const p = S.players[id]; if (!p || p.testFA) return 'He wants to test free agency.';
  const cost = +(p.ask * 1.0).toFixed(2);
  if (E.capSpace(p.team) < cost) return 'Not enough cap space.';
  p.sal = cost; p.yl = p.askY; delete p.testFA; delete p.ask; delete p.askY;
  log(`Re-signed ${p.pos} ${p.name}: ${p.yl} yr, $${cost.toFixed(1)}M/yr.`, 'good');
  return null;
};
E.startFreeAgency = function () {
  // AI teams re-sign some of their own
  for (const p of Object.values(S.players)) {
    if (p.yl > 0 || p.team === 'RET' || p.team === 'FA') continue;
    if (p.team !== S.userTeam && !p.testFA) {
      const keep = p.ovr >= 78 ? 0.75 : p.ovr >= 68 ? 0.5 : 0.25;
      if (rnd() < keep && E.capSpace(p.team) > p.ask) { p.sal = p.ask; p.yl = p.askY; delete p.ask; delete p.askY; continue; }
    }
    p.prevTeam = p.team; p.team = 'FA'; p.ask = E.marketValue(p); p.askY = E.askYears(p);
    p.decide = p.ovr >= 82 ? ri(2, 5) : p.ovr >= 72 ? ri(3, 10) : ri(6, 18);
    delete p.testFA;
  }
  S.phase = 'freeagency'; S.faDay = 1; S.fa = { offers: {} };
  const n = Object.values(S.players).filter(p => p.team === 'FA').length;
  log(`Free agency is open: ${n} players are on the market. The window runs 3 weeks (21 days).`, 'big');
};

// ---------- free agency ----------
E.freeAgents = () => Object.values(S.players).filter(p => p.team === 'FA');
E.makeOffer = function (id, years, amt) {
  const p = S.players[id]; if (!p || p.team !== 'FA') return 'Player is not a free agent.';
  amt = +amt; years = clamp(+years, 1, 5);
  if (amt < MIN_SAL) return `Minimum salary is $${MIN_SAL}M.`;
  const committed = E.pendingOffers(S.userTeam).filter(o => o.id !== id).reduce((s, o) => s + o.amt, 0);
  if (E.capSpace(S.userTeam) - committed < amt) return 'Not enough cap space (including your other pending offers).';
  const L = S.fa.offers[id] = (S.fa.offers[id] || []).filter(o => o.team !== S.userTeam);
  L.push({ team: S.userTeam, years, amt, day: S.faDay });
  if (S.phase !== 'freeagency') return resolveFA(p, true) ? null : `${p.name} turned you down. He wants about $${p.ask.toFixed(1)}M/yr.`;
  return null;
};
E.withdrawOffer = id => { if (S.fa.offers[id]) S.fa.offers[id] = S.fa.offers[id].filter(o => o.team !== S.userTeam); };
E.pendingOffers = abbr => Object.entries(S.fa.offers).flatMap(([id, L]) => L.filter(o => o.team === abbr).map(o => ({ id, ...o }))).filter(o => S.players[o.id] && S.players[o.id].team === 'FA');
E.interest = function (p, team) {
  // how attractive a team is beyond money: contender + playing time
  const T = S.teams[team], r = E.teamRatings(team);
  const starters = r.by[p.pos].slice(0, STARTERS[p.pos]); const would = starters.length < STARTERS[p.pos] || starters.some(s => s.ovr < p.ovr);
  return 1 + (r.ovr - 74) * 0.008 + (would ? 0.08 : -0.05);
};
E.offerScore = (p, o) => (o.amt / p.ask) * E.interest(p, o.team) * (1 + (o.years - p.askY) * (p.age >= 30 ? 0.04 : -0.01));
function resolveFA(p, instant) {
  const L = S.fa.offers[p.id] || []; if (!L.length) return false;
  const best = L.map(o => ({ o, s: E.offerScore(p, o) })).sort((a, b) => b.s - a.s)[0];
  const need = instant ? 0.97 : (S.faDay >= 15 ? 0.85 : 0.95);
  if (best.s < need) return false;
  if (E.capSpace(best.o.team) < best.o.amt) return false;
  p.team = best.o.team; p.sal = +best.o.amt.toFixed(2); p.yl = best.o.years; p.inj = 0;
  delete p.ask; delete p.askY; delete p.decide; delete S.fa.offers[p.id];
  const big = p.ovr >= 78;
  if (p.team === S.userTeam) log(`SIGNED: ${p.pos} ${p.name} (${p.ovr} OVR) — ${p.yl} yr, $${p.sal.toFixed(1)}M/yr.`, 'good');
  else if (L.some(o => o.team === S.userTeam)) log(`${p.name} chose the ${tname(p.team)} over your offer (${p.yl} yr, $${p.sal.toFixed(1)}M/yr).`, 'bad');
  else if (big) log(`${p.pos} ${p.name} (${p.ovr}) signs with ${p.team}: ${p.yl} yr, $${p.sal.toFixed(1)}M/yr.`);
  return true;
}
function aiFAOffers() {
  const fas = E.freeAgents().sort((a, b) => b.ovr - a.ovr);
  for (const abbr of shuffle(Object.keys(S.teams))) {
    if (abbr === S.userTeam) continue;
    const by = E.depth(abbr); let space = E.capSpace(abbr) - E.pendingOffers(abbr).reduce((s, o) => s + o.amt, 0);
    if (E.roster(abbr).length >= 75) continue;
    let made = 0;
    for (const p of fas) {
      if (made >= 2) break;
      const have = by[p.pos].length, starterMin = by[p.pos].slice(0, STARTERS[p.pos]).reduce((m, x) => Math.min(m, x.ovr), 99);
      const needy = have < DEPTH_NEED[p.pos] || p.ovr > starterMin + 2;
      if (!needy || (S.fa.offers[p.id] || []).some(o => o.team === abbr)) continue;
      if (rnd() < 0.55) continue;
      const amt = +(p.ask * (0.88 + rnd() * 0.25)).toFixed(2);
      if (amt > space - 4) continue;
      (S.fa.offers[p.id] = S.fa.offers[p.id] || []).push({ team: abbr, years: clamp(p.askY + ri(-1, 1), 1, 5), amt, day: S.faDay });
      space -= amt; made++;
    }
  }
}
E.advanceFADay = function () {
  if (S.phase !== 'freeagency') return;
  aiFAOffers();
  for (const p of E.freeAgents()) {
    if (S.faDay >= p.decide) resolveFA(p, false);
    if (S.faDay > 5 && p.team === 'FA') p.ask = +Math.max(MIN_SAL, p.ask * 0.97).toFixed(2);
  }
  if (S.faDay % 7 === 0) scoutWeek();
  S.faDay++;
  if (S.faDay > 21) { S.faDay = 21; startDraft(); }
};

// ---------- scouting ----------
const FIRST = ['Jalen','Marcus','Tyrese','Caleb','Devin','Jordan','Malik','Isaiah','Darius','Trey','Cameron','Xavier','Brandon','Kendrick','Elijah','Jaylen','Andre','Quentin','Mason','Tyler','Bryce','Corey','Dante','Gavin','Hunter','Jamal','Keon','Logan','Micah','Nolan','Omar','Reggie','Silas','Tavion','Wyatt','Zion','Aiden','Blake','Colby','Desmond','Emeka','Felix','Grant','Harold','Ivan','Jace','Kobe','Landon','Miles','Nate','Owen','Preston','Roman','Shane','Theo','Uriah','Vince','Wes','Yusuf','Ashton','Beau','Cyrus','Dorian','Ezra','Finn','Gideon','Jett','Kai','Luca','Marquise','Naz','Rashad','Sterling','Tobias','Abram','Brody','Cade','Dawson','Easton','Ford'];
const LAST = ['Adams','Banks','Carter','Dawson','Ellis','Foster','Graves','Hayes','Irving','Jennings','Knox','Lawson','Mercer','Nash','Okafor','Pryor','Quarles','Reeves','Sutton','Tate','Underwood','Vance','Whitaker','Young','Zeller','Abbott','Bishop','Coleman','Drummond','Easley','Fontenot','Gaines','Holloway','Ingram','Jefferies','Kimbrough','Langford','Monroe','Norwood','Oliver','Pettaway','Ransom','Sheppard','Thibodeaux','Upshaw','Vickers','Wingate','Yarbrough','Alston','Boateng','Calloway','Dupree','Etheridge','Fairley','Gentry','Hightower','Jamison','Kirkland','Lockett','Maddox','Nwosu','Osei','Presley','Redmond','Stallworth','Truitt','Varner','Whitfield','Albright','Bridgewater','Crenshaw','Delacroix','Forsythe','Granger','Hollins','Kingsley','Lattimore','McCray','Pendleton','Rutledge'];
const COLLEGES = ['Alabama','Georgia','Ohio State','Michigan','LSU','Texas','Oregon','Clemson','Notre Dame','Penn State','USC','Florida','Florida State','Miami','Tennessee','Oklahoma','Texas A&M','Auburn','Wisconsin','Iowa','Utah','Washington','Ole Miss','Missouri','Kansas State','TCU','Baylor','Arizona State','Colorado','South Carolina','Kentucky','Arkansas','NC State','Louisville','Pittsburgh','Boise State','Iowa State','Minnesota','UCLA','Stanford','Virginia Tech','Duke','Houston','Tulane','Memphis','Toledo','App State','North Dakota State','Oregon State','West Virginia'];
const PROS_POS = [['QB',14],['RB',22],['WR',42],['TE',18],['OT',26],['IOL',30],['EDGE',32],['DT',28],['LB',28],['CB',38],['S',24],['K',4],['P',4],['LS',2]];
const SIZE = { QB:[75,220],RB:[70,210],WR:[72,195],TE:[77,250],OT:[78,315],IOL:[76,310],EDGE:[76,255],DT:[75,305],LB:[74,235],CB:[71,190],S:[72,205],K:[72,195],P:[74,210],LS:[74,240] };
const FORTY = { QB:4.75,RB:4.5,WR:4.45,TE:4.7,OT:5.15,IOL:5.2,EDGE:4.7,DT:4.95,LB:4.62,CB:4.45,S:4.52,K:4.9,P:4.95,LS:4.95 };
function realProspects(year) {
  const R = window.DRAFT_2027; if (year !== 2027 || !R) return [];
  return R.prospects.map(([name, pos, col, avg]) => {
    const r = Math.max(1, avg);
    const ovr = clamp(Math.round(73 - (r - 1) * 0.13 + gauss() * 3.5), 52, 79);
    const pot = clamp(Math.round(93 - (r - 1) * 0.15 + gauss() * 4), ovr + 5, 97);
    const [h0, w0] = SIZE[pos]; const athl = clamp(Math.round(ovr + 8 + gauss() * 8), 40, 99);
    return { id: 'P' + year + '_' + (S.nextId++), name, pos, age: ri(20, 22), col, ht: h0 + ri(-2, 2), wt: w0 + ri(-12, 12), ovr, pot,
      forty: +(FORTY[pos] + (70 - athl) * 0.006 + gauss() * 0.03).toFixed(2), sp: 0, lvl: 0, u: rnd(), u2: rnd(), year, real: true, board: avg };
  });
}
function genProspects(year) {
  const real = realProspects(year);
  const pool = [];
  for (const [pos, n] of PROS_POS) for (let i = 0; i < n; i++) pool.push(pos);
  // when a real class is loaded, generated players fill the later rounds
  if (real.length) { const cnt = {}; real.forEach(p => cnt[p.pos] = (cnt[p.pos] || 0) + 1); for (const pos in cnt) for (let i = 0; i < cnt[pos] && pool.includes(pos); i++) pool.splice(pool.indexOf(pos), 1); }
  const L = pool.map(pos => {
    const tier = real.length ? rnd() * 0.88 : rnd();
    let ovr = tier > 0.97 ? ri(68, 76) : tier > 0.88 ? ri(60, 70) : tier > 0.6 ? ri(52, 63) : ri(42, 56);
    let pot = clamp(ovr + ri(4, 26) + (tier > 0.97 ? 8 : 0), 50, 99);
    if (pos === 'K' || pos === 'P' || pos === 'LS') { ovr = ri(55, 75); pot = ovr + ri(0, 10); }
    const [h0, w0] = SIZE[pos];
    const athl = clamp(Math.round(ovr + gauss() * 10), 30, 99);
    const id = 'P' + year + '_' + (S.nextId++);
    return { id, name: pick(FIRST) + ' ' + pick(LAST), pos, age: ri(21, 23), col: pick(COLLEGES), ht: h0 + ri(-2, 2), wt: w0 + ri(-15, 15),
      ovr, pot, forty: +(FORTY[pos] + (70 - athl) * 0.006 + gauss() * 0.03).toFixed(2),
      sp: 0, lvl: 0, u: rnd(), u2: rnd(), year };
  });
  // consensus media board: true value plus noise
  L.forEach(p => p.media = p.pot * 0.6 + p.ovr * 0.4 + (POSVAL[p.pos] || .3) * 8 + gauss() * 7);
  L.sort((a, b) => b.media - a.media);
  const all = [...real.sort((a, b) => a.board - b.board), ...L];
  all.forEach((p, i) => { p.rank = i + 1; delete p.media; });
  return all;
}
E.projRound = p => p.rank <= 32 ? '1st' : p.rank <= 64 ? '2nd' : p.rank <= 100 ? '3rd' : p.rank <= 140 ? '4th' : p.rank <= 180 ? '5th' : p.rank <= 220 ? '6th-7th' : 'UDFA';
// What the user currently knows about a prospect.
E.scoutView = function (p) {
  const sk = p.sk || 3;
  if (p.lvl >= 3) return { ovr: [p.ovr, p.ovr], pot: [p.pot, p.pot], attrs: true, exact: true };
  if (p.lvl === 2) { const w = 7 - sk; return { ovr: range(p.ovr, w, p.u), pot: range(p.pot, w + 2, p.u2), attrs: true }; }
  if (p.lvl === 1) { const w = 14 - sk * 2; return { ovr: range(p.ovr, w, p.u), pot: null, attrs: false }; }
  return { ovr: null, pot: null, attrs: false };
};
function range(v, w, u) { const lo = Math.round(v - u * 2 * w); return [clamp(lo, 20, 99), clamp(lo + 2 * w, 20, 99)]; }
E.scoutLevelNames = ['Unscouted', 'Area report', 'Cross-checked', 'Fully scouted'];
function genScoutPool(initial) {
  const names = shuffle(FIRST.map(f => f + ' ' + pick(LAST)));
  S.scoutPool = [];
  for (let i = 0; i < 8; i++) {
    const skill = ri(1, 5); const spec = pick(['Offense', 'Defense', 'Any']);
    S.scoutPool.push({ id: 'S' + (S.nextId++), name: names[i], skill, spec, salary: +(0.15 + skill * 0.12 + rnd() * 0.05).toFixed(2), assign: null });
  }
  if (initial) { const s = { id: 'S' + (S.nextId++), name: names[9], skill: 2, spec: 'Any', salary: 0.4, assign: null }; S.scouts.push(s); }
}
E.SCOUT_BUDGET = 2.5; E.MAX_SCOUTS = 4;
E.scoutSpend = () => S.scouts.reduce((s, x) => s + x.salary, 0);
E.hireScout = function (id) {
  const s = S.scoutPool.find(x => x.id === id); if (!s) return 'Not found';
  if (S.scouts.length >= E.MAX_SCOUTS) return `You can employ at most ${E.MAX_SCOUTS} scouts.`;
  if (E.scoutSpend() + s.salary > E.SCOUT_BUDGET + 1e-9) return `That would put you over your $${E.SCOUT_BUDGET}M scouting budget.`;
  S.scouts.push(s); S.scoutPool = S.scoutPool.filter(x => x !== s); log(`Hired scout ${s.name} (${s.skill}★, ${s.spec}).`); return null;
};
E.fireScout = function (id) { const s = S.scouts.find(x => x.id === id); if (!s) return; S.scouts = S.scouts.filter(x => x !== s); s.assign = null; S.scoutPool.push(s); };
const OFFPOS = ['QB','RB','WR','TE','OT','IOL','K','P','LS'];
E.scoutRate = function (s, p) {
  let r = 10 + s.skill * 12;
  if (s.spec === 'Offense' && OFFPOS.includes(p.pos)) r += 12;
  if (s.spec === 'Defense' && !OFFPOS.includes(p.pos)) r += 12;
  return r;
};
E.assignScout = function (sid, pid) { const s = S.scouts.find(x => x.id === sid); if (s) s.assign = pid || null; };
function scoutWeek() {
  for (const s of S.scouts) {
    const p = S.prospects.find(x => x.id === s.assign);
    if (!p || p.lvl >= 3) { s.assign = null; continue; }
    p.sp += E.scoutRate(s, p);
    p.sk = Math.max(p.sk || 0, s.skill);
    while (p.sp >= 100 && p.lvl < 3) { p.sp -= 100; p.lvl++; }
    if (p.lvl >= 3) { p.sp = 0; log(`Scout ${s.name} finished a full report on ${p.pos} ${p.name}.`); s.assign = null; }
  }
}
E.scoutWeek = scoutWeek;

// ---------- draft ----------
function draftOrder() {
  const P = S.playoffs; const all = Object.values(S.teams);
  const non = all.filter(t => !P || (!P.seeds.AFC.includes(t.abbr) && !P.seeds.NFC.includes(t.abbr)));
  const ord = [...sortTeams([...non]).reverse()];
  if (P) {
    const po = all.filter(t => !non.includes(t));
    const elimRound = t => t.abbr === P.champ ? 6 : (P.elim[t.abbr] || 5);
    po.sort((a, b) => elimRound(a) - elimRound(b) || E.pct(a) - E.pct(b));
    ord.push(...po);
  }
  return ord.map(t => t.abbr);
}
function startDraft() {
  // late scouting: combine reveals 40 times for everyone
  S.phase = 'draft';
  const order = S.draftOrder || draftOrder();
  const picks = [];
  for (let r = 1; r <= 7; r++) order.forEach((t, i) => picks.push({ r, n: picks.length + 1, team: t, pid: null }));
  S.draft = { picks, cur: 0, year: S.season + 1 };
  for (const p of S.prospects) p.combine = true;
  log(`Free agency's main window has closed. Draft day: you pick ${picks.filter(p => p.team === S.userTeam && p.r === 1).map(p => '#' + p.n).join(', ') || '(no 1st)'} in round 1.`, 'big');
}
E.startDraft = startDraft;
E.onClock = () => S.draft && S.draft.picks[S.draft.cur];
E.available = () => S.prospects.filter(p => !p.drafted);
function aiPick(team) {
  const by = E.depth(team);
  let best = null, bs = -1e9;
  for (const p of E.available()) {
    const have = by[p.pos].length, starterMin = by[p.pos].slice(0, STARTERS[p.pos]).reduce((m, x) => Math.min(m, x.ovr), 99);
    let s = p.pot * 0.55 + p.ovr * 0.45 + (POSVAL[p.pos] || .3) * 6 + gauss() * 3.5 - p.rank * 0.04;
    if (have < DEPTH_NEED[p.pos]) s += 3; if (p.pot > starterMin) s += 2;
    if (['K','P','LS'].includes(p.pos) && S.draft.cur < 150) s -= 15;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
function rookieSalary(n) { const c = E.capFor(S.season + 1) / CAP0; return +((n <= 32 ? 11 - (n - 1) * 0.24 : n <= 64 ? 2.6 - (n - 33) * 0.02 : Math.max(1.0, 1.7 - (n - 65) * 0.004)) * c).toFixed(2); }
E.rookieSalary = rookieSalary;
E.makePick = function (pid) {
  const pk = E.onClock(); if (!pk) return 'Draft is over.';
  const p = S.prospects.find(x => x.id === pid && !x.drafted); if (!p) return 'Not available.';
  p.drafted = { team: pk.team, n: pk.n, r: pk.r }; pk.pid = p.id;
  const pl = { id: p.id, name: p.name, team: pk.team, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot, exp: 0, yl: 4, sal: rookieSalary(pk.n),
    dn: pk.n, dy: S.draft.year, ht: p.ht, wt: p.wt, col: p.col, num: '', inj: 0, stats: {}, rookie: true };
  S.players[pl.id] = pl;
  if (pk.team === S.userTeam) log(`DRAFTED: Rd ${pk.r} #${pk.n} — ${p.pos} ${p.name}, ${p.col}.`, 'good');
  else if (pk.r === 1 && pk.n <= 10) log(`#${pk.n}: ${tname(pk.team)} select ${p.pos} ${p.name} (${p.col}).`);
  S.draft.cur++;
  if (S.draft.cur >= S.draft.picks.length) finishDraft();
  return null;
};
E.simToUserPick = function (oneOnly) {
  while (S.phase === 'draft' && E.onClock() && E.onClock().team !== S.userTeam) { E.makePick(aiPick(E.onClock().team).id); if (oneOnly) break; }
};
E.autoPickUser = function () { const pk = E.onClock(); if (pk && pk.team === S.userTeam) E.makePick(aiPick(S.userTeam).id); };
function finishDraft() {
  S.phase = 'preseason';
  log('The draft is complete. Cut your roster to 53 and finish any late free-agent signings, then start the new season.', 'big');
}

// ---------- roster moves ----------
E.release = function (id) {
  const p = S.players[id]; if (!p || p.team !== S.userTeam) return;
  const dead = +(p.rookie && p.dn && p.dn <= 64 ? p.sal * 0.8 : p.sal * 0.4).toFixed(2);
  S.dead[p.team] = (S.dead[p.team] || 0) + dead;
  log(`Released ${p.pos} ${p.name} ($${dead.toFixed(1)}M dead cap).`);
  p.prevTeam = p.team; p.team = 'FA'; p.ask = E.marketValue(p); p.askY = E.askYears(p); p.decide = 0; p.yl = 0;
};
E.releaseCost = p => +(p.rookie && p.dn && p.dn <= 64 ? p.sal * 0.8 : p.sal * 0.4).toFixed(2);
function aiCutdown(abbr) {
  const L = E.roster(abbr);
  if (L.length <= ROSTER_MAX) return;
  const by = E.depth(abbr); const keep = new Set();
  for (const pos of POS) by[pos].slice(0, Math.min(DEPTH_NEED[pos], by[pos].length)).forEach(p => keep.add(p.id));
  const rest = L.filter(p => !keep.has(p.id)).sort((a, b) => (b.ovr + (b.pot - b.ovr) * 0.4) - (a.ovr + (a.pot - a.ovr) * 0.4));
  const spots = ROSTER_MAX - keep.size;
  rest.slice(Math.max(0, spots)).forEach(p => { p.team = 'FA'; p.ask = E.marketValue(p); p.askY = 1; p.yl = 0; });
  // if still over (keep set too big), cut lowest overall
  const L2 = E.roster(abbr).sort((a, b) => a.ovr - b.ovr);
  while (L2.length > ROSTER_MAX) { const p = L2.shift(); p.team = 'FA'; p.ask = E.marketValue(p); p.askY = 1; p.yl = 0; }
}
E.autoCutUser = function () {
  const n = E.roster(S.userTeam).length - ROSTER_MAX; if (n <= 0) return [];
  const by = E.depth(S.userTeam); const keep = new Set();
  for (const pos of POS) by[pos].slice(0, Math.min(DEPTH_NEED[pos], by[pos].length)).forEach(p => keep.add(p.id));
  const cands = E.roster(S.userTeam).filter(p => !keep.has(p.id)).sort((a, b) => (a.ovr + (a.pot - a.ovr) * 0.4) - (b.ovr + (b.pot - b.ovr) * 0.4));
  const cut = cands.slice(0, n); cut.forEach(p => E.release(p.id)); return cut;
};

// ---------- new season ----------
E.startSeason = function () {
  if (E.roster(S.userTeam).length > ROSTER_MAX) return `Your roster has ${E.roster(S.userTeam).length} players. Cut down to ${ROSTER_MAX} first.`;
  if (E.capSpace(S.userTeam) < 0) return 'You are over the salary cap. Release or trade players first.';
  for (const abbr in S.teams) if (abbr !== S.userTeam) { aiCutdown(abbr); aiFillRoster(abbr); aiCapFix(abbr); }
  // leftover expiring with no team stay FA; rookies lose flag after 1st year handled by exp
  for (const p of Object.values(S.players)) { if (p.team === 'FA') p.decide = 0; delete p.prev; }
  // drop undrafted prospects into UDFA pool (best ones), discard the rest
  for (const p of S.prospects.filter(x => !x.drafted).sort((a, b) => b.pot - a.pot).slice(0, 40)) {
    S.players[p.id] = { id: p.id, name: p.name, team: 'FA', pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot, exp: 0, yl: 0, sal: MIN_SAL, dn: 0, dy: S.season + 1, ht: p.ht, wt: p.wt, col: p.col, num: '', inj: 0, stats: {}, ask: MIN_SAL, askY: 2, decide: 0 };
  }
  // prune old free agents to keep saves small
  const fas = E.freeAgents().sort((a, b) => b.ovr - a.ovr); fas.slice(250).forEach(p => delete S.players[p.id]);
  for (const id in S.players) if (S.players[id].team === 'RET') delete S.players[id];
  S.season++; S.week = 1; S.phase = 'regular'; S.playoffs = null; S.lastGame = null; S.draft = null; S.fa = { offers: {} };
  S.schedule = genSchedule();
  S.prospects = genProspects(S.season + 1);
  for (const s of S.scouts) s.assign = null;
  genScoutPool(false);
  log(`The ${S.season} season begins. A new draft class (${S.season + 1}) is ready to scout.`, 'big');
  return null;
};
function aiFillRoster(abbr) {
  const by = E.depth(abbr);
  for (const pos of POS) {
    while (by[pos].length < DEPTH_NEED[pos] && E.roster(abbr).length < ROSTER_MAX) {
      const fa = E.freeAgents().filter(p => p.pos === pos).sort((a, b) => b.ovr - a.ovr)[0];
      if (!fa) break;
      fa.team = abbr; fa.sal = Math.min(fa.ask || MIN_SAL, Math.max(MIN_SAL, E.capSpace(abbr) * 0.5)); fa.yl = 1; delete fa.ask; delete fa.askY;
      by[pos].push(fa);
    }
  }
}
function aiCapFix(abbr) {
  let guard = 0;
  while (E.capSpace(abbr) < 0 && guard++ < 30) {
    const p = E.roster(abbr).filter(x => x.sal > 3).sort((a, b) => (a.ovr / a.sal) - (b.ovr / b.sal))[0];
    if (!p) break; p.sal = +(p.sal * 0.7).toFixed(2); // "restructure"
  }
}
function genSchedule() {
  const yr = S.season;
  const T = window.TEAMS.map(t => t.abbr);
  const divs = {}; for (const t of window.TEAMS) (divs[t.conf] = divs[t.conf] || {}, divs[t.conf][t.div] = divs[t.conf][t.div] || []).push(t.abbr);
  const DN = ['East', 'North', 'South', 'West'];
  // last-season division finish
  const finish = {}; const D = E.divisions(); for (const k in D) D[k].forEach((t, i) => finish[t.abbr] = i);
  for (const c in divs) for (const d in divs[c]) divs[c][d].sort((a, b) => finish[a] - finish[b]);
  const games = []; const add = (a, b) => games.push(rnd() < 0.5 ? [a, b] : [b, a]);
  const pairsets = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  const pset = pairsets[yr % 3];
  for (const c of ['AFC', 'NFC']) {
    for (const d of DN) { const L = divs[c][d]; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { games.push([L[i], L[j]]); games.push([L[j], L[i]]); } }
    for (const [x, y] of pset) { const A = divs[c][DN[x]], B = divs[c][DN[y]]; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) games.push((i + j) % 2 ? [A[i], B[j]] : [B[j], A[i]]); }
    // same-place vs the two other intra-conf divisions
    for (let x = 0; x < 4; x++) {
      const partner = pset.find(p => p.includes(x)); const others = [0, 1, 2, 3].filter(y => y !== x && !partner.includes(y));
      for (const y of others) if (x < y) for (let i = 0; i < 4; i++) add(divs[c][DN[x]][i], divs[c][DN[y]][i]);
    }
  }
  for (let x = 0; x < 4; x++) {
    const A = divs.AFC[DN[x]], B = divs.NFC[DN[(x + yr) % 4]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) games.push((i + j) % 2 ? [A[i], B[j]] : [B[j], A[i]]);
    const B2 = divs.NFC[DN[(x + yr + 1) % 4]];
    for (let i = 0; i < 4; i++) add(A[i], B2[i]);
  }
  // assign to 18 weeks: every team gets one bye between weeks 5 and 14
  for (let attempt = 0; attempt < 3000; attempt++) {
    const byeWeek = {}; shuffle(T.slice()).forEach((t, i) => byeWeek[t] = 5 + (i % 8) + (i >= 16 && i % 8 >= 6 ? 2 : 0));
    // pair bye teams so counts are even in each week
    const rem = shuffle(games.map(g => g.slice())); const out = []; let ok = true;
    for (let w = 1; w <= 18 && ok; w++) {
      const playing = T.filter(t => byeWeek[t] !== w); if (playing.length % 2) { ok = false; break; }
      const busy = new Set();
      // greedy with most-constrained team first
      for (let guard = 0; guard < 40 && busy.size < playing.length; guard++) {
        const free = playing.filter(t => !busy.has(t));
        const opts = t => rem.filter(g => (g[0] === t || g[1] === t) && !busy.has(g[0]) && !busy.has(g[1]) && byeWeek[g[0]] !== w && byeWeek[g[1]] !== w);
        free.sort((x, y) => opts(x).length - opts(y).length);
        const t = free[0], o = opts(t); if (!o.length) { ok = false; break; }
        const g = o[Math.floor(rnd() * o.length)]; rem.splice(rem.indexOf(g), 1);
        busy.add(g[0]); busy.add(g[1]); out.push({ w, a: g[0], h: g[1], as: null, hs: null });
      }
      if (busy.size < playing.length) ok = false;
    }
    if (ok && !rem.length) return out;
  }
  // fallback: allow any arrangement
  const out = []; const rem = games.slice(); let w = 1;
  while (rem.length) { const busy = new Set(); for (let i = 0; i < rem.length; i++) { const [a, h] = rem[i]; if (busy.has(a) || busy.has(h)) continue; busy.add(a); busy.add(h); out.push({ w, a, h, as: null, hs: null }); rem.splice(i, 1); i--; } w++; }
  return out;
}
E.genSchedule = genSchedule;

// ---------- persistence ----------
const KEY = 'gridiron_gm_save_v1';
E.save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { return false; } };
E.load = function () { try { const s = localStorage.getItem(KEY); if (s) { S = JSON.parse(s); return S; } } catch (e) {} return null; };
E.clearSave = function () { try { localStorage.removeItem(KEY); } catch (e) {} };

window.GM = E;
})();
