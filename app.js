// 發音樂園 — 注音 (ABC / 50 音 later). No build step: plain ES module + data/*.json.

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ============ data ============ */
let Z;           // data/zhuyin.json
let ART = {};    // data/art.json: slug -> {cat, desc}
let SYM = {};    // symbol -> {s, g, say, words}
let STICKERS = []; // one per picture slug: {art, word, cat, syms}
const GROUP_NAME = { i: '聲母', m: '介音', f: '韻母' };
const CAT_NAME = { animal: '動物', food: '食物', plant: '植物', vehicle: '交通工具', person: '家人', body: '身體', object: '東西', sky: '天空', scene: '大自然' };
const STAMPS = ['🐾', '⭐', '🌸', '🍓', '🐟', '🎈', '🌈', '🍀', '🐾', '🧶'];
const ROUND = 5;
// sounds kids typically mix up — used as distractors so practice targets real confusions
const CONFUSE = ['ㄅㄆ', 'ㄉㄊ', 'ㄍㄎ', 'ㄓㄗ', 'ㄔㄘ', 'ㄕㄙ', 'ㄈㄏ', 'ㄋㄌ', 'ㄐㄑㄒ', 'ㄓㄐ', 'ㄔㄑ', 'ㄕㄒ',
  'ㄖㄌ', 'ㄣㄥ', 'ㄢㄤ', 'ㄛㄜ', 'ㄝㄟ', 'ㄞㄟ', 'ㄠㄡ', 'ㄧㄩ', 'ㄨㄩ', 'ㄛㄡ', 'ㄜㄦ'];

/* ============ storage ============ */
const STORE = 'kidphonics.v1';
const S = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
S.settings ??= { rate: 0.8, voice: '' };
S.settings.narrate ??= true;           // cats read instructions / praise aloud
S.stats ??= {};                        // 'zh:ㄅ' -> {ok, bad, streak}
S.seen ??= {};                         // 'zh:ㄅ' -> first time its page was opened (ms)
S.stickers ??= {};                     // picture slug -> unlocked at (ms); never taken back
S.days ??= {};                         // 'YYYY-MM-DD' (local) -> {rounds, stamp}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* private mode */ } };
const seenSyms = () => Z.symbols.filter(x => S.seen['zh:' + x.s]).map(x => x.s);
function markSeen(s) { if (!S.seen['zh:' + s]) { S.seen['zh:' + s] = Date.now(); save(); } }
const stat = s => (S.stats['zh:' + s] ??= { ok: 0, bad: 0, streak: 0 });
const level = s => Math.min(3, stat(s).streak);   // 0..3 dots; 3 = learned
function record(s, firstTry) {
  const st = stat(s);
  if (firstTry) { st.ok++; st.streak++; } else { st.bad++; st.streak = Math.max(0, st.streak - 1); }
  save();
}
// a learned symbol unlocks the pictures of its words; returns the words newly unlocked
function unlockStickers() {
  const fresh = [];
  for (const x of Z.symbols) if (level(x.s) === 3)
    for (const w of x.words) {
      const a = Z.words[w].art;
      if (!S.stickers[a]) { S.stickers[a] = Date.now(); fresh.push(w); }
    }
  if (fresh.length) save();
  return fresh;
}
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ============ sound ============ */
const HAS_TTS = 'speechSynthesis' in window;
let voices = [];
function loadVoices() { if (HAS_TTS) voices = speechSynthesis.getVoices(); }
if (HAS_TTS) { loadVoices(); speechSynthesis.addEventListener?.('voiceschanged', loadVoices); }
// Mandarin only: zh-HK / zh-MO / yue voices speak Cantonese
const isCantonese = v => /[-_](HK|MO)\b|yue/i.test(v.lang) || /粵|廣東|cantonese/i.test(v.name);
const zhVoices = () => voices.filter(v => /^zh|^cmn/i.test(v.lang) && !isCantonese(v));
function voiceFor() {
  const chosen = voices.find(v => v.voiceURI === S.settings.voice);
  if (chosen && !isCantonese(chosen)) return chosen;
  const zh = zhVoices();
  return zh.find(v => /zh[-_]TW/i.test(v.lang)) || zh.find(v => /Hant/i.test(v.lang)) || zh[0] || null;
}
// Recorded clips play through one <audio> element: unlike Web Audio it isn't muted by the
// iPhone/iPad silent switch. Resolves true (played), false (failed -> caller falls back) or 'stop'.
const player = (() => { try { const a = new Audio(); a.preload = 'auto'; return a; } catch { return null; } })();
let clipFin = null;
function stopClip() { if (clipFin) { try { player.pause(); } catch { /* ignore */ } clipFin('stop'); } }
function playClip(url) {
  return new Promise(resolve => {
    if (!player) return resolve(false);
    stopClip();
    let done = false, started = false;
    const fin = r => {
      if (done) return; done = true; clearTimeout(tm);
      player.onended = player.onerror = player.onplaying = null;
      if (clipFin === fin) clipFin = null;
      resolve(r);
    };
    const tm = setTimeout(() => fin(started), 4000);
    player.onended = () => fin(true); player.onerror = () => fin(false); player.onplaying = () => { started = true; };
    clipFin = fin;
    player.muted = false;
    player.src = url;
    try { player.play()?.catch?.(() => fin(false)); } catch { fin(false); }
  });
}
// iOS only lets audio start inside a user gesture: prime the element on the first tap
['touchend', 'click'].forEach(ev => document.addEventListener(ev, function prime() {
  document.removeEventListener('touchend', prime, true); document.removeEventListener('click', prime, true);
  if (!player || clipFin) return;
  player.muted = true; player.src = symUrl('ㄅ');
  try { player.play()?.then?.(() => { player.pause(); player.muted = false; }).catch?.(() => { player.muted = false; }); } catch { player.muted = false; }
}, true));
// 教育部《國語注音符號手冊》recordings, named by code point: ㄅ -> 3105.mp3
const symUrl = s => `assets/audio/zh/sym/${s.codePointAt(0).toString(16)}.mp3`;

function speak(text, o = {}) {
  return new Promise(resolve => {
    if (!HAS_TTS) return resolve();
    stopClip();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    const v = voiceFor();
    if (v) u.voice = v;
    u.rate = o.rate ?? S.settings.rate;
    u.pitch = o.pitch ?? 1;
    let done = false;
    const end = () => { if (!done) { done = true; resolve(); } };
    u.onend = end; u.onerror = end;
    setTimeout(end, 1500 + text.length * 700);   // some engines never fire onend
    speechSynthesis.speak(u);
  });
}
// a cancellable run of speech: {t, pitch, rate} = say it, number = pause (ms), function = await it.
// Starting a new seq() or hush() stops the old one after its current step.
let seqId = 0;
async function seq(steps) {
  const id = ++seqId;
  for (const st of steps) {
    if (id !== seqId) return false;
    if (!st) continue;
    if (typeof st === 'number') await sleep(st);
    else if (typeof st === 'function') await st();
    else await speak(st.t, st);
  }
  return id === seqId;
}
const hush = () => { seqId++; stopClip(); if (HAS_TTS) speechSynthesis.cancel(); };
// recording first; TTS reads the representative character (ㄅ -> 玻) only if the clip fails
async function saySym(s) {
  if (HAS_TTS) speechSynthesis.cancel();
  const r = await playClip(symUrl(s));
  if (r === false) await speak(SYM[s].say);
}
// Gemini TTS word recordings (tools/gemini_tts.py), named by the characters' code points: 筆 -> 7b46.mp3
const wordUrl = w => `assets/audio/zh/word/${[...w].map(c => c.codePointAt(0).toString(16)).join('-')}.mp3`;
// every example word has one voice; device TTS only if the clip fails
async function sayWord(w) {
  if (HAS_TTS) speechSynthesis.cancel();
  if (await playClip(wordUrl(w)) === false) await speak(w);
}
const narrate = (...steps) => S.settings.narrate ? steps : [];
// character voices (TTS pitch): 胖胖 is the excitable one, 菲菲 the calm helper
const PANG = { pitch: 1.4 };
const FEI = { pitch: 1.05 };

