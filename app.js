// 發音樂園 — 注音 (ABC / 50 音 later). No build step: plain ES module + data/*.json.
import { parseSyl, sylParts, TONE_MARK } from './syllable.js';

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
S.settings.bubbles ??= 'slow';         // 泡泡 rising speed: slow | mid | fast
S.stats ??= {};                        // 'zh:ㄅ' -> {ok, bad, streak}
S.seen ??= {};                         // 'zh:ㄅ' -> first time its page was opened (ms)
S.stickers ??= {};                     // picture slug -> unlocked at (ms); never taken back
S.days ??= {};                         // 'YYYY-MM-DD' (local) -> {rounds, stamp}
S.spell ??= {};                        // 'zh:貓' -> {ok, round}: 拼拼看 first-try spellings, one per round
S.map ??= {};                          // 'zh:ㄅㄆ' -> 闖關地圖: that pair first beaten in a 大對決 at (ms)
S.settings.learnView ??= 'map';        // 認識符號: 'map' (闖關地圖) | 'grid'
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
// the one way a sticker gets into the book (learned symbol, 拼拼看); true if it's new. Caller saves.
function giveSticker(art) { if (S.stickers[art]) return false; S.stickers[art] = Date.now(); return true; }
// a learned symbol unlocks the pictures of its words; returns the words newly unlocked
function unlockStickers() {
  const fresh = [];
  for (const x of Z.symbols) if (level(x.s) === 3)
    for (const w of x.words) if (giveSticker(Z.words[w].art)) fresh.push(w);
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
function playClip(url, volume = 1) {
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
    player.volume = volume;
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
    u.volume = o.volume ?? 1;
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
    else await (st.who ? sayLine(st) : speak(st.t, st));
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
async function sayWord(w, volume = 1) {
  if (HAS_TTS) speechSynthesis.cancel();
  if (await playClip(wordUrl(w), volume) === false) await speak(w, { volume });
}
// 抓錯遊戲: the words 胖胖 reads, in his own voice (Gemini Puck); the example-word clip if one is missing
async function sayPangWord(w) {
  if (HAS_TTS) speechSynthesis.cancel();
  if (await playClip(wordUrl(w).replace('/word/', '/pang-word/')) === false) await sayWord(w);
}
const narrate = (...steps) => S.settings.narrate ? steps : [];
// 胖胖 / 菲菲 lines: Gemini TTS clips in assets/audio/zh/<who>/, named by the code points of the text
// without punctuation (tools/cat_<who>.txt lists them). Device TTS at the cat's pitch if the clip fails —
// so a line added to the code without a recording still works; console.warn shows which one.
const lineUrl = (who, t) => `assets/audio/zh/${who}/${[...t.replace(LINE_PUNCT, '')].map(c => c.codePointAt(0).toString(16)).join('-')}.mp3`;
const LINE_PUNCT = /[\s，。！？、：；～「」,.!?:;~]/g;   // keep in sync with tools/split_tts.py
async function sayLine(st) {
  if (HAS_TTS) speechSynthesis.cancel();
  const r = await playClip(lineUrl(st.who, st.t));
  if (r === false) { console.warn('no recording for', st.who, st.t); await speak(st.t, st); }
}
// character voices: 胖胖 (Gemini Puck) is the excitable one, 菲菲 (Tari) the calm helper; pitch is for the TTS fallback
const PANG = { who: 'pang', pitch: 1.4 };
const FEI = { who: 'fei', pitch: 1.05 };

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
  think: `<circle cx="112" cy="128" r="17" fill="#C2C86C" class="ol"/><circle cx="168" cy="128" r="17" fill="#C2C86C" class="ol"/>
    <circle cx="117" cy="121" r="10" fill="#1f1d1c"/><circle cx="173" cy="121" r="10" fill="#1f1d1c"/>
    <circle cx="114" cy="117" r="3.5" fill="#fff"/><circle cx="170" cy="117" r="3.5" fill="#fff"/>`,
};
const PP_MOUTH = {
  talk: `<path d="M140 157 Q140 164 132 165 M140 157 Q140 164 148 165" class="ln"/>`,
  oh: `<ellipse cx="140" cy="167" rx="5" ry="6.5" fill="#B8324F" class="ol" style="stroke-width:2"/>`,
  happy: `<path d="M131 160 Q140 175 149 160Z" fill="#B8324F" class="ol" style="stroke-width:2"/>`,
  think: `<path d="M131 163 q4.5 -4 9 0 q4.5 4 9 0" class="ln"/>`,
};
function pangSVG(mood) {
  const eyes = PP_EYES[mood] || PP_EYES.open;
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
const routes = { '': home, learn, sym: symPage, practice, sort: sortGame, memory: memoryGame, spell: spellGame, bubbles: bubbleGame, catch: catchGame, boss: bossGame, teach: teachGame, stickers, settings };
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
const SOFT = '<span class="tag">🙂 小聲就好</span>';
const LOUD = '<span class="tag loud">📣 要開口</span>';
function home() {
  const learned = Z.symbols.filter(x => level(x.s) === 3).length;
  const today = S.days[dayKey()];
  const got = STICKERS.filter(x => S.stickers[x.art]).length;
  const memLeft = Math.max(0, MEM_MIN - seenSyms().length), spellLeft = Math.max(0, SPELL_MIN - learned),
    bubLeft = Math.max(0, BUB_MIN - learned), catchLeft = Math.max(0, CATCH_MIN - learned);
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
        : `<a href="#/memory"><span class="ico">🃏</span><span class="mt"><span class="t">翻牌配對</span><br><span class="s">翻開牌，找出符號跟它的圖片</span></span>${QUIET}</a>`}
      ${spellLeft
        ? `<a href="#/spell" class="locked" data-act="lockSpell"><span class="ico">🔒</span><span class="mt"><span class="t">拼拼看</span><br><span class="s">再學會 ${spellLeft} 個符號（★），就能玩</span></span>${SOFT}</a>`
        : `<a href="#/spell"><span class="ico">🛝</span><span class="mt"><span class="t">拼拼看</span><br><span class="s">注音溜滑梯，拼出一個字</span></span>${SOFT}</a>`}
      ${bubLeft
        ? `<a href="#/bubbles" class="locked" data-act="lockBub"><span class="ico">🔒</span><span class="mt"><span class="t">泡泡</span><br><span class="s">再學會 ${bubLeft} 個符號（★），就能玩</span></span>${QUIET}</a>`
        : `<a href="#/bubbles"><span class="ico">🫧</span><span class="mt"><span class="t">泡泡</span><br><span class="s">聽聲音，戳破對的泡泡，複習學會的符號</span></span>${QUIET}</a>`}
      ${catchLeft
        ? `<a href="#/catch" class="locked" data-act="lockCatch"><span class="ico">🔒</span><span class="mt"><span class="t">抓錯遊戲</span><br><span class="s">再學會 ${catchLeft} 個符號（★），就能玩</span></span>${QUIET}</a>`
        : `<a href="#/catch"><span class="ico">🔍</span><span class="mt"><span class="t">抓錯遊戲</span><br><span class="s">胖胖念對了嗎？抓出念錯的地方</span></span>${QUIET}</a>`}
      <a href="#/teach"><span class="ico">🧑‍🏫</span><span class="mt"><span class="t">教胖胖</span><br><span class="s">當胖胖的老師，念注音給牠聽</span></span>${LOUD}</a>
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
      { t: learned ? '謝謝你陪我練習！今天也一起學注音吧！' : '我還不太會注音，你可以陪我練習嗎？', ...PANG }]);
  };
  ACT.hiFei = el => {
    bounce(el);
    seq([{ t: '我是菲菲。', ...FEI }, () => saySym('ㄈ'), 150, () => saySym('ㄟ'), 150, { t: '菲。', ...FEI },
      { t: today ? '今天的章蓋好了，好棒。' : '每天玩一輪，就能蓋一個章喔。', ...FEI }]);
  };
  ACT.lockSort = () => {
    const [a, b] = sortHint();
    seq([{ t: '先認識', ...FEI }, () => saySym(a), { t: '還有', ...FEI }, () => saySym(b), { t: '，就能玩分類籃喔。', ...FEI }]);
  };
  // the number is on screen; spoken lines stay fixed so they can be recorded
  ACT.lockMem = () => seq([{ t: '再多認識幾個符號，就能玩翻牌喔。', ...FEI }]);
  ACT.lockSpell = () => seq([{ t: '再多學會幾個符號，就能玩拼拼看喔。', ...FEI }]);
  ACT.lockBub = () => seq([{ t: '再多學會幾個符號，就能玩泡泡喔。', ...FEI }]);
  ACT.lockCatch = () => seq([{ t: '再多學會幾個符號，就能玩抓錯遊戲喔。', ...FEI }]);
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
  ACT.stk = el => { flash(el); seq([() => sayWord(el.dataset.w)]); };
  ACT.stkLock = el => seq([{ t: '學會', ...FEI }, () => saySym(el.dataset.s), { t: '，就能拿到這張貼紙喔。', ...FEI }]);
}

