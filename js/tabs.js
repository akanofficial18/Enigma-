/* tabs.js - feature tabs, plus small helpers shared by the analysers (toast, doctor message, OCR). */
(function () {
  'use strict';
  var SV = window.SV, $ = function (id) { return document.getElementById(id); };
  var TABS = [['overview', 'Overview'], ['monitor', 'Monitoring'], ['doctor', 'Doctor & history'],
              ['rx', 'Prescription'], ['report', 'Reports'], ['rehab', 'Rehab']];

  SV.toast = function (t) {
    var el = $('toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(SV.toast.h); SV.toast.h = setTimeout(function () { el.classList.remove('on'); }, 2400);
  };
  /* Append text to the doctor message and jump to it. */
  SV.addToMsg = function (text) {
    $('msg').value += '\n\n' + text; SV.toast('Added to doctor message'); show('doctor');
  };
  /* Read text from a photo with Tesseract.js (loaded only when first used). */
  SV.ocr = function (file, status) {
    return new Promise(function (res, rej) {
      function go() {
        status('Reading image…');
        window.Tesseract.recognize(file, 'eng', { logger: function (m) {
          if (m.status === 'recognizing text') status('Reading image… ' + Math.round(m.progress * 100) + '%');
        } }).then(function (r) { status(''); res(r.data.text); }, rej);
      }
      if (window.Tesseract) return go();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = go; s.onerror = function () { rej(new Error('Could not load the OCR library (check your connection).')); };
      document.head.appendChild(s);
    });
  };

  function show(id) {
    if (!TABS.some(function (t) { return t[0] === id; })) id = 'overview';
    $('tabs').querySelectorAll('button').forEach(function (b) {
      var on = b.dataset.t === id; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('[data-tab]').forEach(function (el) { el.hidden = el.dataset.tab !== id; });
    var vis = 0;
    document.querySelectorAll('.grid > .col').forEach(function (c) {
      var any = !!c.querySelector(':scope > [data-tab]:not([hidden])'); c.hidden = !any; if (any) vis++;
    });
    var g = document.querySelector('.grid'); g.hidden = vis === 0;
    g.style.gridTemplateColumns = vis === 1 ? 'minmax(0,1fr)' : '';
    if (id !== 'rehab' && SV.rehabStop) SV.rehabStop(false);
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }

  $('tabs').innerHTML = TABS.map(function (t) {
    return '<button type="button" role="tab" data-t="' + t[0] + '">' + t[1] + '</button>';
  }).join('');
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.t); });
  SV.Tabs = { show: show };
  show((location.hash || '').slice(1));
})();
