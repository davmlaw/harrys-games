'use strict';
// Mega Cookie: click the big cookie a few times (the fun bit), then a sum pops up and three cookies show answers.
// Click the right cookie to win cookies (answer fast for a speed bonus), click a wrong one and you lose some.
// Spend cookies in the shop on things that add more cookies to every right answer.
// Everything is PLUS, never times (Harry's rule).

// pa = + cookies for every right answer. Nothing bakes on its own: cookies only come from maths (Harry's rule).
const ITEMS = [
  {id:'pencil',  ic:'✏️', nm:'Sharp Pencil',     pa:4,      cost:25},
  {id:'fingers', ic:'👆', nm:'Sticky Fingers',   pa:3,      cost:15},
  {id:'chips',   ic:'🍫', nm:'Extra Choc Chips', pa:12,      cost:100},
  {id:'ruler',   ic:'📏', nm:'Magic Ruler',      pa:40,     cost:400},
  {id:'sprink',  ic:'🌈', nm:'Sprinkles',        pa:50,     cost:600},
  {id:'abacus',  ic:'🧮', nm:'Abacus',           pa:200,    cost:3000},
  {id:'oven',    ic:'🔥', nm:'Big Oven',         pa:250,    cost:4000},
  {id:'book',    ic:'📘', nm:'Maths Book',       pa:1200,   cost:20000},
  {id:'milk',    ic:'🥛', nm:'Milk Fountain',    pa:1300,    cost:25000},
  {id:'jar',     ic:'🫙', nm:'Giant Cookie Jar', pa:3500,   cost:70000},
  {id:'star',    ic:'⭐', nm:"Teacher's Gold Star",pa:7000, cost:150000},
  {id:'icing',   ic:'🧁', nm:'Rainbow Icing',    pa:6000,   cost:150000},
  {id:'truck',   ic:'🚚', nm:'Cookie Truck',     pa:40000,  cost:1e6},
  {id:'brain',   ic:'🧠', nm:'Big Brain',        pa:45000,  cost:1.2e6},
  {id:'factory', ic:'🏭', nm:'Cookie Factory',   pa:200000, cost:6e6},
  {id:'owl',     ic:'🦉', nm:'Professor Owl',    pa:250000, cost:8e6},
  {id:'rocket',  ic:'🚀', nm:'Cookie Rocket',    pa:1.2e6, cost:4e7},
  {id:'robot',   ic:'🤖', nm:'Maths Robot',      pa:1.7e6,  cost:6e7},
  {id:'moon',    ic:'🌙', nm:'Moon Bakery',      pa:7e6,  cost:2.5e8},
  {id:'diamond', ic:'💎', nm:'Diamond Cookie',   pa:2.5e7,    cost:1e9},
  {id:'crown',   ic:'👑', nm:'Genius Crown',     pa:3.5e7,    cost:1.5e9},
  {id:'volcano', ic:'🌋', nm:'Cookie Volcano',   pa:6e7,    cost:2.5e9},
  {id:'planet',  ic:'🪐', nm:'Cookie Planet',    pa:1.2e8,    cost:5e9},
  {id:'galaxy',  ic:'🌌', nm:'Cookie Galaxy',    pa:6.5e8,    cost:3e10},
  {id:'wizard',  ic:'🧙', nm:'Number Wizard',    pa:8.5e8,  cost:4e10},
  {id:'univ',    ic:'✨', nm:'Cookie Universe',  pa:3e9,  cost:1.5e11},
  {id:'dragon',  ic:'🐉', nm:'Cookie Dragon',    pa:1e10,    cost:5e11},
  {id:'golden',  ic:'🏆', nm:'THE GOLDEN COOKIE',pa:1e11,    cost:1e12, final:true},
];
const PRICE_UP = 1.15;   // each one you buy costs 15% more than the last
const BASE_ANSWER = 5;   // cookies for a right answer before any upgrades

const SAVE_KEY = 'megaCookie2';
let G = {cookies:0, n:{}, right:0, muted:false, won:false, level:1};
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.cookies === 'number') G = Object.assign(G, s); } catch (e) {}
function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {} }

