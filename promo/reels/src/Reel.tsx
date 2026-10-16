import React, { useState } from 'react';
import {
  AbsoluteFill, Audio, Img, Sequence, continueRender, delayRender, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';

// site palette (style.css :root)
export const C = {
  bg: '#FFF6E5', ink: '#1F2A44', soft: '#5B6680', red: '#FF5A5F', yellow: '#FFC93C',
  green: '#3BC47A', blue: '#3FA9F5', orange: '#FF9A3C', pinkBlob: '#FFDDE3', blueBlob: '#D8EEFD', yellowBlob: '#FFE6B0',
};
export const KAI = '"LXGW WenKai TC", "Microsoft JhengHei", serif';
export const FPS = 30;
export const s2f = (s: number) => Math.round(s * FPS);

// narration clips public/audio/vo*.mp3 (gemini-3.8-flash-lite-tts, multi-speaker: the parent's two lines vo1 + vo1b Rami,
// the rest Veda; scripts/promo_tts.py): length (s) and start inside each scene;
// each scene lasts as long as its line (scene 1 first plays the ㄅ / ㄆ recordings, then vo1, then vo1b)
const PARENT2_AT = 1.7 + 2.8;
const VO_LEN = [2.8 + 3.4, 5.05, 6.3, 4.25, 3.2, 3.95, 3.2];
const VO_AT = [1.7, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];
const SCENES = VO_LEN.map((d, i) => VO_AT[i] + d + (i < 6 ? 0.12 : 0.5));
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, b) => a + b, 0));
export const TOTAL = s2f(SCENES.reduce((a, b) => a + b, 0));

// screenshots are 1290 x 2796 (430 x 932 @3x)
const SHOT_RATIO = 2796 / 1290;

export const useFont = (text = '發音樂園孩子還不識字注音怎麼教？給歲孩子的練習個真人發用玩一輪題紀錄建議多每天分鐘了才拿貼紙打開瀏覽器就能今來') => {
  const [handle] = useState(() => delayRender('font'));
  React.useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400;700&display=block';
    document.head.appendChild(link);
    link.onload = () => document.fonts.load(`700 80px "LXGW WenKai TC"`, text)
      .then(() => document.fonts.ready).then(() => continueRender(handle));
    link.onerror = () => continueRender(handle);
  }, [handle, text]);
};

export const ease = (f: number, from: number, to: number, a: number, b: number, e = Easing.bezier(0.33, 1, 0.68, 1)) =>
  interpolate(f, [from, to], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e });

// soft blobs like the site background, drifting a little for parallax
export const Background: React.FC = () => {
  const f = useCurrentFrame();
  const blob = (color: string, x: number, y: number, r: number, k: number) => (
    <div style={{
      position: 'absolute', left: x + Math.sin(f / 70 + k) * 24, top: y + Math.cos(f / 85 + k) * 30,
      width: r, height: r, borderRadius: '50%', background: color,
    }} />
  );
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      {blob(C.yellowBlob, -140, 60, 420, 0)}
      {blob(C.blueBlob, 820, 520, 360, 2)}
      {blob(C.pinkBlob, 700, 1560, 520, 4)}
      {blob(C.yellowBlob, -120, 1380, 260, 1)}
    </AbsoluteFill>
  );
};

// phone frame around a real screenshot
export const Phone: React.FC<{ src: string; width: number; children?: React.ReactNode }> = ({ src, width, children }) => {
  const bezel = width * 0.03, sw = width - bezel * 2, sh = sw * SHOT_RATIO;
  return (
    <div style={{
      width, height: sh + bezel * 2, padding: bezel, boxSizing: 'border-box', background: '#141a2b',
      borderRadius: width * 0.13, boxShadow: '0 40px 90px rgba(31,42,68,.28), 0 8px 20px rgba(31,42,68,.18)',
    }}>
      <div style={{ position: 'relative', width: sw, height: sh, borderRadius: width * 0.105, overflow: 'hidden', background: C.bg }}>
        <Img src={staticFile('img/' + src)} style={{ width: sw, height: sh, display: 'block' }} />
        {children}
      </div>
    </div>
  );
};
export const screen = (width: number) => { const b = width * 0.03, sw = width - b * 2; return { b, sw, sh: sw * SHOT_RATIO }; };

