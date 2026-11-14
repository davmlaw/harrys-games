'use strict';
// Mega Cookie: click the cookie, buy multipliers, get the Golden Cookie.
// Every upgrade multiplies how many cookies one click gives you.

// Every item can be bought lots of times. Each one bakes cookies for you every second
// (the dearer it is, the more it bakes), and the price goes up a bit each time you buy one.
// THE GOLDEN COOKIE is the big goal: it adds +100 million cookies to every click.
const ITEMS = [
  {id:'fingers', ic:'👆', nm:'Sticky Fingers',   ps:1,      cost:10},
  {id:'chips',   ic:'🍫', nm:'Extra Choc Chips', ps:5,      cost:100},
  {id:'sprink',  ic:'🌈', nm:'Sprinkles',        ps:25,     cost:600},
  {id:'oven',    ic:'🔥', nm:'Big Oven',         ps:150,    cost:4000},
  {id:'milk',    ic:'🥛', nm:'Milk Fountain',    ps:800,    cost:25000},
  {id:'icing',   ic:'🧁', nm:'Rainbow Icing',    ps:4000,   cost:150000},
  {id:'truck',   ic:'🚚', nm:'Cookie Truck',     ps:20000,  cost:1e6},
  {id:'factory', ic:'🏭', nm:'Cookie Factory',   ps:100000, cost:6e6},
  {id:'rocket',  ic:'🚀', nm:'Cookie Rocket',    ps:500000, cost:4e7},
  {id:'moon',    ic:'🌙', nm:'Moon Bakery',      ps:2.5e6,  cost:2.5e8},
  {id:'diamond', ic:'💎', nm:'Diamond Cookie',   ps:9e6,    cost:1e9},
  {id:'planet',  ic:'🪐', nm:'Cookie Planet',    ps:4e7,    cost:5e9},
  {id:'galaxy',  ic:'🌌', nm:'Cookie Galaxy',    ps:2e8,    cost:3e10},
  {id:'univ',    ic:'✨', nm:'Cookie Universe',  ps:7.5e8,  cost:1.5e11},
  {id:'dragon',  ic:'🐉', nm:'Cookie Dragon',    ps:2e9,    cost:5e11},
  {id:'golden',  ic:'🏆', nm:'THE GOLDEN COOKIE',pc:1e8,    cost:1e12, final:true},
];
const PRICE_UP = 1.15; // each one you buy costs 15% more than the last

const SAVE_KEY = 'megaCookie2';
let G = {cookies:0, n:{}, clicks:0, muted:false, won:false};
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.cookies === 'number') G = Object.assign(G, s); } catch (e) {}
function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {} }

const $ = id => document.getElementById(id);
const owned = it => G.n[it.id] || 0;
const price = it => Math.ceil(it.cost * Math.pow(PRICE_UP, owned(it)));
const perSec = () => ITEMS.reduce((t, it) => t + owned(it) * (it.ps || 0), 0);
const perClick = () => ITEMS.reduce((t, it) => t + owned(it) * (it.pc || 0), 1);

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

