'use strict';
// Park Dodgeball — everyone for themselves on a park field. Run with one stick, point your hands with the other.
// A flying ball that meets your hands is a catch (the thrower loses a heart); anywhere else on your body is a hit.
// Everything is drawn procedurally; sound is Web Audio.

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const W = 960, H = 540, DPR = Math.min(2, window.devicePixelRatio || 1);
cv.width = W * DPR; cv.height = H * DPR;
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto');
const TOUCH = Q.has('mobile') || (!Q.has('desktop') && (
  matchMedia('(pointer: coarse)').matches ||
  (matchMedia('(any-pointer: coarse)').matches && matchMedia('(hover: none)').matches) ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))));
if (TOUCH) document.body.classList.add('touch');

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// ---------- things to tune ----------
const CFG = {
  HEARTS: 3,
  PR: 15,               // body size (radius)
  BR: 8,                // ball size (radius)
  SPEED: 190,           // running speed
  THROW: 520,           // ball speed
  FLY: 540,             // how far a ball flies before it lands (a landed ball can't hurt)
  CATCH_ARC: TAU / 6,   // how wide your hands are: 1/6 of a circle. Smaller = harder to catch
  BLOCK_ARC: TAU / 4,   // holding a ball? It blocks anything coming at this much of your front
  SAFE: 1.2,            // seconds you can't be hit after losing a heart
  HOLD: 5,              // seconds you can hold a ball before it pops out of your hands
  SHRINK_EVERY: 25,     // seconds between the referee moving the line in
  WARN: 5,              // seconds of warning (yellow line) before the line really moves
  TR: 15,               // tree trunk size (radius)
  WINDUP: .6,           // how long a computer player holds the ball up before throwing
};
const F = { x0: 54, y0: 54, x1: W - 54, y1: H - 54 };   // the grass you can run on (trees are outside)
const inset = (dx, dy) => ({ x0: F.x0 + dx, y0: F.y0 + dy, x1: F.x1 - dx, y1: F.y1 - dy });
const ZONES = [F, inset(70, 42), inset(130, 80), inset(178, 108)];   // the chalk lines: the referee moves play in one line at a time
const DIFF = {
  easy:   { speed: .8, react: .34, catchP: .08, dodgeP: .30, handErr: .5,  turn: 7,  aimErr: .20, lead: .3, wind: 1.5, thr: .8 },
  medium: { speed: .9, react: .24, catchP: .18, dodgeP: .45, handErr: .35, turn: 10, aimErr: .12, lead: .7, wind: 1.1, thr: .9 },
  hard:   { speed: 1,  react: .15, catchP: .30, dodgeP: .55, handErr: .22, turn: 14, aimErr: .06, lead: 1,  wind: .8,  thr: 1 },
};
const KIDS = [
  { name: 'Max', shirt: '#ff5a36', hair: '#5a3a1e' }, { name: 'Zoe', shirt: '#b06cff', hair: '#2b2b2b' },
  { name: 'Sam', shirt: '#ff9f1c', hair: '#d9a441' }, { name: 'Mia', shirt: '#ff7ad9', hair: '#8a4b2a' },
  { name: 'Leo', shirt: '#22c1c3', hair: '#2b2b2b' }, { name: 'Ava', shirt: '#f4f4f4', hair: '#c0392b' },
  { name: 'Finn', shirt: '#a3e635', hair: '#d9a441' }, { name: 'Ruby', shirt: '#7c5cff', hair: '#5a3a1e' },
];
const SKINS = ['#ffd9b3', '#f1c27d', '#c68642', '#8d5524', '#ffe0bd'];

// ---------- saved settings ----------
const SET = Object.assign({ n: 4, diff: 'medium', muted: false, trees: false, shrink: true }, (() => {
  try { return JSON.parse(localStorage.getItem('parkDodgeball1')) || {}; } catch (e) { return {}; }
})());
const saveSet = () => { try { localStorage.setItem('parkDodgeball1', JSON.stringify(SET)); } catch (e) { } };
if (Q.has('n')) SET.n = clamp(+Q.get('n') || 4, 2, 8);
if (DIFF[Q.get('diff')]) SET.diff = Q.get('diff');
if (Q.has('trees')) SET.trees = true;
if (Q.has('shrink')) SET.shrink = Q.get('shrink') !== '0';

// ---------- sound ----------
let AC = null;
function ac() { if (!AC && !AUTO) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } AC?.resume?.(); }
function beep(f0, f1, dur, type = 'sine', vol = .15) {
  if (!AC || SET.muted) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}
const SFX = {
  throw: () => beep(500, 180, .14, 'triangle', .12),
  hit: () => { beep(200, 60, .22, 'square', .14); beep(90, 40, .25, 'sine', .2); },
  catch: () => { beep(520, 780, .1, 'sine', .18); setTimeout(() => beep(780, 1040, .14, 'sine', .18), 90); },
  block: () => beep(300, 220, .1, 'square', .1),
  grab: () => beep(660, 880, .07, 'sine', .08),
  out: () => beep(400, 80, .5, 'sawtooth', .12),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, f, .2, 'triangle', .16), i * 130)),
  go: () => beep(880, 880, .25, 'triangle', .14),
  whistle: () => { for (let i = 0; i < 5; i++) setTimeout(() => beep(2300 + (i % 2) * 250, 2300 + (i % 2) * 250, .09, 'square', .07), i * 70); },
  pop: () => beep(300, 120, .18, 'triangle', .14),
};

