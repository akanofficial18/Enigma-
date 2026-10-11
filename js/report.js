/* report.js - lab report analyser. Finds "test name + number" lines and compares them with typical adult ranges. */
(function () {
  'use strict';
  var SV = window.SV, $ = function (id) { return document.getElementById(id); }, esc = SV.esc;
  /* name, aliases, unit, range (or {m,f}), note shown when out of range */
  var T = [
    ['Hemoglobin', ['hemoglobin', 'haemoglobin', 'hb'], 'g/dL', { m: [13, 17], f: [12, 15.5] }, 'Low may point to anaemia (iron, B12, blood loss); high to dehydration or smoking.'],
    ['WBC count', ['wbc', 'white blood cell', 'total leucocyte count', 'tlc'], '/µL', [4000, 11000], 'High often means infection or inflammation; low can follow viral illness or some medicines.'],
    ['Platelets', ['platelet count', 'platelets', 'plt'], '/µL', [150000, 450000], 'Low raises bleeding risk; high can follow infection or iron deficiency.'],
    ['Fasting glucose', ['fasting blood sugar', 'fasting glucose', 'fbs', 'glucose'], 'mg/dL', [70, 99], '100-125 suggests pre-diabetes; 126 or more on repeat tests suggests diabetes.'],
    ['HbA1c', ['hemoglobin a1c', 'glycated hemoglobin', 'glycosylated hemoglobin', 'hba1c', 'a1c'], '%', [4, 5.6], '5.7-6.4 suggests pre-diabetes; 6.5 or more suggests diabetes.'],
    ['Total cholesterol', ['total cholesterol', 'cholesterol'], 'mg/dL', [0, 199], 'High raises heart-disease risk over time.'],
    ['LDL cholesterol', ['ldl cholesterol', 'ldl'], 'mg/dL', [0, 99], '"Bad" cholesterol; lower is better.'],
    ['HDL cholesterol', ['hdl cholesterol', 'hdl'], 'mg/dL', [40, 200], '"Good" cholesterol; low is the concern. Exercise helps.'],
    ['Triglycerides', ['triglycerides', 'tg'], 'mg/dL', [0, 149], 'Raised by sugar, alcohol and refined carbs.'],
    ['Creatinine', ['creatinine'], 'mg/dL', { m: [0.7, 1.3], f: [0.6, 1.1] }, 'High can mean reduced kidney function or dehydration.'],
    ['Uric acid', ['uric acid'], 'mg/dL', { m: [3.5, 7.2], f: [2.6, 6] }, 'High can cause gout and kidney stones.'],
    ['ALT (SGPT)', ['sgpt', 'alt'], 'U/L', [7, 56], 'High can reflect liver stress (fatty liver, medicines, alcohol, hepatitis).'],
    ['AST (SGOT)', ['sgot', 'ast'], 'U/L', [10, 40], 'High can reflect liver or muscle stress.'],
    ['TSH', ['tsh'], 'mIU/L', [0.4, 4], 'High suggests underactive thyroid; low suggests overactive thyroid.'],
    ['Vitamin D', ['vitamin d', 'vit d'], 'ng/mL', [30, 100], 'Low is common; sunlight, diet and supplements as advised.'],
    ['Vitamin B12', ['vitamin b12', 'b12'], 'pg/mL', [200, 900], 'Low can cause tiredness and nerve symptoms.'],
    ['Sodium', ['sodium', 'na'], 'mmol/L', [135, 145], 'Out of range needs prompt medical review.'],
    ['Potassium', ['potassium'], 'mmol/L', [3.5, 5.1], 'Out of range can affect heart rhythm; needs prompt review.']
  ];
  var last = null;
  SV.Report = { analyse: function (t, s) { return analyse(t, s); } };

  function norm(name, v) {
    if (name === 'WBC count' && v < 100) return v * 1000;
    if (name === 'Platelets') return v < 30 ? v * 100000 : v < 2000 ? v * 1000 : v;   /* lakh, x10^3, or absolute */
    return v;
  }
  var SKIP = /\b(date|time|age|years?|phone|mobile|sample|collected|reported|page|lab|ref|patient|doctor|dr|id|no|registered|barcode|method)\b/i;
  function printed(t) {
    var m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/);
    if (m) return [+m[1], +m[2]];
    if ((m = t.match(/(?:<=?|up to|upto)\s*(\d+(?:\.\d+)?)/i))) return [null, +m[1]];
    if ((m = t.match(/>=?\s*(\d+(?:\.\d+)?)/))) return [+m[1], null];
    return null;
  }
  /* Uses the range printed on the report when there is one (labs differ); otherwise the built-in range. */
  function analyse(text, sex) {
    var rows = [], unk = [];
    text.split(/\n+/).map(function (s) { return s.replace(/[|]/g, ' ').trim(); }).filter(Boolean).forEach(function (line) {
      var low = line.toLowerCase().replace(/25[\s-]*(oh|hydroxy)[a-z\s]*/g, ''), best = null, t, v, after, m, r, pr, u = '';
      T.forEach(function (x) { x[1].forEach(function (a) {
        var mm = new RegExp('\\b' + a + '\\b').exec(low);
        if (mm && (!best || a.length > best.len)) best = { t: x, len: a.length, end: mm.index + a.length };
      }); });
      if (best) {
        m = low.slice(best.end).match(/(\d+(?:\.\d+)?)/); if (!m) { unk.push(line); return; }
        t = best.t; v = +m[1]; after = low.slice(best.end).slice(m.index + m[0].length);
      } else {
        m = line.match(/^([A-Za-z][A-Za-z ()\/.%-]{2,40}?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(.*)$/);
        if (!m || SKIP.test(m[1])) { unk.push(line); return; }
        v = +m[2]; after = m[3]; t = [m[1].trim(), [], '', null, 'Outside the range printed on your report. Ask your doctor what it means for you.'];
      }
      pr = printed(after);
      if ((m = after.match(/^\s*([a-zA-Zµ%][a-zA-Z0-9µ%\/^.]*)/))) u = m[1];
      r = pr || (t[3] && (Array.isArray(t[3]) ? t[3] : t[3][sex]));
      if (!r) { unk.push(line); return; }
      if (!pr) v = norm(t[0], v);
      var s = r[0] != null && v < r[0] ? -1 : r[1] != null && v > r[1] ? 1 : 0;
      var dev = s < 0 ? (r[0] - v) / Math.abs(r[0] || 1) : s > 0 ? (v - r[1]) / Math.abs(r[1] || 1) : 0;
      rows.push({ t: t, v: v, r: r, s: s, sev: s ? (dev > 0.3 ? 2 : 1) : 0, unit: t[2] || u, src: pr ? 'report' : 'standard' });
    });
    return { rows: rows, unk: unk };
  }
  function rng(r) { return r[0] == null ? '< ' + r[1] : r[1] == null ? '> ' + r[0] : r[0] + ' – ' + r[1]; }
    function render(a) {
    last = a;
    var bad = a.rows.filter(function (x) { return x.s; });
    var h = '<p class="issue ' + (bad.length ? (bad.some(function (x) { return x.sev === 2; }) ? 'crit' : '') : 'ok') + '"><b>' + bad.length + ' of ' + a.rows.length + '</b> values are outside the typical adult range.</p>';
    h += '<div class="tblwrap"><table><thead><tr><th>Test</th><th>Result</th><th>Typical range</th><th>Status</th></tr></thead><tbody>' +
      a.rows.map(function (x) {
        return '<tr><td><b>' + x.t[0] + '</b></td><td class="n">' + +x.v.toFixed(2) + ' ' + x.unit + '</td><td class="n">' + rng(x.r) + ' <span class="small muted">(' + x.src + ')</span></td><td><span class="chip ' +
          SV.STATUS[x.sev] + '">' + (x.s < 0 ? 'Low' : x.s > 0 ? 'High' : 'Normal') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
    h += bad.map(function (x) { return '<p class="issue' + (x.sev === 2 ? ' crit' : '') + '"><b>' + x.t[0] + ' ' + (x.s < 0 ? 'low' : 'high') + ':</b> ' + esc(x.t[4]) + '</p>'; }).join('');
    if (a.unk.length) h += '<p class="small muted">Not recognised: ' + a.unk.map(esc).join(' · ') + '</p>';
    h += '<div class="row"><button type="button" class="btn sm" id="rpToMsg">Add summary to doctor message</button></div><p class="small muted">Ranges are general adult values; labs differ. Not a diagnosis: discuss results with your doctor.</p>';
    $('rpOut').innerHTML = a.rows.length ? h : '<p class="issue">No known tests found. Use lines like "Hemoglobin 12.4 g/dL".</p>';
  }

  $('rpGo').addEventListener('click', function () { render(analyse($('rpText').value, $('rpSex').value)); });
  $('rpSample').addEventListener('click', function () {
    $('rpText').value = 'Hemoglobin 10.2 g/dL\nWBC 7800\nPlatelets 2.4 lakh\nFasting glucose 118 mg/dL\nHbA1c 6.1 %\nTotal cholesterol 224\nLDL 141\nHDL 38\nTriglycerides 180\nCreatinine 0.9\nTSH 5.6\nVitamin D 18';
  });
  $('rpFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    SV.ocr(f, function (t) { $('rpStatus').textContent = t; }).then(function (t) { $('rpText').value = t.trim(); $('rpGo').click(); SV.toast('Text read and analysed. Fix any misread values and press Analyse again.'); },
      function (er) { $('rpStatus').textContent = er.message; });
  });
  $('rpOut').addEventListener('click', function (e) {
    if (!e.target.closest('#rpToMsg') || !last) return;
    var bad = last.rows.filter(function (x) { return x.s; });
    SV.addToMsg('LAB REPORT REVIEW (simulated)\nOut of range: ' + (bad.length ? bad.map(function (x) { return x.t[0] + ' ' + +x.v.toFixed(2) + ' ' + x.unit + ' (' + (x.s < 0 ? 'low' : 'high') + ')'; }).join('; ') : 'none') +
      '\nTests checked: ' + last.rows.length);
  });
})();