const $ = id => document.getElementById(id);
const owned = it => G.n[it.id] || 0;
const price = it => Math.ceil(it.cost * Math.pow(PRICE_UP, owned(it)));
const CLICKS_PER_Q = 12; // clicks on the big cookie before each maths question
const perClick = () => Math.max(1, Math.round(perAns() / 10));
const perAns = () => ITEMS.reduce((t, it) => t + owned(it) * (it.pa || 0), BASE_ANSWER);

// ---------- numbers ----------
const WORDS = [[1e21,'sextillion'],[1e18,'quintillion'],[1e15,'quadrillion'],[1e12,'trillion']];
function fmt(n){
  n = Math.floor(n);
  for (const [v, w] of WORDS) if (n >= v) {
    const a = n / v; return (a >= 100 ? Math.floor(a) : Math.floor(a * 10) / 10).toLocaleString('en') + ' ' + w;
  }
  return n.toLocaleString('en');
}
function fmtShort(n){ // for the shop cost labels
  if (n >= 1e12) return fmt(n);
  if (n >= 1e9) return +(n / 1e9).toFixed(1) + ' billion';
  if (n >= 1e6) return +(n / 1e6).toFixed(1) + ' million';
  return n.toLocaleString('en');
}

// ---------- sound (made with Web Audio, no files) ----------
let AC = null;
function ac(){ if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, t0, dur, type='square', vol=.08, f2){
  const a = ac(); if (!a || G.muted) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
let noiseBuf = null;
function crunch(){
  const a = ac(); if (!a || G.muted) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * .12, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = .8 + Math.random() * .5;
  f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 1400; f.Q.value = 1.2;
  g.gain.value = .5; s.connect(f).connect(g).connect(a.destination); s.start();
  tone(520 + Math.random() * 120, 0, .07, 'triangle', .05, 300); // little "pop"
}
const sBuy  = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .07, .16, 'square', .06));
const sNope = () => tone(160, 0, .22, 'sawtooth', .07, 90);
const sWin  = () => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * .14, .3, 'square', .07));

const sRight = () => { crunch(); tone(880, 0, .1, 'square', .05); tone(1320, .07, .14, 'square', .05); };
const sFast  = () => [1047, 1319, 1568].forEach((f, i) => tone(f, .1 + i * .05, .1, 'triangle', .06));
const sLevel = () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * .09, .2, 'triangle', .08));

// ---------- maths questions ----------
// Level goes up after 4 right in a row and down after 2 wrong in a row.
const MAX_LEVEL = 6;
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
function makeQuestion(lv){
  const kinds = [
    ['add', 'sub'],                              // 1: + and − up to 20
    ['add', 'sub', 'times'],                     // 2: + − to 50, easy times tables
    ['add', 'sub', 'times', 'times'],            // 3: + − to 100, all tables to 10
    ['add', 'sub', 'times', 'div'],              // 4: tables to 12, dividing
    ['add', 'sub', 'times', 'div', 'big'],       // 5: bigger sums
    ['add', 'sub', 'times', 'div', 'big', 'two'],// 6: two steps
  ][lv - 1];
  const k = pick(kinds), top = [20, 50, 100, 100, 500, 1000][lv - 1];
  const tables = lv === 2 ? [2, 5, 10] : lv === 3 ? [2, 3, 4, 5, 6, 7, 8, 9, 10] : [2, 3, 4, 5, 6, 7, 8, 9, 11, 12];
  let a, b, c, q, ans;
  if (k === 'add') { a = rnd(1, top - 1); b = rnd(1, top - a); q = `${a} + ${b}`; ans = a + b; }
  else if (k === 'sub') { a = rnd(2, top); b = rnd(1, a - 1); q = `${a} − ${b}`; ans = a - b; }
  else if (k === 'times') { a = pick(tables); b = rnd(2, lv >= 4 ? 12 : 10); if (Math.random() < .5) [a, b] = [b, a]; q = `${a} × ${b}`; ans = a * b; }
  else if (k === 'div') { b = pick(tables); ans = rnd(2, 12); q = `${b * ans} ÷ ${b}`; }
  else if (k === 'big') { a = rnd(11, 25); b = rnd(3, 9); q = `${a} × ${b}`; ans = a * b; }
  else { a = rnd(2, 9); b = rnd(2, 9); c = rnd(1, 20); const plus = Math.random() < .5;
    if (!plus) c = rnd(1, a * b - 1);
    q = `${a} × ${b} ${plus ? '+' : '−'} ${c}`; ans = a * b + (plus ? c : -c); }
  // wrong answers that look tempting: off by one or two, off by ten, or a neighbour in the times table
  const near = [1, -1, 2, -2, 10, -10];
  if (k === 'times' || k === 'big') near.push(a, -a, b, -b);
  if (k === 'div') near.push(1, -1);
  const opts = new Set([ans]);
  let tries = 0;
  while (opts.size < 3 && tries++ < 50) { const w = ans + pick(near); if (w >= 0) opts.add(w); }
  while (opts.size < 3) opts.add(ans + opts.size + 2);
  return {q: q + ' = ?', ans, opts: [...opts].sort(() => Math.random() - .5)};
}

