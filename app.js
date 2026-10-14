// 發音樂園 — 注音 (ABC / 50 音 later). No build step: plain ES module + data/*.json.

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ============ data ============ */
let Z;           // data/zhuyin.json
let SYM = {};    // symbol -> {s, g, say, words}
const GROUP_NAME = { i: '聲母', m: '介音', f: '韻母' };
const ROUND = 5;
// sounds kids typically mix up — used as distractors so practice targets real confusions
const CONFUSE = ['ㄅㄆ', 'ㄉㄊ', 'ㄍㄎ', 'ㄓㄗ', 'ㄔㄘ', 'ㄕㄙ', 'ㄈㄏ', 'ㄋㄌ', 'ㄐㄑㄒ', 'ㄓㄐ', 'ㄔㄑ', 'ㄕㄒ',
  'ㄖㄌ', 'ㄣㄥ', 'ㄢㄤ', 'ㄛㄜ', 'ㄝㄟ', 'ㄞㄟ', 'ㄠㄡ', 'ㄧㄩ', 'ㄨㄩ', 'ㄛㄡ', 'ㄜㄦ'];

/* ============ storage ============ */
const STORE = 'kidphonics.v1';
const S = (() => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } })();
S.settings ??= { rate: 0.8, voice: '' };
S.stats ??= {};                        // 'zh:ㄅ' -> {ok, bad, streak}
S.seen ??= {};                         // 'zh:ㄅ' -> first time its page was opened (ms)
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
function speak(text, rate = S.settings.rate) {
  return new Promise(resolve => {
    if (!HAS_TTS) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    const v = voiceFor();
    if (v) u.voice = v;
    u.rate = rate;
    let done = false;
    const end = () => { if (!done) { done = true; resolve(); } };
    u.onend = end; u.onerror = end;
    setTimeout(end, 1500 + text.length * 700);   // some engines never fire onend
    speechSynthesis.speak(u);
  });
}
const hush = () => HAS_TTS && speechSynthesis.cancel();
const saySym = s => speak(SYM[s].say);

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

