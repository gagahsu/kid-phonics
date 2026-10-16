import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Background, C, Caption, Cta, Fade, KAI, Phone, Ripple, TopFade, cam, ease, s2f, screen, useFont } from './Reel';

// second reel: the features the first one skips (教胖胖, 抓錯, 錄音跟讀, 泡泡／翻牌／大對決, 蓋章月曆, 開口標示, 獎狀).
// narration public/audio/r2/vo1-8 (gemini-3.8-flash-lite-tts, Veda, scripts/promo2_tts.py); vo9 = the first reel's
// end line (in this take 樂 came out yuè). 胖胖's lines are the app's own recordings (assets/audio/zh/pang/).
const HOOK = 5.5;                                   // 嗨！我是胖胖。(1.66 s) + 我還不太會注音…(3.41 s)
const ASK_AT = 1.95;
const CAUGHT_AT = 4.15, CAUGHT_LEN = 2.2;           // 被你抓到了！ after vo3
const VO_LEN = [5.63, 4.77, 4.2, 3.45, 3.73, 4.24, 2.78, 3.31, 3.2];
const SCENES = [HOOK, ...VO_LEN.map((d, i) => 0.05 + (i === 2 ? CAUGHT_AT + CAUGHT_LEN : d) + (i < 8 ? 0.08 : 0.5))];
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, b) => a + b, 0));
export const TOTAL2 = s2f(SCENES.reduce((a, b) => a + b, 0));
const GLYPHS = '嗨我是胖胖還不太會注音你可以陪練習嗎孩子當小老師一起學看大聲念給聽開口說抓錯遊戲了錄跟讀自己的聲比示範泡翻牌配對闖關決每天蓋章月曆休息幾也歸零出門在外選用要場合印獎狀整組發樂園打瀏覽器就能玩畫面為資料・';

const PW = 640, PL = (1080 - PW) / 2, PT = 560;
const Demo = () => <div style={{ position: 'absolute', bottom: 40, right: 44, fontFamily: KAI, fontSize: 30, color: C.soft, background: 'rgba(255,255,255,.85)', padding: '6px 18px', borderRadius: 999, zIndex: 11 }}>畫面為示範資料</div>;
const Pop: React.FC<{ at: number; v?: number }> = ({ at, v = 0.3 }) => <Sequence from={at}><Audio src={staticFile('audio/pop.mp3')} volume={v} /></Sequence>;

// a phone that zooms from whole-screen to a point (fx, fy) of the screenshot
const Zoom: React.FC<{ src: string; fx: number; fy: number; s: number; ty?: number; from?: number; to?: number; children?: React.ReactNode }> =
  ({ src, fx, fy, s, ty = 1180, from = 8, to = 40, children }) => {
    const f = useCurrentFrame();
    const k = ease(f, from, to, 0, 1);
    const st = cam(PL, PT, PW, interpolate(k, [0, 1], [0.5, fx]), interpolate(k, [0, 1], [0.3, fy]), interpolate(k, [0, 1], [1, s]), 540, interpolate(k, [0, 1], [PT + 0.3 * screen(PW).sh, ty]));
    return <AbsoluteFill style={st}><div style={{ position: 'absolute', left: PL, top: PT }}><Phone src={'r2/' + src} width={PW}>{children}</Phone></div></AbsoluteFill>;
  };
// glowing box on the screenshot, in screenshot fractions
const Glow: React.FC<{ x: number; y: number; w: number; h: number; at: number }> = ({ x, y, w, h, at }) => {
  const f = useCurrentFrame(), g = ease(f, at, at + 12, 0, 1), { sw, sh } = screen(PW);
  return <div style={{
    position: 'absolute', left: x * sw, top: y * sh, width: w * sw, height: h * sh, borderRadius: 24, border: `6px solid ${C.yellow}`,
    boxShadow: `0 0 0 ${10 * g}px rgba(255,201,60,.3)`, opacity: g,
  }} />;
};
const Tap: React.FC<{ fx: number; fy: number; at: number }> = ({ fx, fy, at }) => {
  const { sw, sh } = screen(PW);
  return <div style={{ position: 'absolute', left: 0, top: 0 }}><Ripple x={fx * sw} y={fy * sh} at={at} /></div>;
};