let actx;
function tone(freqs, dur = 0.12, type = 'sine') {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur * 0.8;
    }
  } catch { /* no audio */ }
}
const ding = () => tone([660, 880, 1320], 0.13);
const boop = () => tone([300, 220], 0.16, 'triangle');

/* ============ zhuyin rendering ============ */
// one syllable as a vertical column to the right of its character, tone mark beside it
function zyCol(syl, hi) {
  let light = false, tn = '';
  if (syl[0] === '˙') { light = true; syl = syl.slice(1); }
  if (/[ˊˇˋ]$/.test(syl)) { tn = syl.slice(-1); syl = syl.slice(0, -1); }
  const letters = [...syl];
  return `<span class="zy${letters.length === 1 ? ' one' : ''}">${light ? '<i class="lt">˙</i>' : ''}` +
    `<span class="zl">${letters.map(c => `<b class="${c === hi ? 'hi' : ''}">${c}</b>`).join('')}</span>` +
    `${tn ? `<i class="tn">${tn}</i>` : ''}</span>`;
}
function ruby(word, hi) {
  const syl = Z.words[word].zy.split(' ');
  return `<span class="zw" aria-label="${esc(word)}">${[...word].map((ch, i) =>
    `<span class="zc"><span class="ch">${ch}</span>${zyCol(syl[i], hi)}</span>`).join('')}</span>`;
}
const img = (word, cls = '') => `<img class="${cls}" src="assets/img/${Z.words[word].art}.webp" alt="${esc(word)}" draggable="false">`;
const dots = s => `<span class="dots">${[0, 1, 2].map(i => `<i class="${i < level(s) ? 'on' : ''}"></i>`).join('')}</span>`;

/* ============ cats: 胖胖 (tabby & white, 麒麟尾) and 菲菲 (Russian Blue) ============ */
// shapes come from design/cats.svg; clip paths / gradient live once in the page (CAT_DEFS)
const CAT_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <clipPath id="ppBody"><ellipse cx="140" cy="222" rx="80" ry="62"/></clipPath>
  <clipPath id="ppHead"><ellipse cx="140" cy="128" rx="72" ry="60"/></clipPath>
  <clipPath id="ffEyeL"><path d="M341 160 Q356 153 371 158 Q369 172 356 173 Q343 172 341 160Z"/></clipPath>
  <clipPath id="ffEyeR"><path d="M393 158 Q408 153 423 160 Q421 172 408 173 Q395 172 393 158Z"/></clipPath>
  <radialGradient id="ffShade" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#9aa3ae"/><stop offset="1" stop-color="#7a838f"/></radialGradient>
