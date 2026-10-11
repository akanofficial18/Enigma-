/* rules.js - rule-based anomaly detection.
   Single rules look at one reading, baseline rules compare with the personal baseline,
   combined rules need two signals to agree. Severity: 1 = warning, 2 = critical. */
(function () {
  'use strict';
  var SV = window.SV;
  var HRLIM = { rest: 100, walk: 130, run: 175 };

  var LIST = [
    { id: 'hr-high', name: 'High heart rate for current activity', kind: 'Single', m: ['hr'],
      desc: 'Above 100 bpm resting, 130 walking, 175 running. 25 bpm more is critical.',
      test: function (r, b, act) {
        var l = HRLIM[act], w = SV.LABEL[act].toLowerCase();
        if (r.hr > l + 25) return [2, 'Heart rate is ' + r.hr + ' bpm, far above the ' + l + ' bpm expected while ' + w + '.'];
        if (r.hr > l) return [1, 'Heart rate is ' + r.hr + ' bpm, above the ' + l + ' bpm expected while ' + w + '.'];
        return null;
      } },
    { id: 'hr-base', name: 'Resting heart rate above your baseline', kind: 'Baseline', m: ['hr'],
      desc: 'More than 30% above your learned resting heart rate (once the baseline is established).',
      test: function (r, b, act) {
        if (act !== 'rest' || b.n < b.target) return null;   /* needs an established baseline */
        if (r.hr > b.hr * 1.3) return [1, 'Resting heart rate is ' + Math.round((r.hr / b.hr - 1) * 100) + '% above your baseline of ' + Math.round(b.hr) + ' bpm.'];
        return null;
      } },
    { id: 'hr-low', name: 'Low resting heart rate', kind: 'Single', m: ['hr'],
      desc: 'Below 48 bpm at rest is a warning, below 40 bpm is critical.',
      test: function (r, b, act) {
        if (act !== 'rest') return null;
        if (r.hr < 40) return [2, 'Heart rate is only ' + r.hr + ' bpm at rest.'];
        if (r.hr < 48) return [1, 'Heart rate is low at ' + r.hr + ' bpm at rest.'];
        return null;
      } },
    { id: 'ox-low', name: 'Low blood oxygen (SpO₂)', kind: 'Single', m: ['ox'],
      desc: 'Below 94% is a warning, below 90% is critical.',
      test: function (r) {
        if (r.ox < 90) return [2, 'SpO₂ is ' + r.ox + '%, below the 90% critical limit.'];
        if (r.ox < 94) return [1, 'SpO₂ is ' + r.ox + '%, below the 94% comfort limit.'];
        return null;
      } },
    { id: 'combo-distress', name: 'Fast resting heart rate and low oxygen', kind: 'Combined', m: ['hr', 'ox'],
      desc: 'At rest, heart rate above 120 bpm while SpO₂ is below 92%.',
      test: function (r, b, act) {
        if (act === 'rest' && r.hr > 120 && r.ox < 92) return [2, 'Fast heart rate together with low oxygen at rest points to possible cardio-respiratory distress.'];
        return null;
      } },
    { id: 'combo-oxdrop', name: 'Oxygen falling while heart rate climbs', kind: 'Combined', m: ['ox', 'hr'],
      desc: 'At rest, SpO₂ at least 3 points under baseline and heart rate 15% above baseline.',
      test: function (r, b, act) {
        if (act !== 'rest') return null;      /* exercise explains a faster heart rate */
        if (r.ox <= b.ox - 3 && r.hr >= b.hr * 1.15) return [1, 'SpO₂ has dropped ' + Math.round(b.ox - r.ox) + ' points below baseline while heart rate is rising.'];
        return null;
      } },
    { id: 'ml-forecast', name: 'AI model: reading far from forecast', kind: 'ML model', m: ['hr', 'ox'],
      desc: 'Hugging Face time-series model (IBM Granite TTM) forecasts your next reading; a large, sustained miss raises an alert.',
      test: function (r, b, act, ml) {
        if (ml && ml.level) return [ml.level, 'AI model: ' + (ml.msg || 'readings are far from the personal forecast.')];
        return null;
      } }
  ];

  /* r: rounded vitals, b: baseline, act: 'rest' | 'walk' | 'run'.
     Returns { rules: [{id,sev,msg,m}], reasons: [only the triggered ones, worst first], status: 0|1|2 } */
  function evaluate(r, b, act, ml) {
    var reasons = [];
    var rules = LIST.map(function (R) {
      var t = R.test(r, b, act, ml);
      var o = { id: R.id, sev: t ? t[0] : 0, msg: t ? t[1] : '', m: (R.id === 'ml-forecast' && ml && ml.m && ml.m.length) ? ml.m : R.m };
      if (t) reasons.push(o);
      return o;
    });
    reasons.sort(function (a, c) { return c.sev - a.sev; });
    return { rules: rules, reasons: reasons, status: reasons.length ? reasons[0].sev : 0 };
  }

  SV.Rules = { LIST: LIST, evaluate: evaluate };
})();