// headline + sub, revealed with a rising mask
export const Caption: React.FC<{ title: React.ReactNode; sub?: string; at?: number; top?: number }> = ({ title, sub, at = 0, top = 150 }) => {
  const f = useCurrentFrame();
  const t = ease(f, at, at + 14, 100, 0), s = ease(f, at + 6, at + 20, 100, 0);
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', fontFamily: KAI, color: C.ink, zIndex: 10 }}>
      <div style={{ overflow: 'hidden', paddingBottom: 8 }}>
        <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: 6, transform: `translateY(${t}%)`, lineHeight: 1.2 }}>{title}</div>
      </div>
      {sub && <div style={{ overflow: 'hidden', marginTop: 10 }}>
        <div style={{ fontSize: 60, color: C.soft, transform: `translateY(${s}%)`, letterSpacing: 2 }}>{sub}</div>
      </div>}
    </div>
  );
};
export const TopFade = () => <div style={{
  position: 'absolute', top: 0, left: 0, right: 0, height: 600, zIndex: 5,
  background: `linear-gradient(${C.bg} 70%, rgba(255,246,229,0))`,
}} />;

// camera: move screen point (fx, fy) of a phone placed at (left, top) to target (tx, ty), zoomed by s
export const cam = (left: number, top: number, width: number, fx: number, fy: number, s: number, tx: number, ty: number) => {
  const { b, sw, sh } = screen(width);
  const px = left + b + fx * sw, py = top + b + fy * sh;
  return { transform: `translate(${tx - px * s}px, ${ty - py * s}px) scale(${s})`, transformOrigin: '0 0' };
};

export const Ripple: React.FC<{ x: number; y: number; at: number; color?: string }> = ({ x, y, at, color = C.yellow }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const p = ease(f, at, at + 18, 0, 1);
  return <div style={{
    position: 'absolute', left: x, top: y, width: 140, height: 140, marginLeft: -70, marginTop: -70, borderRadius: '50%',
    border: `10px solid ${color}`, transform: `scale(${0.3 + p})`, opacity: 1 - p,
  }} />;
};

