import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Background, C, Caption, Cta, Fade, KAI, Phone, Ripple, TopFade, cam, ease, s2f, screen, useFont } from './Reel';

// third reel: what the first two skip (題目都念出來, 餵胖胖, 胖胖變圓, 我的聲音, 休息提醒, 不用註冊／沒有廣告).
// narration public/audio/r3/vo1-6 (gemini-3.8-flash-lite-tts, Veda, scripts/promo3_tts.py); vo7 = the first reel's end line.
// 菲菲 / 胖胖 lines are the app's own recordings (assets/audio/zh/fei, pang, pang-word).
const FIND = 1.68, VO1_AT = 2.2;                    // 菲菲「聽聲音，找到它！」then vo1
const FEED_AT = 2.85;                                // 胖胖「貓！」「我們一起玩！」after vo2
const SLEEP_AT = 3.9, SLEEP = 3.03;                  // 菲菲「菲菲想睡覺了…」after vo5
const VO = [3.88, 2.75, 3.4, 4.07, 3.74, 3.81, 3.2];
const SCENES = [VO1_AT + VO[0] + 0.1, FEED_AT + 1.55 + 0.1, VO[2] + 0.15, VO[3] + 0.15, SLEEP_AT + SLEEP + 0.1, VO[5] + 0.2, VO[6] + 0.55];
const VO_AT = [VO1_AT, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, b) => a + b, 0));
export const TOTAL3 = s2f(SCENES.reduce((a, b) => a + b, 0));
const GLYPHS = '還不識字題目都會念出來聽聲音找到它餵胖胖貼紙送給變圓學個我的錄只存在這台裝置提醒休息想睡覺了明天再玩吧用註冊沒有廣告紀錄自己安心孩子發樂園打開瀏覽器就能畫面為示範資料–';

const PW = 640, PL = (1080 - PW) / 2, PT = 560;
const Pop: React.FC<{ at: number; v?: number }> = ({ at, v = 0.3 }) => <Sequence from={at}><Audio src={staticFile('audio/pop.mp3')} volume={v} /></Sequence>;
const Demo = () => <div style={{ position: 'absolute', bottom: 40, right: 44, fontFamily: KAI, fontSize: 30, color: C.soft, background: 'rgba(255,255,255,.85)', padding: '6px 18px', borderRadius: 999, zIndex: 11 }}>畫面為示範資料</div>;
const Zoom: React.FC<{ src: string; fx: number; fy: number; s: number; ty?: number; from?: number; to?: number; children?: React.ReactNode }> =
  ({ src, fx, fy, s, ty = 1180, from = 8, to = 40, children }) => {
    const f = useCurrentFrame();
    const k = ease(f, from, to, 0, 1);
    const st = cam(PL, PT, PW, interpolate(k, [0, 1], [0.5, fx]), interpolate(k, [0, 1], [0.3, fy]), interpolate(k, [0, 1], [1, s]), 540, interpolate(k, [0, 1], [PT + 0.3 * screen(PW).sh, ty]));
    return <AbsoluteFill style={st}><div style={{ position: 'absolute', left: PL, top: PT }}><Phone src={src} width={PW}>{children}</Phone></div></AbsoluteFill>;
  };

// ① 不識字也能玩: 菲菲 reads the question out
const Read = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const { sw, sh } = screen(PW);
  const wave = (i: number) => {
    const p = ((f + i * 12) % 36) / 36;
    return <div key={i} style={{ position: 'absolute', left: 0.24 * sw, top: 0.13 * sh, width: 120, height: 120, marginLeft: -60, marginTop: -60, borderRadius: '50%', border: `8px solid ${C.yellow}`, transform: `scale(${0.4 + p * 1.4})`, opacity: f < s2f(FIND) + 6 ? 1 - p : 0 }} />;
  };
  return (
    <AbsoluteFill>
      <Zoom src="r3/practice.png" fx={0.5} fy={0.25} s={1.25} ty={1100} from={4} to={30}>{[0, 1, 2].map(wave)}</Zoom>
      <TopFade />
      <Caption at={4} title="還不識字？" />
      <Sequence from={s2f(VO1_AT)}><Caption title="" sub="每一題，菲菲都會念出來" top={300} /></Sequence>
      <Sequence from={s2f(0.25)}><Audio src={staticFile('audio/r3/fei_find.mp3')} /></Sequence>
    </AbsoluteFill>
  );
};

// ② 餵胖胖: tap a sticker, 胖胖 reacts
const Feed = () => {
  const f = useCurrentFrame();
  const { sw, sh } = screen(PW);
  const tap = s2f(FEED_AT - 0.35);
  return (
    <AbsoluteFill>
      <Zoom src={f < tap + 4 ? 'r3/feed0.png' : 'r3/feed2.png'} fx={0.5} fy={0.25} s={1.3} ty={1100} from={4} to={30}>
        <Ripple x={0.52 * sw} y={0.36 * sh} at={tap} />
      </Zoom>
      <TopFade />
      <Caption at={4} title="餵胖胖" sub="把貼紙送給胖胖" />
      <Pop at={tap} />
      <Sequence from={s2f(FEED_AT)}><Audio src={staticFile('audio/r3/pang_cat.mp3')} /></Sequence>
      <Sequence from={s2f(FEED_AT + 0.5)}><Audio src={staticFile('audio/r3/pang_play.mp3')} /></Sequence>
    </AbsoluteFill>
  );
};