// ---------- game state ----------
// G.players: everyone (out ones stay in the list). G.balls: balls NOT in someone's hands (flying "live" or lying "dead").
let G = null, mode = 'title';
function newGame(n, human) {
  const D = DIFF[SET.diff];
  const kids = KIDS.slice().sort(() => Math.random() - .5);
  G = { players: [], balls: [], fx: [], parts: [], t: 0, ready: human ? 1.6 : .5, shake: 0, hurt: 0, human: null, endT: -1, demo: !human,
    stage: 0, zt: CFG.SHRINK_EVERY, warn: false, trees: [], ref: { x: W / 2, y: F.y0 + 12, step: 0 } };
  const cx = W / 2, cy = H / 2;
  if (Q.has('zt')) G.zt = +Q.get('zt');   // testing: seconds until the first line move
  for (let i = 0; i < n; i++) {
    const a = Math.PI + i * TAU / n, k = kids[i % kids.length], me = human && i === 0;
    const p = {
      name: me ? 'YOU' : k.name, shirt: me ? '#2f7bff' : k.shirt, hair: me ? '#3b2a1a' : k.hair, skin: pick(SKINS),
      x: cx + Math.cos(a) * 330, y: cy + Math.sin(a) * 180, vx: 0, vy: 0, hand: a + Math.PI, handT: a + Math.PI, turn: 7,
      hp: CFG.HEARTS, ball: false, hold: 0, noGrab: 0, safe: 0, wind: 0, windMax: 1, out: false, human: me, mx: 0, my: 0, step: rand(0, 9),
      catches: 0, hits: 0, place: 0, D: me ? DIFF.medium : D,
      ai: { th: null, plan: '', react: 0, err: 0, side: 1, sideT: 0, cool: 0, tgt: null, tgtT: 0, wx: cx, wy: cy, wT: 0, px: 0, py: 0 },
    };
    G.players.push(p); if (me) G.human = p;
  }
  const nb = Math.ceil(n / 2) + 1;
  for (let i = 0; i < nb; i++) G.balls.push(mkBall(cx, cy + (i - (nb - 1) / 2) * 46, 0, 0));
  // a few trees in the middle of the park (if switched on)
  if (SET.trees) for (let tries = 0; tries < 300 && G.trees.length < 4; tries++) {
    const t = { x: rand(F.x0 + 110, F.x1 - 110), y: rand(F.y0 + 80, F.y1 - 80), r: rand(30, 38), col: pick(['#2f8a3a', '#27803a', '#3a9440']) };
    if (Math.abs(t.x - cx) < 60) continue;
    if (G.trees.some(o => Math.hypot(o.x - t.x, o.y - t.y) < 130) || G.players.some(o => Math.hypot(o.x - t.x, o.y - t.y) < 60)) continue;
    G.trees.push(t);
  }
}
const mkBall = (x, y, vx, vy) => ({ x, y, vx, vy, live: false, owner: null, flown: 0, spin: rand(0, 6) });
const alive = () => G.players.filter(p => !p.out);
const say = (x, y, txt, col = '#fff', big = false) => G.fx.push({ x, y, txt, col, t: 0, big });
function puff(x, y, col, n = 8, sp = 90) {
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(.3, 1) * sp; G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(.3, .6), col, r: rand(2, 4.5) }); }
}

// ---------- throwing, catching, getting hit ----------
function throwBall(p, ang, speed = CFG.THROW) {
  if (!p.ball) return;
  p.ball = false; p.wind = 0; p.hand = ang;
  const d = CFG.PR + CFG.BR + 2;
  const b = mkBall(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, Math.cos(ang) * speed, Math.sin(ang) * speed);
  b.live = true; b.owner = p; G.balls.push(b); SFX.throw();
}
function grab(p) { p.ball = true; p.hold = 0; p.wind = 0; p.ai.cool = rand(.8, 2.2) * p.D.wind; p.ai.tgtT = 0; }
function loseHeart(p) {
  p.hp--; p.safe = CFG.SAFE;
  if (p === G.human) { G.shake = .35; G.hurt = .5; navigator.vibrate?.(80); }
  if (p.hp > 0) return;
  p.out = true; p.place = alive().length + 1;
  if (p.ball) { p.ball = false; G.balls.push(mkBall(p.x, p.y, rand(-40, 40), rand(-40, 40))); }
  say(p.x, p.y - 34, p.name + (p.human ? ' ARE OUT!' : ' IS OUT!'), '#ffd43b', true); puff(p.x, p.y, '#fff', 18, 160); SFX.out();
}
function deadBounce(b, p) {   // ball stops being dangerous and pops off the player
  const a = Math.atan2(b.y - p.y, b.x - p.x) + rand(-.5, .5), s = rand(90, 160);
  b.live = false; b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s;
}
function ballMeetsPlayer(b, p) {
  const toBall = Math.atan2(b.y - p.y, b.x - p.x);
  const inHands = Math.abs(wrapA(toBall - p.hand)) <= (p.ball ? CFG.BLOCK_ARC : CFG.CATCH_ARC) / 2;
  if (inHands && !p.ball) {           // CATCH! the thrower loses a heart
    G.balls.splice(G.balls.indexOf(b), 1); grab(p); p.catches++;
    say(p.x, p.y - 34, 'CATCH!', '#7CFC9A', true); puff(b.x, b.y, '#fff', 8); SFX.catch();
    const o = b.owner;
    if (o && !o.out) { say(o.x, o.y - 34, 'CAUGHT OUT!', '#ff8a70'); loseHeart(o); }
  } else if (inHands) {               // already holding a ball: it bounces off your ball
    const sp = Math.hypot(b.vx, b.vy) || 1;     // it loses nearly all its speed and plops back the way it came
    b.live = false; b.vx = -b.vx / sp * 45; b.vy = -b.vy / sp * 45;
    say(p.x, p.y - 34, 'BLOCK!', '#bfe3ff'); puff(b.x, b.y, '#fff', 5, 50); SFX.block();
  } else if (p.safe > 0) {
    deadBounce(b, p);
  } else {                            // HIT
    p.vx += b.vx * .3; p.vy += b.vy * .3;
    puff(b.x, b.y, '#ffe36e', 10, 140); deadBounce(b, p); SFX.hit();
    if (b.owner) b.owner.hits++;
    say(p.x, p.y - 34, p.human ? 'OUCH!' : 'HIT!', '#ff8a70', p.human);
    loseHeart(p);
  }
}

