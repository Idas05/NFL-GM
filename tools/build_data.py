import csv, json, hashlib, collections, sys, datetime
D = sys.argv[1]; OUT = sys.argv[2]
def h(s, salt=''):
    return int(hashlib.md5((s+salt).encode()).hexdigest()[:8], 16) / 0xffffffff

wk = list(csv.DictReader(open(f'{D}/roster_weekly_2026.csv')))
mx = collections.defaultdict(int)
for x in wk: mx[x['team']] = max(mx[x['team']], int(x['week']))
roster = [x for x in wk if int(x['week']) == mx[x['team']] and x['status'] in ('ACT', 'RES', 'INA')]
asof_week = max(mx.values())

# snap shares
def snaps(path):
    teamgames = collections.defaultdict(set); pl = collections.defaultdict(list)
    for r in csv.DictReader(open(path)):
        if r['game_type'] != 'REG': continue
        teamgames[r['team']].add(r['game_id'])
        o, d, s = float(r['offense_pct'] or 0), float(r['defense_pct'] or 0), float(r['st_pct'] or 0)
        for key in (r['pfr_player_id'], 'N:' + r['player'] + '|' + r['team'], 'N:' + r['player']):
            pl[key].append((r['team'], max(o, d), s))
    out = {}
    for k, v in pl.items():
        tg = max(len(teamgames[t]) for t, _, _ in v)
        out[k] = (sum(a for _, a, _ in v) / max(tg, 1), len(v), sum(a for _, a, _ in v) / len(v), sum(s for _,_,s in v)/max(tg,1))
    return out
S26 = snaps(f'{D}/snap_counts_2026.csv'); S25 = snaps(f'{D}/snap_counts_2025.csv')

def stats(path):
    return {r['player_id']: r for r in csv.DictReader(open(path))}
ST26 = stats(f'{D}/stats_player_reg_2026.csv'); ST25 = stats(f'{D}/stats_player_reg_2025.csv')
f = lambda r, k: float(r.get(k) or 0) if r else 0.0

def mappos(x):
    p = x['depth_chart_position'] or x['position']
    m = {'QB':'QB','RB':'RB','FB':'RB','HB':'RB','WR':'WR','TE':'TE','T':'OT','OT':'OT','G':'IOL','C':'IOL','OL':'IOL',
         'DE':'EDGE','DT':'DT','NT':'DT','DL':'DT','ILB':'LB','MLB':'LB','LB':'LB','CB':'CB','DB':'CB','FS':'S','SS':'S','S':'S',
         'K':'K','P':'P','LS':'LS'}
    if p == 'OLB':
        st = [s for s in (ST26.get(x['gsis_id']), ST25.get(x['gsis_id'])) if s]
        g = sum(f(s,'games') for s in st); pr = sum(f(s,'def_sacks') + 0.5*f(s,'def_qb_hits') for s in st)
        if g >= 3: return 'EDGE' if pr / g >= 0.18 else 'LB'
        return 'EDGE' if int(x['weight'] or 240) >= 245 else 'LB'
    return m.get(p, 'LB')

def prod(pos, gid):
    tot = 0; games = 0
    for wt, st in ((1.0, ST26.get(gid)), (0.7, ST25.get(gid))):
        if not st: continue
        g = f(st,'games')
        if g == 0: continue
        if pos == 'QB': v = (f(st,'passing_epa') + f(st,'rushing_epa')) / max(f(st,'attempts'),1) * 40 + f(st,'passing_cpoe')/10
        elif pos == 'RB': v = (f(st,'rushing_yards') + f(st,'receiving_yards')) / g / 20 + f(st,'rushing_epa')/g
        elif pos in ('WR','TE'): v = f(st,'receiving_yards') / g / 15 + f(st,'receiving_epa')/g/2
        elif pos in ('EDGE','DT'): v = (f(st,'def_sacks') + 0.5*f(st,'def_qb_hits') + 0.3*f(st,'def_tackles_for_loss')) / g * 2
        elif pos == 'LB': v = (f(st,'def_tackles_solo') + 0.5*f(st,'def_tackle_assists') + 2*f(st,'def_sacks') + 3*f(st,'def_interceptions')) / g / 3
        elif pos in ('CB','S'): v = (f(st,'def_pass_defended') + 2*f(st,'def_interceptions')) / g * 2 + f(st,'def_tackles_solo')/g/6
        elif pos == 'K': v = (f(st,'fg_pct') or 0.8) * 5 + f(st,'fg_made_50_59')/g
        elif pos == 'P': v = f(st,'pt_net_yards') / max(f(st,'pt_att'),1) / 10
        else: v = 0
        tot += wt * v * min(g, 17); games += wt * min(g, 17)
    return tot / games if games >= 2 else None