export const Cursor: React.FC<{ path: [number, number, number][] }> = ({ path }) => {
  // path: [frame, x, y]
  const f = useCurrentFrame();
  const fs = path.map(p => p[0]);
  const x = interpolate(f, fs, path.map(p => p[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const y = interpolate(f, fs, path.map(p => p[2]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const press = path.some(p => f >= p[0] && f < p[0] + 6 && p === path[path.length - 1]) ? 0.85 : 1;
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" style={{ position: 'absolute', left: x - 6, top: y - 4, zIndex: 20, transform: `scale(${press})`, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.3))' }}>
      <path d="M4 2l16 9.5-7 1.6 4 7.4-3 1.5-4-7.5L4 19z" fill="#fff" stroke={C.ink} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

// ① Hook: ㄅ / ㄆ sound alike
const Hook = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const card = (src: string, at: number, x: number) => {
    const sp = spring({ frame: f - at, fps, config: { damping: 11 } });
    const wob = f > 50 ? Math.sin((f - 50) / 2.2) * ease(f, 50, 60, 0, 1) * ease(f, 70, 95, 1, 0) * 4 : 0;
    return <Img src={staticFile('img/' + src)} style={{
      position: 'absolute', left: x, top: 760, width: 420, transform: `scale(${sp}) rotate(${wob}deg)`,
      filter: 'drop-shadow(0 18px 30px rgba(31,42,68,.15))',
    }} />;
  };
  const q = spring({ frame: f - 48, fps, config: { damping: 9 } });
  const push = ease(f, 0, s2f(SCENES[0]), 1, 1.06, Easing.linear);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {card('card_bo.png', 6, 90)}
        {card('card_po.png', 27, 570)}
        <Ripple x={300} y={950} at={6} />
        <Ripple x={780} y={950} at={27} />
        <div style={{ position: 'absolute', top: 1190, left: 0, right: 0, textAlign: 'center', fontSize: 260, fontWeight: 700, color: C.orange, fontFamily: KAI, transform: `scale(${q})` }}>？</div>
      </AbsoluteFill>
      <Caption title={<>ㄅ？ㄆ？</>} at={10} top={300} />
      <Sequence from={s2f(PARENT2_AT)}><Caption title="" sub="孩子還不識字，注音怎麼教？" top={480} /></Sequence>
      <Sequence from={s2f(PARENT2_AT)}><Audio src={staticFile('audio/vo1b.mp3')} /></Sequence>
      <Sequence from={6}><Audio src={staticFile('audio/bo.mp3')} /></Sequence>
      <Sequence from={27}><Audio src={staticFile('audio/po.mp3')} /></Sequence>
    </AbsoluteFill>
  );
};

const PW = 640, PL = (1080 - PW) / 2, PT = 560;   // default phone placement

// ② Reveal: home page
const Reveal = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 16, mass: 1.1 } });
  const y = interpolate(sp, [0, 1], [900, 0]), rot = interpolate(sp, [0, 1], [24, 0]);
  const colors = [C.red, C.orange, C.green, C.blue];
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: PL, top: PT, perspective: 1600 }}>
        <div style={{ transform: `translateY(${y}px) rotateX(${rot}deg)` }}><Phone src="home.png" width={PW} /></div>
      </div>
      <TopFade />
      <Caption at={8} title={<>{[...'發音樂園'].map((c, i) => <span key={i} style={{ color: colors[i] }}>{c}</span>)}</>} sub="給 5–7 歲孩子的注音練習" />
    </AbsoluteFill>
  );
};

// ③ 認識符號: tap the speaker, hear ㄅ, look at the word cards
const Learn = () => {
  const f = useCurrentFrame();
  const W = PW, L = PL, T = PT;
  // speaker icon on the ㄅ card ≈ (0.641, 0.222) of the screenshot; word cards ≈ y 0.55
  const tap = 30;
  const s = ease(f, 0, 24, 1, 1.35) + ease(f, 55, 90, 0, -0.15);
  const fy = ease(f, 55, 90, 0.2, 0.52), ty = ease(f, 55, 90, 900, 1240);
  const st = cam(L, T, W, 0.5, fy, s, 540, ty);
  const { b, sw, sh } = screen(W);
  const ix = L + b + 0.641 * sw, iy = T + b + 0.222 * sh;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={st}>
        <div style={{ position: 'absolute', left: L, top: T }}><Phone src="sym.png" width={W} /></div>
        <Ripple x={ix} y={iy} at={tap} />
        <Cursor path={[[0, ix + 260, iy + 380], [tap - 4, ix, iy], [tap, ix, iy], [45, ix, iy], [65, ix + 300, iy + 700]]} />
      </AbsoluteFill>
      <TopFade />
      <Caption at={4} title="37 個注音" sub="看圖卡 · 聽真人發音" />
      <Sequence from={tap}><Audio src={staticFile('audio/bo.mp3')} /></Sequence>
      <Sequence from={tap}><Audio src={staticFile('audio/pop.mp3')} volume={0.35} /></Sequence>
    </AbsoluteFill>
  );
};