// ---------- screen ----------
const countEl = $('count'), itemsEl = $('items');
function renderShop(){
  itemsEl.innerHTML = '';
  // the Golden Cookie goal sits at the top so you always know what you're aiming for
  for (const it of [ITEMS[ITEMS.length - 1], ...ITEMS.filter(it => !it.final)]) {
    const li = document.createElement('li');
    li.className = 'item' + (it.final ? ' final' : '');
    const what = it.final ? `+${fmtShort(it.pc)}<small>every click</small>` : `+${fmtShort(it.ps)}<small>every second</small>`;
    li.innerHTML = `<div class="ic">${it.ic}</div><div><div class="nm">${it.nm}</div><div class="cost">🍪 <span></span></div></div><div class="fac">${what}</div><div class="bar"></div><div class="own"></div>`;
    li.addEventListener('click', () => buy(it, li));
    itemsEl.appendChild(li);
    it.el = li; it.bar = li.querySelector('.bar'); it.costEl = li.querySelector('.cost span'); it.ownEl = li.querySelector('.own');
  }
  update();
}
function update(){
  countEl.textContent = fmt(G.cookies);
  $('perSec').textContent = fmt(perSec());
  $('perClick').textContent = '+' + fmt(perClick());
  for (const it of ITEMS) {
    const c = price(it), can = G.cookies >= c;
    it.costEl.textContent = fmtShort(c);
    it.ownEl.textContent = owned(it) || '';
    it.el.classList.toggle('can', can);
    it.el.classList.toggle('no', !can);
    it.bar.style.width = Math.min(100, G.cookies / c * 100) + '%';
  }
  $('goal').textContent = G.won ? '🏆 You got the Golden Cookie! Keep clicking forever!' :
    'Buy things that bake cookies for you, then get THE GOLDEN COOKIE!';
  document.body.classList.toggle('golden', !!G.won);
}

// ---------- clicking ----------
const cookieBtn = $('cookie'), fx = $('fx');
function clickCookie(x, y){
  const p = perClick();
  G.cookies += p; G.clicks++;
  crunch();
  cookieBtn.classList.add('squish'); setTimeout(() => cookieBtn.classList.remove('squish'), 60);
  countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
  const plus = document.createElement('div');
  plus.className = 'plus'; plus.textContent = '+' + fmt(p);
  plus.style.left = x + (Math.random() * 40 - 20) + 'px'; plus.style.top = y + 'px';
  fx.appendChild(plus); setTimeout(() => plus.remove(), 900);
  for (let i = 0; i < 5; i++) crumb(x, y);
  if (G.clicks > 3) $('hint').classList.add('gone');
  update();
}
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

cookieBtn.addEventListener('pointerdown', e => { e.preventDefault(); clickCookie(e.clientX, e.clientY); });
cookieBtn.addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
    e.preventDefault(); const r = cookieBtn.getBoundingClientRect(); clickCookie(r.left + r.width / 2, r.top + r.height / 3);
  }
});

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
    $('winPer').textContent = fmt(perClick()); $('win').hidden = false;
  } else sBuy();
}
$('winOk').addEventListener('click', () => { $('win').hidden = true; });

// ---------- buttons ----------
const muteBtn = $('mute');
function showMute(){ muteBtn.textContent = G.muted ? '🔇' : '🔊'; }
muteBtn.addEventListener('click', () => { G.muted = !G.muted; showMute(); save(); });
$('reset').addEventListener('click', () => {
  if (!confirm('Start again from 0 cookies?')) return;
  G = {cookies:0, n:{}, clicks:0, muted:G.muted, won:false}; save();
  $('hint').classList.remove('gone'); update();
});

// ---------- baking every second ----------
let last = performance.now(), uiT = 0, saveT = 0;
function loop(now){
  const dt = Math.min(1, (now - last) / 1000); last = now;
  G.cookies += perSec() * dt;
  uiT += dt; saveT += dt;
  if (uiT > .1) { uiT = 0; update(); }
  if (saveT > 2) { saveT = 0; save(); }
  requestAnimationFrame(loop);
}
// a hidden tab doesn't run animation frames, so catch up when you come back (up to an hour)
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); save(); }
  else if (hiddenAt) { G.cookies += perSec() * Math.min(3600, (Date.now() - hiddenAt) / 1000); hiddenAt = 0; last = performance.now(); update(); }
});
addEventListener('pagehide', save);

// ?shot=N gives N cookies and a few items (for screenshots)
const shot = new URLSearchParams(location.search).get('shot');
if (shot) { G = {cookies:+shot || 0, n:{fingers:12, chips:6, sprink:3, oven:1}, clicks:9, muted:true, won:false}; $('hint').classList.add('gone'); }

showMute();
renderShop();
if (G.clicks > 3) $('hint').classList.add('gone');
requestAnimationFrame(loop);