/* ============ routing ============ */
const routes = { '': home, learn, sym: symPage, practice, settings };
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
function home() {
  const learned = Z.symbols.filter(x => level(x.s) === 3).length;
  app.innerHTML = `
    <div class="bar"><span style="flex:1"></span><a class="icon-btn" href="#/settings" aria-label="家長設定">⚙️</a></div>
    <section class="hero">
      <div class="hero-art">${['貓', '蘋果', '恐龍', '冰淇淋'].map(w => img(w)).join('')}</div>
      <h1><span>發</span><span>音</span><span>樂</span><span>園</span></h1>
      <p>聽一聽、找一找，認識每個聲音</p>
    </section>
    <div class="langs" role="group" aria-label="選擇語言">
      <button class="lang" aria-pressed="true">注音</button>
      <button class="lang" disabled>ABC<small>準備中</small></button>
      <button class="lang" disabled>あいう<small>準備中</small></button>
    </div>
    <nav class="menu">
      <a href="#/learn"><span class="ico">👀</span><span><span class="t">認識符號</span><br><span class="s">看圖卡、聽發音，37 個注音符號</span></span></a>
      <a href="#/practice"><span class="ico">👂</span><span><span class="t">聽音練習</span><br><span class="s">${seenSyms().length
        ? `練習學過的 ${seenSyms().length} 個符號，一輪 ${ROUND} 題` : '先學幾個符號，再來練習'}</span></span></a>
    </nav>
    <div class="progress">
      <div class="row"><span>學會的符號（連續答對 3 次）</span><b>${learned} / ${Z.symbols.length}</b></div>
      <div class="meter"><i style="width:${learned / Z.symbols.length * 100}%"></i></div>
    </div>`;
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
  ACT.sayWord = async el => { playToken++; flash(el); await speak(el.dataset.w); };
  ACT.sayAll = async () => {
    const my = ++playToken;
    const big = $('.big-sym'); big.classList.add('playing');
    await saySym(s); big.classList.remove('playing');
    for (const card of app.querySelectorAll('.card')) {
      if (my !== playToken) return;
      await sleep(250);
      flash(card); await speak(card.dataset.w);
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
function practice(focus) {
  if (focus && SYM[focus]) { markSeen(focus); return startRound({ mode: 'seen', focus }); }
  if (G && !G.over) return renderQ();
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
  G = { cfg, qs: makeQuestions(roundTargets(cfg)), k: 0, results: [], over: false };
  renderQ();
}
function promptSound(q) { return q.type === 'A' ? saySym(q.t) : speak(q.w); }

function renderQ() {
  if (G.k >= G.qs.length) return renderDone();
  const q = G.qs[G.k];
  q.tries = 0; q.locked = false;
  const dotsHtml = G.qs.map((_, i) => `<i class="${i < G.k ? (G.results[i] ? 'done' : 'miss') : i === G.k ? 'now' : ''}"></i>`).join('');
  const prompt = q.type === 'A'
    ? `<p class="q-title">聽聲音，找到它！</p><div class="q-prompt"><button class="play" data-act="replay" aria-label="再聽一次">🔊</button></div>`
    // zhuyin hidden until answered — it would give the answer away
    : `<p class="q-title">聽到哪一個音？</p><div class="q-prompt"><button class="q-pic" data-act="replay" aria-label="再聽一次">${img(q.w)}<span id="qword" class="zw">${esc(q.w)}</span></button></div>`;
  app.innerHTML = `
    <div class="bar pbar"><a class="icon-btn" href="#/" data-act="quit" aria-label="離開">✕</a>
      <span class="pdots" aria-label="第 ${G.k + 1} 題，共 ${G.qs.length} 題">${dotsHtml}</span><span style="width:46px"></span></div>
    <div class="q">${prompt}
      <div class="opts">${q.opts.map(o => `<button class="opt" data-act="answer" data-o="${o}">${o}</button>`).join('')}</div>
      <div class="fb" id="fb"></div>
      <div id="next"></div>
    </div>`;
  ACT.replay = async el => { el.classList.remove('playing'); void el.offsetWidth; el.classList.add('playing'); await promptSound(q); };
  ACT.quit = () => { G = null; go(''); };
  ACT.answer = el => answer(q, el);
  ACT.next = () => { G.k++; renderQ(); };
  setTimeout(() => promptSound(q), 300);
}

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
    fb.className = 'fb good'; fb.textContent = pick(PRAISE);
    lockAll(); revealWord(q);
    showNext();
  } else {
    q.tries++;
    el.classList.add('wrong'); el.disabled = true; boop();
    if (q.tries >= 2) {
      q.locked = true;
      G.results[G.k] = false;
      record(q.t, false);
      app.querySelector(`.opt[data-o="${q.t}"]`).classList.add('reveal');
      fb.className = 'fb oops'; fb.textContent = `答案是「${q.t}」喔`;
      lockAll(); revealWord(q);
      showNext();
    } else {
      fb.className = 'fb oops'; fb.textContent = '再聽聽看～';
      await sleep(350);
      await promptSound(q);
    }
  }
}
function revealWord(q) { if (q.type === 'B') $('#qword').outerHTML = ruby(q.w, q.t); }
function lockAll() { app.querySelectorAll('.opt').forEach(b => { if (!b.classList.contains('right') && !b.classList.contains('reveal')) b.disabled = true; }); }
function showNext() {
  const last = G.k + 1 >= G.qs.length;
  $('#next').innerHTML = `<button class="btn primary big" data-act="next">${last ? '看看拿了幾顆星 ⭐' : '下一題 →'}</button>`;
}

function renderDone() {
  G.over = true;
  const stars = G.results.filter(Boolean).length;
  const msg = stars === ROUND ? '全部答對！' : stars >= 3 ? '很棒喔！' : '多聽幾次就會了！';
  app.innerHTML = `
    <div class="done">
      <h2>${msg}</h2>
      <div class="stars" aria-label="${stars} 顆星">${G.results.map((r, i) => `<span class="${r ? 'on' : 'off'}" style="animation-delay:${i * 0.15}s">★</span>`).join('')}</div>
      <div class="recap">${G.qs.map((q, i) => `<span class="g-${SYM[q.t].g} ${G.results[i] ? 'ok' : 'no'}">${q.t}</span>`).join('')}</div>
      <div class="btn-row">
        <button class="btn primary big" data-act="again">再玩一次</button>
        <a class="btn big" href="#/${G.cfg.focus ? 'sym/' + G.cfg.focus : 'learn'}">看圖卡</a>
        <a class="btn big" href="#/">回首頁</a>
      </div>
    </div>`;
  ACT.again = () => startRound(G.cfg);
  if (stars >= 3) setTimeout(() => tone([523, 659, 784, 1047], 0.16), 200);
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
      <p class="note">注音符號目前用代表字朗讀（例如 ㄅ 念「玻」），之後會換成真人錄音。</p>
    </div>
    <div class="panel">
      <h3>練習紀錄</h3>
      <p class="note">已學會 ${Z.symbols.filter(x => level(x.s) === 3).length} 個。答錯最多：${
        Z.symbols.filter(x => stat(x.s).bad > 0).sort((a, b) => stat(b.s).bad - stat(a.s).bad).slice(0, 6).map(x => `${x.s}（${stat(x.s).bad}）`).join('、') || '還沒有'}</p>
      <div class="btn-row"><button class="btn" data-act="reset">清除紀錄</button></div>
    </div>`;
  $('#voice').onchange = e => { S.settings.voice = e.target.value; save(); };
  $('#rate').oninput = e => { S.settings.rate = +e.target.value; $('#rateV').textContent = S.settings.rate.toFixed(1); save(); };
  ACT.test = () => speak('玻。爸爸，杯子，包子。');
  ACT.reset = () => { if (confirm('確定要清除所有練習紀錄嗎？')) { S.stats = {}; save(); settings(); } };
}

/* ============ boot ============ */
(async () => {
  try {
    Z = await (await fetch('data/zhuyin.json')).json();
  } catch {
    app.innerHTML = '<p class="loading">資料載入失敗。請用網頁伺服器開啟（例如 <code>py -m http.server</code>），不要直接雙擊 index.html。</p>';
    return;
  }
  for (const x of Z.symbols) SYM[x.s] = x;
  route();
})();