// ① 胖胖 introduces itself (its own recordings)
const Hook = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 10 } });
  const hop = Math.abs(Math.sin(f / 5)) * 18 * (f < s2f(1.6) || (f > s2f(ASK_AT) && f < s2f(ASK_AT + 3.3)) ? 1 : 0);
  const line = f < s2f(ASK_AT) ? '嗨！我是胖胖。' : '我還不太會注音，\n你可以陪我練習嗎？';
  const b = spring({ frame: f - (f < s2f(ASK_AT) ? 6 : s2f(ASK_AT)), fps, config: { damping: 12 } });
  const push = ease(f, 0, s2f(HOOK), 1, 1.05, Easing.linear);
  return (
    <AbsoluteFill style={{ transform: `scale(${push})` }}>
      <div style={{
        position: 'absolute', top: 360, left: 90, right: 90, padding: '40px 50px', background: '#fff', borderRadius: 60, textAlign: 'center',
        fontFamily: KAI, fontSize: 78, fontWeight: 700, color: C.ink, whiteSpace: 'pre-line', lineHeight: 1.35,
        boxShadow: '0 14px 0 rgba(31,42,68,.08)', transform: `scale(${b})`,
      }}>{line}</div>
      {/* the app's own SVG 胖胖, exported transparent from the home page */}
      <Img src={staticFile('img/r2/pang.png')} style={{
        position: 'absolute', left: 540 - 280, top: 820 - hop, width: 560, transform: `scale(${sp})`, transformOrigin: '50% 100%',
        filter: 'drop-shadow(0 20px 24px rgba(31,42,68,.15))',
      }} />
      <div style={{ position: 'absolute', top: 1610, left: 0, right: 0, textAlign: 'center', fontFamily: KAI, fontSize: 64, color: C.soft, opacity: ease(f, 20, 34, 0, 1) }}>
        胖 = ㄆ ㄤˋ
      </div>
      <Sequence from={s2f(0.3)}><Audio src={staticFile('audio/r2/pang_hi.mp3')} /></Sequence>
      <Sequence from={s2f(ASK_AT)}><Audio src={staticFile('audio/r2/pang_ask.mp3')} /></Sequence>
    </AbsoluteFill>
  );
};

// ② 孩子當小老師: the home page, 胖胖 greeting
const Teacher = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 16, mass: 1.1 } });
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: PL, top: PT, transform: `translateY(${interpolate(sp, [0, 1], [900, 0])}px)` }}><Phone src="home.png" width={PW} /></div>
      <TopFade />
      <Caption at={4} title="孩子當小老師" sub="陪胖胖一起學注音" />
    </AbsoluteFill>
  );
};

// ③ 教胖胖: read the zhuyin aloud, press 我念好了
const Teach = () => (
  <AbsoluteFill>
    <Zoom src="teach.png" fx={0.5} fy={0.33} s={1.35} ty={1200}>
      <Tap fx={0.67} fy={0.454} at={s2f(3.2)} />
    </Zoom>
    <TopFade />
    <Caption at={4} title="教胖胖" sub="看注音，大聲念給牠聽" />
    <Pop at={s2f(3.2)} />
  </AbsoluteFill>
);

// ④ 抓錯遊戲: 胖胖 says it wrong, the child taps ✕
const Catch = () => (
  <AbsoluteFill>
    <Zoom src="catch.png" fx={0.5} fy={0.4} s={1.3} ty={1240}>
      <Glow x={0.555} y={0.455} w={0.27} h={0.14} at={s2f(2.6)} />
      <Tap fx={0.687} fy={0.52} at={s2f(CAUGHT_AT - 0.2)} />
    </Zoom>
    <TopFade />
    <Caption at={4} title="抓錯遊戲" sub="胖胖念錯了，換你抓！" />
    <Pop at={s2f(CAUGHT_AT - 0.2)} />
    <Sequence from={s2f(0.05 + CAUGHT_AT)}><Audio src={staticFile('audio/r2/pang_caught_short.mp3')} /></Sequence>
  </AbsoluteFill>
);

// ⑤ 錄音跟讀: 🎤 我也說說看 on the symbol page
const Record = () => (
  <AbsoluteFill>
    <Zoom src="sym.png" fx={0.6} fy={0.3} s={1.4} ty={1150} from={6} to={34}>
      <Glow x={0.52} y={0.255} w={0.33} h={0.05} at={s2f(1)} />
      <Tap fx={0.683} fy={0.28} at={s2f(1.4)} />
    </Zoom>
    <TopFade />
    <Caption at={4} title="錄音跟讀" sub="錄下自己的聲音，跟示範比一比" />
    <Pop at={s2f(1.4)} />
  </AbsoluteFill>
);