// ---------- computer players ----------
function think(p, dt) {
  const D = p.D, ai = p.ai, PR = CFG.PR, BR = CFG.BR;
  p.mx = p.my = 0; p.turn = 7;
  const others = G.players.filter(o => o !== p && !o.out);
  ai.sideT -= dt; if (ai.sideT <= 0) { ai.sideT = rand(.6, 1.8); ai.side = Math.random() < .5 ? 1 : -1; }

  // is a ball flying at me?
  let th = null, bt = 9;
  if (p.wind <= 0) for (const b of G.balls) {
    if (!b.live || b.owner === p) continue;
    const rx = p.x - b.x, ry = p.y - b.y, t = (rx * b.vx + ry * b.vy) / (b.vx * b.vx + b.vy * b.vy);
    if (t < 0 || t > .9) continue;
    const px = rx - b.vx * t, py = ry - b.vy * t;
    if (Math.hypot(px, py) > PR + BR + 16) continue;
    if (t < bt) { bt = t; th = b; ai.px = px; ai.py = py; }
  }
  if (th !== ai.th) {
    ai.th = th;
    if (th) {
      const r = Math.random();
      ai.react = D.react * rand(.6, 1.5); ai.err = rand(-1, 1) * D.handErr;
      ai.plan = r < D.catchP ? 'catch' : r < D.catchP + D.dodgeP ? 'dodge' : 'oops';
    }
  }
  if (th && (ai.react -= dt) <= 0) {
    if (ai.plan === 'catch') { p.handT = Math.atan2(th.y - p.y, th.x - p.x) + ai.err; p.turn = D.turn; return; }
    if (ai.plan === 'dodge') {
      let px = ai.px, py = ai.py;
      if (Math.hypot(px, py) < 3) { px = -th.vy * ai.side; py = th.vx * ai.side; }
      const m = Math.hypot(px, py) || 1; p.mx = px / m; p.my = py / m; return;
    }
  }

  const go = (tx, ty, s = 1) => { const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy) || 1; p.mx += dx / m * s; p.my += dy / m * s; return m; };
  const wander = () => {
    ai.wT -= dt;
    if (ai.wT <= 0 || Math.hypot(ai.wx - p.x, ai.wy - p.y) < 20) { ai.wT = rand(1, 2.5); ai.wx = rand(F.x0 + 60, F.x1 - 60); ai.wy = rand(F.y0 + 50, F.y1 - 50); }
    go(ai.wx, ai.wy, .7);
  };

  if (!p.ball) {
    // run to the nearest ball on the ground
    let best = null, bd = 1e9;
    for (const b of G.balls) { if (b.live) continue; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = b; } }
    if (best) go(best.x, best.y);
    else {
      // no balls: keep away from whoever is holding one
      let scary = null, sd = 240;
      for (const o of others) { if (!o.ball) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < sd) { sd = d; scary = o; } }
      if (scary) { go(scary.x, scary.y, -1); go(W / 2, H / 2, .45); p.mx += -(scary.y - p.y) / sd * ai.side * .5; p.my += (scary.x - p.x) / sd * ai.side * .5; }
      else wander();
    }
    if (p.mx || p.my) p.handT = Math.atan2(p.my, p.mx);
    return;
  }

  // I have a ball: pick somebody and throw it at them
  ai.tgtT -= dt;
  if (!ai.tgt || ai.tgt.out || (ai.tgtT <= 0 && p.wind <= 0)) {
    ai.tgt = null; ai.tgtT = rand(2, 4);
    let tot = 0; const ws = others.map(o => { const w = 1 / (Math.hypot(o.x - p.x, o.y - p.y) + 80); tot += w; return w; });
    let r = Math.random() * tot;
    for (let i = 0; i < others.length; i++) { if ((r -= ws[i]) <= 0) { ai.tgt = others[i]; break; } }
  }
  const t = ai.tgt;
  if (!t) { wander(); if (p.hold > CFG.HOLD - 1) throwBall(p, p.hand); return; }
  const d = Math.hypot(t.x - p.x, t.y - p.y), fly = d / (CFG.THROW * D.thr);
  const aim = Math.atan2(t.y + t.vy * fly * D.lead - p.y, t.x + t.vx * fly * D.lead - p.x);
  p.handT = aim; p.turn = 12;
  const ux = (t.x - p.x) / (d || 1), uy = (t.y - p.y) / (d || 1);
  if (p.wind > 0) {
    p.mx = -uy * ai.side * .3; p.my = ux * ai.side * .3;
    p.wind -= dt;
    if (p.wind <= 0) throwBall(p, aim + rand(-1, 1) * D.aimErr, CFG.THROW * D.thr);
    return;
  }
  const fwd = d > 270 ? 1 : d < 140 ? -1 : 0;
  p.mx = ux * fwd - uy * ai.side * .7; p.my = uy * fwd + ux * ai.side * .7;
  ai.cool -= dt;
  if ((d < 310 && ai.cool <= 0) || p.hold > CFG.HOLD - 1.5) { p.wind = p.windMax = CFG.WINDUP * D.wind; }
}