// ④ 遊戲: three game screens in a carousel
const GAMES: [string, string][] = [['practice.png', '聽音練習'], ['sort.png', '分類籃'], ['spell.png', '拼拼看']];
const Games = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  // switch just before each name is spoken in vo4 (分類 starts at 0.84 s, 拼拼看 at 1.59 s)
  const W = 560, gap = 620, at = [0, ...[0.84, 1.59].map(t => s2f(VO_AT[3] + t - 0.15))];
  const pos = GAMES.reduce((p, _, i) => i === 0 ? p : p + spring({ frame: f - at[i], fps, config: { damping: 18 } }), 0);
  const cur = Math.min(GAMES.length - 1, Math.round(pos));
  const chip = spring({ frame: f - at[cur], fps, config: { damping: 12 } });
  return (
    <AbsoluteFill>
      {GAMES.map(([src], i) => {
        const d = i - pos, sc = interpolate(Math.abs(d), [0, 1], [1, 0.78], { extrapolateRight: 'clamp' });
        return <div key={src} style={{
          position: 'absolute', left: 540 - W / 2 + d * gap, top: 640, transform: `scale(${sc})`, transformOrigin: '50% 30%',
          opacity: interpolate(Math.abs(d), [0, 1], [1, 0.55], { extrapolateRight: 'clamp' }), zIndex: 3 - Math.round(Math.abs(d)),
        }}><Phone src={src} width={W} /></div>;
      })}
      <TopFade />
      <Caption at={4} title="用玩的練習" sub="一輪 5 題" />
      <div style={{ position: 'absolute', top: 470, left: 0, right: 0, textAlign: 'center', zIndex: 11 }}>
        <span style={{
          display: 'inline-block', padding: '14px 44px', borderRadius: 999, background: C.ink, color: '#fff',
          fontFamily: KAI, fontSize: 52, fontWeight: 700, transform: `scale(${0.6 + 0.4 * chip})`,
        }}>{GAMES[cur][1]}</span>
      </div>
      {[1, 2].map(i => <Sequence key={i} from={at[i]}><Audio src={staticFile('audio/pop.mp3')} volume={0.3} /></Sequence>)}
    </AbsoluteFill>
  );
};

// ⑤ 家長頁: zoom into 建議多練 (≈ y 0.71–0.92 of the screenshot)
const Parents = () => {
  const f = useCurrentFrame();
  const s = ease(f, 10, 50, 1, 1.25), fy = ease(f, 10, 50, 0.3, 0.74), ty = ease(f, 10, 50, 1050, 1380);
  const { b, sw, sh } = screen(PW);
  const glow = ease(f, 52, 66, 0, 1);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={cam(PL, PT, PW, 0.5, fy, s, 540, ty)}>
        <div style={{ position: 'absolute', left: PL, top: PT }}><Phone src="settings.png" width={PW}>
          <div style={{
            position: 'absolute', left: 0.03 * sw, top: 0.705 * sh, width: 0.94 * sw, height: 0.215 * sh, borderRadius: 30,
            border: `6px solid ${C.yellow}`, boxShadow: `0 0 0 ${12 * glow}px rgba(255,201,60,.3)`, opacity: glow,
          }} />
        </Phone></div>
      </AbsoluteFill>
      <TopFade />
      <Caption at={4} title="練習紀錄" sub="家長知道哪裡要多練" />
      <div style={{ position: 'absolute', bottom: 40, right: 44, fontFamily: KAI, fontSize: 30, color: C.soft, background: 'rgba(255,255,255,.85)', padding: '6px 18px', borderRadius: 999, zIndex: 11 }}>畫面為示範資料</div>
      <Sequence from={52}><Audio src={staticFile('audio/pop.mp3')} volume={0.3} /></Sequence>
    </AbsoluteFill>
  );
};

// ⑥ Value: stickers pop out of the sticker book
const STK: [string, number, number, number][] = [['st_crab.png', 40, 760, -12], ['st_cat.png', 760, 820, 10], ['st_tiger.png', 30, 1420, 8], ['st_dragon.png', 770, 1460, -9]];
const Value = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const s = ease(f, 0, s2f(4), 1, 0.9, Easing.linear);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: PL, top: PT + 40, transform: `scale(${s})`, transformOrigin: '50% 20%' }}><Phone src="stickers.png" width={PW} /></div>
      {STK.map(([src, x, y, r], i) => {
        const sp = spring({ frame: f - 14 - i * 9, fps, config: { damping: 9 } });
        return <Img key={src} src={staticFile('img/' + src)} style={{
          position: 'absolute', left: x, top: y + Math.sin((f + i * 20) / 18) * 8, width: 280, height: 280, borderRadius: 48,
          background: '#FFFDF8', transform: `scale(${sp}) rotate(${r}deg)`, zIndex: 6,
          boxShadow: '0 16px 30px rgba(31,42,68,.18)', border: '8px solid #fff',
        }} />;
      })}
      <TopFade />
      <Caption at={4} title="每天 5 分鐘" sub="學會了，才拿貼紙" />
      {STK.map((_, i) => <Sequence key={i} from={14 + i * 9}><Audio src={staticFile('audio/pop.mp3')} volume={0.25} /></Sequence>)}
    </AbsoluteFill>
  );
};