// ⑥ more games: 泡泡 → 翻牌配對 → 闖關大對決 (switched near each name in vo5)
const GAMES: [string, string][] = [['bubbles.png', '戳泡泡'], ['memory.png', '翻牌配對'], ['boss_1.png', '闖關大對決']];
const Games = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const W = 560, gap = 620, at = [0, s2f(0.95), s2f(2.15)];
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
        }}><Phone src={'r2/' + src} width={W} /></div>;
      })}
      <TopFade />
      <Caption at={4} title="還有更多遊戲" />
      <div style={{ position: 'absolute', top: 330, left: 0, right: 0, textAlign: 'center', zIndex: 11 }}>
        <span style={{
          display: 'inline-block', padding: '14px 44px', borderRadius: 999, background: C.ink, color: '#fff',
          fontFamily: KAI, fontSize: 56, fontWeight: 700, transform: `scale(${0.6 + 0.4 * chip})`,
        }}>{GAMES[cur][1]}</span>
      </div>
      {[1, 2].map(i => <Pop key={i} at={at[i]} />)}
    </AbsoluteFill>
  );
};

// ⑦ 蓋章月曆 (home page, lower half)
const Stamps = () => (
  <AbsoluteFill>
    <Zoom src="cal.png" fx={0.5} fy={0.7} s={1.3} ty={1250}>
      <Glow x={0.03} y={0.56} w={0.94} h={0.3} at={s2f(1.3)} />
    </Zoom>
    <TopFade />
    <Caption at={4} title="每天蓋一個章" sub="休息幾天，也不會歸零" />
    <Demo />
    <Pop at={s2f(1.3)} />
  </AbsoluteFill>
);

// ⑧ 開口標示 (same screenshot, the tags on the game cards)
const Tags = () => (
  <AbsoluteFill>
    <Zoom src="cal.png" fx={0.62} fy={0.3} s={1.35} ty={1150} from={2} to={26}>
      <Glow x={0.7} y={0.135} w={0.24} h={0.04} at={s2f(0.9)} />
      <Glow x={0.7} y={0.28} w={0.24} h={0.04} at={s2f(1.1)} />
    </Zoom>
    <TopFade />
    <Caption at={4} title="不用開口也能玩" sub="捷運上、睡前都適合" />
    <Pop at={s2f(0.9)} />
  </AbsoluteFill>
);

// ⑨ 獎狀
const Award = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const sp = spring({ frame: f - 20, fps, config: { damping: 9 } });
  return (
    <AbsoluteFill>
      <Zoom src="award.png" fx={0.5} fy={0.26} s={1.45} ty={1150} from={4} to={30} />
      <div style={{ position: 'absolute', right: 120, top: 1500, fontSize: 200, transform: `scale(${sp}) rotate(-12deg)`, zIndex: 6 }}>🏅</div>
      <TopFade />
      <Caption at={4} title="可以印獎狀" sub="學會一整組注音" />
      <Demo />
      <Pop at={20} v={0.35} />
    </AbsoluteFill>
  );
};

export const Reel2: React.FC<{ url: string }> = ({ url }) => {
  useFont(GLYPHS);
  const scenes = [<Hook />, <Teacher />, <Teach />, <Catch />, <Record />, <Games />, <Stamps />, <Tags />, <Award />, <Cta url={url} />];
  const last = scenes.length - 1, end = TOTAL2;
  return (
    <AbsoluteFill style={{ fontFamily: KAI }}>
      <Background />
      {/* same music as the first reel (scripts/bgm.py): faint under 胖胖, up when the narration starts */}
      <Audio src={staticFile('audio/bgm.mp3')} volume={f => interpolate(f,
        [0, 10, s2f(STARTS[1]) - 5, s2f(STARTS[1]) + 5, end - 45, end],
        [0, 0.08, 0.08, 0.22, 0.22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      {scenes.map((el, i) => (
        <Sequence key={i} from={s2f(STARTS[i])} durationInFrames={s2f(SCENES[i]) + (i < last ? 8 : 0)}>
          <Fade>{el}</Fade>
          {i > 0 && <Sequence from={s2f(0.05)}><Audio src={staticFile(`audio/r2/vo${i}.mp3`)} /></Sequence>}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