// ---------- your controls ----------
const keys = {};
const move = { id: null, cx: 0, cy: 0, x: 0, y: 0 };   // left stick
const aim = { id: null, cx: 0, cy: 0, x: 0, y: 0 };    // right stick
const mouse = { x: W / 2, y: H / 2, moved: false };
const STICK = 48;
function toGame(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
function humanThrow() { const p = G.human; if (mode === 'play' && p && !p.out && p.ball && G.ready <= 0) throwBall(p, p.hand); }

addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); ac(); humanThrow(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

if (TOUCH) {
  const setStick = (s, e) => {
    const q = toGame(e); let dx = q.x - s.cx, dy = q.y - s.cy; const m = Math.hypot(dx, dy);
    if (m > STICK) { s.cx += dx * (1 - STICK / m); s.cy += dy * (1 - STICK / m); dx *= STICK / m; dy *= STICK / m; }   // the stick follows your thumb
    s.x = dx / STICK; s.y = dy / STICK;
  };
  addEventListener('pointerdown', e => {
    if (mode !== 'play' || e.target.closest('button')) return;
    ac(); e.preventDefault();
    const q = toGame(e), s = q.x < W / 2 ? move : aim;
    if (s.id !== null) return;
    s.id = e.pointerId; s.cx = q.x; s.cy = q.y; s.x = s.y = 0;
  }, { passive: false });
  addEventListener('pointermove', e => { if (e.pointerId === move.id) setStick(move, e); else if (e.pointerId === aim.id) setStick(aim, e); });
  const end = e => {
    if (e.pointerId === move.id) { move.id = null; move.x = move.y = 0; }
    if (e.pointerId === aim.id) {
      aim.id = null; aim.x = aim.y = 0;
      if (e.type === 'pointerup') humanThrow();    // a tap, or letting go = throw
    }
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  addEventListener('contextmenu', e => e.preventDefault());
} else {
  cv.addEventListener('pointermove', e => { const q = toGame(e); mouse.x = q.x; mouse.y = q.y; mouse.moved = true; });
  cv.addEventListener('pointerdown', e => { ac(); const q = toGame(e); mouse.x = q.x; mouse.y = q.y; mouse.moved = true; if (G.human && !G.human.out) G.human.hand = Math.atan2(mouse.y - G.human.y, mouse.x - G.human.x); humanThrow(); });
}
function control(p) {
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + move.x;
  let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + move.y;
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  p.mx = mx; p.my = my;
  if (TOUCH) { if (Math.hypot(aim.x, aim.y) > .3) p.hand = Math.atan2(aim.y, aim.x); }
  else if (mouse.moved) p.hand = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  p.handT = p.hand;
}

// ---------- one tick of the game ----------
function step(dt) {
  G.t += dt; G.shake = Math.max(0, G.shake - dt); G.hurt = Math.max(0, G.hurt - dt);
  const PR = CFG.PR, BR = CFG.BR;
  if (G.ready > 0) { G.ready -= dt; if (G.ready <= 0 && !G.demo) SFX.go(); }
  const frozen = G.ready > 0;
  // the referee moves the line in
  if (SET.shrink && !frozen && G.stage < ZONES.length - 1 && alive().length > 1) {
    G.zt -= dt;
    if (!G.warn && G.zt <= CFG.WARN) { G.warn = true; say(G.ref.x, G.ref.y + 34, 'MOVE IN!', '#ffd43b', true); if (!G.demo) SFX.whistle(); }
    if (G.zt <= 0) { G.stage++; G.zt = CFG.SHRINK_EVERY; G.warn = false; if (!G.demo) SFX.whistle(); }
  }
  const Z = ZONES[G.stage], NZ = G.warn ? ZONES[G.stage + 1] : Z;
  const rf = G.ref, rty = G.stage ? Z.y0 - 20 : F.y0 + 12;
  if (Math.abs(rty - rf.y) > 1) { rf.y += clamp(rty - rf.y, -40 * dt, 40 * dt); rf.step += dt * 9; }

  for (const p of G.players) {
    if (p.out) continue;
    p.safe = Math.max(0, p.safe - dt);
    if (frozen) { p.mx = p.my = 0; if (p.human && !AUTO) control(p), p.mx = p.my = 0; }
    else if (p.human && !AUTO) control(p);
    else {
      think(p, dt);
      // computer players stay inside the line (and head for the new one when the referee whistles)
      const m = PR + 8;
      if (p.x < NZ.x0 + m) p.mx = Math.max(p.mx, p.x < NZ.x0 + m - 6 ? 1 : 0); if (p.x > NZ.x1 - m) p.mx = Math.min(p.mx, p.x > NZ.x1 - m + 6 ? -1 : 0);
      if (p.y < NZ.y0 + m) p.my = Math.max(p.my, p.y < NZ.y0 + m - 6 ? 1 : 0); if (p.y > NZ.y1 - m) p.my = Math.min(p.my, p.y > NZ.y1 - m + 6 ? -1 : 0);
    }
    // hold a ball too long and it pops out of your hands
    p.noGrab -= dt;
    if (p.ball && !frozen && (p.hold += dt) >= CFG.HOLD) {
      p.ball = false; p.wind = 0; p.noGrab = .8;
      const d = PR + BR + 4; G.balls.push(mkBall(p.x + Math.cos(p.hand) * d, p.y + Math.sin(p.hand) * d, Math.cos(p.hand) * 130, Math.sin(p.hand) * 130));
      say(p.x, p.y - 34, 'TOO SLOW!', '#ffd43b'); if (p.human) SFX.pop();
    }
    const m = Math.hypot(p.mx, p.my), k = m > 1 ? 1 / m : 1, sp = CFG.SPEED * (p.human ? 1 : p.D.speed);
    const e = 1 - Math.exp(-12 * dt);
    p.vx = lerp(p.vx, p.mx * k * sp, e); p.vy = lerp(p.vy, p.my * k * sp, e);
    p.x += p.vx * dt; p.y += p.vy * dt; p.step += Math.hypot(p.vx, p.vy) * dt * .09;
    p.x = clamp(p.x, F.x0 + PR, F.x1 - PR); p.y = clamp(p.y, F.y0 + PR, F.y1 - PR);
    for (const t of G.trees) {
      const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy) || 1, min = PR + CFG.TR;
      if (d < min) { p.x = t.x + dx / d * min; p.y = t.y + dy / d * min; if (!p.human || AUTO) { p.x += -dy / d * p.ai.side * 40 * dt; p.y += dx / d * p.ai.side * 40 * dt; } }
    }
    // right over the chalk line = lose a heart and get bumped back in
    if (G.stage && !frozen && (p.x < Z.x0 - PR || p.x > Z.x1 + PR || p.y < Z.y0 - PR || p.y > Z.y1 + PR)) {
      say(p.x, p.y - 34, 'OUT OF BOUNDS!', '#ff8a70', p.human); SFX.hit(); loseHeart(p);
      p.x = clamp(p.x, Z.x0 + PR + 16, Z.x1 - PR - 16); p.y = clamp(p.y, Z.y0 + PR + 16, Z.y1 - PR - 16); p.vx = p.vy = 0;
      if (p.out) continue;
    }
    if (!p.human || AUTO) p.hand += clamp(wrapA(p.handT - p.hand), -p.turn * dt, p.turn * dt);
  }
  // players can't stand on top of each other
  const ps = alive();
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    if (d < PR * 2) { const o = (PR * 2 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
  }

  for (const b of G.balls.slice()) {
    const sp = Math.hypot(b.vx, b.vy);
    b.x += b.vx * dt; b.y += b.vy * dt; b.spin += sp * dt * .05;
    if (b.live) {
      b.flown += sp * dt;
      if (b.flown >= CFG.FLY) { b.live = false; b.vx *= .45; b.vy *= .45; puff(b.x, b.y, '#8fd46a', 5, 60); }
    } else {
      const f = Math.exp(-2.4 * dt); b.vx *= f; b.vy *= f;
      // balls left outside the line get rolled back in
      if (b.x < Z.x0 + 20 || b.x > Z.x1 - 20 || b.y < Z.y0 + 20 || b.y > Z.y1 - 20) { const dx = W / 2 - b.x, dy = H / 2 - b.y, m = Math.hypot(dx, dy) || 1; b.vx += dx / m * 380 * dt; b.vy += dy / m * 380 * dt; }
    }
    for (const t of G.trees) {
      const dx = b.x - t.x, dy = b.y - t.y, d = Math.hypot(dx, dy) || 1, min = BR + CFG.TR - 2;
      if (d >= min) continue;
      const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
      b.x = t.x + nx * min; b.y = t.y + ny * min;
      if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
      if (b.live) { b.live = false; b.vx *= .35; b.vy *= .35; puff(b.x, b.y, '#8a5a2b', 6, 80); }
    }
    let wall = false;
    if (b.x < F.x0 + BR) { b.x = F.x0 + BR; b.vx = Math.abs(b.vx); wall = true; }
    if (b.x > F.x1 - BR) { b.x = F.x1 - BR; b.vx = -Math.abs(b.vx); wall = true; }
    if (b.y < F.y0 + BR) { b.y = F.y0 + BR; b.vy = Math.abs(b.vy); wall = true; }
    if (b.y > F.y1 - BR) { b.y = F.y1 - BR; b.vy = -Math.abs(b.vy); wall = true; }
    if (wall && b.live) { b.live = false; b.vx *= .4; b.vy *= .4; puff(b.x, b.y, '#3f8f3a', 6, 80); }
    for (const p of ps) {
      if (p.out || Math.hypot(p.x - b.x, p.y - b.y) > PR + BR) continue;
      if (b.live) { if (p !== b.owner) { ballMeetsPlayer(b, p); break; } }
      else if (!p.ball && !frozen && p.noGrab <= 0) { G.balls.splice(G.balls.indexOf(b), 1); grab(p); if (p.human) SFX.grab(); break; }
    }
  }

  for (const f of G.fx) { f.t += dt; f.y -= 26 * dt; }
  G.fx = G.fx.filter(f => f.t < 1.1);
  for (const q of G.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .94; q.vy *= .94; }
  G.parts = G.parts.filter(q => q.t < q.life);

  // is it over?
  const left = alive().length;
  if (G.demo) { if (left <= 1 && (G.endT < 0 ? (G.endT = 2.5) : (G.endT -= dt)) <= 0) newGame(6, false); }
  else if (mode === 'play') {
    const me = G.human;
    if (G.endT < 0 && (me.out || left <= 1)) { G.endT = 1.1; if (!me.out) { me.place = 1; SFX.win(); } }
    if (G.endT >= 0 && (G.endT -= dt) <= 0) showEnd();
  }
}

// ---------- drawing ----------
const park = document.createElement('canvas');
function bakePark() {
  park.width = W * DPR; park.height = H * DPR;
  const c = park.getContext('2d'); c.scale(DPR, DPR);
  c.fillStyle = '#2e6f2c'; c.fillRect(0, 0, W, H);
  // mown stripes
  c.save(); c.beginPath(); c.roundRect(F.x0 - 14, F.y0 - 14, F.x1 - F.x0 + 28, F.y1 - F.y0 + 28, 26); c.clip();
  for (let x = 0, i = 0; x < W; x += 71, i++) { c.fillStyle = i % 2 ? '#62bd4c' : '#6cc855'; c.fillRect(x, 0, 71, H); }
  // worn patch in the middle, daisies and tufts
  const g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 150); g.addColorStop(0, 'rgba(190,170,90,.28)'); g.addColorStop(1, 'rgba(190,170,90,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = rand(F.x0, F.x1), y = rand(F.y0, F.y1);
    if (i % 3 === 0) { c.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + Math.cos(k * 1.257) * 2.6, y + Math.sin(k * 1.257) * 2.6, 1.7, 0, TAU); c.fill(); } c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill(); }
    else { c.strokeStyle = 'rgba(40,110,40,.45)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x - 4, y - 5); c.moveTo(x, y); c.lineTo(x, y - 6); c.moveTo(x + 3, y); c.lineTo(x + 4, y - 5); c.stroke(); }
  }
  c.restore();
  // a ring of trees all the way round
  const trees = [];
  for (let x = 10; x < W; x += rand(38, 52)) { trees.push([x, rand(6, 24)], [x + rand(-12, 12), H - rand(6, 24)]); }
  for (let y = 50; y < H - 40; y += rand(38, 52)) { trees.push([rand(6, 24), y], [W - rand(6, 24), y + rand(-12, 12)]); }
  trees.sort((a, b) => a[1] - b[1]);
  c.fillStyle = 'rgba(0,0,0,.22)';
  for (const [x, y] of trees) { c.beginPath(); c.arc(x + 7, y + 10, 34, 0, TAU); c.fill(); }
  for (const [x, y] of trees) {
    const r = rand(29, 37), col = pick(['#2f8a3a', '#27803a', '#3a9440', '#2b7a4b']);
    c.fillStyle = '#1e5a28'; c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.fill();
    c.fillStyle = col; for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(x + Math.cos(k * .9) * r * .45, y + Math.sin(k * .9) * r * .45, r * .62, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(190,240,130,.35)'; c.beginPath(); c.arc(x - r * .28, y - r * .3, r * .38, 0, TAU); c.fill();
    c.fillStyle = 'rgba(190,240,130,.3)'; c.beginPath(); c.arc(x + r * .2, y - r * .05, r * .16, 0, TAU); c.fill();
  }
}
function txt(s, x, y, size, col, align = 'center', stroke = '#1d1a33', lw = 4) {
  ctx.font = size + 'px Bangers, Impact, sans-serif'; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function drawBallAt(x, y, r, spin) {
  ctx.fillStyle = '#e8372c'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#7d1410'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(125,20,16,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r * .62, spin, spin + 2.2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, r * .28, 0, TAU); ctx.fill();
}
function drawBall(b) {
  const up = b.live ? Math.sin(Math.min(1, b.flown / CFG.FLY) * Math.PI) * 9 + 5 : 0;   // flying balls float above their shadow
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(b.x + 2 + up * .4, b.y + 4 + up, CFG.BR, CFG.BR * .7, 0, 0, TAU); ctx.fill();
  if (b.live) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    for (let i = 1; i <= 4; i++) { ctx.fillStyle = `rgba(255,255,255,${.22 - i * .045})`; ctx.beginPath(); ctx.arc(b.x - b.vx / sp * i * 9, b.y - b.vy / sp * i * 9, CFG.BR - i, 0, TAU); ctx.fill(); }
  }
  drawBallAt(b.x, b.y, CFG.BR + (b.live ? 1.5 : 0), b.spin);
}
function drawPlayer(p) {
  const PR = CFG.PR, half = CFG.CATCH_ARC / 2;
  ctx.save();
  if (p.safe > 0 && Math.floor(G.t * 14) % 2) ctx.globalAlpha = .4;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 6, PR + 1, PR * .8, 0, 0, TAU); ctx.fill();
  if (p.human) { ctx.strokeStyle = p.ball ? 'rgba(29,26,51,.35)' : '#ffd43b'; ctx.lineWidth = p.ball ? 5 : 3; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 9, 0, TAU); ctx.stroke(); }
  if (p.wind > 0) {   // about to throw: warning ring
    const k = 1 - p.wind / p.windMax;
    ctx.strokeStyle = `rgba(255,70,50,${.4 + k * .5})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 16 - k * 9, 0, TAU); ctx.stroke();
  }
  if (p.human && p.ball) {   // yellow ring runs down: throw before it's gone!
    const k = 1 - p.hold / CFG.HOLD;
    ctx.strokeStyle = k < .4 ? '#ff5a36' : '#ffd43b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, PR + 9, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
  }
  ctx.translate(p.x, p.y); ctx.rotate(p.hand);
  // feet
  const sw = Math.sin(p.step) * 6 * Math.min(1, Math.hypot(p.vx, p.vy) / 60);
  ctx.fillStyle = '#2b2b3a'; ctx.beginPath(); ctx.ellipse(sw, -6, 6, 4, 0, 0, TAU); ctx.ellipse(-sw, 6, 6, 4, 0, 0, TAU); ctx.fill();
  // hands (and the catching zone between them)
  const hd = PR + 5, wk = p.wind > 0 ? 1 - p.wind / p.windMax : 0;
  const bd = lerp(PR + 6, 2, wk);
  const hx = p.ball ? bd : Math.cos(half * .8) * hd, hy = p.ball ? CFG.BR + 1 : Math.sin(half * .8) * hd;
  ctx.strokeStyle = p.shirt; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(1, -PR + 4); ctx.lineTo(hx, -hy); ctx.moveTo(1, PR - 4); ctx.lineTo(hx, hy); ctx.stroke();
  if (p.human) {   // your catching zone (white), or blocking zone when you hold a ball (blue)
    const z = (p.ball ? CFG.BLOCK_ARC : CFG.CATCH_ARC) / 2;
    ctx.strokeStyle = p.ball ? 'rgba(150,215,255,.8)' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, PR + CFG.BR + (p.ball ? 11 : 3), -z, z); ctx.stroke();
  }
  // body and head
  ctx.fillStyle = p.shirt; ctx.strokeStyle = '#1d1a33'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 9, PR, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(hx, -hy, 4.5, 0, TAU); ctx.arc(hx, hy, 4.5, 0, TAU); ctx.fill();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx, -hy, 4.5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, TAU); ctx.stroke();
  if (p.ball && !(p.hold > CFG.HOLD - 2 && Math.floor(G.t * 10) % 2)) drawBallAt(bd, 0, CFG.BR + wk * 2, 1);   // flashes when it's about to pop out
  ctx.lineWidth = 2; ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(1, 0, 8.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = p.hair; ctx.beginPath(); ctx.arc(0, 0, 8.5, Math.PI * .42, Math.PI * 1.58); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawTags() {
  for (const p of alive()) {
    let s = ''; for (let i = 0; i < p.hp; i++) s += '♥';
    ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#1d1a33'; ctx.strokeText(s, p.x, p.y - 29); ctx.fillStyle = '#ff4d5e'; ctx.fillText(s, p.x, p.y - 29);
    txt(p.name, p.x, p.y + 31, 13, p.human ? '#ffd43b' : '#fff', 'center', '#1d1a33', 3);
  }
}
function drawZones() {
  const Z = ZONES[G.stage];
  if (G.stage) { ctx.fillStyle = 'rgba(10,50,10,.25)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(Z.x0, Z.y0, Z.x1 - Z.x0, Z.y1 - Z.y0); ctx.fill('evenodd'); }
  for (let i = 1; i < ZONES.length; i++) {
    const z = ZONES[i], on = i === G.stage, next = G.warn && i === G.stage + 1;
    if (i < G.stage) continue;
    ctx.lineWidth = on || next ? 4 : 2.5;
    ctx.strokeStyle = next ? (Math.floor(G.t * 6) % 2 ? '#ffd43b' : '#fff') : on ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.3)';
    ctx.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    if (on || next) for (const [x, y] of [[z.x0, z.y0], [z.x1, z.y0], [z.x0, z.y1], [z.x1, z.y1], [(z.x0 + z.x1) / 2, z.y1], [z.x0, (z.y0 + z.y1) / 2], [z.x1, (z.y0 + z.y1) / 2]]) {   // cones
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 7, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#1d1a33'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    }
  }
}
function drawRef() {
  const r = G.ref, sw = Math.sin(r.step) * 4;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(r.x + 3, r.y + 6, 15, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2b3a'; ctx.beginPath(); ctx.ellipse(r.x - 6, r.y + 4 + sw, 4, 6, 0, 0, TAU); ctx.ellipse(r.x + 6, r.y + 4 - sw, 4, 6, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.ellipse(r.x, r.y, 15, 9, 0, 0, TAU); ctx.clip();
  for (let i = -3; i <= 3; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#1d1a33'; ctx.fillRect(r.x + i * 5 - 2.5, r.y - 10, 5, 20); }
  ctx.restore();
  ctx.strokeStyle = '#1d1a33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.x, r.y, 15, 9, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(r.x, r.y + 1, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1d1a33'; ctx.beginPath(); ctx.arc(r.x, r.y, 8, Math.PI, TAU); ctx.closePath(); ctx.fill();   // cap
  if (G.warn) { ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(r.x + 3, r.y + 9, 3, 0, TAU); ctx.fill(); ctx.stroke(); }   // whistle
  txt('REF', r.x, r.y - 17, 12, '#fff', 'center', '#1d1a33', 3);
}
function drawStick(s, hx, hy, label) {
  const on = s.id !== null, cx = on ? s.cx : hx, cy = on ? s.cy : hy;
  ctx.fillStyle = on ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.1)'; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, STICK, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = on ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(cx + s.x * STICK, cy + s.y * STICK, 22, 0, TAU); ctx.fill();
  if (!on) txt(label, cx, cy, 15, 'rgba(255,255,255,.9)', 'center', 'rgba(29,26,51,.6)', 3);
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  if (G.shake > 0) ctx.translate(rand(-1, 1) * G.shake * 16, rand(-1, 1) * G.shake * 16);
  ctx.drawImage(park, 0, 0, W, H);
  if (SET.shrink) drawZones();
  for (const b of G.balls) if (!b.live) drawBall(b);
  for (const t of G.trees) {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(t.x + 7, t.y + 10, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a4f24'; ctx.strokeStyle = '#3d2710'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, CFG.TR - 2, 0, TAU); ctx.fill(); ctx.stroke();
  }
  if (SET.shrink) drawRef();
  for (const p of alive().sort((a, b) => a.y - b.y)) drawPlayer(p);
  for (const b of G.balls) if (b.live) drawBall(b);
  ctx.globalAlpha = .5;   // leaves: see-through so you can still spot who's hiding under them
  for (const t of G.trees) {
    ctx.fillStyle = t.col; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(t.x + Math.cos(k * .9) * t.r * .45, t.y + Math.sin(k * .9) * t.r * .45, t.r * .62, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(190,240,130,.5)'; ctx.beginPath(); ctx.arc(t.x - t.r * .28, t.y - t.r * .3, t.r * .38, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const q of G.parts) { ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  drawTags();
  for (const f of G.fx) { ctx.globalAlpha = clamp((1.1 - f.t) * 3, 0, 1); txt(f.txt, f.x, f.y, (f.big ? 26 : 19) * Math.min(1, .5 + f.t * 5), f.col); }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (mode !== 'play') return;
  if (G.hurt > 0) { ctx.fillStyle = `rgba(255,40,30,${G.hurt * .5})`; ctx.fillRect(0, 0, W, H); }
  txt('Players left: ' + alive().length, 16, 22, 22, '#fff', 'left');
  if (G.warn) txt('GET INSIDE THE YELLOW LINE!  ' + Math.ceil(G.zt), W / 2, 24, 26, '#ffd43b', 'center', '#1d1a33', 5);
  if (G.ready > 0) txt(G.ready > .5 ? 'READY…' : 'GO!', W / 2, H / 2 - 110, 76, '#ffd43b', 'center', '#1d1a33', 8);
  const me = G.human;
  if (me && !me.out && G.ready > 0) { txt('▼', me.x, me.y - 52 + Math.sin(G.t * 8) * 4, 26, '#ffd43b'); }
  if (TOUCH && !AUTO && me && !me.out) { drawStick(move, 105, H - 105, 'RUN'); drawStick(aim, W - 105, H - 105, me.ball ? 'THROW' : 'HANDS'); }
}

// ---------- menus ----------
function setMode(m) { mode = m; document.body.classList.toggle('title', m === 'title'); document.body.classList.toggle('over', m === 'over'); }
function optButtons(id, list, key) {
  const box = $(id);
  for (const [val, label] of list) {
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = () => { ac(); SET[key] = val; saveSet(); [...box.children].forEach(c => c.classList.toggle('on', c === b)); };
    if (SET[key] === val) b.classList.add('on');
    box.appendChild(b);
  }
}
optButtons('nBtns', [2, 3, 4, 5, 6, 7, 8].map(n => [n, n]), 'n');
optButtons('sBtns', [[false, 'No'], [true, 'Yes']], 'shrink');
optButtons('tBtns', [[false, 'No'], [true, 'Yes']], 'trees');
optButtons('dBtns', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], 'diff');
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
function showEnd() {
  const me = G.human, n = G.players.length;
  $('endTitle').textContent = me.place === 1 ? 'YOU WIN! 🏆' : me.place === 2 ? 'SO CLOSE!' : "YOU'RE OUT!";
  $('endText').innerHTML = `You came <b>${ORD[me.place]}</b> out of ${n}.<br>Catches: <b>${me.catches}</b> &nbsp; Hits: <b>${me.hits}</b>`;
  setMode('over');
}
function startPlay() { ac(); goFullscreen(); newGame(SET.n, true); move.id = aim.id = null; move.x = move.y = aim.x = aim.y = 0; setMode('play'); }
$('playBtn').onclick = startPlay; $('againBtn').onclick = startPlay;
const toMenu = () => { newGame(6, false); setMode('title'); };
$('menuBtn').onclick = toMenu; $('quitBtn').onclick = toMenu;
$('muteBtn').textContent = SET.muted ? '🔇' : '🔊';
$('muteBtn').onclick = () => { ac(); SET.muted = !SET.muted; saveSet(); $('muteBtn').textContent = SET.muted ? '🔇' : '🔊'; };
$('anyway').onclick = () => document.body.classList.add('portraitOk');

const docEl = document.documentElement;
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function goFullscreen() {
  if (!TOUCH || AUTO || isFs() || !fsSupported) return;
  try {
    const p = docEl.requestFullscreen ? docEl.requestFullscreen({ navigationUI: 'hide' }) : docEl.webkitRequestFullscreen?.();
    Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => { });
  } catch (e) { }
}
if (!fsSupported) document.body.classList.add('nofs');
const fsChange = () => document.body.classList.toggle('fs', isFs());
document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);
$('fsBtn').onclick = () => { ac(); goFullscreen(); };
// turn the phone upright = leave full screen (full screen locks the picture sideways, so we watch the tilt sensor)
const exitFs = () => { if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); };
let uprightT = 0;
addEventListener('deviceorientation', e => {
  if (!isFs() || e.beta == null) return;
  const upright = Math.abs(e.beta) > 50 && Math.abs(e.beta) < 130 && Math.abs(e.gamma) < 25;
  if (!upright) uprightT = 0; else if (!uprightT) uprightT = performance.now(); else if (performance.now() - uprightT > 700) { uprightT = 0; exitFs(); }
});
matchMedia('(orientation: portrait)').addEventListener?.('change', e => { if (e.matches) exitFs(); });

// ---------- go ----------
bakePark();
newGame(6, false); setMode('title');
if (AUTO) { newGame(SET.n, true); setMode('play'); }
const timerLoop = AUTO || Q.has('shot');
let last = performance.now();
function loop() {
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  step(dt);
  if (AUTO && mode === 'over') { console.log('auto game over: place ' + G.human.place + ' of ' + G.players.length + ', ' + G.t.toFixed(0) + 's, catches ' + G.players.reduce((s, p) => s + p.catches, 0) + ', hits ' + G.players.reduce((s, p) => s + p.hits, 0)); newGame(SET.n, true); setMode('play'); }
  draw();
  if (timerLoop) setTimeout(loop, 16); else requestAnimationFrame(loop);
}
loop();
