/* intro.js - particle intro that forms the app name, then an email login. Demo only: no server check. */
(function(){
  var NAME='SENTINEL VITALS', KEY='sv_user';
  var gate=document.getElementById('gate'); if(!gate) return;
  var cv=document.getElementById('gateCan'), cx=cv.getContext('2d');
  var W,H,dpr,parts=[],stage='intro',t0=performance.now(),mouse={x:-999,y:-999},raf;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;

  function store(op,k,v){try{return op==='g'?sessionStorage.getItem(k):op==='s'?sessionStorage.setItem(k,v):sessionStorage.removeItem(k)}catch(e){return null}}
  function setStage(s){stage=s;gate.dataset.stage=s;if(s==='login')for(var i=0;i<parts.length;i++){var p=parts[i];p.bg=true;p.tx=Math.random()*W;p.ty=Math.random()*H;p.vx+=(Math.random()-.5)*6;p.vy+=(Math.random()-.5)*6;}}
  function enter(email){
    store('s',KEY,email);
    gate.classList.add('gone'); cancelAnimationFrame(raf);
    setTimeout(function(){gate.style.display='none'},700);
    var so=document.getElementById('signOut'); if(so) so.hidden=false;
    var ue=document.getElementById('userEmail'); if(ue) ue.textContent=email;
  }

  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,2); W=innerWidth; H=innerHeight;
    cv.width=W*dpr; cv.height=H*dpr; cx.setTransform(dpr,0,0,dpr,0,0); buildTargets();
  }
  function buildTargets(){
    var o=document.createElement('canvas'); o.width=W; o.height=H; var c=o.getContext('2d');
    var fs=Math.max(28,Math.min(W*0.86/(NAME.length*0.56),130));
    c.fillStyle='#fff'; c.font='700 '+fs+'px "Barlow Condensed","Arial Narrow",sans-serif';
    c.textAlign='center'; c.textBaseline='middle'; c.letterSpacing=(fs*0.06)+'px';
    c.fillText(NAME,W/2,H/2-10);
    var d=c.getImageData(0,0,W,H).data, step=Math.max(3,Math.round(fs/22)), pts=[];
    for(var y=0;y<H;y+=step)for(var x=0;x<W;x+=step) if(d[(y*W+x)*4+3]>128) pts.push([x,y]);
    var n=Math.max(pts.length,260);
    while(parts.length<n) parts.push({x:Math.random()*W,y:Math.random()*H,vx:0,vy:0,r:Math.random()*1.4+.6,tx:0,ty:0,h:0,bg:true});
    parts.length=n;
    for(var i=0;i<n;i++){
      var p=parts[i], q=pts[i];
      p.bg=!q; p.tx=q?q[0]:Math.random()*W; p.ty=q?q[1]:Math.random()*H; p.h=Math.random();
    }
  }

  function frame(now){
    raf=requestAnimationFrame(frame);
    var t=(now-t0)/1000;
    if(stage==='intro'&&t>4.6){setStage('login');}
    if(t>1.6) document.getElementById('gTag').classList.add('on');
    cx.fillStyle='rgba(7,16,15,.28)'; cx.fillRect(0,0,W,H);
    var form=stage==='intro'?Math.min(1,Math.max(0,(t-.4)/2.2)):0;   // 0 drifting, 1 formed
    var ease=form*form*(3-2*form);
    for(var i=0;i<parts.length;i++){
      var p=parts[i];
      if(stage==='intro'&&!p.bg){
        p.vx+=(p.tx-p.x)*.012*ease; p.vy+=(p.ty-p.y)*.012*ease; p.vx*=.9; p.vy*=.9;
        p.vx+=(Math.random()-.5)*.25*(1-ease); p.vy+=(Math.random()-.5)*.25*(1-ease);
      }else{
        p.vx+=(Math.random()-.5)*.06; p.vy+=(Math.random()-.5)*.06;
        p.vx*=.985; p.vy*=.985; if(stage==='login'){p.vx+=(p.tx-p.x)*.0006;p.vy+=(p.ty-p.y)*.0006;}
        if(stage==='login'||p.bg){ p.vx+=Math.sin(t*.4+p.h*6)*.004; p.vy+=Math.cos(t*.3+p.h*6)*.004; }
      }
      var dx=p.x-mouse.x, dy=p.y-mouse.y, d2=dx*dx+dy*dy;
      if(d2<90*90&&d2>1){var f=(1-Math.sqrt(d2)/90)*1.2,dd=Math.sqrt(d2);p.vx+=dx/dd*f;p.vy+=dy/dd*f;}
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      var alpha=p.bg?.35:(.55+.45*ease);
      cx.fillStyle=p.h>.8?'rgba(123,174,255,'+alpha+')':'rgba(78,208,195,'+alpha+')';
      cx.beginPath(); cx.arc(p.x,p.y,p.r,0,6.283); cx.fill();
    }
    // faint links between nearby background particles
    if(stage==='login'||form<.6){
      cx.lineWidth=.5;
      for(var a=0;a<parts.length;a+=3)for(var b=a+3;b<parts.length;b+=9){
        var A=parts[a],B=parts[b],x=A.x-B.x,y=A.y-B.y,d=x*x+y*y;
        if(d<80*80){cx.strokeStyle='rgba(78,208,195,'+(.12*(1-Math.sqrt(d)/80))+')';cx.beginPath();cx.moveTo(A.x,A.y);cx.lineTo(B.x,B.y);cx.stroke();}
      }
    }
  }

  addEventListener('resize',resize);
  addEventListener('pointermove',function(e){mouse.x=e.clientX;mouse.y=e.clientY});
  addEventListener('pointerleave',function(){mouse.x=mouse.y=-999});
  document.getElementById('gSkip').addEventListener('click',function(){setStage('login')});

  // login form
  var form=document.getElementById('gForm'), em=document.getElementById('gEmail'), pw=document.getElementById('gPass'), er=document.getElementById('gErr');
  document.getElementById('gShow').addEventListener('click',function(e){
    var s=pw.type==='password'; pw.type=s?'text':'password'; e.target.textContent=s?'Hide':'Show';
  });
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var v=em.value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){er.textContent='Enter a valid email address, e.g. name@example.com';em.focus();return;}
    if(pw.value.length<6){er.textContent='Password must be at least 6 characters';pw.focus();return;}
    er.textContent=''; enter(v);
  });
  var so=document.getElementById('signOut');
  if(so) so.addEventListener('click',function(){store('r',KEY);location.reload();});

  var saved=store('g',KEY);
  resize();
  if(saved){ gate.style.display='none'; gate.classList.add('gone'); if(so)so.hidden=false;
    var ue=document.getElementById('userEmail'); if(ue) ue.textContent=saved; return; }
  if(reduce){ setStage('login'); }
  raf=requestAnimationFrame(frame);
})();