def bday_age(b):
    try: d = datetime.date.fromisoformat(b)
    except: return 26
    return round((datetime.date(2026, 9, 1) - d).days / 365.25, 1)

players = []
for x in roster:
    pos = mappos(x)
    keys = [x['pfr_id'], 'N:' + x['full_name'] + '|' + x['team'], 'N:' + x['full_name']]
    s26 = next((S26[k] for k in keys if k and k in S26), None); s25 = next((S25[k] for k in keys if k and k in S25), None)
    a = s26[0] if s26 else 0; b = s25[0] if s25 else 0
    if pos in ('K','P','LS'): a = s26[3] if s26 else 0; b = s25[3] if s25 else 0
    if not s26 or s26[1] < 4: snap = max(a, 0.85 * b)
    else: snap = 0.7 * a + 0.3 * max(b, a * 0.8)
    if s26 and s26[1] >= 3: snap = max(snap, s26[2] * 0.9)  # per-game share when healthy
    dn = int(x['draft_number']) if x['draft_number'] else 0
    ped = (1 - dn / 262) if dn else 0.0
    players.append(dict(id=x['gsis_id'], name=x['full_name'], team=x['team'], pos=pos, age=bday_age(x['birth_date']),
        exp=int(x['years_exp'] or 0), dn=dn, draft_year=int(x['entry_year'] or 0) if dn else 0,
        ht=int(x['height'] or 72), wt=int(x['weight'] or 220), col=(x['college'] or '').split(';')[0], num=x['jersey_number'],
        status=x['status'], snap=snap, prod=prod(pos, x['gsis_id']), ped=ped))

# percentile -> ovr curve
curve = [(0.0, 99), (0.01, 97), (0.04, 92), (0.10, 87), (0.20, 81), (0.35, 75), (0.50, 69), (0.70, 62), (0.85, 56), (1.0, 46)]
def interp(p):
    for (p0, v0), (p1, v1) in zip(curve, curve[1:]):
        if p <= p1: return v0 + (v1 - v0) * (p - p0) / (p1 - p0)
    return 46
bypos = collections.defaultdict(list)
for p in players: bypos[p['pos']].append(p)
for pos, L in bypos.items():
    pv = sorted([p['prod'] for p in L if p['prod'] is not None and p['snap'] >= 0.45])
    for p in L:
        pp = (sum(1 for v in pv if v <= p['prod']) / len(pv)) if p['prod'] is not None and pv else 0.3
        st = min(p['snap'] / 0.8, 1.0)
        e, a = p['exp'], p['age']
        vet = 0.25 if e == 0 else 0.55 if e == 1 else 0.8 if e == 2 else 1.0
        if a >= 31: vet -= 0.08 * (a - 30)
        if pos in ('K', 'P'): raw = 0.3 * min(p['snap']*4,1) + 0.6 * pp + 0.1 * vet
        elif pos == 'LS': raw = 0
        elif pos == 'IOL' or pos == 'OT':
            raw = 0.55 * st + 0.2 * p['ped'] + 0.25 * vet * st + 0.10 * h(p['id'], 'ol') * st
        else:
            raw = 0.42 * st + 0.33 * pp * st + 0.10 * p['ped'] + 0.15 * vet * st
        p['pp'] = pp
        p['raw'] = raw + 0.025 * (h(p['id'], 'r') - 0.5)
    L.sort(key=lambda p: -p['raw'])
    n = len(L)
    for i, p in enumerate(L):
        p['ovr'] = int(round(interp(i / max(n - 1, 1))))
        if pos == 'LS': p['ovr'] = 58 + int(20 * h(p['id']))
        if p['exp'] == 0 and p['pp'] < 0.9: p['ovr'] = min(p['ovr'], 82)
        elif p['exp'] == 1 and p['pp'] < 0.8: p['ovr'] = min(p['ovr'], 88)