// ---------- screen ----------
const countEl = $('count'), itemsEl = $('items');
function renderShop(){
  itemsEl.innerHTML = '';
  // the Golden Cookie goal sits at the top so you always know what you're aiming for
  for (const it of [ITEMS[ITEMS.length - 1], ...ITEMS.filter(it => !it.final).sort((a, b) => a.cost - b.cost)]) {
    const li = document.createElement('li');
    li.className = 'item' + (it.final ? ' final' : '');
    const what = `+${fmtShort(it.pa)}<small>per answer</small>`;
    li.innerHTML = `<div class="ic">${it.ic}</div><div><div class="nm">${it.nm}</div><div class="cost">🍪 <span></span></div></div><div class="fac">${what}</div><div class="bar"></div><div class="own"></div>`;
    li.addEventListener('click', () => buy(it, li));
    itemsEl.appendChild(li);
    it.el = li; it.bar = li.querySelector('.bar'); it.costEl = li.querySelector('.cost span'); it.ownEl = li.querySelector('.own');
  }
  update();
}
function update(){
  countEl.textContent = fmt(G.cookies);
  $('perAns').textContent = fmt(perAns());
  $('perClick').textContent = '+' + fmt(perClick());
  for (const it of ITEMS) {
    const c = price(it), can = G.cookies >= c;
    it.costEl.textContent = fmtShort(c);
    it.ownEl.textContent = owned(it) || '';
    it.el.classList.toggle('can', can);
    it.el.classList.toggle('no', !can);
    it.bar.style.width = Math.min(100, G.cookies / c * 100) + '%';
  }
  $('goal').textContent = G.won ? '🏆 You got the Golden Cookie! Keep going forever!' :
    'Click the cookie, answer sums, buy things, then get THE GOLDEN COOKIE!';
  $('level').textContent = 'Level ' + G.level;
  $('streak').textContent = streak >= 3 ? `🔥 ${streak} in a row` : '';
  document.body.classList.toggle('golden', !!G.won);
}

// ---------- answering ----------
const QTIMES = [6, 6, 7, 7, 9, 10]; // seconds per question at each level
let QTIME = 6;
const answersEl = $('answers'), fx = $('fx');
let Q = null, qLeft = 0, streak = 0, wrongRow = 0, locked = false;
function nextQuestion(){
  Q = makeQuestion(G.level); QTIME = QTIMES[G.level - 1];
  qLeft = QTIME; locked = false;
  const qEl = $('question'); qEl.textContent = Q.q; qEl.classList.remove('new'); void qEl.offsetWidth; qEl.classList.add('new');
  answersEl.classList.remove('locked');
  answersEl.innerHTML = '';
  Q.opts.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'ans'; b.setAttribute('aria-label', 'Answer ' + v);
    b.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true"><use href="#cookieArt"/></svg><b>${v}</b>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); answer(v, b, e.clientX, e.clientY); });
    b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); const r = b.getBoundingClientRect(); answer(v, b, r.left + r.width / 2, r.top + r.height / 3); } });
    answersEl.appendChild(b);
  });
}
function floatText(text, x, y, cls){
  const p = document.createElement('div');
  p.className = 'plus' + (cls ? ' ' + cls : ''); p.textContent = text;
  p.style.left = x + (Math.random() * 30 - 15) + 'px'; p.style.top = y + 'px';
  fx.appendChild(p); setTimeout(() => p.remove(), 900);
}
function lockThen(ms){ locked = true; answersEl.classList.add('locked'); setTimeout(startClicking, ms); }