// ⑦ CTA
export const Cta: React.FC<{ url: string }> = ({ url }) => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 10 } });
  const cat = spring({ frame: f - 8, fps, config: { damping: 12 } });
  const pill = ease(f, 18, 32, 0, 1);
  const colors = [C.red, C.orange, C.green, C.blue];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: KAI }}>
      <Img src={staticFile('img/r2/pang.png')} style={{ width: 230, transform: `translateY(${(1 - cat) * 200}px)`, opacity: cat, marginBottom: 20 }} />
      <div style={{ fontSize: 170, fontWeight: 700, letterSpacing: 10, transform: `scale(${0.9 + 0.1 * sp})`, opacity: Math.min(1, sp * 1.5) }}>
        {[...'發音樂園'].map((c, i) => <span key={i} style={{ color: colors[i] }}>{c}</span>)}
      </div>
      <div style={{ marginTop: 30, opacity: pill, transform: `translateY(${(1 - pill) * 30}px)`, textAlign: 'center' }}>
        {/* QR of the site with 胖胖＆菲菲 (scripts/qr.mjs) */}
        {url && <Img src={staticFile('img/qr-cats.png')} style={{ width: 420, height: 420, borderRadius: 36, display: 'block', margin: '0 auto 26px', boxShadow: '0 8px 0 rgba(31,42,68,.12)' }} />}
        {url && <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 46, color: C.ink, background: '#fff', padding: '18px 48px', borderRadius: 999, boxShadow: '0 6px 0 rgba(31,42,68,.12)', marginBottom: 34 }}>{url}</div>}
        <div style={{ display: 'inline-block', fontSize: 64, fontWeight: 700, color: C.ink, background: C.yellow, padding: '22px 64px', borderRadius: 999, boxShadow: '0 8px 0 #E0A100' }}>打開瀏覽器就能玩 →</div>
      </div>
      <Audio src={staticFile('audio/chime.mp3')} volume={0.5} />
    </AbsoluteFill>
  );
};

// cross-fade into each scene so cuts land softly on the beat
export const Fade: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: ease(f, 0, 8, 0, 1) }}>{children}</AbsoluteFill>;
};

export const Reel: React.FC<{ url: string }> = ({ url }) => {
  useFont();
  const scenes = [<Hook />, <Reveal />, <Learn />, <Games />, <Parents />, <Value />, <Cta url={url} />];
  return (
    <AbsoluteFill style={{ fontFamily: KAI }}>
      <Background />
      {/* music (scripts/bgm.py): faint under the ㄅ / ㄆ question, up with the brand reveal (where its melody enters) */}
      <Audio src={staticFile('audio/bgm.mp3')} volume={f => interpolate(f,
        [0, 10, s2f(STARTS[1]) - 5, s2f(STARTS[1]) + 5, TOTAL - 45, TOTAL],
        [0, 0.08, 0.08, 0.22, 0.22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      {scenes.map((el, i) => (
        <Sequence key={i} from={s2f(STARTS[i])} durationInFrames={s2f(SCENES[i]) + (i < 6 ? 8 : 0)}>
          <Fade>{el}</Fade>
          <Sequence from={s2f(VO_AT[i])}><Audio src={staticFile(`audio/vo${i + 1}.mp3`)} /></Sequence>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
