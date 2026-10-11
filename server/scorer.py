"""Anomaly scoring with a Hugging Face time-series model.

Model: IBM Granite TinyTimeMixer (ibm-granite/granite-timeseries-ttm-r2), ~1M parameters, CPU friendly,
used ZERO-SHOT (no training, no labelled emergencies). Every second it forecasts the next
reading of each channel from the wearer's own recent history. The gap between the forecast and the
real reading, measured in units of that wearer's typical forecast error, is the anomaly score.

If the Hugging Face model cannot be loaded (no internet, packages missing) the SAME scoring pipeline
runs with a simple exponential-moving-average forecaster, and /api/status says so openly.
"""
import os, threading, numpy as np

CH = ['hr', 'ox', 'st']                      # channels fed to the model
NAME = {'hr': 'Heart rate', 'ox': 'SpO2', 'st': 'Stress'}
UNIT = {'hr': ' bpm', 'ox': '%', 'st': '/10'}
FLOOR = {'hr': 5.0, 'ox': 0.8, 'st': 2.0}    # smallest forecast-error scale we trust (stops tiny noise exploding z)
SEV1, SEV2 = 4.5, 8.0                        # warning / critical z thresholds
HOLD = 2                                     # warning needs this many consecutive high ticks


class HFForecaster:
    CTX, PRED = 512, 96                      # the 'main' revision of granite-timeseries-ttm-r2

    def __init__(self, repo, revision=None):
        import torch
        from tsfm_public.models.tinytimemixer import TinyTimeMixerForPrediction
        kw = {'revision': revision} if revision else {}
        self.torch = torch
        self.model = TinyTimeMixerForPrediction.from_pretrained(repo, **kw).eval()
        self.ctx = getattr(self.model.config, 'context_length', self.CTX)
        self.name = repo + (f'@{revision}' if revision else '')

    def forecast(self, hist):
        """hist: array (T, C) of past values -> next-step forecast (C,)"""
        x = np.asarray(hist[-self.ctx:], dtype='float32')
        if len(x) < self.ctx:                                # left-pad by repeating the oldest reading
            x = np.vstack([np.repeat(x[:1], self.ctx - len(x), axis=0), x])
        with self.torch.no_grad():
            out = self.model(past_values=self.torch.from_numpy(x)[None])
        return out.prediction_outputs[0, 0].numpy()


class EmaForecaster:
    name = 'fallback: moving-average forecaster'

    def __init__(self, a=0.06): self.a = a; self.lvl = None

    def forecast(self, hist):
        """Next-step forecast = current level (hist ends at the latest ACCEPTED reading)."""
        h = np.asarray(hist, dtype='float64')
        if self.lvl is None: self.lvl = h[-1].copy()
        return self.lvl.copy()

    def learn(self, x):
        self.lvl = (1 - self.a) * self.lvl + self.a * np.asarray(x, dtype='float64')


class Scorer:
    def __init__(self):
        self.hist = []                       # winsorised context (anomalies do not drag the forecast along)
        self.scale = {c: FLOOR[c] * 1.5 for c in CH}
        self.hold = 0
        self.fc = EmaForecaster()
        self.status = {'model': self.fc.name, 'state': 'fallback', 'detail': 'Hugging Face model not loaded yet'}
        self._hf = None
        if os.environ.get('SV_NO_HF') != '1':
            threading.Thread(target=self._load, daemon=True).start()
        else:
            self.status['detail'] = 'disabled with SV_NO_HF=1'

    def _load(self):
        repo = os.environ.get('SV_HF_MODEL', 'ibm-granite/granite-timeseries-ttm-r2')
        rev = os.environ.get('SV_HF_REVISION') or None
        self.status = {'model': repo, 'state': 'loading', 'detail': 'downloading / loading weights'}
        try:
            self._hf = HFForecaster(repo, rev)
            self.status = {'model': self._hf.name, 'state': 'huggingface', 'detail': 'zero-shot forecasting'}
        except Exception as e:                                 # keep running, but say why
            self.status = {'model': EmaForecaster.name, 'state': 'fallback',
                           'detail': f'could not load {repo}: {type(e).__name__}: {str(e)[:160]}'}

    def reset(self):
        self.hist = []; self.hold = 0
        self.scale = {c: FLOOR[c] * 1.5 for c in CH}
        self.fc = EmaForecaster()

    def score(self, row):
        """row: dict with hr, ox, st (st on 1..10 scale). Returns the ml dict sent to the dashboard."""
        x = np.array([row[c] for c in CH], dtype='float64')
        if len(self.hist) < 20:                                # warm-up: learn the wearer's normal first
            self.hist.append(x); self.fc.forecast(np.array(self.hist)); self.fc.learn(x)
            return {'level': 0, 'score': 0.0, 'z': {}, 'm': [], 'msg': '', 'warming': True, **self._tag()}
        try:
            f = (self._hf or self.fc).forecast(np.array(self.hist))
        except Exception as e:                                 # model failed mid-run: drop to fallback, visibly
            self._hf = None
            self.status = {'model': EmaForecaster.name, 'state': 'fallback', 'detail': f'HF inference error: {e}'[:200]}
            f = self.fc.forecast(np.array(self.hist))
        z = {}
        for i, c in enumerate(CH):
            z[c] = float((x[i] - f[i]) / self.scale[c])
            r = abs(x[i] - f[i])
            # update the typical error only from non-anomalous residuals
            if abs(z[c]) < 3: self.scale[c] = max(FLOOR[c], 0.97 * self.scale[c] + 0.03 * r * 1.25)
        # winsorised context so a real anomaly is not absorbed into "normal"
        w = np.array([f[i] + np.clip(x[i] - f[i], -4 * self.scale[c], 4 * self.scale[c]) for i, c in enumerate(CH)])
        self.hist.append(w); self.hist = self.hist[-self.fc_ctx():]
        self.fc.learn(w)
        # HR and SpO2 matter clinically; stress alone is never an emergency
        bad = {c: z[c] for c in ('hr', 'ox') if abs(z[c]) >= SEV1 * 0.7}
        if row.get('st', 0) is not None and abs(z['st']) >= SEV1 * 0.7 and bad: bad['st'] = z['st']
        top = max([abs(z['hr']), abs(z['ox'])])
        joint = sum(1 for c in ('hr', 'ox') if abs(z[c]) >= 4.0) >= 2
        combined = float(np.sqrt(z['hr'] ** 2 + z['ox'] ** 2))
        score = max(top, combined * 0.8 if joint else 0)
        self.hold = self.hold + 1 if score >= SEV1 else 0
        level = 2 if score >= SEV2 else (1 if self.hold >= HOLD else 0)
        msg = ''
        if level:
            parts = []
            for i, c in enumerate(CH):
                if c in bad:
                    d = 'above' if z[c] > 0 else 'below'
                    parts.append(f'{NAME[c]} {x[i]:.0f}{UNIT[c]} is {abs(z[c]):.1f}x its usual swing {d} the model forecast ({f[i]:.0f}{UNIT[c]})')
            msg = ('Multiple signals moved together: ' if joint else '') + '; '.join(parts) + '.'
        return {'level': level, 'score': round(score, 2), 'z': {c: round(v, 2) for c, v in z.items()},
                'm': [c for c in bad if c != 'st'] + (['st'] if 'st' in bad else []), 'msg': msg,
                'joint': joint, 'warming': False, **self._tag()}

    def fc_ctx(self): return getattr(self._hf, 'ctx', 512) if self._hf else 512

    def _tag(self): return {'model': self.status['model'], 'engine': self.status['state']}
