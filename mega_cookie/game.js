'use strict';
// Mega Cookie: click the cookie, buy multipliers, get the Golden Cookie.
// Every upgrade multiplies how many cookies one click gives you.

const ITEMS = [
  {id:'fingers', ic:'👆', nm:'Sticky Fingers',   x:2,         cost:1},
  {id:'chips',   ic:'🍫', nm:'Extra Choc Chips', x:2,         cost:20},
  {id:'sprink',  ic:'🌈', nm:'Sprinkles',        x:3,         cost:200},
  {id:'oven',    ic:'🔥', nm:'Big Oven',         x:5,         cost:750},
  {id:'milk',    ic:'🥛', nm:'Milk Fountain',    x:10,        cost:5000},
  {id:'icing',   ic:'🧁', nm:'Rainbow Icing',    x:2,         cost:50000},
  {id:'truck',   ic:'🚚', nm:'Cookie Truck',     x:5,         cost:100000},
  {id:'factory', ic:'🏭', nm:'Cookie Factory',   x:10,        cost:600000},
  {id:'rocket',  ic:'🚀', nm:'Cookie Rocket',    x:3,         cost:6e6},
  {id:'moon',    ic:'🌙', nm:'Moon Bakery',      x:10,        cost:2e7},
  {id:'planet',  ic:'🪐', nm:'Cookie Planet',    x:5,         cost:2e8},
  {id:'diamond', ic:'💎', nm:'Diamond Cookie',   x:10,        cost:1e9},
  {id:'galaxy',  ic:'🌌', nm:'Cookie Galaxy',    x:2,         cost:1e10},
  {id:'univ',    ic:'✨', nm:'Cookie Universe',  x:10,        cost:2e10},
  {id:'dragon',  ic:'🐉', nm:'Cookie Dragon',    x:5,         cost:2e11},
  {id:'golden',  ic:'🏆', nm:'THE GOLDEN COOKIE',x:100000000, cost:1e12, final:true},
];

const SAVE_KEY = 'megaCookie1';
let G = {cookies:0, got:{}, clicks:0, muted:false};
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.cookies === 'number') G = Object.assign(G, s); } catch (e) {}
function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {} }

const $ = id => document.getElementById(id);
const perClick = () => ITEMS.reduce((m, it) => G.got[it.id] ? m * it.x : m, 1);

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
const countEl = $('count'), multEl = $('mult'), itemsEl = $('items');
function renderShop(){
  itemsEl.innerHTML = '';
  // the Golden Cookie goal sits at the top so you always know what you're aiming for,
  // then the ones you still need, and the ones you've already got go to the bottom
  const rest = ITEMS.filter(it => !it.final);
  const order = [ITEMS[ITEMS.length - 1], ...rest.filter(it => !G.got[it.id]), ...rest.filter(it => G.got[it.id])];
  for (const it of order) {
    const li = document.createElement('li');
    li.className = 'item' + (it.final ? ' final' : '');
    li.dataset.id = it.id;
    li.innerHTML = `<div class="ic">${it.ic}</div><div><div class="nm">${it.nm}</div><div class="cost"><span>🍪 ${fmtShort(it.cost)}</span></div></div><div class="fac">x${fmtShort(it.x)}</div><div class="bar"></div>`;
    li.addEventListener('click', () => buy(it, li));
    itemsEl.appendChild(li);
    it.el = li; it.bar = li.querySelector('.bar');
  }
  update();
}
function update(){
  countEl.textContent = fmt(G.cookies);
  const p = perClick();
  multEl.textContent = fmt(p);
  $('perClick').textContent = fmt(p);
  $('pcS').textContent = p === 1 ? '' : 's';
  for (const it of ITEMS) {
    const got = !!G.got[it.id], can = !got && G.cookies >= it.cost;
    it.el.classList.toggle('got', got);
    it.el.classList.toggle('can', can);
    it.el.classList.toggle('no', !got && !can);
    it.bar.style.width = got ? '0' : Math.min(100, G.cookies / it.cost * 100) + '%';
  }
  const left = ITEMS.filter(it => !G.got[it.id]).length;
  $('goal').textContent = G.got.golden ? '🏆 You got the Golden Cookie! Keep clicking forever!' :
    `Get all the upgrades and buy THE GOLDEN COOKIE! (${left} to go)`;
  document.body.classList.toggle('golden', !!G.got.golden);
}

// ---------- clicking ----------
const cookieBtn = $('cookie'), fx = $('fx');
let saveT = 0;
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
  clearTimeout(saveT); saveT = setTimeout(save, 400);
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
  if (G.got[it.id]) return;
  if (G.cookies < it.cost) {
    sNope(); li.classList.remove('shake'); void li.offsetWidth; li.classList.add('shake'); return;
  }
  G.cookies -= it.cost; G.got[it.id] = true; save();
  const m = document.querySelector('.mult'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
  renderShop();
  if (it.final) {
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
  G = {cookies:0, got:{}, clicks:0, muted:G.muted}; save();
  $('hint').classList.remove('gone'); renderShop();
});

// ?shot=N gives N cookies and the first upgrades (for screenshots)
const shot = new URLSearchParams(location.search).get('shot');
if (shot) { G = {cookies:+shot || 0, got:{fingers:1, chips:1, sprink:1, oven:1}, clicks:9, muted:true}; $('hint').classList.add('gone'); }

showMute();
renderShop();
if (G.clicks > 3) $('hint').classList.add('gone');
