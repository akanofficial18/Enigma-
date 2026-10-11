#!/usr/bin/env python3
"""Clean the Kaggle 'unclean smartwatch health data' CSV.

    python3 server/clean_data.py <raw.csv> [out.csv]

Rules (every one is reported so the cleaning is auditable):
  * text cells such as 'ERROR' / 'Very High' become missing
  * activity labels are repaired (Seddentary, Actve, Highly_Active ...)
  * physiologically impossible values become missing:
      HR outside 30-220 bpm, SpO2 outside 70-100 %, steps > 40000, sleep outside 0-14 h
  * HR of exactly 40.0 is a clipped sensor floor in this file, so it is treated as missing
  * missing values are filled with the median of the same activity level
  * rows with no heart rate AND no SpO2 are dropped (nothing to monitor)
"""
import sys, pandas as pd, numpy as np

ACT = {'sedentary': 'Sedentary', 'seddentary': 'Sedentary', 'active': 'Active', 'actve': 'Active',
       'highly active': 'Highly Active', 'highly_active': 'Highly Active'}
COLS = {'User ID': 'user', 'Heart Rate (BPM)': 'hr', 'Blood Oxygen Level (%)': 'ox',
        'Step Count': 'steps', 'Sleep Duration (hours)': 'sleep', 'Activity Level': 'activity',
        'Stress Level': 'stress'}

def clean(src):
    d = pd.read_csv(src).rename(columns=COLS)
    rep = {'rows_in': len(d)}
    for c in ['user', 'hr', 'ox', 'steps', 'sleep', 'stress']:
        d[c] = pd.to_numeric(d[c], errors='coerce')
    d['activity'] = d['activity'].astype(str).str.strip().str.lower().map(ACT)
    rep['activity_repaired_or_missing'] = int(d['activity'].isna().sum())
    d = d.drop_duplicates()
    bad = {
        'hr': (d.hr < 30) | (d.hr > 220) | (d.hr == 40.0),
        'ox': (d.ox < 70) | (d.ox > 100),
        'steps': (d.steps < 0) | (d.steps > 40000),
        'sleep': (d.sleep < 0) | (d.sleep > 14),
    }
    for c, m in bad.items():
        rep['invalid_' + c] = int(m.sum()); d.loc[m, c] = np.nan
    d = d[~(d.hr.isna() & d.ox.isna())].copy()
    d['activity'] = d['activity'].fillna('Sedentary')
    for c in ['hr', 'ox', 'steps', 'sleep', 'stress']:
        d[c] = d[c].fillna(d.groupby('activity')[c].transform('median')).fillna(d[c].median())
    d['stress'] = d['stress'].round().clip(1, 10).astype(int)
    d['user'] = d['user'].fillna(-1).astype(int)
    rep['rows_out'] = len(d)
    return d.reset_index(drop=True), rep

if __name__ == '__main__':
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'data/clean_smartwatch.csv'
    d, rep = clean(src)
    d.to_csv(out, index=False)
    for k, v in rep.items(): print(f'{k:32s}{v}')
    print('saved', out)
