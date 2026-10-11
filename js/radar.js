/* radar.js - draws the six-axis radar into an <svg viewBox="-220 -192 440 384">.
   Three overlapping translucent shapes (now, 5-minute average, baseline), round rings,
   dark diamond markers at each axis end, and a name + value label per axis.
   Used by the app (large) and by the watch (compact). */
(function () {
  'use strict';
  var SV = window.SV;
  var R = 130;

  function ang(i) { return (-90 + i * 60) * Math.PI / 180; }
  function pt(i, f) { return [Math.cos(ang(i)) * R * f, Math.sin(ang(i)) * R * f]; }
  function f1(n) { return n.toFixed(1); }
  function poly(vals) {
    return vals.map(function (f, i) { var p = pt(i, f); return f1(p[0]) + ',' + f1(p[1]); }).join(' ');
  }
  function dots(vals, cls) {
    return vals.map(function (f, i) {
      var p = pt(i, f);
      return '<circle class="rd-d ' + cls + '" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="4"/>';
    }).join('');
  }

  /* state: the shared state from the engine. opt.compact makes labels bigger for the watch. */
  function render(svg, state, opt) {
    if (!svg || !state) return;
    var s = '', i, p, a;
    var now = SV.norm(state.v);
    var avg = SV.norm(state.avg || state.v);
    var base = SV.norm(state.base);
    var flagged = {};
    (state.reasons || []).forEach(function (x) { x.m.forEach(function (k) { flagged[k] = true; }); });

    [0.25, 0.5, 0.75].forEach(function (f) { s += '<circle class="rd-ring" r="' + f1(R * f) + '"/>'; });
    s += '<circle class="rd-ring rd-outer" r="' + R + '"/>';
    for (i = 0; i < 6; i++) { p = pt(i, 1); s += '<line class="rd-spoke" x1="0" y1="0" x2="' + f1(p[0]) + '" y2="' + f1(p[1]) + '"/>'; }

    s += '<polygon class="rd-s base" points="' + poly(base) + '"/>' + dots(base, 'base');
    s += '<polygon class="rd-s avg" points="' + poly(avg) + '"/>' + dots(avg, 'avg');
    s += '<polygon class="rd-s now" points="' + poly(now) + '"/>' + dots(now, 'now');

    for (i = 0; i < 6; i++) {
      a = SV.AXES[i];
      p = pt(i, (R + 16) / R);
      s += '<rect class="rd-dia" x="-5" y="-5" width="10" height="10" transform="translate(' + f1(p[0]) + ' ' + f1(p[1]) + ') rotate(45)"/>';
      var c = Math.cos(ang(i)), q = pt(i, (R + 36) / R);
      var anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
      var x = q[0] + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0);
      var y = q[1];
      var dy = i === 0 ? -6 : i === 3 ? 6 : 0;
      s += '<text class="rd-name" text-anchor="' + anchor + '" x="' + f1(x) + '" y="' + f1(y + dy - 2) + '">' + a.name + '</text>' +
           '<text class="rd-val' + (flagged[a.k] ? ' bad' : '') + '" text-anchor="' + anchor + '" x="' + f1(x) + '" y="' + f1(y + dy + 14) + '">' + SV.withUnit(SV.round(state.v), a.k) + '</text>';
    }
    svg.setAttribute('class', 'radar' + (opt && opt.compact ? ' compact' : ''));
    svg.innerHTML = s;
  }

  SV.Radar = { render: render };
})();