def potential(p):
    a = p['age']; r = h(p['id'], 'pot')
    if a <= 22.5: g = 6 + 12 * r + 6 * p['ped']
    elif a <= 24.5: g = 3 + 9 * r + 4 * p['ped']
    elif a <= 26.5: g = 1 + 5 * r
    elif a <= 28.5: g = 2 * r
    else: g = 0
    return min(99, int(round(p['ovr'] + g)))

POSVAL = {'QB': 1.0, 'EDGE': .62, 'OT': .55, 'WR': .58, 'CB': .5, 'DT': .5, 'IOL': .4, 'S': .38, 'LB': .36, 'TE': .36, 'RB': .3, 'K': .1, 'P': .08, 'LS': .03}
MIN = 0.885  # $M min salary-ish
def rookie_scale(dn):
    if dn <= 32: return 11.0 - (dn - 1) * 0.24
    if dn <= 64: return 2.6 - (dn - 33) * 0.02
    return max(1.0, 1.7 - (dn - 65) * 0.004)
def vet_salary(p):
    o = p['ovr']; v = POSVAL[p['pos']]
    if o < 62: return MIN + 0.4 * h(p['id'], 's')
    top = 55 * v  # top-of-market $M at position
    s = MIN + (top - MIN) * ((o - 60) / 39) ** 2.3
    return max(MIN, s * (0.8 + 0.4 * h(p['id'], 's')))

out = []
for p in players:
    pot = potential(p)
    rookie_deal = p['draft_year'] >= 2023 and p['dn'] > 0
    if rookie_deal:
        yl = p['draft_year'] + 4 - 2026; sal = rookie_scale(p['dn'])
    elif p['exp'] <= 2 and not p['dn']:
        yl = max(1, 3 - p['exp']); sal = MIN + 0.1 * p['exp']
    else:
        r = h(p['id'], 'y')
        if p['age'] >= 32: yl = 1 + (r > 0.6)
        elif p['ovr'] >= 80: yl = 1 + int(r * 4.5)
        else: yl = 1 + int(r * 3)
        sal = vet_salary(p)
    out.append([p['id'], p['name'], p['team'], p['pos'], p['age'], p['ovr'], pot, p['exp'], max(1, yl), round(sal, 2),
                p['dn'], p['draft_year'], p['ht'], p['wt'], p['col'], p['num'], 1 if p['status'] == 'RES' else 0])

# scale team payrolls into a realistic band (approx 85-97% of $301.2M cap)
CAP = 301.2
team = collections.defaultdict(list)
for r in out: team[r[2]].append(r)
for t, L in team.items():
    tot = sum(r[9] for r in L); target = CAP * (0.86 + 0.1 * h(t, 'cap'))
    k = target / tot
    for r in L:
        if r[9] > 1.2: r[9] = round(max(MIN, r[9] * k), 2)

# schedule
games = [x for x in csv.DictReader(open(f'{D}/games.csv')) if x['season'] == '2026' and x['game_type'] == 'REG']
sched = [[int(g['week']), g['away_team'], g['home_team'], int(g['away_score']) if g['away_score'] else None, int(g['home_score']) if g['home_score'] else None] for g in games]
played_through = max(w for w, a, h_, s1, s2 in sched if s1 is not None)

meta = dict(source='nflverse-data (rosters_weekly_2026, snap_counts 2025-26, stats_player_reg 2025-26, schedules)',
            roster_week=asof_week, played_through=played_through, built=str(datetime.date.today()), cap=CAP)
cols = ['id','name','team','pos','age','ovr','pot','exp','yl','sal','dn','dy','ht','wt','col','num','ir']
open(OUT, 'w').write('window.NFL_DATA=' + json.dumps(dict(meta=meta, cols=cols, players=out, schedule=sched), separators=(',', ':')) + ';')
print(len(out), 'players', 'played through wk', played_through, 'roster wk', asof_week)
for t in sorted(team): 
    continue
    L = sorted(team[t], key=lambda r: -r[5]); print(t, len(L), round(sum(r[9] for r in L)), [ (r[1], r[3], r[5]) for r in L[:3]])


    L=sorted([r for r in out if r[3]==pos],key=lambda r:-r[5])[:12]
    print(pos,[(r[1],r[5],r[6]) for r in L])