/* ============ learn: all symbols (闖關地圖 or the plain grid) ============ */
function learn() {
  const map = S.settings.learnView === 'map';
  const groups = ['i', 'm', 'f'].map(g => {
    const list = Z.symbols.filter(x => x.g === g);
    return `<h3 class="group-h">${GROUP_NAME[g]}<small>${list.length} 個</small></h3>
      <div class="tiles">${list.map(x => `<a class="tile g-${g}${level(x.s) === 3 ? ' learned' : ''}" href="#/sym/${x.s}" aria-label="${x.s}">${x.s}${dots(x.s)}</a>`).join('')}</div>`;
  }).join('');
  const legend = `<p class="legend">
    <span class="dots"><i class="on"></i><i></i><i></i></span>聽音練習連續答對的次數
    <span class="sep"></span><span class="dots"><i class="on"></i><i class="on"></i><i class="on"></i></span>學會了 <b>${map ? '🚩' : '★'}</b></p>`;
  app.innerHTML = `<div class="bar"><a class="icon-btn" href="#/" aria-label="回首頁">🏠</a><h2>認識符號</h2></div>
    <div class="chips" role="group" aria-label="怎麼排">
      <button class="chip" data-act="view" data-k="map" aria-pressed="${map}">🗺️ 地圖</button>
      <button class="chip" data-act="view" data-k="grid" aria-pressed="${!map}">🔲 方格</button>
    </div>${legend}${map ? mapLegs() : groups}`;
  ACT.view = el => { S.settings.learnView = el.dataset.k; save(); learn(); };
  // route() scrolls to the top afterwards: bring 胖胖 (where the child is up to) into view
  if (map) setTimeout(() => $('.isle .here')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
}

// 闖關地圖: the 37 symbols in standard order as islands along a path, 5 legs. Each leg ends with a
// 大對決 (#/boss/<leg>) over that leg's easily-confused pairs (a pair spanning two legs, like ㄈㄏ, goes to the later one).
// A leg is won once every one of its pairs has been beaten; that only reveals the next leg's look —
// every island (and every 大對決) can be tapped from the start.
const LEGS = ['ㄅㄆㄇㄈㄉㄊㄋ', 'ㄌㄍㄎㄏㄐㄑㄒ', 'ㄓㄔㄕㄖㄗㄘㄙ', 'ㄧㄨㄩㄚㄛㄜㄝ', 'ㄞㄟㄠㄡㄢㄣㄤㄥㄦ'].map(l => [...l]);
const legOf = s => LEGS.findIndex(l => l.includes(s));
const legPairs = i => PAIRS.filter(p => Math.max(...p.map(legOf)) === i);
const pairWon = p => !!S.map['zh:' + p.join('')];
const bossWon = i => legPairs(i).every(pairWon);
const MAP_X = [50, 78, 50, 22], MAP_ROW = 86, MAP_TOP = 50;

function mapLegs() {
  const here = Z.symbols.find(x => level(x.s) < 3)?.s;   // 胖胖 waits at the first island not yet learned
  return LEGS.map((syms, i) => {
    const pts = [...syms.map((_, k) => MAP_X[k % 4]), 50].map((x, k) => [x, MAP_TOP + k * MAP_ROW]);
    const h = pts.at(-1)[1] + MAP_TOP + 10;
    const road = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x} ${y}`).join(' ');
    const isles = syms.map((s, k) => {
      const [x, y] = pts[k];
      return `<a class="isle g-${SYM[s].g}${level(s) === 3 ? ' learned' : ''}" style="left:${x}%;top:${y}px" href="#/sym/${s}" aria-label="${s}">${s}${dots(s)}${
        s === here ? `<span class="here ${x > 50 ? 'l' : 'r'}">${catEl('pang')}</span>` : ''}</a>`;
    }).join('');
    const won = bossWon(i), [bx, by] = pts.at(-1);
    const boss = `<a class="isle boss${won ? ' won' : ''}" style="left:${bx}%;top:${by}px" href="#/boss/${i + 1}"
      aria-label="第 ${i + 1} 關大對決${won ? '，過關了' : ''}">
      <span class="b-ico">${won ? '🏆' : '⚔️'}</span><span class="b-t">大對決</span>
      <span class="b-p">${legPairs(i).map(p => `<i class="${pairWon(p) ? 'ok' : ''}">${p.join('')}</i>`).join(' ')}</span></a>`;
    const fog = i > 0 && !bossWon(i - 1);
    const got = syms.filter(s => level(s) === 3).length;
    return `<section class="leg${fog ? ' fog' : ''}">
      <h3 class="group-h">第 ${i + 1} 關<small>學會 ${got} / ${syms.length}${won ? '・🏆 過關' : ''}</small></h3>
      ${fog ? '<p class="fog-note">☁️ 打贏上一關的大對決，這裡就會亮起來（還是可以先點進去學喔）</p>' : ''}
      <div class="path" style="height:${h}px">
        <svg class="road" viewBox="0 0 100 ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${road}"/></svg>
        ${isles}${boss}
      </div></section>`;
  }).join('');
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
  const prompt = q.type === 'A'
    ? `<div class="q-prompt"><button class="play" data-act="replay" aria-label="再聽一次">🔊</button></div>`
    // zhuyin hidden until answered — it would give the answer away
    : `<div class="q-prompt"><button class="q-pic" data-act="replay" aria-label="再聽一次">${img(q.w)}<span id="qword" class="zw">${esc(q.w)}</span></button></div>`;
  app.innerHTML = `
    ${roundBar()}
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
// ✕ + one dot per question: green = first try, orange = needed help, yellow = now
const roundBar = (unit = '題') => `<div class="bar pbar"><a class="icon-btn" href="#/" data-act="quit" aria-label="離開">✕</a>
  <span class="pdots" aria-label="第 ${G.k + 1} ${unit}，共 ${G.qs.length} ${unit}">${G.qs.map((_, i) =>
    `<i class="${i < G.k ? (G.results[i] ? 'done' : 'miss') : i === G.k ? 'now' : ''}"></i>`).join('')}</span><span style="width:46px"></span></div>`;
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
  app.innerHTML = `
    ${roundBar('張')}
    <div class="q">
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">放進對的籃子！</div></div>
      <div class="sort-stage"><button class="q-pic sort-card" aria-label="${esc(q.w)}，再聽一次">${img(q.w)}<span class="zw">${esc(q.w)}</span></button></div>
      <div class="baskets">${G.pair.map(s => `<div class="bk">
        <button class="basket g-${SYM[s].g}" data-act="drop" data-s="${s}" aria-label="${s} 的籃子"><b>${s}</b><span class="pile">${G.pile[s].map(w => img(w)).join('')}</span></button>
        <button class="b-say" data-act="baskSay" data-s="${s}" aria-label="聽 ${s}">🔊</button></div>`).join('')}</div>
      <p class="note">把圖片拖進籃子，或直接點籃子。</p>
    </div>`;
  const card = $('.sort-card');
  dragCard(card, '.basket', b => sortDrop(q, b.dataset.s), () => seq([() => sayWord(q.w)]));
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

// Pointer Events cover mouse, touch and pen. Dropped on a `sel` element -> onDrop(el);
// a tap without moving -> onTap (if any); anywhere else it springs back.
const dropAt = (ev, sel) => document.elementsFromPoint(ev.clientX, ev.clientY).map(el => el.closest(sel)).find(Boolean);
function dragCard(card, sel, onDrop, onTap) {
  card.addEventListener('pointerdown', e => {
    if (e.button > 0 || card.disabled || card.classList.contains('gone')) return;
    card._dragged = false;
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    card.setPointerCapture(e.pointerId);
    card.classList.add('drag');
    const move = ev => {
      card._dx = ev.clientX - x0; card._dy = ev.clientY - y0;
      if (!moved && Math.hypot(card._dx, card._dy) < 8) return;
      moved = true;
      card.style.transform = `translate(${card._dx}px, ${card._dy}px) scale(.85)`;
      const over = dropAt(ev, sel);
      app.querySelectorAll(sel).forEach(b => b.classList.toggle('over', b === over && !b.disabled));
    };
    const up = ev => {
      card.removeEventListener('pointermove', move); card.removeEventListener('pointerup', up); card.removeEventListener('pointercancel', up);
      card.classList.remove('drag');
      app.querySelectorAll(sel).forEach(b => b.classList.remove('over'));
      if (!moved) { card._dx = card._dy = 0; return onTap?.(); }
      card._dragged = true;   // the click that follows a drag isn't a tap
      const b = ev.type === 'pointerup' && dropAt(ev, sel);
      if (b && !b.disabled) return onDrop(b);
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
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">找出符號跟它的圖片！</div></div>
      <div class="mem">${G.cards.map((c, i) => `<button class="mcard" data-act="flip" data-i="${i}" aria-label="第 ${i + 1} 張牌">
        <span class="back">🐾</span>
        <span class="face${c.s ? ` sym g-${SYM[c.s].g}` : ''}">${c.s || img(c.w)}</span></button>`).join('')}</div>
    </div>`;
  ACT.flip = el => memFlip(+el.dataset.i, el);
  ACT.quit = () => { G = null; go(''); };
  setTimeout(() => {
    if (G?.cfg.game !== 'memory' || G.tries || G.up.length || location.hash !== '#/memory') return;
    seq(narrate({ t: '翻開兩張牌，找出符號跟它的圖片！', ...FEI }));
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

/* ============ game: 拼拼看 (blend symbols into a syllable / build a word from its symbols) ============ */
// A 看拼音找圖: the slide sounds out ㄇ…ㄠ, the child picks the picture (3 choices).
// B 聽音拼出來: hear a word, put its symbols into the column in order (+ 2 decoys).
// One-character words only for now; tone is shown but not asked.
const SPELL_MIN = 10;   // learned symbols before it unlocks
let ONE = [];           // one-character words: {w, p: {i, m, f, t}, parts, tone} — filled at boot
const sylKey = p => p.i + p.m + p.f;   // same sounds apart from tone
// near-misses for picture choices: same 聲母, or same 介音 + 韻母 — never the same sounds (書 / 樹)
const near = (o, pool) => pool.filter(x => sylKey(x.p) !== sylKey(o.p) &&
  ((o.p.i && x.p.i === o.p.i) || (o.p.m + o.p.f && x.p.m + x.p.f === o.p.m + o.p.f)));

function spellGame() {
  if (Z.symbols.filter(x => level(x.s) === 3).length < SPELL_MIN) return go('');
  // words made only of symbols the child has seen, weakest symbols first
  const seen = new Set(seenSyms());
  const score = o => o.parts.reduce((a, s) => a + weight(s), 0) / o.parts.length - o.parts.filter(s => !seen.has(s)).length * 10;
  const picked = [];
  for (const o of ONE.map(o => [score(o), o]).sort((a, b) => b[0] - a[0]).map(x => x[1]))
    if (picked.length < ROUND && !picked.some(x => sylKey(x.p) === sylKey(o.p))) picked.push(o);
  // A and B take turns, starting with the easier A
  const qs = shuffle(picked).map((o, k) => k % 2 ? spellB(o) : spellA(o));
  G = { cfg: { game: 'spell' }, qs, k: 0, results: [], over: false, told: {}, newStickers: [], started: Date.now() };
  renderSpell();
}
function spellA(o) {
  const opts = [o];
  for (const x of [...shuffle(near(o, ONE)), ...shuffle(ONE)])
    if (opts.length < 3 && !opts.some(y => sylKey(y.p) === sylKey(x.p))) opts.push(x);
  return { type: 'A', ...o, opts: shuffle(opts) };
}
function spellB(o) {
  const extra = [];   // 2 decoys, near-misses of the word's own symbols first (尺 has only one symbol)
  for (let k = 0; extra.length < 2; k++) extra.push(...distractors(o.parts[k % o.parts.length], 1, [...o.parts, ...extra].join('')));
  return { type: 'B', ...o, tiles: shuffle([...o.parts, ...extra]) };
}

// the slide: ball starts on the ladder platform, stops at each symbol (聲母 → 介音 → 韻母, tone on the last)
function slideSVG(q) {
  return `<svg class="slide" viewBox="0 0 300 190" aria-hidden="true">
    <path d="M34 48 V182 M58 48 V182 M34 80 H58 M34 112 H58 M34 144 H58 M34 176 H58" class="sl-ladder"/>
    <path d="M28 46 H86" class="sl-top"/>
    <path d="M86 46 C 160 46, 170 168, 286 168" class="sl-rail"/>
    <path d="M86 46 C 160 46, 170 168, 286 168" class="sl-path"/>
    ${q.parts.map((s, k) => `<text class="sl-sym" data-k="${k}">${s}${k === q.parts.length - 1 && q.tone ? `<tspan class="sl-tn">${q.tone}</tspan>` : ''}</text>`).join('')}
    <circle class="sl-ball" r="11" cx="57" cy="34"/>
  </svg>`;
}
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
function slideSteps(q, svg, withWord) {
  const path = svg.querySelector('.sl-path'), L = path.getTotalLength(), n = q.parts.length;
  const stop = k => L * (n > 1 ? 0.12 + 0.62 * k / (n - 1) : 0.4);
  const ball = svg.querySelector('.sl-ball'), syms = [...svg.querySelectorAll('.sl-sym')];
  const put = l => { const p = path.getPointAtLength(l); ball.setAttribute('cx', p.x); ball.setAttribute('cy', p.y - 12); };
  syms.forEach((el, k) => { const p = path.getPointAtLength(stop(k)); el.setAttribute('x', p.x + 14); el.setAttribute('y', p.y - 16); });
  let at = 0;
  // slides faster as it goes, like a real slide; reduced motion jumps from stop to stop
  const roll = to => () => new Promise(res => {
    const from = at; at = to;
    if (REDUCED) { put(to); return res(); }
    const ms = 250 + 900 * Math.abs(to - from) / L, t0 = performance.now();
    const f = now => { const k = Math.min(1, (now - t0) / ms); put(from + (to - from) * k * k); k < 1 && svg.isConnected ? requestAnimationFrame(f) : res(); };
    requestAnimationFrame(f);
  });
  return [
    () => { syms.forEach(el => el.classList.remove('lit')); svg.classList.remove('end'); at = 0; put(0); },
    ...q.parts.flatMap((s, k) => [roll(stop(k)), () => { syms[k].classList.add('lit'); return saySym(s); }, 100]),
    roll(L), () => svg.classList.add('end'),
    withWord && (() => sayWord(q.w)),
  ];
}

const SPELL_TITLE = { A: '看拼音，找到圖片！', B: '聽聽看，拼出來！' };
const SPELL_INTRO = { A: '跟著溜滑梯念念看，找到對的圖片。', B: '聽聽看，把注音一個一個放進格子裡。' };
function renderSpell() {
  if (G.k >= G.qs.length) return renderDone();
  const q = G.qs[G.k];
  q.tries = 0; q.locked = false; q.at = 0; q.sel = null;
  const body = q.type === 'A'
    ? `<button class="slide-box" data-act="slide" aria-label="再聽一次">${slideSVG(q)}</button>
       <div class="opts pics">${q.opts.map(o => `<button class="opt pic" data-act="pick" data-w="${esc(o.w)}">${img(o.w)}</button>`).join('')}</div>`
    : `<div class="spell-row">
         <button class="q-pic sp-pic" data-act="replay" aria-label="再聽一次">${img(q.w)}</button>
         <div class="slots" data-act="slots" aria-label="注音格子">${q.parts.map((_, k) => `<span class="slot" data-k="${k}"></span>`).join('')}${q.tone ? `<i class="tn">${q.tone}</i>` : ''}</div>
       </div>
       <div class="tiles">${q.tiles.map(s => `<button class="tile" data-act="tile" data-s="${s}">${s}</button>`).join('')}</div>
       <p class="note">把注音拖進格子，或點一下注音、再點格子。</p>
       <div class="slide-box hint" hidden>${slideSVG(q)}</div>`;
  app.innerHTML = `
    ${roundBar()}
    <div class="q">
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">${SPELL_TITLE[q.type]}</div></div>
      ${body}
      <div class="fb" id="fb"></div>
      <div id="next"></div>
    </div>`;
  const svg = $('.slide');
  const slide = () => slideSteps(q, svg, q.type === 'B' || q.locked);
  ACT.quit = () => { G = null; go(''); };
  ACT.next = () => { hush(); G.k++; renderSpell(); };
  ACT.slide = () => seq(slide());
  ACT.replay = () => seq([() => sayWord(q.w)]);
  ACT.pick = el => spellPick(q, el, slide);
  ACT.tile = el => {
    if (el._dragged) { el._dragged = false; return; }
    if (q.locked || el.disabled) return;
    q.sel = el.dataset.s;
    app.querySelectorAll('.tile').forEach(t => t.classList.toggle('sel', t === el));
    seq([() => saySym(q.sel)]);
  };
  ACT.slots = () => { if (q.sel) spellPlace(q, q.sel, slide); };
  app.querySelectorAll('.tile').forEach(t => dragCard(t, '.slots', () => spellPlace(q, t.dataset.s, slide)));
  if (q.type === 'A') slideSteps(q, svg)[0]();   // lay out the symbols before the first run
  const intro = !G.told[q.type];
  G.told[q.type] = true;
  setTimeout(() => {
    if (G?.qs[G.k] !== q || q.locked || q.tries || q.at || location.hash !== '#/spell') return;
    seq([...(intro ? narrate({ t: SPELL_INTRO[q.type], ...FEI }, 200) : []), ...(q.type === 'A' ? slide() : [() => sayWord(q.w)])]);
  }, 300);
}

// both types record every symbol of the word: firstTry = solved without a single mistake
function spellSolved(q, firstTry) {
  q.locked = true;
  G.results[G.k] = firstTry;
  for (const s of q.parts) record(s, firstTry);
  G.newStickers.push(...unlockStickers());
  // B spelled right first time in 2 different rounds -> the word's picture joins the sticker book
  if (q.type === 'B' && firstTry) {
    const rec = (S.spell['zh:' + q.w] ??= { ok: 0, round: 0 });
    if (rec.round !== G.started) { rec.ok++; rec.round = G.started; }
    if (rec.ok >= 2 && giveSticker(Z.words[q.w].art)) G.newStickers.push(q.w);
    save();
  }
  showNext();
}

async function spellPick(q, el, slide) {
  if (q.locked || el.disabled) return;
  if (el.dataset.w === q.w) {
    el.classList.add('right'); ding();
    spellSolved(q, q.tries === 0);
    app.querySelectorAll('.opt.pic').forEach(b => { if (b !== el) b.disabled = true; });
    const praise = pick(PRAISE);
    bubble(praise); setCat('fei', 'smile', 'hop');
    seq([300, () => sayWord(q.w), 200, ...narrate({ t: praise, ...FEI })]);
    return;
  }
  q.tries++;
  el.classList.add('wrong'); el.disabled = true; boop();
  if (q.tries >= 2) {
    spellSolved(q, false);
    app.querySelector(`.opt.pic[data-w="${q.w}"]`).classList.add('reveal');
    app.querySelectorAll('.opt.pic:not(.reveal)').forEach(b => { b.disabled = true; });
    bubble('是這一個喔！'); setCat('fei', 'calm', 'wobble');
    seq([300, () => sayWord(el.dataset.w), 300, ...narrate({ t: '答案是', ...FEI }), ...slide()]);
  } else {
    bubble('再聽聽看～'); setCat('fei', 'calm', 'wobble');
    // let the child hear what they picked, then the slide again
    seq([300, () => sayWord(el.dataset.w), 300, ...narrate({ t: '再聽聽看', ...FEI }, 150), ...slide()]);
  }
}

function spellPlace(q, s, slide) {
  if (q.locked) return;
  const tile = app.querySelector(`.tile[data-s="${s}"]`);
  tile.style.transform = ''; tile._dx = tile._dy = 0;
  q.sel = null; app.querySelectorAll('.tile.sel').forEach(t => t.classList.remove('sel'));
  if (s === q.parts[q.at]) {
    const slot = app.querySelector(`.slot[data-k="${q.at}"]`);
    slot.textContent = s; slot.classList.add('filled');
    tile.disabled = true; tile.classList.add('used');
    app.querySelectorAll('.tile.reveal').forEach(t => t.classList.remove('reveal'));
    if (++q.at < q.parts.length) return seq([() => saySym(s)]);
    // spelled: run the slide once more so the sounds join up into the word
    ding(); spellSolved(q, q.tries === 0);
    app.querySelectorAll('.tile').forEach(t => { t.disabled = true; });
    $('.slots').classList.add('done');
    const praise = pick(PRAISE);
    bubble(q.tries ? `對了，${q.w}！` : praise); setCat('fei', 'smile', 'hop');
    $('.hint').hidden = false;
    seq([...slide(), 200, ...narrate({ t: q.tries ? '對了！' : praise, ...FEI })]);
    return;
  }
  q.tries++; boop();
  tile.classList.remove('no'); void tile.offsetWidth; tile.classList.add('no');
  if (!q.parts.includes(s)) tile.disabled = true;
  bubble('再聽聽看～'); setCat('fei', 'calm', 'wobble');
  if (q.tries === 1) {   // first mistake: the slide is the hint
    $('.hint').hidden = false;
    seq([350, ...narrate({ t: '看溜滑梯，再聽聽看', ...FEI }, 150), ...slide()]);
  } else {               // after that: point at the symbol that goes next
    const want = q.parts[q.at];
    app.querySelector(`.tile[data-s="${want}"]`).classList.add('reveal');
    seq([350, ...narrate({ t: '下一個是', ...FEI }), () => saySym(want)]);
  }
}

/* ============ game: 泡泡 (pop the bubble with the sound you hear) ============ */
// Review of learned symbols only: 菲菲 plays a symbol, 4 bubbles rise (it + 3 near-misses).
// A bubble that floats off the top is a miss: the sound plays again and a new wave starts.
const BUB_MIN = 5;      // learned symbols before it unlocks
const BUB_N = 8;
const BUB_SPEED = { slow: { name: '慢', sec: 11 }, mid: { name: '中', sec: 8 }, fast: { name: '快', sec: 6 } };

function bubbleGame() {
  const learned = Z.symbols.filter(x => level(x.s) === 3).map(x => x.s);
  if (learned.length < BUB_MIN) return go('');
  // weakest first; with few learned symbols a symbol may come back, but not twice in a row
  const pool = shuffle(chooseTargets(learned, BUB_N)), ts = [];
  while (pool.length) { const i = pool.findIndex(x => x !== ts.at(-1)); ts.push(...pool.splice(Math.max(0, i), 1)); }
  const qs = ts.map(t => ({ t, opts: shuffle([t, ...distractors(t, 3)]) }));
  G = { cfg: { game: 'bubbles' }, qs, k: 0, results: [], over: false, told: {}, newStickers: [] };
  renderBubbles();
}

function renderBubbles() {
  if (G.k >= G.qs.length) return renderDone();
  const q = G.qs[G.k];
  q.tries = 0; q.locked = false;
  app.innerHTML = `
    ${roundBar()}
    <div class="q">
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">聽聲音，戳破對的泡泡！</div>
        <button class="play small" data-act="replay" aria-label="再聽一次">🔊</button></div>
      <div class="bub-stage" style="--rise:${BUB_SPEED[S.settings.bubbles]?.sec || 11}s"></div>
    </div>`;
  ACT.quit = () => { G = null; go(''); };
  ACT.replay = el => { el.classList.remove('playing'); void el.offsetWidth; el.classList.add('playing'); seq([() => saySym(q.t)]); };
  const intro = !G.told.b;
  G.told.b = true;
  setTimeout(() => {
    if (G?.qs[G.k] !== q || location.hash !== '#/bubbles') return;
    bubWave(q, intro ? narrate({ t: '聽聲音，戳破對的泡泡！', ...FEI }, 200) : []);
  }, 300);
}

// one wave: say the sound, then let the bubbles go (lanes shuffled, starts staggered)
async function bubWave(q, before = []) {
  const g = G;
  $('.bub-stage').innerHTML = '';
  if (!await seq([...before, () => saySym(q.t), 150]) || G !== g || G.qs[G.k] !== q || q.locked) return;
  const stage = $('.bub-stage');
  const left = q.opts.filter(o => o === q.t || !q.gone?.includes(o));
  const lanes = shuffle([0, 1, 2, 3]).slice(0, left.length), delays = shuffle([0, 0.7, 1.4, 2.1]);
  stage.innerHTML = left.map((o, i) => `<button class="bub${q.tries >= 2 && o === q.t ? ' glow' : ''}" data-o="${o}"
    style="--lane:${lanes[i]};--delay:${delays[i]}s;--sway:${(Math.random() * 2 - 1).toFixed(2)}" aria-label="${o}"><span>${o}</span></button>`).join('');
  for (const b of stage.querySelectorAll('.bub')) {
    // pointerdown, not click: a moving target can slide out from under a slow tap
    b.addEventListener('pointerdown', e => { e.preventDefault(); bubPop(q, b); });
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bubPop(q, b); } });
    if (b.dataset.o === q.t) b.addEventListener('animationend', e => { if (e.animationName === 'rise') bubMissed(q); });
  }
}

function bubMissed(q) {
  if (q.locked || G?.qs[G.k] !== q) return;
  q.tries++;
  bubble('泡泡飛走了，再聽一次～'); setCat('fei', 'calm', 'wobble');
  bubWave(q, narrate({ t: '泡泡飛走了，再聽一次', ...FEI }, 150));
}

async function bubPop(q, b) {
  if (q.locked || b.classList.contains('popped')) return;
  if (b.dataset.o !== q.t) {
    q.tries++; boop();
    (q.gone ??= []).push(b.dataset.o);   // that one stays away in later waves
    b.classList.add('popped', 'wrong');
    bubble('再聽聽看～'); setCat('fei', 'calm', 'wobble');
    if (q.tries >= 2) app.querySelector(`.bub[data-o="${q.t}"]`)?.classList.add('glow');
    seq([300, ...narrate({ t: '再聽聽看', ...FEI }, 150), () => saySym(q.t)]);
    return;
  }
  q.locked = true;
  const firstTry = q.tries === 0;
  G.results[G.k] = firstTry;
  record(q.t, firstTry);
  G.newStickers.push(...unlockStickers());
  ding(); b.classList.add('popped');
  app.querySelectorAll('.bub').forEach(x => x.style.animationPlayState = 'paused');
  const praise = pick(PRAISE);
  bubble(praise); setCat('fei', 'smile', 'hop');
  const g = G;
  await Promise.all([sleep(1100), seq([200, () => saySym(q.t), 150, ...narrate({ t: praise, ...FEI })])]);
  if (G === g && G.qs[G.k] === q && location.hash === '#/bubbles') { G.k++; renderBubbles(); }
}

/* ============ game: 大對決 (闖關地圖: 胖胖 throws yarn at the pictures with the sound you hear) ============ */
// Picture cards of one easily-confused pair (ㄓ / ㄗ) ride a conveyor belt; 菲菲 says one of the two
// symbols and the child taps every picture that has it. Each pair is played twice (once per symbol).
// No text under the pictures — hearing the word is the point. A card that rides off comes back; a wrong
// hit costs nothing but counts as a slip. A pair is beaten with at most BOSS_SLIP slips over its two waves.
const BOSS_PAIRS = 2;         // pairs per round -> 4 waves
const BOSS_HIT = 3;           // target pictures per wave (fewer if the symbol has fewer words: ㄦ)
const BOSS_FOIL = 3;          // pictures of the other symbol riding along
const BOSS_SLIP = 1;
const BELT_SPEED = { slow: 42, mid: 62, fast: 88 };   // px/s, follows the 泡泡 speed setting

function bossGame(arg) {
  const leg = LEGS[arg - 1] ? +arg : 0;
  if (!leg) return go('learn');
  // pairs not beaten yet first, then the ones the child misses most
  const pairs = legPairs(leg - 1).map(p => [(pairWon(p) ? 0 : 100) + stat(p[0]).bad + stat(p[1]).bad + Math.random() * 2, p])
    .sort((x, y) => y[0] - x[0]).slice(0, BOSS_PAIRS).map(x => x[1]);
  const has = (w, s) => firstSyl(w).includes(s);
  const qs = pairs.flatMap(pair => {
    const [a, b] = pair;
    const only = (s, o) => shuffle(Object.keys(Z.words).filter(w => has(w, s) && !has(w, o)));
    return shuffle([[a, b], [b, a]]).map(([t, o]) => {
      const hits = only(t, o).slice(0, BOSS_HIT);
      return { t, pair, hits, cards: shuffle([...hits, ...only(o, t).slice(0, BOSS_FOIL)]) };
    });
  });
  G = { cfg: { game: 'boss', arg: leg }, leg, qs, k: 0, results: [], over: false, told: {}, newStickers: [] };
  renderBoss();
}

function renderBoss() {
  if (G.k >= G.qs.length) return bossEnd();
  const q = G.qs[G.k];
  q.slips = 0; q.got = []; q.locked = false;
  app.innerHTML = `
    ${roundBar('回')}
    <div class="q">
      <div class="ask">${catEl('fei')}<div class="bubble" id="bubble">⚔️ 第 ${G.leg} 關大對決！</div></div>
      <div class="boss-target">
        <button class="big-sym boss-sym g-${SYM[q.t].g}" data-act="replay" aria-label="再聽一次">${q.t}<span class="spk">🔊</span></button>
        <span class="yarns" aria-label="還要打 ${q.hits.length} 張">${q.hits.map(() => '<i></i>').join('')}</span>
      </div>
      <div class="belt" style="--belt:${BELT_SPEED[S.settings.bubbles] || BELT_SPEED.slow}px">
        ${q.cards.map(w => `<button class="bcard" data-w="${esc(w)}" aria-label="${esc(w)}">${img(w)}</button>`).join('')}
      </div>
      <div class="thrower">${catEl('pang')}</div>
    </div>`;
  ACT.quit = () => { G = null; go(''); };
  ACT.replay = el => { el.classList.remove('playing'); void el.offsetWidth; el.classList.add('playing'); seq([() => saySym(q.t)]); };
  for (const c of app.querySelectorAll('.bcard')) {
    // pointerdown, not click: a moving target can slide out from under a slow tap
    c.addEventListener('pointerdown', e => { e.preventDefault(); bossThrow(q, c); });
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bossThrow(q, c); } });
  }
  beltRun(q);
  const intro = !G.told.b;
  G.told.b = true;
  setTimeout(() => {
    if (G?.qs[G.k] !== q || q.got.length || q.slips || !location.hash.startsWith('#/boss')) return;
    seq([...(intro ? narrate({ t: '大對決！', ...PANG }, 150, { t: '聽到這個音的圖片，就丟毛線球打它！', ...FEI }, 200)
      : narrate({ t: '換這個音', ...FEI }, 150)), () => saySym(q.t)]);
  }, 300);
}

// the belt: cards evenly spaced on a loop longer than the screen, moving right to left; a hit card
// is taken off and leaves a gap
function beltRun(q) {
  const belt = $('.belt'), cards = [...belt.querySelectorAll('.bcard')];
  const speed = parseFloat(getComputedStyle(belt).getPropertyValue('--belt'));
  const g = G;
  let off = 0, last = performance.now();
  const step = now => {
    if (G !== g || G.qs[G.k] !== q || !belt.isConnected) return;
    const W = belt.clientWidth, cw = cards[0].offsetWidth, gap = Math.max(cw + 24, (W + cw + 24) / cards.length), L = gap * cards.length;
    if (!q.locked) off += speed * Math.min(0.05, (now - last) / 1000);
    last = now;
    cards.forEach((c, i) => { c.style.transform = `translateX(${((i * gap - off) % L + L) % L - cw}px)`; });
    belt.style.backgroundPositionX = `${-off}px`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function bossThrow(q, c) {
  if (q.locked || c._busy) return;
  c._busy = true;
  const right = q.hits.includes(c.dataset.w);
  // 胖胖 throws: a yarn ball flies from him to the card
  setCat('pang', 'oh', 'hop', $('.thrower'));
  const from = $('.thrower').getBoundingClientRect(), to = c.getBoundingClientRect();
  const ball = document.createElement('i');
  ball.className = 'yarn';
  app.append(ball);
  // aim where the card will be when the ball lands: the belt keeps moving
  const fly = 380, speed = parseFloat(getComputedStyle($('.belt')).getPropertyValue('--belt'));
  const x0 = from.left + from.width / 2, y0 = from.top + 10, x1 = to.left + to.width / 2 - speed * fly / 1000, y1 = to.top + to.height / 2;
  await ball.animate([
    { transform: `translate(${x0}px, ${y0}px) rotate(0)` },
    { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 60}px) rotate(270deg)`, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) rotate(540deg)` },
  ], { duration: fly, easing: 'ease-in' }).finished.catch(() => {});
  ball.remove();
  if (G?.qs[G.k] !== q) return;
  if (!right) {
    q.slips++; boop();
    c.classList.remove('miss'); void c.offsetWidth; c.classList.add('miss');
    setCat('pang', 'talk', '', $('.thrower'));
    bubble('再聽聽看～'); setCat('fei', 'calm', 'wobble');
    if (q.slips >= 2) app.querySelectorAll('.bcard').forEach(x => x.classList.toggle('glow', q.hits.includes(x.dataset.w) && !q.got.includes(x.dataset.w)));
    setTimeout(() => { c._busy = false; }, 500);
    seq([() => sayWord(c.dataset.w), 200, ...narrate({ t: '再聽聽看', ...FEI }, 150), () => saySym(q.t)]);
    return;
  }
  q.got.push(c.dataset.w);
  ding(); c.classList.add('hit');
  setTimeout(() => c.remove(), 700);
  app.querySelectorAll('.yarns i')[q.got.length - 1]?.classList.add('on');
  setCat('pang', 'happy', 'hop', $('.thrower'));
  if (q.got.length < q.hits.length) return seq([() => sayWord(c.dataset.w)]);
  // wave cleared
  q.locked = true;
  const clean = q.slips === 0;
  G.results[G.k] = clean;
  record(q.t, clean);
  G.newStickers.push(...unlockStickers());
  const praise = pick(PRAISE);
  bubble(praise); setCat('fei', 'smile', 'hop');
  const g = G;
  await seq([() => sayWord(c.dataset.w), 300, ...narrate({ t: praise, ...FEI }), 500]);
  if (G === g && G.qs[G.k] === q && location.hash.startsWith('#/boss')) { G.k++; renderBoss(); }
}

// a pair is beaten when its two waves together had at most BOSS_SLIP slips
function bossEnd() {
  if (!G.over) {
    const was = bossWon(G.leg - 1);
    G.beat = [];
    for (const p of new Set(G.qs.map(q => q.pair))) {
      const slips = G.qs.filter(q => q.pair === p).reduce((n, q) => n + q.slips, 0);
      if (slips <= BOSS_SLIP && !pairWon(p)) { S.map['zh:' + p.join('')] = Date.now(); G.beat.push(p); }
    }
    G.wonLeg = !was && bossWon(G.leg - 1);
    save();
  }
  renderDone();
}

/* ============ game: 抓錯遊戲 (胖胖 reads a word — right, or as a near-miss; the child judges) ============ */
// One-character words with a near-miss partner (貓 -> 馬 / 草 / 門). 胖胖's "reading" is that word's
// recording, so a wrong reading is a real, reviewed word — no new syllable audio needed.
const CATCH_MIN = 8;    // learned symbols before it unlocks

function catchGame() {
  if (Z.symbols.filter(x => level(x.s) === 3).length < CATCH_MIN) return go('');
  const seen = new Set(seenSyms());
  const score = o => o.parts.reduce((a, s) => a + weight(s), 0) / o.parts.length - o.parts.filter(s => !seen.has(s)).length * 10;
  const picked = [];
  for (const o of ONE.filter(o => near(o, ONE).length).map(o => [score(o), o]).sort((a, b) => b[0] - a[0]).map(x => x[1]))
    if (picked.length < ROUND && !picked.some(x => sylKey(x.p) === sylKey(o.p))) picked.push(o);
  // at least 2 right and 2 wrong readings in a round
  const right = shuffle([true, true, false, false, Math.random() < 0.5]);
  const qs = shuffle(picked).map((o, k) => ({ ...o, right: right[k], heard: right[k] ? o.w : pick(near(o, ONE)).w }));
  G = { cfg: { game: 'catch' }, qs, k: 0, results: [], over: false, told: {}, newStickers: [] };
  renderCatch();
}

function renderCatch() {
  if (G.k >= G.qs.length) return renderDone();
  const q = G.qs[G.k];
  q.tries = 0; q.locked = false;
  app.innerHTML = `
    ${roundBar()}
    <div class="q">
      <div class="ask">${catEl('pang', 'talk')}<div class="bubble" id="bubble">胖胖念對了嗎？</div>
        <button class="play small" data-act="replay" aria-label="再聽一次">🔊</button></div>
      <div class="q-prompt"><div class="q-pic">${img(q.w)}${ruby(q.w)}</div></div>
      <div class="opts verdict">
        <button class="opt" data-act="judge" data-v="1" aria-label="念對了"><b class="mk ok">○</b>念對了</button>
        <button class="opt" data-act="judge" data-v="0" aria-label="念錯了"><b class="mk no">✕</b>念錯了</button>
      </div>
      <div class="fb" id="fb"></div>
      <div id="next"></div>
    </div>`;
  const reading = (again = false) => [{ t: again ? '我再念一次。' : '我念念看。', ...PANG }, 150, () => sayPangWord(q.heard)];
  ACT.quit = () => { G = null; go(''); };
  ACT.next = () => { hush(); G.k++; renderCatch(); };
  ACT.replay = el => { el.classList.remove('playing'); void el.offsetWidth; el.classList.add('playing'); seq([() => sayPangWord(q.heard)]); };
  ACT.judge = el => catchJudge(q, el, reading);
  const intro = !G.told.c;
  G.told.c = true;
  setTimeout(() => {
    if (G?.qs[G.k] !== q || q.locked || q.tries || location.hash !== '#/catch') return;
    seq([...(intro ? narrate({ t: '胖胖會念念看。念對了按圈圈，念錯了按叉叉。', ...FEI }, 200) : []), ...reading()]);
  }, 300);
}

// what 胖胖 said, shown under the question once it's settled
const heardEl = q => `<span class="heard">胖胖念成${img(q.heard)}${ruby(q.heard)}</span>`;

async function catchJudge(q, el, reading) {
  if (q.locked || el.disabled) return;
  if ((el.dataset.v === '1') === q.right) {
    q.locked = true;
    const firstTry = q.tries === 0;
    G.results[G.k] = firstTry;
    // a right reading is a 50/50 guess; only a caught mistake says the child heard the difference
    if (!q.right) catchRecord(q, firstTry);
    el.classList.add('right'); ding();
    lockAll(); showNext();
    if (q.right) {
      bubble('耶，我念對了！'); setCat('pang', 'happy', 'hop');
      seq([300, ...narrate({ t: '耶，我念對了！', ...PANG }), () => sayPangWord(q.w)]);
    } else {
      // 3.5 教胖胖 will ask the child to say it instead
      bubble('被你抓到了！'); setCat('pang', 'oh', 'hop');
      $('#fb').innerHTML = heardEl(q);
      seq([300, { t: '被你抓到了！那要怎麼念？', ...PANG }, 200, ...narrate({ t: '對的是', ...FEI }), () => sayWord(q.w)]);
    }
    return;
  }
  q.tries++;
  el.classList.add('wrong'); boop();
  if (q.tries >= 2) {
    q.locked = true;
    G.results[G.k] = false;
    if (!q.right) catchRecord(q, false);
    app.querySelector(`.opt[data-v="${q.right ? 1 : 0}"]`).classList.add('reveal');
    lockAll(); showNext();
    setCat('pang', 'think', 'wobble');
    if (q.right) {
      bubble('胖胖念對了喔！');
      seq([300, ...narrate({ t: '胖胖念對了喔', ...FEI }), () => sayWord(q.w)]);
    } else {
      bubble('胖胖念錯了喔！');
      $('#fb').innerHTML = heardEl(q);
      seq([300, ...narrate({ t: '胖胖剛剛念成', ...FEI }), () => sayPangWord(q.heard), 300, ...narrate({ t: '對的是', ...FEI }), () => sayWord(q.w)]);
    }
  } else {
    el.disabled = true;
    bubble('再聽聽看～'); setCat('pang', 'talk', 'wobble');
    seq([350, ...narrate({ t: '再聽聽看', ...FEI }, 150), ...reading(true)]);
  }
}
// the symbols 胖胖 got wrong (貓 ㄇㄠ read as 馬 ㄇㄚ -> ㄠ); none when the target's are all in it (尺 -> 船)
function catchRecord(q, firstTry) {
  const heard = ONE.find(o => o.w === q.heard).parts;
  for (const s of q.parts) if (!heard.includes(s)) record(s, firstTry);
  G.newStickers.push(...unlockStickers());
}

/* ============ game: 教胖胖 (read a word's zhuyin aloud to 胖胖 — the child is the teacher) ============ */
// No microphone: a parent listens, or the child judges. Speaking up is what earns the star, so every
// question gets one; ○ / △ is the child's own call and changes nothing — no record(), no sticker
// (a sticker would teach "always press ○"). Open from the start for now (the spec's unlock: 拼拼看 ≥ 10).
const TEACH_ONE = 3, TEACH_TWO = 2;

function teachGame() {
  // words the child can read: all their symbols learned first, then seen, then anything
  const syms = w => [...Z.words[w].zy.replace(/[\sˊˇˋ˙]/g, '')];
  const rank = w => syms(w).reduce((n, s) => n + (level(s) === 3 ? 0 : S.seen['zh:' + s] ? 1 : 3), 0) + Math.random() * 2;
  const take = (list, n) => list.map(w => [rank(w), w]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
  const words = Object.keys(Z.words);
  const qs = [...take(words.filter(w => [...w].length === 1), TEACH_ONE), ...take(words.filter(w => [...w].length === 2), TEACH_TWO)]
    .map(w => ({ w }));
  G = { cfg: { game: 'teach' }, qs, k: 0, results: [], over: false, newStickers: [] };
  renderTeach();
}

function renderTeach() {
  if (G.k >= G.qs.length) return renderDone();
  const q = G.qs[G.k];
  const ask = G.k === 0 ? '老師好！這個要怎麼念？請大聲念給我聽～' : '這個呢？請大聲念給我聽～';
  app.innerHTML = `
    ${roundBar()}
    <div class="q">
      <div class="ask">${catEl('pang', 'think')}<div class="bubble" id="bubble">${ask}</div></div>
      <div class="teach-card" id="tcard"><span class="teach-zy">${Z.words[q.w].zy.split(' ').map(y => zyCol(y)).join('')}</span></div>
      <div class="btn-row" id="tbtns">
        <button class="btn" data-act="hint">🤫 偷偷提示</button>
        <button class="btn primary big" data-act="said">我念好了！</button>
      </div>
      <div id="next"></div>
      ${G.k === 0 ? '<p class="note">這裡不會錄音。請家長在旁邊聽孩子念，或讓孩子自己判斷念得一不一樣。</p>' : ''}
    </div>`;
  ACT.quit = () => { G = null; go(''); };
  // quiet, so it feels like a secret — and the child still has to say it themselves
  ACT.hint = () => seq([() => sayWord(q.w, 0.4)]);
  ACT.said = () => teachSaid(q);
  ACT.same = () => teachJudge(q, true);
  ACT.diff = () => teachJudge(q, false);
  ACT.next = () => { hush(); G.k++; renderTeach(); };
  setTimeout(() => {
    if (G?.qs[G.k] !== q || q.said || location.hash !== '#/teach') return;
    seq(narrate({ t: ask, ...PANG }));
  }, 300);
}

// the star is for speaking up; then the picture and 胖胖's own try
function teachSaid(q) {
  if (q.said) return;
  q.said = true;
  G.results[G.k] = true;
  ding();
  $('#tcard').innerHTML = `${img(q.w)}${ruby(q.w)}`;
  $('#tcard').classList.add('shown');
  $('#tbtns').innerHTML = `<button class="btn big" data-act="same">○ 一樣！</button><button class="btn big" data-act="diff">△ 不太一樣</button>`;
  bubble(`${q.w}！我學會了！我念的跟你一樣嗎？`); setCat('pang', 'happy', 'hop');
  const g = G;
  seq([300, () => sayPangWord(q.w), 200, ...narrate({ t: '我學會了！我念的跟你一樣嗎？', ...PANG }),
    () => { if (G === g && G.qs[G.k] === q && !q.judged) setCat('pang', 'talk'); }]);
}

function teachJudge(q, same) {
  if (q.judged) return;
  q.judged = true;
  $('#tbtns').innerHTML = '';
  const last = G.k + 1 >= G.qs.length;
  $('#next').innerHTML = `<button class="btn primary big" data-act="next">${last ? '看看拿了幾顆星 ⭐' : '下一題 →'}</button>`;
  if (same) {
    bubble('謝謝老師！'); setCat('pang', 'happy', 'dance');
    seq(narrate({ t: '謝謝老師！', ...PANG }));
  } else {
    bubble('沒關係，我們一起慢慢念'); setCat('pang', 'talk', 'wobble');
    seq([...narrate({ t: '沒關係，我們一起慢慢念', ...PANG }, 300), () => sayWord(q.w), 600, () => sayWord(q.w)]);
  }
}

const REST_AT = 3;   // rounds per day before 菲菲 suggests a break (never blocks)
function renderDone() {
  if (G.over) return;           // re-rendered by navigation: don't count the round twice
  G.over = true;
  // 翻牌 has no per-question results: its 3 stars come from how many tries it took
  const marks = G.cfg.game === 'memory' ? [1, 2, 3].map(n => n <= memStars(G.tries)) : G.results;
  const stars = marks.filter(Boolean).length;
  const msg = G.cfg.game === 'memory' ? (stars === 3 ? '記得好清楚！' : '全部找到了！')
    : G.cfg.game === 'teach' ? '謝謝你陪胖胖練習！'
    : stars === G.qs.length ? '全部答對！' : stars >= 3 ? '很棒喔！' : '多聽幾次就會了！';
  const day = (S.days[dayKey()] ??= { rounds: 0, stamp: '' });
  day.rounds++;
  const firstToday = !day.stamp;
  if (firstToday) day.stamp = pick(STAMPS);
  save();
  const tired = day.rounds >= REST_AT;
  const fresh = G.newStickers;
  // 大對決: pairs beaten this round; the last one of a leg lights up the next leg
  const beat = G.beat || [], won = G.wonLeg, more = won && G.leg < LEGS.length;
  app.innerHTML = `
    <div class="done">
      <div class="duo small">${catEl('pang', 'happy', 'dance')}${catEl('fei', tired ? 'yawn' : 'smile')}</div>
      <h2>${msg}</h2>
      <div class="stars" aria-label="${stars} 顆星">${marks.map((r, i) => `<span class="${r ? 'on' : 'off'}" style="animation-delay:${i * 0.15}s">★</span>`).join('')}</div>
      <div class="recap">${G.qs.map((q, i) => `<span class="g-${q.t ? SYM[q.t].g : 'm'} ${G.cfg.game === 'memory' || G.results[i] ? 'ok' : 'no'}">${q.t || q.w}</span>`).join('')}</div>
      ${won ? `<div class="stamp-new"><span class="stamp">🏆</span><span>第 ${G.leg} 關過關了！${more ? '<br>地圖上的下一關亮起來了' : ''}</span></div>`
        : beat.length ? `<div class="stamp-new"><span class="stamp">🧶</span><span>打贏了 ${beat.map(p => p.join('／')).join('、')}！</span></div>` : ''}
      ${firstToday ? `<div class="stamp-new"><span class="stamp">${day.stamp}</span><span>今天的章蓋好了！</span></div>` : ''}
      ${fresh.length ? `<div class="new-stk"><p>拿到新貼紙！</p><div>${fresh.map((w, i) => `<span style="animation-delay:${0.6 + i * 0.12}s">${img(w)}</span>`).join('')}</div></div>` : ''}
      ${tired ? `<p class="rest">今天已經玩了 ${day.rounds} 輪，好厲害！<br>菲菲想睡覺了，我們明天再玩吧。</p>` : ''}
      <div class="btn-row">
        <button class="btn ${tired ? '' : 'primary '}big" data-act="again">再玩一次</button>
        <a class="btn big" href="#/${G.cfg.focus ? 'sym/' + G.cfg.focus : 'learn'}">${G.leg ? '看地圖' : '看圖卡'}</a>
        <a class="btn ${tired ? 'primary ' : ''}big" href="#/">回首頁</a>
      </div>
    </div>`;
  ACT.again = () => G.cfg.game ? routes[G.cfg.game](G.cfg.arg) : startRound(G.cfg);
  if (stars >= 3) setTimeout(() => tone([523, 659, 784, 1047], 0.16), 200);
  seq([700, ...narrate(
    { t: '耶！', ...PANG }, { t: msg, ...FEI },
    won && { t: '過關了！', ...PANG }, !won && beat.length && { t: '打贏了！', ...PANG }, more && { t: '地圖上的下一關亮起來了。', ...FEI },
    firstToday && { t: '今天的練習完成了，蓋一個章！', ...FEI },
    fresh.length && { t: '拿到新貼紙了！', ...PANG }, ...fresh.flatMap(w => [() => sayWord(w), 150]),
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
      <p class="note">注音符號、範例詞和貓咪說話都播放錄音（見下方「聲音從哪裡來」）；這裡的語音只在錄音播不出來時代替（例如 ㄅ 念代表字「玻」）。</p>
      <label class="check"><input type="checkbox" id="narrate" ${S.settings.narrate ? 'checked' : ''}> 念出題目說明和鼓勵（菲菲、胖胖說話）</label>
    </div>
    <div class="panel">
      <h3>泡泡、大對決的速度</h3>
      <div class="chips" role="group" aria-label="泡泡的速度">${Object.entries(BUB_SPEED).map(([k, v]) =>
        `<button class="chip" data-act="bubSpeed" data-k="${k}" aria-pressed="${S.settings.bubbles === k}">${v.name}</button>`).join('')}</div>
      <p class="note">泡泡往上飄、大對決輸送帶跑的速度。孩子常常來不及點，就調慢一點。</p>
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
      <p class="note"><b>胖胖、菲菲說話</b>：以 Google Gemini 語音合成（gemini-3.8-flash-tts）預先錄好。</p>
      <p class="note"><b>錄音播不出來時</b>：改用這台裝置內建的中文語音。</p>
    </div>`;
  $('#narrate').onchange = e => { S.settings.narrate = e.target.checked; save(); };
  ACT.bubSpeed = el => { S.settings.bubbles = el.dataset.k; save(); app.querySelectorAll('[data-act=bubSpeed]').forEach(b => b.setAttribute('aria-pressed', b === el)); };
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
  // 拼拼看 uses the one-character words; their Gemini clip doubles as the syllable's sound
  ONE = Object.keys(Z.words).filter(w => [...w].length === 1).map(w => {
    const p = parseSyl(Z.words[w].zy);
    return { w, p, parts: sylParts(p), tone: TONE_MARK[p.t] };
  });
  unlockStickers();   // older saves: hand out stickers for symbols learned before the book existed
  document.body.insertAdjacentHTML('beforeend', CAT_DEFS);
  route();
})();
