// One zhuyin syllable -> {i, m, f, t}: 聲母, 介音, 韻母 ('' when absent) and tone 1–5 (5 = 輕聲).
// Shared by 拼拼看 and near(); data stays as strings in zhuyin.json. Test: node tools/test_syllable.mjs
const I = 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ', M = 'ㄧㄨㄩ', F = 'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ';
const TONE = { 'ˊ': 2, 'ˇ': 3, 'ˋ': 4 };
const SHAPE = new RegExp(`^([${I}]?)([${M}]?)([${F}]?)$`);

export function parseSyl(zy) {
  let s = String(zy).trim(), t = 1;
  if (s[0] === '˙') { t = 5; s = s.slice(1); }
  else if (TONE[s.at(-1)]) { t = TONE[s.at(-1)]; s = s.slice(0, -1); }
  const p = s && SHAPE.exec(s);
  return p ? { i: p[1], m: p[2], f: p[3], t } : null;   // null = not one valid syllable
}
// the symbols in spelling order (no tone): ㄋㄧㄡˊ -> ['ㄋ', 'ㄧ', 'ㄡ']
export const sylParts = p => [p.i, p.m, p.f].filter(Boolean);
export const TONE_MARK = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'];