// ---------- the fun bit: click the big cookie ----------
const cookieBtn = $('cookie');
let clicksLeft = CLICKS_PER_Q;
function showClicks(){
  $('toMaths').textContent = clicksLeft === 1 ? 'Maths challenge in 1 click!' : `Maths challenge in ${clicksLeft} clicks!`;
  $('toMathsBar').style.width = (1 - clicksLeft / CLICKS_PER_Q) * 100 + '%';
}
function startClicking(){
  clicksLeft = CLICKS_PER_Q; locked = true; Q = null;
  document.body.classList.remove('quizMode'); showClicks();
}
function clickCookie(x, y){
  if (document.body.classList.contains('quizMode')) return;
  const p = perClick();
  G.cookies += p; crunch();
  cookieBtn.classList.add('squish'); setTimeout(() => cookieBtn.classList.remove('squish'), 60);
  countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
  floatText('+' + fmt(p), x, y);
  for (let i = 0; i < 5; i++) crumb(x, y);
  clicksLeft--; showClicks(); update();
  if (clicksLeft <= 0) {
    tone(660, 0, .1, 'square', .06); tone(990, .1, .18, 'square', .06);
    setTimeout(() => { document.body.classList.add('quizMode'); $('hint').textContent = 'Click the cookie with the right answer! Quick = bonus ⚡'; nextQuestion(); }, 150);
  }
}
cookieBtn.addEventListener('pointerdown', e => { e.preventDefault(); clickCookie(e.clientX, e.clientY); });
cookieBtn.addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); const r = cookieBtn.getBoundingClientRect(); clickCookie(r.left + r.width / 2, r.top + r.height / 3); }
});
function answer(v, btn, x, y){
  if (locked) return;
  if (v === Q.ans) {
    const base = perAns(), fast = Math.round(base * qLeft / QTIME); // speed bonus: up to the same again
    G.cookies += base + fast; G.right++;
    streak++; wrongRow = 0;
    sRight(); btn.classList.add('right');
    floatText('+' + fmt(base), x, y);
    if (fast > 0) { setTimeout(() => floatText('+' + fmt(fast) + ' ⚡', x, y - 40, 'fast'), 120); if (qLeft > QTIME / 2) sFast(); }
    for (let i = 0; i < 8; i++) crumb(x, y);
    if (streak % 4 === 0 && G.level < MAX_LEVEL) { G.level++; sLevel(); setTimeout(() => floatText('LEVEL ' + G.level + '!', innerWidth / 2, innerHeight / 2, 'fast'), 250); }
    if (G.right > 2) $('hint').classList.add('gone');
    lockThen(250);
  } else {
    const lose = Math.min(G.cookies, perAns());
    G.cookies -= lose; streak = 0; wrongRow++;
    sNope(); btn.classList.add('wrong');
    floatText(lose > 0 ? '−' + fmt(lose) : 'Oops!', x, y, 'bad');
    for (const b of answersEl.children) if (+b.querySelector('b').textContent === Q.ans) b.classList.add('right'); // show the right one
    if (wrongRow >= 2 && G.level > 1) { G.level--; wrongRow = 0; }
    lockThen(900);
  }
  countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
  update(); save();
}
document.addEventListener('keydown', e => { // keys 1, 2, 3 pick a cookie
  const i = ['1', '2', '3'].indexOf(e.key); if (i < 0 || e.repeat || !Q) return;
  const b = answersEl.children[i]; if (!b) return;
  const r = b.getBoundingClientRect(); answer(Q.opts[i], b, r.left + r.width / 2, r.top + r.height / 3);
});

