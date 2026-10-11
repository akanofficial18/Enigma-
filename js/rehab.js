/* rehab.js - camera-based rehabilitation coach. MediaPipe Pose finds 33 body joints on the device;
   they are drawn as dots, one joint angle is tracked, and reps are counted. Video never leaves the browser. */
(function () {
  'use strict';
  var SV = window.SV, $ = function (id) { return document.getElementById(id); };
  var CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  /* side: [left, right] joint triples (landmark indices). A rep = rest -> active -> rest. */
  var EX = {
    curl:  { name: 'Elbow curl', side: [[11, 13, 15], [12, 14, 16]], above: true, rest: 150, act: 50, tip: 'Keep the upper arm still. Curl until your hand nears your shoulder, then lower fully.' },
    raise: { name: 'Side arm raise', side: [[23, 11, 13], [24, 12, 14]], above: false, rest: 30, act: 80, tip: 'Face the camera. Lift the arm out to the side up to shoulder height, then lower slowly.' },
    squat: { name: 'Mini squat', side: [[23, 25, 27], [24, 26, 28]], above: true, rest: 160, act: 120, tip: 'Stand side-on with your whole body in view. Bend the knees, keep your back straight, stand fully.' },
    knee:  { name: 'Seated knee extension', side: [[23, 25, 27], [24, 26, 28]], above: false, rest: 110, act: 160, tip: 'Sit side-on to the camera. Straighten the knee, hold a moment, lower slowly.' }
  };
  var vid = $('rbVid'), can = $('rbCan'), ctx = can.getContext('2d');
  var mod = null, pl = null, stream = null, raf = 0, run = false, lastT = -1;
  var reps = 0, phase = 'rest', ext = null, roms = [], t0 = 0, prev = null, mv = 0;

  Object.keys(EX).forEach(function (k) { $('rbEx').add(new Option(EX[k].name, k)); });
  function tip() { $('rbTip').textContent = EX[$('rbEx').value].tip; } tip();
  function setMsg(t) { var m = $('rbMsg'); m.textContent = t; m.hidden = !t; }
  function coach(t, cls) { var c = $('rbCoach'); c.textContent = t; c.className = 'issue' + (cls ? ' ' + cls : ''); }
  function ang(a, b, c) {
    var d = Math.abs((Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)) * 180 / Math.PI);
    return d > 180 ? 360 - d : d;
  }

  function load() {
    if (pl) return Promise.resolve();
    setMsg('Loading pose model…');
    return import(CDN + '/vision_bundle.mjs').then(function (m) {
      mod = m; return m.FilesetResolver.forVisionTasks(CDN + '/wasm');
    }).then(function (fs) {
      var mk = function (d) { return mod.PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1 }); };
      return mk('GPU').catch(function () { return mk('CPU'); });
    }).then(function (p) { pl = p; });
  }

  function start() {
    $('rbStart').disabled = true;
    load().then(function () {
      setMsg('Starting camera…');
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    }).then(function (s) {
      stream = s; vid.srcObject = s; return vid.play();
    }).then(function () {
      reps = 0; phase = 'rest'; ext = null; roms = []; prev = null; t0 = Date.now(); run = true; lastT = -1;
      setMsg(''); $('rbStart').hidden = true; $('rbStop').hidden = false; $('rbStart').disabled = false;
      coach('Step back so the joints you are exercising are visible.'); metrics(null); loop();
    }).catch(function (e) {
      setMsg('Could not start: ' + (e && e.message || e) + '. The camera needs permission and HTTPS or localhost.');
      $('rbStart').disabled = false;
    });
  }
  function stop(save) {
    if (!run) return;
    run = false; cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    vid.srcObject = null; ctx.clearRect(0, 0, can.width, can.height);
    if (save && reps > 0) {
      var rom = roms.length ? Math.round(roms.reduce(function (a, b) { return a + b; }, 0) / roms.length) : 0;
      SV.Sync.command({ type: 'event', etype: 'Rehab', text: 'Rehab session: ' + EX[$('rbEx').value].name + ', ' + reps + ' reps in ' + Math.round((Date.now() - t0) / 60000 * 10) / 10 + ' min, average joint angle at peak ' + rom + '°.' });
      SV.toast('Session saved to health history');
    }
    $('rbStart').hidden = false; $('rbStop').hidden = true; setMsg('Camera is off'); coach('Pick an exercise and start the camera.', 'ok');
  }
  SV.rehabStop = stop;

  function loop() {
    if (!run) return;
    if (vid.readyState >= 2 && vid.currentTime !== lastT) {
      lastT = vid.currentTime;
      var r = pl.detectForVideo(vid, performance.now());
      frame(r.landmarks && r.landmarks[0]);
    }
    raf = requestAnimationFrame(loop);
  }

  function frame(L) {
    if (can.width !== vid.videoWidth) { can.width = vid.videoWidth; can.height = vid.videoHeight; }
    ctx.clearRect(0, 0, can.width, can.height);
    if (!L) { coach('No body detected. Move into view and make sure the room is well lit.'); metrics(null); return; }
    var W = can.width, H = can.height, e = EX[$('rbEx').value];
    var vis = function (t) { return (L[t[0]].visibility + L[t[1]].visibility + L[t[2]].visibility) / 3; };
    var tr = vis(e.side[0]) >= vis(e.side[1]) ? e.side[0] : e.side[1];

    if ($('rbLines').checked) {
      ctx.strokeStyle = 'rgba(78,208,195,.55)'; ctx.lineWidth = 3; ctx.beginPath();
      mod.PoseLandmarker.POSE_CONNECTIONS.forEach(function (c) {
        if (L[c.start].visibility < .4 || L[c.end].visibility < .4) return;
        ctx.moveTo(L[c.start].x * W, L[c.start].y * H); ctx.lineTo(L[c.end].x * W, L[c.end].y * H);
      }); ctx.stroke();
    }
    L.forEach(function (p, i) {
      if (p.visibility < .4) return;
      var hot = tr.indexOf(i) > -1;
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, hot ? 9 : 5, 0, 7);
      ctx.fillStyle = hot ? '#F2A640' : '#4ED0C3'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#050B0A'; ctx.stroke();
    });

    var d = 0, ids = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    if (prev) { ids.forEach(function (i) { d += Math.hypot(L[i].x - prev[i].x, L[i].y - prev[i].y); }); d /= ids.length; }
    prev = L.map(function (p) { return { x: p.x, y: p.y }; }); mv = mv * .8 + d * .2;

    if (vis(tr) < .5) { coach('The joints for this exercise are hidden. Adjust your position.'); metrics(null); return; }
    var a = ang(L[tr[0]], L[tr[1]], L[tr[2]]);
    var inRest = e.above ? a > e.rest : a < e.rest, inAct = e.above ? a < e.act : a > e.act;
    ext = ext === null ? a : (e.above ? Math.min(ext, a) : Math.max(ext, a));
    if (inAct) phase = 'act';
    if (inRest) {
      if (phase === 'act') {
        reps++; roms.push(ext); SV.toast('Rep ' + reps);
        if (reps >= (+$('rbTarget').value || 10)) coach('Target reached. Press "Stop and save session".', 'ok');
      }
      phase = 'rest'; ext = null;
    }
    if (reps < (+$('rbTarget').value || 10))
      coach(inAct ? 'Good range. Now return slowly.' : inRest ? 'Ready. Start the movement.' : phase === 'act' ? 'Return all the way to the start.' : 'Go a little further for a full rep.', inAct ? 'ok' : '');
    metrics(a);
  }
  function metrics(a) {
    $('rbReps').textContent = reps;
    $('rbAng').textContent = a === null ? '--' : Math.round(a) + '°';
    $('rbMv').textContent = a === null ? '--' : mv < .003 ? 'Still' : mv < .012 ? 'Gentle' : 'Active';
    $('rbRom').textContent = roms.length ? Math.round(roms.reduce(function (s, x) { return s + x; }, 0) / roms.length) + '°' : '--';
  }

  $('rbStart').addEventListener('click', start);
  $('rbStop').addEventListener('click', function () { stop(true); });
  $('rbEx').addEventListener('change', function () { tip(); reps = 0; phase = 'rest'; ext = null; roms = []; metrics(null); });
})();
