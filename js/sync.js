/* sync.js - keeps the app and the watch showing the same data.
   One page is the leader: it runs the simulation engine once a second and broadcasts the state.
   Every other page is a follower: it only displays that state and sends commands back.
   If the leader goes quiet for 3.5 s, a follower takes over, so closing either page is safe.
   Transport: BroadcastChannel, with a localStorage "storage" event as a fallback.
   Both need the pages to be served from the same origin (use a local web server, see README). */
(function () {
  'use strict';
  var SV = window.SV;
  var id = Math.random().toString(36).slice(2, 10);
  var role = 'app', onState = function () {};
  var leader = false, epoch = 0, gotState = false, lastState = 0, last = null;
  var tickT = null, bc = null, seen = {}, mids = [];

  function send(msg) {
    msg.id = id; msg.role = role; msg.epoch = epoch;
    msg.mid = id + Math.random().toString(36).slice(2, 8);
    try { if (bc) bc.postMessage(msg); } catch (e) {}
    try { localStorage.setItem('sv-msg', JSON.stringify(msg)); } catch (e) {}
  }

  function publish() {
    var s = SV.Engine.publicState();
    last = s;
    send({ t: 'state', state: s });
    onState(s);
  }

  function becomeLeader() {
    leader = true; epoch = Date.now();
    SV.Engine.init(last);
    publish();
    clearInterval(tickT);
    tickT = setInterval(function () { SV.Engine.tick(publish); }, 1000);
  }
  function stepDown() { leader = false; clearInterval(tickT); }

  function recv(m) {
    if (!m || m.id === id || mids.indexOf(m.mid) > -1) return;
    mids.push(m.mid); if (mids.length > 80) mids.shift();
    seen[m.id] = { role: m.role, t: Date.now() };
    if (m.t === 'state') {
      if (leader) {
        /* two leaders: the newer one wins, ties go to the lower id */
        if (m.epoch > epoch || (m.epoch === epoch && m.id < id)) stepDown(); else return;
      }
      gotState = true; lastState = Date.now(); last = m.state;
      onState(m.state);
    } else if (m.t === 'hello' && leader) {
      publish();
    } else if (m.t === 'cmd' && leader) {
      SV.Engine.apply(m.cmd); publish();
    }
  }

  SV.Sync = {
    start: function (o) {
      role = o.role; onState = o.onState;
      try { bc = new BroadcastChannel('sentinel-vitals'); bc.onmessage = function (e) { recv(e.data); }; } catch (e) {}
      window.addEventListener('storage', function (e) {
        if (e.key === 'sv-msg' && e.newValue) { try { recv(JSON.parse(e.newValue)); } catch (_) {} }
      });
      send({ t: 'hello' });
      setTimeout(function () { if (!gotState && !leader) becomeLeader(); }, 800);
      setInterval(function () {
        if (!leader && gotState && Date.now() - lastState > 3500) becomeLeader();
        if (!leader) send({ t: 'presence' });
      }, 1000);
    },
    command: function (cmd) {
      if (leader) { SV.Engine.apply(cmd); publish(); } else { send({ t: 'cmd', cmd: cmd }); }
    },
    isLeader: function () { return leader; },
    /* which other pages were heard from in the last 4 seconds, e.g. { watch: true } */
    peers: function () {
      var out = {}, now = Date.now();
      Object.keys(seen).forEach(function (k) { if (now - seen[k].t < 4000) out[seen[k].role] = true; });
      return out;
    }
  };
})();
