#!/usr/bin/env python3
"""Sentinel Vitals data server.

    python3 server/app.py            -> http://localhost:8000/index.html  and  /watch.html

* replays the CLEANED Kaggle smartwatch CSV one reading per request (the dashboard asks once a second)
* conditions the signal (light smoothing: the CSV rows are independent, so raw jumps are not physiology)
* scores every reading with the Hugging Face model (server/scorer.py)
* injects the 'Emergency Health Spike' / 'Warning demo' when the dashboard asks
"""
import os, sys, random, pathlib
import numpy as np, pandas as pd
from flask import Flask, jsonify, request, send_from_directory

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'server'))
from clean_data import clean
from scorer import Scorer

RAW = os.environ.get('SV_RAW_CSV', str(ROOT / 'data' / 'unclean_smartwatch_health_data.csv'))
CLEAN = ROOT / 'data' / 'clean_smartwatch.csv'
if CLEAN.exists():
    DF = pd.read_csv(CLEAN)
else:
    DF, rep = clean(RAW); DF.to_csv(CLEAN, index=False); print('cleaned', rep)

MAP = {'Sedentary': 'rest', 'Active': 'walk', 'Highly Active': 'run'}
ACT_IDX = {'rest': 6.0, 'walk': 42.0, 'run': 86.0}
POOL = {a: DF[DF.activity == k].sample(frac=1, random_state=7).to_dict('records') for k, a in MAP.items()}
SMOOTH = {'hr': 0.35, 'ox': 0.35, 'st': 0.15, 'sp': 0.06, 'sl': 0.06, 'act': 0.3}

app = Flask(__name__, static_folder=None)
scorer = Scorer()
S = {}


def reset():
    r = random.Random(11)
    S.clear(); S.update(i=0, mode='auto', act='rest', block=0, scenario='normal', ptr={a: 0 for a in POOL}, rng=r, v=None, hold=0)
    scorer.reset()


def pick():
    """Next dataset row. In auto mode the wearer stays in one activity for a while (rest-heavy day)."""
    if S['mode'] != 'auto': S['act'] = S['mode']
    elif S['block'] <= 0:
        S['act'] = S['rng'].choices(['rest', 'walk', 'run'], [0.6, 0.28, 0.12])[0]
        S['block'] = S['rng'].randint(8, 20)
    S['block'] -= 1
    pool = POOL[S['act']]
    row = pool[S['ptr'][S['act']] % len(pool)]; S['ptr'][S['act']] += 1
    return row


reset()


# Activity changes physiology. The CSV has no such link (heart rate is independent of activity level there),
# so a small, documented offset is added on top of the CSV value to make the demo behave like a body.
OFF_HR = {'rest': 0.0, 'walk': 15.0, 'run': 55.0}
OFF_OX = {'rest': 0.0, 'walk': -0.3, 'run': -0.8}
HR_MED, OX_MED, SHRINK = 75.3, 98.0, 0.5       # single rows are treated as noisy samples, pulled toward the typical level
EASE = {'hr': 0.22, 'ox': 0.18, 'st': 0.10, 'sp': 0.04, 'sl': 0.04}
RANK = {'rest': 0, 'walk': 1, 'run': 2}


def jit(a): return S['rng'].uniform(-a, a)


@app.get('/api/next')
def nxt():
    S['i'] += 1
    sc, rng = S['scenario'], S['rng']
    if S.get('hold', 0) <= 0:                       # a new dataset row becomes the target every 6-14 s
        S['row'] = pick(); S['hold'] = rng.randint(6, 14)
    S['hold'] -= 1
    row = S['row']
    tgt = {'hr': HR_MED + SHRINK * (row['hr'] - HR_MED), 'ox': OX_MED + SHRINK * (row['ox'] - OX_MED),
           'st': row['stress'] * 10.0, 'sp': row['steps'], 'sl': row['sleep']}
    inj = sc in ('spike', 'warn')
    if inj:
        S['act'] = 'rest'
        tgt.update(hr=(160 if sc == 'spike' else 108) + jit(3), ox=(88 if sc == 'spike' else 93.5) + jit(.4),
                   st=90 if sc == 'spike' else 62)
    b = S.get('base')
    if b is None: b = dict(tgt)
    else:
        for k in EASE:
            b[k] = tgt[k] if (inj and k in ('hr', 'ox', 'st')) else b[k] + (tgt[k] - b[k]) * EASE[k]
    S['base'] = b
    off = S.setdefault('off', {'hr': 0.0, 'ox': 0.0, 'act': 6.0})
    for k, tab in (('hr', OFF_HR), ('ox', OFF_OX)):
        t = 0.0 if inj else tab[S['act']]
        off[k] += (t - off[k]) * (0.15 if abs(t) > abs(off[k]) else 0.22)
    off['act'] += ((5.0 if inj else ACT_IDX[S['act']]) - off['act']) * 0.25
    implied = 'run' if off['hr'] > 35 else 'walk' if off['hr'] > 8 else 'rest'
    eff = S['act'] if RANK[S['act']] >= RANK[implied] else implied      # cool-down keeps its label until HR settles
    v = {'hr': b['hr'] + off['hr'] + jit(1.2), 'ox': min(100.0, b['ox'] + off['ox'] + jit(.12)),
         'st': b['st'] + jit(1.0), 'sp': b['sp'], 'sl': b['sl'], 'act': off['act']}
    # the model sees heart rate / SpO2 with the known activity effect removed, so exercise is not an anomaly
    ml = scorer.score({'hr': b['hr'] + jit(1.2), 'ox': min(100.0, b['ox'] + jit(.12)), 'st': v['st'] / 10.0})
    S['v'] = v
    return jsonify(i=S['i'], v=v, activity=eff, scenario=sc, ml=ml,
                   raw=dict(hr=row['hr'], ox=row['ox'], user=int(row['user']), label=row['activity']), model=scorer.status)


@app.post('/api/control')
def control():
    j = request.get_json(force=True, silent=True) or {}
    if 'scenario' in j: S['scenario'] = j['scenario'] if j['scenario'] in ('normal', 'warn', 'spike') else 'normal'
    if 'activity' in j and j['activity'] in ('rest', 'walk', 'run', 'auto'): S['mode'] = j['activity']; S['scenario'] = 'normal'; S['hold'] = 0
    if j.get('reset'): reset()
    return jsonify(ok=True, scenario=S['scenario'], mode=S['mode'])


@app.get('/api/status')
def status():
    return jsonify(model=scorer.status, rows=len(DF), cleaned_csv=str(CLEAN.name), tick=S['i'])


@app.get('/')
def home(): return send_from_directory(ROOT, 'index.html')


@app.get('/<path:p>')
def static_files(p):
    if p.split('/')[0] not in ('css', 'js') and p not in ('index.html', 'watch.html'): return ('', 404)
    return send_from_directory(ROOT, p)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8000)), threaded=False)
