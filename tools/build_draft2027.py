# Merge public 2027 big boards into a consensus list -> js/draft2027.js
import csv, json, re, sys, os
D = os.path.join(os.path.dirname(__file__), 'draft2027')
boards = {'Athlon Sports (Sep 30, 2026)': 'athlon_2026-09-30.csv', 'NFL Draft Countdown (Nov 16, 2026)': 'draftcountdown_2026-11-16.csv'}
POS = {'EDGE':'EDGE','Edge':'EDGE','DL':'DT','OL':'IOL','IOL':'IOL','OT':'OT','WR':'WR','QB':'QB','RB':'RB','TE':'TE','LB':'LB','CB':'CB','S':'S'}
SCHOOL = {'Miami (FL)':'Miami'}
ALIAS = {'tae johnson':'brauntae johnson', 'tavion gadsen':'tavion gadson'}
def key(n):
    n = re.sub(r"[.'’]", '', n.lower()); n = re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', n); n = ' '.join(n.split())
    return ALIAS.get(n, n)
P = {}
for src, f in boards.items():
    for r, name, pos, school in csv.reader(open(os.path.join(D, f))):
        k = key(name); e = P.setdefault(k, {'name': name, 'pos': POS[pos], 'col': SCHOOL.get(school, school), 'ranks': {}})
        e['ranks'][src] = int(r)
        if pos in ('OT',) : e['pos'] = 'OT'
        if src.startswith('NFL'): e['name'] = name if len(name) >= len(e['name']) else e['name']
for e in P.values():
    rs = [e['ranks'].get(s, 120) for s in boards]
    e['avg'] = sum(rs) / len(rs)
L = sorted(P.values(), key=lambda e: e['avg'])
out = [[e['name'], e['pos'], e['col'], round(e['avg'], 1)] for e in L]
open(sys.argv[1], 'w').write('window.DRAFT_2027=' + json.dumps({'sources': list(boards), 'prospects': out}, separators=(',', ':')) + ';')
print(len(out)); print(out[:12])