function fling(el, x, y, vx, vy, life, spin){
  fx.appendChild(el);
  let t = 0, r = Math.random() * 360; const t0 = performance.now();
  (function step(now){
    t = (now - t0) / 1000;
    el.style.transform = `translate(${x + vx * t}px,${y + vy * t + 900 * t * t}px) rotate(${r + spin * t}deg)`;
    el.style.opacity = Math.max(0, 1 - t / life);
    if (t < life) requestAnimationFrame(step); else el.remove();
  })(t0);
}
function crumb(x, y){
  const c = document.createElement('div');
  c.className = 'crumb' + (Math.random() < .35 ? ' c' : '');
  c.style.left = c.style.top = '0';
  const a = Math.random() * Math.PI * 2, s = 150 + Math.random() * 250;
  fling(c, x, y, Math.cos(a) * s, Math.sin(a) * s - 250, .7, 600);
}
function confetti(){
  const cols = ['#ff4f81', '#3ccf9a', '#4aa8ff', '#ffd23f', '#fff8ec', '#b56bff'];
  for (let i = 0; i < 120; i++) {
    const c = document.createElement('div'); c.className = 'conf';
    c.style.left = c.style.top = '0'; c.style.background = cols[i % cols.length];
    fling(c, Math.random() * innerWidth, -30 - Math.random() * 200, Math.random() * 200 - 100, Math.random() * 200, 3, 400);
  }
}


// ---------- buying ----------
function buy(it, li){
  const c = price(it);
  if (G.cookies < c) {
    sNope(); li.classList.remove('shake'); void li.offsetWidth; li.classList.add('shake'); return;
  }
  G.cookies -= c; G.n[it.id] = owned(it) + 1; save();
  const m = document.querySelector('.mult'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
  li.classList.remove('bought'); void li.offsetWidth; li.classList.add('bought');
  update();
  if (it.final && !G.won) {
    G.won = true; save(); update();
    sWin(); confetti(); setTimeout(confetti, 700);
    $('winPer').textContent = fmt(perAns()); $('win').hidden = false;
  } else sBuy();
}
$('winOk').addEventListener('click', () => { $('win').hidden = true; });

// ---------- buttons ----------
const muteBtn = $('mute');
function showMute(){ muteBtn.textContent = G.muted ? '🔇' : '🔊'; }
muteBtn.addEventListener('click', () => { G.muted = !G.muted; showMute(); save(); });
$('reset').addEventListener('click', () => {
  if (!confirm('Start again from 0 cookies?')) return;
  G = {cookies:0, n:{}, right:0, muted:G.muted, won:false, level:1}; streak = 0; save();
  $('hint').classList.remove('gone'); $('hint').textContent = 'Click the big cookie!'; update(); startClicking();
});

// ---------- every frame: the question timer ----------
let last = performance.now(), uiT = 0, saveT = 0;
function loop(now){
  const dt = Math.min(1, (now - last) / 1000); last = now;
  if (!locked && Q) {
    qLeft -= dt;
    if (qLeft <= 0) { // too slow: no penalty, but the streak ends and the right answer is shown
      qLeft = 0; streak = 0;
      for (const b of answersEl.children) if (+b.querySelector('b').textContent === Q.ans) b.classList.add('right');
      tone(300, 0, .15, 'triangle', .05, 200);
      lockThen(800);
    }
  }
  const bar = $('timeBar'); bar.style.transform = `scaleX(${qLeft / QTIME})`; bar.classList.toggle('slow', qLeft < QTIME / 2);
  uiT += dt; saveT += dt;
  if (uiT > .1) { uiT = 0; update(); }
  if (saveT > 2) { saveT = 0; save(); }
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// ?shot=N gives N cookies and a few items (for screenshots)
const shot = new URLSearchParams(location.search).get('shot');
if (shot) { G = {cookies:+shot || 0, n:{pencil:3, fingers:8, chips:4, ruler:1}, right:20, muted:true, won:false, level:3}; streak = 5; $('hint').classList.add('gone'); }

showMute();
renderShop();
if (G.right > 2) $('hint').classList.add('gone');
if (new URLSearchParams(location.search).has('quiz')) { document.body.classList.add('quizMode'); nextQuestion(); } else startClicking();
requestAnimationFrame(loop);