</defs></svg>`;

const PP_EYES = {
  open: `<circle cx="112" cy="128" r="17" fill="#C2C86C" class="ol"/><circle cx="168" cy="128" r="17" fill="#C2C86C" class="ol"/>
    <circle cx="113" cy="129" r="12" fill="#1f1d1c"/><circle cx="167" cy="129" r="12" fill="#1f1d1c"/>
    <circle cx="108" cy="122" r="4.5" fill="#fff"/><circle cx="163" cy="122" r="4.5" fill="#fff"/>
    <circle cx="117" cy="134" r="2" fill="#fff"/><circle cx="172" cy="134" r="2" fill="#fff"/>`,
  oh: `<circle cx="112" cy="128" r="17" fill="#C2C86C" class="ol"/><circle cx="168" cy="128" r="17" fill="#C2C86C" class="ol"/>
    <circle cx="112" cy="128" r="8" fill="#1f1d1c"/><circle cx="168" cy="128" r="8" fill="#1f1d1c"/>
    <circle cx="109" cy="124" r="3" fill="#fff"/><circle cx="165" cy="124" r="3" fill="#fff"/>`,
  happy: `<path d="M97 132 Q112 114 127 132 M153 132 Q168 114 183 132" class="ln" style="stroke-width:4.5"/>`,
};
const PP_MOUTH = {
  talk: `<path d="M140 157 Q140 164 132 165 M140 157 Q140 164 148 165" class="ln"/>`,
  oh: `<ellipse cx="140" cy="167" rx="5" ry="6.5" fill="#B8324F" class="ol" style="stroke-width:2"/>`,
  happy: `<path d="M131 160 Q140 175 149 160Z" fill="#B8324F" class="ol" style="stroke-width:2"/>`,
};
function pangSVG(mood) {
  const eyes = mood === 'happy' ? PP_EYES.happy : mood === 'oh' ? PP_EYES.oh : PP_EYES.open;
  const mouth = PP_MOUTH[mood] || PP_MOUTH.talk;
  return `<svg viewBox="52 26 214 270" aria-hidden="true">
    <path d="M210 258 Q226 260 230 250 Q233 244 229 240" fill="none" stroke="#3d3330" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M210 258 Q226 260 230 250 Q233 244 229 240" fill="none" stroke="#8a6c56" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M222 252 l4 7" class="st"/>
    <ellipse cx="140" cy="222" rx="80" ry="62" fill="#FBF8F3"/>
    <g clip-path="url(#ppBody)">
      <path d="M150 168 Q196 166 222 196 L226 290 L176 290 Q186 252 170 222 Q154 196 150 168Z" fill="#8a6c56"/>
      <path d="M180 186 q8 6 10 16 M196 196 q6 8 6 18 M206 222 q4 8 2 18" class="st"/>
      <ellipse cx="78" cy="236" rx="26" ry="22" fill="#8a6c56"/>
      <path d="M68 226 q6 6 4 14 M84 222 q6 8 4 16" class="st"/>
    </g>
    <ellipse cx="140" cy="222" rx="80" ry="62" fill="none" class="ol"/>
    <ellipse cx="118" cy="278" rx="17" ry="11" fill="#FBF8F3" class="ol"/><ellipse cx="162" cy="278" rx="17" ry="11" fill="#FBF8F3" class="ol"/>
    <path d="M113 274v7M123 274v7M157 274v7M167 274v7" class="ln" style="stroke-width:1.8"/>
    <path d="M84 98 L78 40 Q80 34 86 37 L124 76Z" fill="#8a6c56" class="ol"/><path d="M90 88 L87 52 L112 78Z" fill="#F4B8BE"/>
    <path d="M196 98 L202 40 Q200 34 194 37 L156 76Z" fill="#8a6c56" class="ol"/><path d="M190 88 L193 52 L168 78Z" fill="#F4B8BE"/>
    <ellipse cx="140" cy="128" rx="72" ry="60" fill="#FBF8F3"/>
    <g clip-path="url(#ppHead)">
      <path d="M60 60 H222 V114 Q206 114 192 106 Q172 94 156 94 Q148 68 140 66 Q132 68 124 94 Q108 94 88 106 Q74 114 60 118Z" fill="#8a6c56"/>
      <path d="M120 78 q4 8 2 14 M160 78 q-4 8 -2 14 M100 86 q6 6 6 12 M180 86 q-6 6 -6 12 M134 74 v-8 M146 74 v-8" class="st"/>
    </g>
    <ellipse cx="140" cy="128" rx="72" ry="60" fill="none" class="ol"/>
    ${eyes}
    <ellipse cx="93" cy="154" rx="10" ry="5.5" fill="#FF9FAE" opacity=".45"/><ellipse cx="187" cy="154" rx="10" ry="5.5" fill="#FF9FAE" opacity=".45"/>
    <path d="M132 148 Q140 144 148 148 Q142 157 140 157 Q138 157 132 148Z" fill="#EE9AA3" class="ol" style="stroke-width:2"/>
    ${mouth}
    <path d="M100 152 L66 146 M100 158 L66 162 M180 152 L214 146 M180 158 L214 162" class="wh"/>
  </svg>`;
}

const FF_EYES = {
  calm: `<path d="M341 160 Q356 153 371 158 Q369 172 356 173 Q343 172 341 160Z" fill="#B3C95E"/>
    <path d="M393 158 Q408 153 423 160 Q421 172 408 173 Q395 172 393 158Z" fill="#B3C95E"/>
    <g clip-path="url(#ffEyeL)"><ellipse cx="357" cy="165" rx="3.6" ry="9" fill="#1f1d1c"/></g>
    <g clip-path="url(#ffEyeR)"><ellipse cx="407" cy="165" rx="3.6" ry="9" fill="#1f1d1c"/></g>
    <path d="M341 160 Q356 153 371 158 Q369 172 356 173 Q343 172 341 160Z M393 158 Q408 153 423 160 Q421 172 408 173 Q395 172 393 158Z" fill="none" class="ol"/>
    <path d="M337 160 Q356 150 375 157 M389 157 Q408 150 427 160" class="ln" style="stroke-width:4.5"/>
    <circle cx="352" cy="162" r="2" fill="#fff"/><circle cx="403" cy="162" r="2" fill="#fff"/>`,
  smile: `<path d="M343 167 Q356 153 369 167 M395 167 Q408 153 421 167" class="ln" style="stroke-width:4.5"/>`,
  yawn: `<path d="M341 163 Q356 170 371 163 M393 163 Q408 170 423 163" class="ln" style="stroke-width:4.5"/>`,
};
const FF_MOUTH = {
  calm: `<path d="M382 188 Q382 194 375 195 M382 188 Q382 194 389 195" class="ln"/>`,
  smile: `<path d="M382 188 v3 M373 192 Q382 202 391 192" class="ln"/>`,
  yawn: `<ellipse cx="382" cy="199" rx="7" ry="9" fill="#B8324F" class="ol" style="stroke-width:2"/>`,
};
function feiSVG(mood) {
  const eyes = FF_EYES[mood] || FF_EYES.calm, mouth = FF_MOUTH[mood] || FF_MOUTH.calm;
  return `<svg viewBox="312 26 214 270" aria-hidden="true">
    <path d="M452 250 Q490 262 474 286 Q460 300 420 294" fill="none" stroke="#3d3330" stroke-width="20" stroke-linecap="round"/>
    <path d="M452 250 Q490 262 474 286 Q460 300 420 294" fill="none" stroke="#838c98" stroke-width="14" stroke-linecap="round"/>
    <ellipse cx="400" cy="224" rx="64" ry="60" fill="url(#ffShade)" class="ol"/>
    <ellipse cx="400" cy="214" rx="26" ry="30" fill="#a9b1bb" opacity=".35"/>
    <ellipse cx="383" cy="279" rx="15" ry="10" fill="#8d96a2" class="ol"/><ellipse cx="417" cy="279" rx="15" ry="10" fill="#8d96a2" class="ol"/>
    <path d="M379 275v7M388 275v7M413 275v7M422 275v7" class="ln" style="stroke-width:1.8"/>
    <g transform="translate(18 -22)">
      <path d="M330 130 L322 70 Q324 64 330 67 L372 104Z" fill="#848d99" class="ol"/><path d="M336 120 L331 82 L360 106Z" fill="#C9AEB4"/>
      <path d="M434 130 L442 70 Q440 64 434 67 L392 104Z" fill="#848d99" class="ol"/><path d="M428 120 L433 82 L404 106Z" fill="#C9AEB4"/>
      <path d="M382 98 Q438 98 446 150 Q448 192 382 210 Q316 192 318 150 Q326 98 382 98Z" fill="url(#ffShade)" class="ol"/>
      <path d="M370 108 v14 M382 106 v16 M394 108 v14" class="ln" style="opacity:.35"/>
      <ellipse cx="382" cy="184" rx="24" ry="16" fill="#a9b1bb" opacity=".7"/>
      ${eyes}
      <path d="M375 180 Q382 177 389 180 Q384 188 382 188 Q380 188 375 180Z" fill="#5a5f69" class="ol" style="stroke-width:1.8"/>
      ${mouth}
      <path d="M356 186 L322 180 M356 192 L322 196 M408 186 L442 180 M408 192 L442 196" class="wh"/>
    </g>
  </svg>`;
}
// who: 'pang' | 'fei'; anim: '' | 'hop' | 'wobble' | 'dance'
const catEl = (who, mood = '', anim = '') =>
  `<span class="cat cat-${who} ${anim}" role="img" aria-label="${who === 'pang' ? '胖胖' : '菲菲'}">${who === 'pang' ? pangSVG(mood) : feiSVG(mood)}</span>`;
function setCat(who, mood, anim = '', scope = app) {
  const el = scope.querySelector(`.cat-${who}`);
  if (el) el.outerHTML = catEl(who, mood, anim);
}

/* ============ routing ============ */
const routes = { '': home, learn, sym: symPage, practice, sort: sortGame, memory: memoryGame, stickers, settings };
function go(path) { location.hash = '#/' + path; }
function route() {
  hush();
  const [r = '', arg] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  (routes[r] || home)(arg);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// delegated clicks: data-act="name" -> ACT[name](el)
const ACT = {};
app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el, e); }
});

/* ============ home ============ */
const QUIET = '<span class="tag">🤫 不用開口</span>';
function home() {
  const learned = Z.symbols.filter(x => level(x.s) === 3).length;
  const today = S.days[dayKey()];
  const got = STICKERS.filter(x => S.stickers[x.art]).length;
  const memLeft = Math.max(0, MEM_MIN - seenSyms().length);
  const greet = learned ? `我們已經學會 <b>${learned}</b> 個注音了！<br>今天也一起練習吧～` : '嗨！我是胖胖。<br>我還不太會注音，你可以陪我練習嗎？';
  app.innerHTML = `
    <div class="bar"><span style="flex:1"></span><a class="icon-btn" href="#/settings" aria-label="家長設定">⚙️</a></div>
    <section class="hero">
      <h1><span>發</span><span>音</span><span>樂</span><span>園</span></h1>
      <div class="duo">
        <button class="cat-btn" data-act="hiPang" aria-label="胖胖">${catEl('pang')}</button>
        <div class="bubble">${greet}</div>
        <button class="cat-btn" data-act="hiFei" aria-label="菲菲">${catEl('fei')}</button>
      </div>
    </section>
    <div class="langs" role="group" aria-label="選擇語言">
      <button class="lang" aria-pressed="true">注音</button>
      <button class="lang" disabled>ABC<small>準備中</small></button>
      <button class="lang" disabled>あいう<small>準備中</small></button>
    </div>
    <a class="today-btn${today ? ' done' : ''}" href="#/practice/today">
      <span class="big">${today ? today.stamp : '⭐'}</span>
      <span><span class="t">今天的練習</span><br><span class="s">${today ? '今天的章蓋好了！想玩可以再玩' : `玩一輪 ${ROUND} 題，就能蓋一個章`}</span></span>
    </a>
    <nav class="menu">
      <a href="#/learn"><span class="ico">👀</span><span class="mt"><span class="t">認識符號</span><br><span class="s">看圖卡、聽發音，37 個注音符號</span></span>${QUIET}</a>
      <a href="#/practice"><span class="ico">👂</span><span class="mt"><span class="t">聽音練習</span><br><span class="s">${seenSyms().length
        ? `練習學過的 ${seenSyms().length} 個符號，一輪 ${ROUND} 題` : '先學幾個符號，再來練習'}</span></span>${QUIET}</a>
      <a href="#/stickers"><span class="ico">🎁</span><span class="mt"><span class="t">我的貼紙簿</span><br><span class="s">已收集 ${got} / ${STICKERS.length} 張</span></span></a>
    </nav>
    <h3 class="group-h">遊戲</h3>
    <nav class="menu games">
      ${sortPairs().length
        ? `<a href="#/sort"><span class="ico">🧺</span><span class="mt"><span class="t">分類籃</span><br><span class="s">把圖片放進對的籃子，分清楚很像的音</span></span>${QUIET}</a>`
        : `<a href="#/sort" class="locked" data-act="lockSort"><span class="ico">🔒</span><span class="mt"><span class="t">分類籃</span><br><span class="s">先認識 ${sortHint().join(' 和 ')}，就能玩</span></span>${QUIET}</a>`}
      ${memLeft
        ? `<a href="#/memory" class="locked" data-act="lockMem"><span class="ico">🔒</span><span class="mt"><span class="t">翻牌配對</span><br><span class="s">再認識 ${memLeft} 個符號，就能玩</span></span>${QUIET}</a>`
        : `<a href="#/memory"><span class="ico">🃏</span><span class="mt"><span class="t">翻牌配對</span><br><span class="s">翻開牌，找出符號和它的圖片</span></span>${QUIET}</a>`}
    </nav>
    ${calendar()}
    <div class="progress">
      <div class="row"><span>學會的符號（連續答對 3 次）</span><b>${learned} / ${Z.symbols.length}</b></div>
      <div class="meter"><i style="width:${learned / Z.symbols.length * 100}%"></i></div>
    </div>`;
  const bounce = el => { const c = el.querySelector('.cat'); c.classList.remove('hop'); void c.offsetWidth; c.classList.add('hop'); };
  // name = first spelling lesson: ㄆ ㄤˋ 胖 / ㄈ ㄟ 菲
  ACT.hiPang = el => {
    bounce(el);
    seq([{ t: '嗨！我是胖胖。', ...PANG }, () => saySym('ㄆ'), 150, () => saySym('ㄤ'), 150, { t: '胖！', ...PANG },
      { t: learned ? `我們已經學會${learned}個注音了！` : '我還不太會注音，你可以陪我練習嗎？', ...PANG }]);
  };
  ACT.hiFei = el => {
    bounce(el);
    seq([{ t: '我是菲菲。', ...FEI }, () => saySym('ㄈ'), 150, () => saySym('ㄟ'), 150, { t: '菲。', ...FEI },
      { t: today ? '今天的章蓋好了，好棒。' : '每天玩一輪，就能蓋一個章喔。', ...FEI }]);
  };
  ACT.lockSort = () => {
    const [a, b] = sortHint();
    seq([{ t: '先認識', ...FEI }, () => saySym(a), { t: '和', ...FEI }, () => saySym(b), { t: '，就能玩分類籃喔。', ...FEI }]);
  };
  ACT.lockMem = () => seq([{ t: `再認識${memLeft}個符號，就能玩翻牌喔。`, ...FEI }]);
}

// this month's stamps — no streak count on purpose (missing a day shouldn't feel like losing)
function calendar() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const lead = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate();
  let cells = '<i class="pad"></i>'.repeat(lead), count = 0;
  for (let d = 1; d <= n; d++) {
    const rec = S.days[dayKey(new Date(y, m, d))];
    if (rec) count++;
    cells += `<i class="${rec ? 'on' : ''}${d === now.getDate() ? ' today' : ''}">${rec ? rec.stamp : d}</i>`;
  }
  return `<div class="cal">
    <div class="cal-h"><b>${m + 1} 月的印章</b><span>蓋了 ${count} 天</span></div>
    <div class="cal-g">${[...'日一二三四五六'].map(w => `<i class="wk">${w}</i>`).join('')}${cells}</div>
  </div>`;
}

/* ============ sticker book ============ */
function stickers() {
  const got = STICKERS.filter(x => S.stickers[x.art]).length;
  const cats = [...new Set([...Object.keys(CAT_NAME), ...STICKERS.map(x => x.cat)])];
  const sections = cats.map(c => {
    const list = STICKERS.filter(x => x.cat === c);
    if (!list.length) return '';
    const have = list.filter(x => S.stickers[x.art]).length;
    return `<h3 class="group-h">${CAT_NAME[c] || c}<small>${have} / ${list.length}</small></h3>
      <div class="stk-grid">${list.map(x => S.stickers[x.art]
        ? `<button class="stk" data-act="stk" data-w="${esc(x.word)}">${img(x.word)}<span class="cap">${ruby(x.word)}</span></button>`
        : `<button class="stk lock" data-act="stkLock" data-s="${x.syms[0]}" aria-label="還沒拿到，學會 ${x.syms[0]} 就能拿到">${img(x.word)}<span class="need g-${SYM[x.syms[0]].g}">${x.syms[0]}</span></button>`).join('')}</div>`;
  }).join('');
  app.innerHTML = `<div class="bar"><a class="icon-btn" href="#/" aria-label="回首頁">🏠</a><h2>我的貼紙簿</h2></div>
    <p class="legend">已收集 <b>${got}</b> / ${STICKERS.length} 張。注音符號學會了（★），它的貼紙就會跑進來。</p>
    ${sections}`;
  ACT.stk = el => { flash(el); seq([{ t: el.dataset.w }]); };
  ACT.stkLock = el => seq([{ t: '學會', ...FEI }, () => saySym(el.dataset.s), { t: '，就能拿到這張貼紙喔。', ...FEI }]);
}

/* ============ learn: all symbols ============ */
function learn() {
  const groups = ['i', 'm', 'f'].map(g => {
    const list = Z.symbols.filter(x => x.g === g);
    return `<h3 class="group-h">${GROUP_NAME[g]}<small>${list.length} 個</small></h3>
      <div class="tiles">${list.map(x => `<a class="tile g-${g}${level(x.s) === 3 ? ' learned' : ''}" href="#/sym/${x.s}" aria-label="${x.s}">${x.s}${dots(x.s)}</a>`).join('')}</div>`;
  }).join('');
  const legend = `<p class="legend">
    <span class="dots"><i class="on"></i><i></i><i></i></span>聽音練習連續答對的次數
    <span class="sep"></span><span class="dots"><i class="on"></i><i class="on"></i><i class="on"></i></span>學會了 <b>★</b></p>`;
  app.innerHTML = `<div class="bar"><a class="icon-btn" href="#/" aria-label="回首頁">🏠</a><h2>認識符號</h2></div>${legend}${groups}`;
}

/* ============ one symbol ============ */
let playToken = 0;
function symPage(s) {
  const x = SYM[s];
  if (!x) return go('learn');
  const i = Z.symbols.indexOf(x), n = Z.symbols.length;
  const prev = Z.symbols[(i - 1 + n) % n].s, next = Z.symbols[(i + 1) % n].s;
  app.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#/learn" aria-label="回符號列表">←</a><h2>${GROUP_NAME[x.g]}</h2></div>
    <div class="sym-head">
      <a class="icon-btn nav-btn" href="#/sym/${prev}" aria-label="上一個 ${prev}">‹</a>
      <button class="big-sym g-${x.g}" data-act="saySym" aria-label="聽 ${s} 的聲音">${s}<span class="spk">🔊</span></button>
      <a class="icon-btn nav-btn" href="#/sym/${next}" aria-label="下一個 ${next}">›</a>
    </div>
    <div class="say-all"><button class="btn" data-act="sayAll">▶ 全部聽一次</button></div>
    <div class="words">${x.words.map(w => `<button class="card" data-act="sayWord" data-w="${esc(w)}">${img(w)}${ruby(w, s)}</button>`).join('')}</div>
    <div class="btn-row"><a class="btn primary big" href="#/practice/${s}">練習 ${s} 👂</a></div>`;
  markSeen(s);
  ACT.saySym = async el => { el.classList.remove('playing'); void el.offsetWidth; el.classList.add('playing'); playToken++; await saySym(s); };
  ACT.sayWord = async el => { playToken++; flash(el); await sayWord(el.dataset.w); };
  ACT.sayAll = async () => {
    const my = ++playToken;
    const big = $('.big-sym'); big.classList.add('playing');
    await saySym(s); big.classList.remove('playing');
    for (const card of app.querySelectorAll('.card')) {
      if (my !== playToken) return;
      await sleep(250);
      flash(card); await sayWord(card.dataset.w);
    }
  };
  setTimeout(() => saySym(s), 250);
}
function flash(el) {
  app.querySelectorAll('.speaking').forEach(c => c.classList.remove('speaking'));
  void el.offsetWidth; el.classList.add('speaking');
  setTimeout(() => el.classList.remove('speaking'), 1400);
}

