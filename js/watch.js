/* watch.js - the smartwatch screen. It only draws the radar (plus the clock) from the shared state.
   The ring colour follows the alert status; during an alert a short "open app" prompt appears. */
(function () {
  'use strict';
  var SV = window.SV;
  var $ = function (id) { return document.getElementById(id); };

  function render(st) {
    $('app').setAttribute('data-status', SV.STATUS[st.status]);
    SV.Radar.render($('wRadar'), st, { compact: true });
    $('wTime').textContent = SV.hhmm(Date.now());
    $('wAlert').textContent = st.status === 2 ? 'Alert · open app' : st.status === 1 ? 'Warning · open app' : '';
  }

  SV.Sync.start({ role: 'watch', onState: render });
})();