// ③ 胖胖 gets rounder: the three body sizes (學會 0–9 / 10–24 / 25–37)
const Grow = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const labels = ['0–9 個', '10–24 個', '25–37 個'];
  return (
    <AbsoluteFill>
      {[0, 1, 2].map(i => {
        const sp = spring({ frame: f - 6 - i * 16, fps, config: { damping: 10 } });
        return <div key={i} style={{ position: 'absolute', left: 30 + i * 345, top: 760, width: 330, textAlign: 'center', transform: `scale(${sp})`, transformOrigin: '50% 100%' }}>
          <Img src={staticFile(`img/r3/pang_stage${i}.png`)} style={{ width: 300 + i * 20, filter: 'drop-shadow(0 16px 18px rgba(31,42,68,.14))' }} />
          <div style={{ fontFamily: KAI, fontSize: 46, color: C.soft, marginTop: 10 }}>學會<br /><b style={{ color: C.ink, fontSize: 54 }}>{labels[i]}</b></div>
        </div>;
      })}
      <div style={{ position: 'absolute', top: 1500, left: 200, right: 200, height: 12, borderRadius: 6, background: C.yellowBlob }}>
        <div style={{ height: 12, borderRadius: 6, background: C.orange, width: `${ease(f, 6, 60, 0, 100)}%` }} />
      </div>
      <Caption at={4} title="胖胖會變圓" sub="學會的注音越多，越圓" />
      {[0, 1, 2].map(i => <Pop key={i} at={6 + i * 16} v={0.25} />)}
    </AbsoluteFill>
  );
};

// ④ 我的聲音
const Voice = () => (
  <AbsoluteFill>
    <Zoom src="r3/myvoice2.png" fx={0.5} fy={0.3} s={1.2} ty={1150} from={4} to={34} />
    <TopFade />
    <Caption at={4} title="我的聲音" sub="念過的錄音，隨時聽" />
    <Demo />
  </AbsoluteFill>
);

// ⑤ 休息提醒: third round today, 菲菲 yawns
const Rest = () => {
  const f = useCurrentFrame();
  const { sw, sh } = screen(PW);
  const g = ease(f, s2f(SLEEP_AT) - 6, s2f(SLEEP_AT) + 6, 0, 1);
  return (
    <AbsoluteFill>
      <Zoom src="r3/rest.png" fx={0.5} fy={0.32} s={1.3} ty={1150} from={4} to={30}>
        <div style={{ position: 'absolute', left: 0.06 * sw, top: 0.39 * sh, width: 0.88 * sw, height: 0.085 * sh, borderRadius: 24, border: `6px solid ${C.yellow}`, boxShadow: `0 0 0 ${10 * g}px rgba(255,201,60,.3)`, opacity: g }} />
      </Zoom>
      <TopFade />
      <Caption at={4} title="玩太久會提醒休息" sub="眼睛和耳朵休息一下" />
      <Sequence from={s2f(SLEEP_AT)}><Audio src={staticFile('audio/r3/fei_sleep.mp3')} /></Sequence>
    </AbsoluteFill>
  );
};

// ⑥ 安心: no sign-up, no ads, records stay on the device
const Safe = () => {
  const f = useCurrentFrame(), { fps } = useVideoConfig();
  const items = ['不用註冊', '沒有廣告', '紀錄只存在自己的裝置'];
  const at = [0.2, 1.05, 1.9].map(s2f);
  return (
    <AbsoluteFill>
      {items.map((t, i) => {
        const sp = spring({ frame: f - at[i], fps, config: { damping: 12 } });
        return <div key={t} style={{
          position: 'absolute', left: 110, right: 110, top: 720 + i * 230, height: 180, borderRadius: 48, background: '#fff', display: 'flex', alignItems: 'center', gap: 34, padding: '0 48px',
          boxShadow: '0 12px 0 rgba(31,42,68,.08)', transform: `translateX(${(1 - sp) * 120}px)`, opacity: Math.min(1, sp * 1.4),
        }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: C.green, color: '#fff', fontSize: 64, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</div>
          <div style={{ fontFamily: KAI, fontSize: i === 2 ? 58 : 70, fontWeight: 700, color: C.ink }}>{t}</div>
        </div>;
      })}
      <Caption at={4} title="安心給孩子用" />
      {at.map((a, i) => <Pop key={i} at={a} v={0.25} />)}
    </AbsoluteFill>
  );
};

export const Reel3: React.FC<{ url: string }> = ({ url }) => {
  useFont(GLYPHS);
  const scenes = [<Read />, <Feed />, <Grow />, <Voice />, <Rest />, <Safe />, <Cta url={url} />];
  const last = scenes.length - 1, end = TOTAL3;
  return (
    <AbsoluteFill style={{ fontFamily: KAI }}>
      <Background />
      {/* same music as the other reels: low under 菲菲's first line, up with the narration */}
      <Audio src={staticFile('audio/bgm.mp3')} volume={f => interpolate(f,
        [0, 10, s2f(VO1_AT) - 5, s2f(VO1_AT) + 5, end - 45, end],
        [0, 0.08, 0.08, 0.22, 0.22, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      {scenes.map((el, i) => (
        <Sequence key={i} from={s2f(STARTS[i])} durationInFrames={s2f(SCENES[i]) + (i < last ? 8 : 0)}>
          <Fade>{el}</Fade>
          <Sequence from={s2f(VO_AT[i])}><Audio src={staticFile(`audio/r3/vo${i + 1}.mp3`)} /></Sequence>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