/* ============ practice ============ */
let G = null;           // current round
let poolMode = 'seen';  // 'seen' = only symbols opened in 認識符號, 'all' = all 37

// #/practice        -> pick pool (學過的 / 全部) and start
// #/practice/ㄅ     -> straight into a round focused on ㄅ (from the symbol page)
// #/practice/today -> one tap from home: a round over learned symbols (weakest first = review)
function practice(focus) {
  if (focus === 'today') {
    if (seenSyms().length) return startRound({ mode: 'seen' });
    go('learn');
    setTimeout(() => seq(narrate({ t: '我們先認識幾個符號，再來練習喔。', ...FEI })), 400);
    return;
  }
  if (focus && SYM[focus]) { markSeen(focus); return startRound({ mode: 'seen', focus }); }
  if (G && !G.over && !G.cfg.game) return renderQ();
  const seen = seenSyms();
  if (poolMode === 'none') poolMode = 'seen';
  if (!seen.length && poolMode === 'seen') poolMode = 'none';
  app.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#/" aria-label="回首頁">🏠</a><h2>聽音練習</h2></div>
    <div class="q">
      <p class="q-title">要練習哪些符號？</p>
      <div class="chips" role="group">
        <button class="chip" data-act="pool" data-k="seen" aria-pressed="${poolMode !== 'all'}">學過的（${seen.length} 個）</button>
        <button class="chip" data-act="pool" data-k="all" aria-pressed="${poolMode === 'all'}">全部（${Z.symbols.length} 個）</button>
      </div>
      ${poolMode === 'none'
        ? `<p class="note">還沒有學過的符號喔！先去「認識符號」看看圖卡、聽聽聲音吧。</p>
           <div class="btn-row"><a class="btn primary big" href="#/learn">去認識符號 👀</a></div>`
        : `<p class="seen-list">${(poolMode === 'all' ? Z.symbols.map(x => x.s) : seen).map(s => `<span class="g-${SYM[s].g}">${s}</span>`).join('')}</p>
           <button class="btn primary big" data-act="start">開始 ▶</button>
           <p class="note">會優先出還不熟、或常搞混的符號。</p>`}
    </div>`;
  ACT.pool = el => { poolMode = el.dataset.k === 'seen' && !seenSyms().length ? 'none' : el.dataset.k; practice(); };
  ACT.start = () => startRound({ mode: poolMode });
}

// weaker / less-practised symbols first, with some randomness
function weight(s) { const st = stat(s); return 1 + st.bad * 1.5 + (st.ok + st.bad === 0 ? 1 : 0) - Math.min(3, st.streak) * 0.3 + Math.random() * 1.2; }
function chooseTargets(list, n) {
  const ranked = list.map(s => [weight(s), s]).sort((a, b) => b[0] - a[0]).map(p => p[1]);
  const out = [];
  while (ranked.length && out.length < n) out.push(...ranked.slice(0, n - out.length));  // repeat when few learned
  return out;
}
function roundTargets({ mode, focus }) {
  const base = mode === 'all' ? Z.symbols.map(x => x.s) : seenSyms();
  if (!focus) return shuffle(chooseTargets(base, ROUND));
  // focused round: the new symbol 3 times + review of earlier ones (or more of it if none)
  const others = base.filter(s => s !== focus);
  const review = others.length ? chooseTargets(others, ROUND - 3) : [focus, focus];
  // spread the focus symbol out instead of three in a row
  const t = shuffle(review);
  return [focus, t[0], focus, t[1], focus].filter(Boolean);
}
function confusables(s) { return [...new Set(CONFUSE.filter(g => g.includes(s)).join(''))].filter(c => c !== s); }
// near-misses first (what kids really confuse), then other learned symbols, then same group, then anything
function distractors(t, k, avoid = '') {
  const taken = new Set([t, ...avoid]);
  const take = list => shuffle(list.filter(c => !taken.has(c))).map(c => (taken.add(c), c));
  return [
    ...take(confusables(t)).slice(0, 2),
    ...take(seenSyms()),
    ...take(Z.symbols.filter(x => x.g === SYM[t].g).map(x => x.s)),
    ...take(Z.symbols.map(x => x.s)),
  ].slice(0, k);
}
function makeQuestions(targets) {
  // A: hear the symbol -> pick it.  B: see + hear a word -> pick the sound in it.
  // A symbol that repeats in a round gets a different word / question type each time.
  const usedWords = new Set(), lastType = {};
  return targets.map(t => {
    const fresh = SYM[t].words.filter(w => !usedWords.has(w));
    const type = lastType[t] === 'A' ? 'B' : lastType[t] === 'B' ? (fresh.length ? pick(['A', 'B']) : 'A') : pick(['A', 'B']);
    lastType[t] = type;
    if (type === 'A') return { type, t, opts: shuffle([t, ...distractors(t, 3)]) };
    const w = pick(fresh.length ? fresh : SYM[t].words);
    usedWords.add(w);
    return { type, t, w, opts: shuffle([t, ...distractors(t, 3, Z.words[w].zy)]) };
  });
}
function startRound(cfg) {
  G = { cfg, qs: makeQuestions(roundTargets(cfg)), k: 0, results: [], over: false, told: {}, newStickers: [] };
  renderQ();
}
const TITLE = { A: '聽聲音，找到它！', B: '聽到哪一個音？' };
function promptSound(q) { return q.type === 'A' ? saySym(q.t) : sayWord(q.w); }

function renderQ() {
  if (G.k >= G.qs.length) return renderDone();
  const q = G.qs[G.k];
  q.tries = 0; q.locked = false;
  const dotsHtml = G.qs.map((_, i) => `<i class="${i < G.k ? (G.results[i] ? 'done' : 'miss') : i === G.k ? 'now' : ''}"></i>`).join('');
  const prompt = q.type === 'A'
    ? `<div class="q-prompt"><button class="play" data-act="replay" aria-label="再聽一次">🔊</button></div>`
    // zhuyin hidden until answered — it would give the answer away
    : `<div class="q-prompt"><button class="q-pic" data-act="replay" aria-label="再聽一次">${img(q.w)}<span id="qword" class="zw">${esc(q.w)}</span></button></div>`;
  app.innerHTML = `
    <div class="bar pbar"><a class="icon-btn" href="#/" data-act="quit" aria-label="離開">✕</a>
      <span class="pdots" aria-label="第 ${G.k + 1} 題，共 ${G.qs.length} 題">${dotsHtml}</span><span style="width:46px"></span></div>
    <div class="q">
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">${TITLE[q.type]}</div></div>
      ${prompt}
      <div class="opts">${q.opts.map(o => `<button class="opt" data-act="answer" data-o="${o}">${o}</button>`).join('')}</div>
      <div class="fb" id="fb"></div>
      <div id="next"></div>
    </div>`;
  ACT.replay = el => { el.classList.remove('playing'); void el.offsetWidth; el.classList.add('playing'); seq([() => promptSound(q)]); };
  ACT.quit = () => { G = null; go(''); };
  ACT.answer = el => answer(q, el);
  ACT.next = () => { hush(); G.k++; renderQ(); };
  // 菲菲 reads the instruction the first time each question type shows up in a round
  const intro = !G.told[q.type];
  G.told[q.type] = true;
  setTimeout(() => {
    // skip if the child already answered / left the page during the delay
    if (G?.qs[G.k] !== q || q.locked || q.tries || !location.hash.startsWith('#/practice')) return;
    seq([...(intro ? narrate({ t: TITLE[q.type], ...FEI }, 200) : []), () => promptSound(q)]);
  }, 300);
}
function bubble(text) { const b = $('#bubble'); if (b) b.textContent = text; }

const PRAISE = ['答對了！', '好棒！', '太厲害了！', '沒錯！', '耳朵好靈！'];
async function answer(q, el) {
  if (q.locked || el.disabled) return;
  const fb = $('#fb');
  if (el.dataset.o === q.t) {
    q.locked = true;
    el.classList.add('right'); ding();
    const firstTry = q.tries === 0;
    G.results[G.k] = firstTry;
    record(q.t, firstTry);
    G.newStickers.push(...unlockStickers());
    const praise = pick(PRAISE);
    bubble(praise); setCat('fei', 'smile', 'hop');
    lockAll(); revealWord(q);
    showNext();
    seq([300, ...narrate({ t: praise, ...FEI })]);
  } else {
    q.tries++;
    el.classList.add('wrong'); el.disabled = true; boop();
    if (q.tries >= 2) {
      q.locked = true;
      G.results[G.k] = false;
      record(q.t, false);
      app.querySelector(`.opt[data-o="${q.t}"]`).classList.add('reveal');
      fb.className = 'fb oops'; fb.textContent = `答案是「${q.t}」喔`;
      bubble('沒關係，我們一起記起來。'); setCat('fei', 'calm', 'wobble');
      lockAll(); revealWord(q);
      showNext();
      seq([300, ...narrate({ t: '答案是', ...FEI }), () => saySym(q.t)]);
    } else {
      bubble('再聽聽看～'); setCat('fei', 'calm', 'wobble');
      seq([350, ...narrate({ t: '再聽聽看', ...FEI }, 150), () => promptSound(q)]);
    }
  }
}
function revealWord(q) { if (q.type === 'B') $('#qword').outerHTML = ruby(q.w, q.t); }
function lockAll() { app.querySelectorAll('.opt').forEach(b => { if (!b.classList.contains('right') && !b.classList.contains('reveal')) b.disabled = true; }); }
function showNext() {
  const last = G.k + 1 >= G.qs.length;
  $('#next').innerHTML = `<button class="btn primary big" data-act="next">${last ? '看看拿了幾顆星 ⭐' : '下一題 →'}</button>`;
}

/* ============ game: 分類籃 (sort pictures into two baskets of easily-confused sounds) ============ */
const SORT_N = 6;
const PAIRS = CONFUSE.map(g => [...g].slice(0, 2));   // ㄐㄑㄒ plays as ㄐ / ㄑ
const seenPair = p => p.filter(s => S.seen['zh:' + s]).length;
const sortPairs = () => PAIRS.filter(p => seenPair(p) === 2);
const sortHint = () => PAIRS.slice().sort((p, q) => seenPair(q) - seenPair(p))[0];   // closest to unlocking
// only words whose first syllable has exactly one of the pair: for 聲母 that means "starts with",
// for 介音 / 韻母 "contains" — a word with both would have no single right basket
const firstSyl = w => Z.words[w].zy.split(' ')[0];

function sortGame() {
  const pairs = sortPairs();
  if (!pairs.length) return go('');
  // the pair the child misses most, with some randomness so it isn't always the same one
  const [a, b] = pairs.map(p => [stat(p[0]).bad + stat(p[1]).bad + Math.random() * 2, p]).sort((x, y) => y[0] - x[0])[0][1];
  const has = (w, s) => firstSyl(w).includes(s);
  const words = Object.keys(Z.words).filter(w => has(w, a) !== has(w, b));
  const A = shuffle(words.filter(w => has(w, a))), B = shuffle(words.filter(w => has(w, b)));
  let na = Math.min(SORT_N / 2, A.length);
  const nb = Math.min(SORT_N - na, B.length);
  na = Math.min(SORT_N - nb, A.length);   // a short side (ㄦ has 2 words) is topped up from the other
  const qs = shuffle([...A.slice(0, na).map(w => ({ w, t: a })), ...B.slice(0, nb).map(w => ({ w, t: b }))]);
  G = { cfg: { game: 'sort' }, pair: [a, b], qs, k: 0, results: [], over: false, newStickers: [], pile: { [a]: [], [b]: [] } };
  renderSort();
}

function renderSort() {
  if (G.k >= G.qs.length) return renderDone();
  const q = G.qs[G.k];
  q.tries = 0; q.locked = false;
  const dotsHtml = G.qs.map((_, i) => `<i class="${i < G.k ? (G.results[i] ? 'done' : 'miss') : i === G.k ? 'now' : ''}"></i>`).join('');
  app.innerHTML = `
    <div class="bar pbar"><a class="icon-btn" href="#/" data-act="quit" aria-label="離開">✕</a>
      <span class="pdots" aria-label="第 ${G.k + 1} 張，共 ${G.qs.length} 張">${dotsHtml}</span><span style="width:46px"></span></div>
    <div class="q">
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">放進對的籃子！</div></div>
      <div class="sort-stage"><button class="q-pic sort-card" aria-label="${esc(q.w)}，再聽一次">${img(q.w)}<span class="zw">${esc(q.w)}</span></button></div>
      <div class="baskets">${G.pair.map(s => `<div class="bk">
        <button class="basket g-${SYM[s].g}" data-act="drop" data-s="${s}" aria-label="${s} 的籃子"><b>${s}</b><span class="pile">${G.pile[s].map(w => img(w)).join('')}</span></button>
        <button class="b-say" data-act="baskSay" data-s="${s}" aria-label="聽 ${s}">🔊</button></div>`).join('')}</div>
      <p class="note">把圖片拖進籃子，或直接點籃子。</p>
    </div>`;
  const card = $('.sort-card');
  dragCard(card, s => sortDrop(q, s), () => seq([() => sayWord(q.w)]));
  ACT.drop = el => sortDrop(q, el.dataset.s);
  ACT.baskSay = el => { const bk = el.previousElementSibling; flash(bk); seq([() => saySym(el.dataset.s)]); };
  ACT.quit = () => { G = null; go(''); };
  const sayBasket = s => () => { flash(app.querySelector(`.basket[data-s="${s}"]`)); return saySym(s); };
  const intro = G.k === 0;
  setTimeout(() => {
    if (G?.qs[G.k] !== q || q.locked || q.tries || location.hash !== '#/sort') return;
    seq([...(intro ? [...narrate({ t: '聽聽看，放進對的籃子。', ...FEI }, 150), sayBasket(G.pair[0]), 250, sayBasket(G.pair[1]), 400] : []),
      () => sayWord(q.w)]);
  }, 300);
}

// Pointer Events cover mouse, touch and pen; a tap without moving replays the word instead
const basketAt = ev => document.elementsFromPoint(ev.clientX, ev.clientY).map(el => el.closest('.basket')).find(Boolean);
function dragCard(card, onDrop, onTap) {
  card.addEventListener('pointerdown', e => {
    if (e.button > 0 || card.classList.contains('gone')) return;
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    card.setPointerCapture(e.pointerId);
    card.classList.add('drag');
    const move = ev => {
      card._dx = ev.clientX - x0; card._dy = ev.clientY - y0;
      if (!moved && Math.hypot(card._dx, card._dy) < 8) return;
      moved = true;
      card.style.transform = `translate(${card._dx}px, ${card._dy}px) scale(.85)`;
      const over = basketAt(ev);
      app.querySelectorAll('.basket').forEach(b => b.classList.toggle('over', b === over && !b.disabled));
    };
    const up = ev => {
      card.removeEventListener('pointermove', move); card.removeEventListener('pointerup', up); card.removeEventListener('pointercancel', up);
      card.classList.remove('drag');
      app.querySelectorAll('.basket.over').forEach(b => b.classList.remove('over'));
      if (!moved) { card._dx = card._dy = 0; return onTap(); }
      const b = ev.type === 'pointerup' && basketAt(ev);
      if (b && !b.disabled) return onDrop(b.dataset.s);
      card.style.transform = ''; card._dx = card._dy = 0;
    };
    card.addEventListener('pointermove', move); card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
  });
}
function flyTo(card, bk) {
  const c = card.getBoundingClientRect(), b = bk.getBoundingClientRect();
  const dx = (card._dx || 0) + b.left + b.width / 2 - (c.left + c.width / 2);
  const dy = (card._dy || 0) + b.top + b.height / 2 - (c.top + c.height / 2);
  card.style.transform = `translate(${dx}px, ${dy}px) scale(.25)`;
  card.classList.add('gone');
}

// two baskets: a wrong drop disables that basket and the child puts the card in the other one
// themselves (counts as not first try) — no ✗, no automatic answer
async function sortDrop(q, s) {
  if (q.locked) return;
  const card = $('.sort-card'), bk = app.querySelector(`.basket[data-s="${s}"]`);
  if (s !== q.t) {
    q.tries++; boop();
    bk.disabled = true; bk.classList.remove('no'); void bk.offsetWidth; bk.classList.add('no');
    card.style.transform = ''; card._dx = card._dy = 0;
    bubble('再聽聽看～'); setCat('fei', 'calm', 'wobble');
    seq([350, ...narrate({ t: '再聽聽看', ...FEI }, 150), () => sayWord(q.w)]);
    return;
  }
  q.locked = true;
  const firstTry = q.tries === 0;
  G.results[G.k] = firstTry;
  record(q.t, firstTry);
  G.newStickers.push(...unlockStickers());
  ding(); flyTo(card, bk);
  G.pile[q.t].push(q.w);
  setTimeout(() => bk.querySelector('.pile')?.insertAdjacentHTML('beforeend', img(q.w)), 350);
  let steps;
  if (firstTry) {
    const praise = pick(PRAISE);
    bubble(praise); setCat('fei', 'smile', 'hop');
    steps = [300, ...narrate({ t: praise, ...FEI })];
  } else {
    const how = SYM[q.t].g === 'i' ? '開頭是' : '裡面有';
    bubble(`對了，「${q.w}」${how} ${q.t}`); setCat('fei', 'smile');
    steps = [300, () => sayWord(q.w), 150, ...narrate({ t: how, ...FEI }), () => saySym(q.t), 200];
  }
  const g = G;
  await Promise.all([sleep(1200), seq(steps)]);
  if (G === g && G.qs[G.k] === q && location.hash === '#/sort') { G.k++; renderSort(); }
}

/* ============ game: 翻牌配對 (match each symbol card with a picture of one of its words) ============ */
// Review only: never calls record(). Matching is mostly remembering where a card was (and luck),
// so a miss doesn't mean the child doesn't know the symbol — counting it would skew weight()
// and sticker unlocks. The round still counts toward today's stamp.
const MEM_N = 6;              // 6 pairs = 12 cards, 4 × 3
const MEM_MIN = 6;            // symbols seen before the game unlocks
const memStars = tries => tries <= 9 ? 3 : tries <= 13 ? 2 : 1;   // tries = pairs of cards turned

function memoryGame() {
  if (seenSyms().length < MEM_MIN) return go('');
  // weaker symbols first; a picture may only contain its own symbol among the chosen ones,
  // otherwise 爸爸 could match both ㄅ and ㄚ
  const W = Z.words;
  const fill = (chosen, order) => {
    for (const s of order) {
      if (chosen.length >= MEM_N) break;
      if (chosen.some(c => c.t === s || W[c.w].zy.includes(s))) continue;
      const ok = SYM[s].words.filter(w => !chosen.some(c => W[w].zy.includes(c.t) || W[w].art === W[c.w].art));
      if (ok.length) chosen.push({ t: s, w: pick(ok) });
    }
    return chosen;
  };
  // weight() is random, so retrying finds another order; unseen symbols only fill in when the seen
  // ones can't make 6 pairs (e.g. exactly 6 seen and two of them share every word, like ㄅ / ㄚ)
  let chosen = [];
  for (let k = 0; k < 40 && chosen.length < MEM_N; k++) {
    const c = fill([], chooseTargets(seenSyms(), seenSyms().length));
    if (c.length > chosen.length) chosen = c;
  }
  fill(chosen, shuffle(Z.symbols.map(x => x.s)));
  const cards = shuffle(chosen.flatMap((c, i) => [{ pair: i, s: c.t }, { pair: i, w: c.w }]));
  G = { cfg: { game: 'memory' }, qs: chosen, cards, up: [], tries: 0, found: 0, busy: false, over: false, newStickers: [] };
  renderMemory();
}

function renderMemory() {
  app.innerHTML = `
    <div class="bar pbar"><a class="icon-btn" href="#/" data-act="quit" aria-label="離開">✕</a><span style="flex:1"></span></div>
    <div class="q">
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">找出符號和它的圖片！</div></div>
      <div class="mem">${G.cards.map((c, i) => `<button class="mcard" data-act="flip" data-i="${i}" aria-label="第 ${i + 1} 張牌">
        <span class="back">🐾</span>
        <span class="face${c.s ? ` sym g-${SYM[c.s].g}` : ''}">${c.s || img(c.w)}</span></button>`).join('')}</div>
    </div>`;
  ACT.flip = el => memFlip(+el.dataset.i, el);
  ACT.quit = () => { G = null; go(''); };
  setTimeout(() => {
    if (G?.cfg.game !== 'memory' || G.tries || G.up.length || location.hash !== '#/memory') return;
    seq(narrate({ t: '翻開兩張牌，找出符號和它的圖片！', ...FEI }));
  }, 300);
}

const cardSound = c => () => c.s ? saySym(c.s) : sayWord(c.w);
async function memFlip(i, el) {
  const c = G.cards[i];
  if (G.busy || c.done || G.up.includes(i)) return;
  el.classList.add('open');
  el.setAttribute('aria-label', c.s || c.w);
  G.up.push(i);
  if (G.up.length === 1) return seq([cardSound(c)]);
  G.busy = true; G.tries++;
  const [a, b] = G.up.map(k => G.cards[k]);
  const els = G.up.map(k => app.querySelector(`.mcard[data-i="${k}"]`));
  const g = G;
  if (a.pair === b.pair) {
    a.done = b.done = true; G.up = []; G.found++;
    els.forEach(e => e.classList.add('done'));
    const { t, w } = G.qs[a.pair];
    const how = firstSyl(w).replace('˙', '')[0] === t ? '開頭是' : '裡面有';
    ding(); bubble(`對了，「${w}」${how} ${t}`); setCat('fei', 'smile', 'hop');
    G.busy = false;   // flipping on cuts this short, which is fine
    await seq([...(c.s ? [cardSound(c), 250] : []), () => sayWord(w), 150, ...narrate({ t: how, ...FEI }), () => saySym(t), 300]);
    if (G === g && G.found === G.qs.length && location.hash === '#/memory') renderDone();
    return;
  }
  // not a pair: let the child hear the second card, then turn both back
  await Promise.all([sleep(1100), seq([cardSound(c)])]);
  if (G !== g) return;
  els.forEach(e => { e.classList.remove('open'); e.setAttribute('aria-label', '第 ' + (+e.dataset.i + 1) + ' 張牌'); });
  G.up = []; G.busy = false;
}

const REST_AT = 3;   // rounds per day before 菲菲 suggests a break (never blocks)
function renderDone() {
  if (G.over) return;           // re-rendered by navigation: don't count the round twice
  G.over = true;
  // 翻牌 has no per-question results: its 3 stars come from how many tries it took
  const marks = G.cfg.game === 'memory' ? [1, 2, 3].map(n => n <= memStars(G.tries)) : G.results;
  const stars = marks.filter(Boolean).length;
  const msg = G.cfg.game === 'memory' ? (stars === 3 ? '記得好清楚！' : '全部找到了！')
    : stars === G.qs.length ? '全部答對！' : stars >= 3 ? '很棒喔！' : '多聽幾次就會了！';
  const day = (S.days[dayKey()] ??= { rounds: 0, stamp: '' });
  day.rounds++;
  const firstToday = !day.stamp;
  if (firstToday) day.stamp = pick(STAMPS);
  save();
  const tired = day.rounds >= REST_AT;
  const fresh = G.newStickers;
  app.innerHTML = `
    <div class="done">
      <div class="duo small">${catEl('pang', 'happy', 'dance')}${catEl('fei', tired ? 'yawn' : 'smile')}</div>
      <h2>${msg}</h2>
      <div class="stars" aria-label="${stars} 顆星">${marks.map((r, i) => `<span class="${r ? 'on' : 'off'}" style="animation-delay:${i * 0.15}s">★</span>`).join('')}</div>
      <div class="recap">${G.qs.map((q, i) => `<span class="g-${SYM[q.t].g} ${G.cfg.game === 'memory' || G.results[i] ? 'ok' : 'no'}">${q.t}</span>`).join('')}</div>
      ${firstToday ? `<div class="stamp-new"><span class="stamp">${day.stamp}</span><span>今天的章蓋好了！</span></div>` : ''}
      ${fresh.length ? `<div class="new-stk"><p>拿到新貼紙！</p><div>${fresh.map((w, i) => `<span style="animation-delay:${0.6 + i * 0.12}s">${img(w)}</span>`).join('')}</div></div>` : ''}
      ${tired ? `<p class="rest">今天已經玩了 ${day.rounds} 輪，好厲害！<br>菲菲想睡覺了，我們明天再玩吧。</p>` : ''}
      <div class="btn-row">
        <button class="btn ${tired ? '' : 'primary '}big" data-act="again">再玩一次</button>
        <a class="btn big" href="#/${G.cfg.focus ? 'sym/' + G.cfg.focus : 'learn'}">看圖卡</a>
        <a class="btn ${tired ? 'primary ' : ''}big" href="#/">回首頁</a>
      </div>
    </div>`;
  ACT.again = () => G.cfg.game === 'sort' ? sortGame() : G.cfg.game === 'memory' ? memoryGame() : startRound(G.cfg);
  if (stars >= 3) setTimeout(() => tone([523, 659, 784, 1047], 0.16), 200);
  seq([700, ...narrate(
    { t: '耶！', ...PANG }, { t: msg, ...FEI },
    firstToday && { t: '今天的練習完成了，蓋一個章！', ...FEI },
    fresh.length && { t: '拿到新貼紙：' + fresh.join('、'), ...PANG },
    tired && { t: '菲菲想睡覺了，我們明天再玩吧。', ...FEI, rate: S.settings.rate * 0.85 },
  )]);
}

/* ============ settings (for parents) ============ */
function settings() {
  const zh = zhVoices();
  const cur = voiceFor();
  app.innerHTML = `
    <div class="bar"><a class="icon-btn" href="#/" aria-label="回首頁">🏠</a><h2>家長設定</h2></div>
    ${!HAS_TTS ? '<div class="warn">這個瀏覽器不支援語音朗讀，請改用 Chrome、Safari 或 Edge。</div>'
      : !zh.length ? '<div class="warn">找不到中文語音。Android 請到「設定 → 文字轉語音」安裝 Google 中文（台灣）語音；Windows 請在「語言」加入中文（台灣）。</div>' : ''}
    <div class="panel">
      <h3>朗讀聲音</h3>
      <label for="voice">語音</label>
      <select id="voice">${zh.length ? zh.map(v => `<option value="${esc(v.voiceURI)}" ${cur && v.voiceURI === cur.voiceURI ? 'selected' : ''}>${esc(v.name)}（${esc(v.lang)}）</option>`).join('') : '<option>（無中文語音）</option>'}</select>
      <label for="rate">速度：<b id="rateV">${S.settings.rate.toFixed(1)}</b></label>
      <input id="rate" type="range" min="0.5" max="1.2" step="0.1" value="${S.settings.rate}">
      <div class="btn-row"><button class="btn" data-act="test">🔊 試聽</button></div>
      <p class="note">這裡的語音用來念句子和貓咪說話。注音符號和範例詞播放錄音（見下方「聲音從哪裡來」）；錄音播不出來時，才用這個語音代替（例如 ㄅ 念代表字「玻」）。</p>
      <label class="check"><input type="checkbox" id="narrate" ${S.settings.narrate ? 'checked' : ''}> 念出題目說明和鼓勵（菲菲、胖胖說話）</label>
    </div>
    <div class="panel">
      <h3>練習紀錄</h3>
      <p class="note">已學會 ${Z.symbols.filter(x => level(x.s) === 3).length} 個・貼紙 ${STICKERS.filter(x => S.stickers[x.art]).length} / ${STICKERS.length} 張・
        這個月練習 ${Object.keys(S.days).filter(k => k.startsWith(dayKey().slice(0, 7))).length} 天・今天 ${S.days[dayKey()]?.rounds || 0} 輪</p>
      <p class="note">答錯最多：${
        Z.symbols.filter(x => stat(x.s).bad > 0).sort((a, b) => stat(b.s).bad - stat(a.s).bad).slice(0, 6).map(x => `${x.s}（${stat(x.s).bad}）`).join('、') || '還沒有'}</p>
      <p class="note">紀錄只存在這台裝置的瀏覽器裡，換裝置或清除瀏覽資料就會重來。</p>
      <div class="btn-row"><button class="btn" data-act="reset">清除紀錄</button></div>
    </div>
    <div class="panel">
      <h3>聲音從哪裡來</h3>
      <p class="note"><b>注音符號</b>：2017 © 教育部，國語注音符號手冊-開放部件。依
        <a href="https://creativecommons.org/licenses/by/4.0/deed.zh_TW" target="_blank" rel="noopener">創用CC 姓名標示 4.0 國際版</a>授權使用
        （<a href="https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html" target="_blank" rel="noopener">原始出處</a>）；本站僅剪除尾端空白、調整音量。</p>
      <p class="note"><b>範例詞（貓、冰淇淋…）</b>：以 Google Gemini 語音合成（gemini-3.8-flash-tts）產生，本站剪除前後空白、調整音量。</p>
      <p class="note"><b>句子、貓咪說話</b>：這台裝置內建的中文語音。</p>
    </div>`;
  $('#narrate').onchange = e => { S.settings.narrate = e.target.checked; save(); };
  $('#voice').onchange = e => { S.settings.voice = e.target.value; save(); };
  $('#rate').oninput = e => { S.settings.rate = +e.target.value; $('#rateV').textContent = S.settings.rate.toFixed(1); save(); };
  ACT.test = () => seq([() => saySym('ㄅ'), 250, { t: '爸爸，杯子，包子。' }]);
  ACT.reset = () => { if (confirm('確定要清除所有練習紀錄（熟練度、貼紙、印章）嗎？')) { S.stats = {}; S.stickers = {}; S.days = {}; save(); settings(); } };
}

/* ============ boot ============ */
(async () => {
  try {
    [Z, ART] = await Promise.all(['data/zhuyin.json', 'data/art.json'].map(async u => (await fetch(u)).json()));
  } catch {
    app.innerHTML = '<p class="loading">資料載入失敗。請用網頁伺服器開啟（例如 <code>py -m http.server</code>），不要直接雙擊 index.html。</p>';
    return;
  }
  for (const x of Z.symbols) SYM[x.s] = x;
  // one sticker per picture; a picture shared by several symbols (杯子: ㄅ, ㄟ) unlocks via any of them
  const bySlug = {};
  for (const x of Z.symbols) for (const w of x.words) {
    const a = Z.words[w].art;
    (bySlug[a] ??= { art: a, word: w, cat: ART[a]?.cat || 'object', syms: [] }).syms.push(x.s);
  }
  STICKERS = Object.values(bySlug);
  unlockStickers();   // older saves: hand out stickers for symbols learned before the book existed
  document.body.insertAdjacentHTML('beforeend', CAT_DEFS);
  route();
})();
