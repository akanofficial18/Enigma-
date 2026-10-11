/* rx.js - prescription analyser. Rule-based: a small drug list, dose and frequency parsing,
   interaction / duplicate / allergy checks. It covers common medicines only. */
(function () {
  'use strict';
  var SV = window.SV, $ = function (id) { return document.getElementById(id); }, esc = SV.esc;
  /* name, aliases, class, max adult mg/day (0 = no simple limit), use */
  var D = [
    ['Paracetamol', ['paracetamol', 'acetaminophen', 'dolo', 'crocin', 'calpol'], 'Analgesic', 4000, 'pain and fever'],
    ['Ibuprofen', ['ibuprofen', 'brufen', 'combiflam'], 'NSAID', 2400, 'pain and inflammation'],
    ['Diclofenac', ['diclofenac', 'voveran'], 'NSAID', 150, 'pain and inflammation'],
    ['Aspirin', ['aspirin', 'ecosprin', 'disprin'], 'NSAID', 4000, 'pain; low dose protects the heart'],
    ['Amoxicillin', ['amoxicillin', 'amoxycillin', 'augmentin', 'mox'], 'Penicillin antibiotic', 3000, 'bacterial infection'],
    ['Azithromycin', ['azithromycin', 'azithral', 'azee'], 'Macrolide antibiotic', 500, 'bacterial infection'],
    ['Ciprofloxacin', ['ciprofloxacin', 'cipro'], 'Quinolone antibiotic', 1500, 'bacterial infection'],
    ['Cetirizine', ['cetirizine', 'cetzine'], 'Antihistamine', 10, 'allergy'],
    ['Montelukast', ['montelukast'], 'Anti-allergic', 10, 'allergy and asthma'],
    ['Pantoprazole', ['pantoprazole', 'pantop'], 'PPI', 80, 'acid reflux, stomach protection'],
    ['Omeprazole', ['omeprazole', 'omez'], 'PPI', 40, 'acid reflux, stomach protection'],
    ['Metformin', ['metformin', 'glycomet'], 'Antidiabetic', 2550, 'type 2 diabetes'],
    ['Amlodipine', ['amlodipine', 'amlong'], 'Blood pressure', 10, 'high blood pressure'],
    ['Losartan', ['losartan', 'losar'], 'Blood pressure', 100, 'high blood pressure'],
    ['Atorvastatin', ['atorvastatin', 'atorva'], 'Statin', 80, 'high cholesterol'],
    ['Warfarin', ['warfarin'], 'Anticoagulant', 0, 'blood thinner'],
    ['Clopidogrel', ['clopidogrel', 'clopilet'], 'Antiplatelet', 75, 'prevents clots'],
    ['Levothyroxine', ['levothyroxine', 'thyronorm', 'eltroxin'], 'Thyroid', 0, 'underactive thyroid'],
    ['Ondansetron', ['ondansetron', 'ondem'], 'Anti-nausea', 24, 'nausea and vomiting'],
    ['Salbutamol', ['salbutamol', 'asthalin'], 'Bronchodilator', 0, 'asthma, wheeze'],
    ['Domperidone', ['domperidone', 'domstal'], 'Anti-nausea', 30, 'nausea'],
    ['Esomeprazole', ['esomeprazole', 'nexpro'], 'PPI', 40, 'acid reflux'],
    ['Rabeprazole', ['rabeprazole', 'razo'], 'PPI', 20, 'acid reflux'],
    ['Cefixime', ['cefixime', 'zifi'], 'Cephalosporin antibiotic', 400, 'bacterial infection'],
    ['Cefuroxime', ['cefuroxime', 'zinnat'], 'Cephalosporin antibiotic', 1000, 'bacterial infection'],
    ['Doxycycline', ['doxycycline', 'doxy'], 'Tetracycline antibiotic', 200, 'bacterial infection'],
    ['Metronidazole', ['metronidazole', 'flagyl', 'metrogyl'], 'Antibiotic', 2400, 'infection (gut, dental)'],
    ['Levofloxacin', ['levofloxacin', 'levoflox'], 'Quinolone antibiotic', 1000, 'bacterial infection'],
    ['Levocetirizine', ['levocetirizine', 'xyzal', 'levocet'], 'Antihistamine', 5, 'allergy'],
    ['Fexofenadine', ['fexofenadine', 'allegra'], 'Antihistamine', 180, 'allergy'],
    ['Telmisartan', ['telmisartan', 'telma'], 'Blood pressure', 80, 'high blood pressure'],
    ['Atenolol', ['atenolol', 'aten'], 'Blood pressure', 100, 'high blood pressure, heart rate'],
    ['Metoprolol', ['metoprolol', 'metolar'], 'Blood pressure', 200, 'high blood pressure, heart rate'],
    ['Glimepiride', ['glimepiride', 'amaryl'], 'Antidiabetic', 8, 'type 2 diabetes'],
    ['Gliclazide', ['gliclazide', 'diamicron'], 'Antidiabetic', 320, 'type 2 diabetes'],
    ['Sitagliptin', ['sitagliptin', 'januvia'], 'Antidiabetic', 100, 'type 2 diabetes'],
    ['Rosuvastatin', ['rosuvastatin', 'rosuvas', 'crestor'], 'Statin', 40, 'high cholesterol'],
    ['Naproxen', ['naproxen', 'naprosyn'], 'NSAID', 1250, 'pain and inflammation'],
    ['Aceclofenac', ['aceclofenac', 'zerodol', 'aceclo'], 'NSAID', 200, 'pain and inflammation'],
    ['Etoricoxib', ['etoricoxib', 'nucoxia'], 'NSAID', 120, 'pain and inflammation'],
    ['Tramadol', ['tramadol', 'ultracet'], 'Opioid analgesic', 400, 'moderate to severe pain'],
    ['Prednisolone', ['prednisolone', 'wysolone'], 'Steroid', 0, 'inflammation, allergy'],
    ['Ambroxol', ['ambroxol', 'ambrodil'], 'Mucolytic', 120, 'cough with phlegm'],
    ['Folic acid', ['folic acid', 'folvite'], 'Supplement', 5, 'folate supplement'],
    ['Calcium', ['calcium', 'shelcal'], 'Supplement', 0, 'bone health'],
    ['Vitamin D3', ['cholecalciferol', 'vitamin d3'], 'Supplement', 0, 'vitamin D supplement'],
    ['Vitamin B12', ['methylcobalamin', 'mecobalamin', 'cobalamin'], 'Supplement', 0, 'B12 supplement'],
    ['Iron', ['ferrous', 'iron'], 'Supplement', 0, 'iron supplement']
  ];
  var INT = [
    ['Warfarin', 'Aspirin', 'Much higher bleeding risk.'], ['Warfarin', 'Ibuprofen', 'Much higher bleeding risk.'],
    ['Warfarin', 'Diclofenac', 'Much higher bleeding risk.'], ['Warfarin', 'Azithromycin', 'Can raise the blood-thinning effect.'],
    ['Clopidogrel', 'Omeprazole', 'Omeprazole can weaken clopidogrel; pantoprazole is usually preferred.'],
    ['Clopidogrel', 'Aspirin', 'More bleeding risk (sometimes prescribed together on purpose).'],
    ['Ibuprofen', 'Aspirin', 'Ibuprofen can blunt aspirin\'s heart protection and adds stomach risk.'],
    ['Losartan', 'Ibuprofen', 'Anti-inflammatories can weaken the blood pressure medicine and strain the kidneys.'],
    ['Losartan', 'Diclofenac', 'Anti-inflammatories can weaken the blood pressure medicine and strain the kidneys.'],
    ['Ciprofloxacin', 'Ondansetron', 'Both can affect heart rhythm.'], ['Azithromycin', 'Ondansetron', 'Both can affect heart rhythm.'],
    ['Metronidazole', 'Warfarin', 'Can raise the blood-thinning effect a lot.'], ['Prednisolone', 'Ibuprofen', 'Steroid plus anti-inflammatory raises stomach bleeding risk.'],
    ['Prednisolone', 'Diclofenac', 'Steroid plus anti-inflammatory raises stomach bleeding risk.']
  ];
  var FQ = [[/\b(qid|four times|4 times)\b/, 4], [/\b(tds|tid|thrice|three times|3 times)\b/, 3],
            [/\b(bd|bid|twice|two times|2 times)\b/, 2], [/\b(od|qd|once|daily|hs|at night|bedtime|morning)\b/, 1]];
  var ABX = /antibiotic/i;

  function lev(a, b) {
    var m = [], i, j;
    for (i = 0; i <= a.length; i++) m[i] = [i];
    for (j = 1; j <= b.length; j++) m[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }
  /* exact word match first, then a spelling-tolerant match (OCR and handwriting often miss a letter) */
  function find(low) {
    var i, j, best = null, bd = 9, toks = low.match(/[a-z]{5,}/g) || [];
    for (i = 0; i < D.length; i++) for (j = 0; j < D[i][1].length; j++)
      if (new RegExp('\\b' + D[i][1][j] + '\\b').test(low)) return D[i];
    D.forEach(function (d) { d[1].forEach(function (a) {
      if (a.length < 5 || a.indexOf(' ') > -1) return;
      var lim = a.length >= 9 ? 2 : 1;
      toks.forEach(function (t) { var x = lev(t, a); if (x <= lim && x < bd) { bd = x; best = d; } });
    }); });
    return best;
  }
  var RXLINE = /^\s*(tab|tabs|tablet|cap|caps|capsule|syp|syrup|inj|injection|drops?|cream|oint|ointment|gel|susp|sachet|inhaler)\b\.?/i;
  function parseLine(line) {
    var low = line.toLowerCase().replace(/[|_]/g, ' '), d = find(low), m;
    var o = { line: line, d: d, mg: 0, f: 0, days: 0, prn: /\b(sos|prn|as needed|if needed)\b/.test(low) };
    if ((m = low.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b/))) o.mg = +m[1] * (m[2] === 'g' ? 1000 : m[2] === 'mcg' ? 0.001 : 1);
    if (!o.mg && !/\b\d+\s*ml\b/.test(low) && (m = low.match(/\b(\d{2,4})\b(?!\s*(?:-|\/|days?\b|d\b))/)) && +m[1] >= 25 && +m[1] <= 1000) o.mg = +m[1];   /* bare number: assume mg */
    if ((m = low.match(/\b([0-3])\s*-\s*([0-3])\s*-\s*([0-3])(?:\s*-\s*([0-3]))?\b/))) o.f = m.slice(1).reduce(function (s, x) { return s + (+x || 0); }, 0);
    else if (/\bmorning\s*(and|&|-|\+)\s*(night|evening)\b/.test(low)) o.f = 2;
    else FQ.some(function (q) { if (q[0].test(low)) { o.f = q[1]; return true; } });
    if ((m = low.match(/(\d+)\s*\/\s*7\b/))) o.days = +m[1];
    else if ((m = low.match(/(\d+)\s*(days?|d|weeks?|wks?|wk)\b/))) o.days = +m[1] * (/^w/.test(m[2]) ? 7 : 1);
    if (!d) {
      if (!RXLINE.test(line) && !(o.mg && (o.f || o.prn))) return { line: line, unknown: true };
      var nm = line.replace(RXLINE, '').replace(/[^A-Za-z -]/g, ' ').trim().split(/\s+/).filter(function (w) { return !/^(ml|mg|mcg|g|bd|od|tds|tid|qid|sos|days?|d|x|for)$/i.test(w); }).slice(0, 2).join(' ') || 'Medicine';
      o.d = [nm, [], 'Not in built-in list', 0, 'not in list']; o.generic = true;
    }
    return o;
  }

  function analyse(text, allergies) {
    var items = text.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).map(parseLine);
    var known = items.filter(function (x) { return !x.unknown; }), issues = [];
    known.forEach(function (x) {
      var n = x.d[0], daily = x.mg * x.f;
      if (x.generic) issues.push([1, n + ': not in the built-in list, so interaction and dose-limit checks were skipped. Verify it with your pharmacist.']);
      if (!x.mg && !x.generic) issues.push([1, n + ': no strength found (e.g. 500 mg).']);
      if (!x.f && !x.prn) issues.push([1, n + ': no frequency found (e.g. BD, TDS or 1-0-1).']);
      if (x.mg && x.f && x.d[3] && daily > x.d[3]) issues.push([2, n + ': ' + daily + ' mg/day is above the usual adult maximum of ' + x.d[3] + ' mg/day.']);
      if (ABX.test(x.d[2]) && !x.days) issues.push([1, n + ': antibiotics need a stated duration. Finish the full course your doctor sets.']);
      allergies.forEach(function (a) {
        if (a && (n.toLowerCase().indexOf(a) > -1 || x.d[2].toLowerCase().indexOf(a) > -1 || x.d[1].some(function (al) { return al === a; })))
          issues.push([2, n + ' matches your listed allergy "' + a + '". Do not take it until you have asked your doctor.']);
      });
    });
    var names = known.map(function (x) { return x.d[0]; });
    INT.forEach(function (p) { if (names.indexOf(p[0]) > -1 && names.indexOf(p[1]) > -1) issues.push([p[2].indexOf('Much') === 0 ? 2 : 1, p[0] + ' + ' + p[1] + ': ' + p[2]]); });
    ['NSAID', 'PPI'].forEach(function (c) {
      var g = known.filter(function (x) { return x.d[2] === c; }).map(function (x) { return x.d[0]; });
      if (g.length > 1) issues.push([1, 'Two ' + c + ' medicines together (' + g.join(', ') + '). Check this is intended.']);
    });
    issues.sort(function (a, b) { return b[0] - a[0]; });
    return { items: items, known: known, issues: issues };
  }

  var last = null;
  SV.Rx = { analyse: analyse };
  function render(r) {
    last = r;
    var h = '<div class="tblwrap"><table><thead><tr><th>Medicine</th><th>For</th><th>Dose</th><th>Per day</th><th>Days</th></tr></thead><tbody>' +
      r.known.map(function (x) {
        return '<tr><td><b>' + x.d[0] + '</b><br><span class="small muted">' + x.d[2] + '</span></td><td>' + x.d[4] + '</td><td class="n">' + (x.mg ? x.mg + ' mg' : '?') +
          '</td><td class="n">' + (x.prn ? 'as needed' : x.f ? x.f + '×' + (x.mg ? ' = ' + x.mg * x.f + ' mg' : '') : '?') + '</td><td class="n">' + (x.days || '–') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    h += r.issues.length ? r.issues.map(function (i) { return '<p class="issue' + (i[0] === 2 ? ' crit' : '') + '">' + esc(i[1]) + '</p>'; }).join('')
      : '<p class="issue ok">No problems found by the built-in checks.</p>';
    var unk = r.items.filter(function (x) { return x.unknown; });
    if (unk.length) h += '<p class="small muted">Not recognised (outside the built-in list): ' + unk.map(function (x) { return esc(x.line); }).join(' · ') + '</p>';
    h += '<div class="row"><button type="button" class="btn sm" id="rxToMsg">Add summary to doctor message</button></div>' +
      '<p class="small muted">Checks cover about 20 common medicines. This is not medical advice; confirm with your doctor or pharmacist.</p>';
    $('rxOut').innerHTML = r.known.length ? h : '<p class="issue">No known medicines found. Check spelling or paste clearer text.</p>';
  }

  function run() {
    var al = $('rxAllergy').value.toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    render(analyse($('rxText').value, al));
  }
  $('rxGo').addEventListener('click', run);
  $('rxSample').addEventListener('click', function () {
    $('rxText').value = 'Tab Paracetamol 650 mg 1-1-1 x 5 days\nTab Ibuprofen 400 mg BD after food x 3 days\nTab Aspirin 75 mg OD\nCap Pantoprazole 40 mg OD before breakfast x 14 days\nTab Amoxicillin 500 mg TDS';
    $('rxAllergy').value = 'penicillin';
  });
  $('rxFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    SV.ocr(f, function (t) { $('rxStatus').textContent = t; }).then(function (t) { $('rxText').value = t.trim(); run(); SV.toast('Text read and analysed. Fix any misread words and press Analyse again.'); },
      function (er) { $('rxStatus').textContent = er.message; });
  });
  $('rxOut').addEventListener('click', function (e) {
    if (!e.target.closest('#rxToMsg') || !last) return;
    SV.addToMsg('PRESCRIPTION REVIEW (simulated)\n' + last.known.map(function (x) { return '- ' + x.d[0] + ' ' + (x.mg || '?') + ' mg, ' + (x.f || '?') + '/day, ' + (x.days || '?') + ' days'; }).join('\n') +
      '\nFlags: ' + (last.issues.length ? last.issues.map(function (i) { return i[1]; }).join(' ') : 'none'));
  });
})();
