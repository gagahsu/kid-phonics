// node tools/test_syllable.mjs — checks parseSyl() on hand-picked cases and every word in zhuyin.json
import { readFileSync } from 'node:fs';
import { parseSyl } from '../syllable.js';

const cases = [
  ['ㄇㄠ', { i: 'ㄇ', m: '', f: 'ㄠ', t: 1 }],
  ['ㄋㄧㄡˊ', { i: 'ㄋ', m: 'ㄧ', f: 'ㄡ', t: 2 }],
  ['ㄅㄧˇ', { i: 'ㄅ', m: 'ㄧ', f: '', t: 3 }],
  ['ㄉㄢˋ', { i: 'ㄉ', m: '', f: 'ㄢ', t: 4 }],
  ['˙ㄅㄚ', { i: 'ㄅ', m: '', f: 'ㄚ', t: 5 }],
  ['ㄔˇ', { i: 'ㄔ', m: '', f: '', t: 3 }],          // 尺: 聲母 only
  ['ㄩˊ', { i: '', m: 'ㄩ', f: '', t: 2 }],          // 魚: 介音 only
  ['ㄜˊ', { i: '', m: '', f: 'ㄜ', t: 2 }],          // 鵝: 韻母 only
  ['ㄨㄢˇ', { i: '', m: 'ㄨ', f: 'ㄢ', t: 3 }],
  ['ㄒㄩㄥˊ', { i: 'ㄒ', m: 'ㄩ', f: 'ㄥ', t: 2 }],
  ['ㄦˇ', { i: '', m: '', f: 'ㄦ', t: 3 }],
  ['', null], ['ˊ', null], ['˙', null], ['ㄠㄇ', null], ['ㄧㄨ', null], ['ㄅㄆ', null], ['ma', null], ['ㄇㄠˊˇ', null],
];
let bad = 0;
for (const [zy, want] of cases) {
  const got = parseSyl(zy);
  if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log('FAIL', JSON.stringify(zy), got, '!=', want); }
}
const Z = JSON.parse(readFileSync(new URL('../data/zhuyin.json', import.meta.url), 'utf8'));
let n = 0;
for (const [w, { zy }] of Object.entries(Z.words)) {
  const syl = zy.split(' ');
  if (syl.length !== [...w].length) { bad++; console.log('FAIL', w, zy, ': syllable count != characters'); }
  for (const s of syl) { n++; if (!parseSyl(s)) { bad++; console.log('FAIL', w, s); } }
}
console.log(`${cases.length} cases, ${n} syllables in zhuyin.json: ${bad ? bad + ' failed' : 'all ok'}`);
process.exit(bad ? 1 : 0);
