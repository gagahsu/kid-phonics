"""Import single-syllable recordings for every syllable used in data/zhuyin.json.

Source: hugolpz/audio-cmn, speaker Chen Wang (README: CC BY-SA)
  https://github.com/hugolpz/audio-cmn  -> 64k/syllabs/cmn-<pinyin><tone>.mp3

Usage:
  py tools/import_syllables.py          (only fetches syllables not yet in assets/)

Writes assets/audio/zh/syl/<code points joined by '-'>.mp3, e.g. ㄅㄚˋ -> 3105-311a-2cb.mp3
(first tone has no mark: ㄅㄚ -> 3105-311a.mp3). Light-tone (˙) syllables are skipped; the site
uses device TTS for them. Same treatment as the symbol clips: trim silence, loudness-normalise,
mono 64 kbps. Needs ffmpeg on PATH.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'zh', 'syl')
URL = 'https://raw.githubusercontent.com/hugolpz/audio-cmn/master/64k/syllabs/cmn-{}.mp3'
TRIM = 'silenceremove=start_periods=1:start_threshold=-40dB'
FILTER = f'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=7,{TRIM},areverse,{TRIM},areverse,adelay=30,apad=pad_dur=0.05'

INIT = dict(zip('ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ',
                'b p m f d t n l g k h j q x zh ch sh r z c s'.split()))
RHYME = {'': 'i', 'ㄚ': 'a', 'ㄛ': 'o', 'ㄜ': 'e', 'ㄝ': 'e', 'ㄞ': 'ai', 'ㄟ': 'ei', 'ㄠ': 'ao', 'ㄡ': 'ou',
         'ㄢ': 'an', 'ㄣ': 'en', 'ㄤ': 'ang', 'ㄥ': 'eng', 'ㄦ': 'er',
         'ㄧ': 'i', 'ㄧㄚ': 'ia', 'ㄧㄛ': 'io', 'ㄧㄝ': 'ie', 'ㄧㄠ': 'iao', 'ㄧㄡ': 'iu',
         'ㄧㄢ': 'ian', 'ㄧㄣ': 'in', 'ㄧㄤ': 'iang', 'ㄧㄥ': 'ing',
         'ㄨ': 'u', 'ㄨㄚ': 'ua', 'ㄨㄛ': 'uo', 'ㄨㄞ': 'uai', 'ㄨㄟ': 'ui', 'ㄨㄢ': 'uan', 'ㄨㄣ': 'un',
         'ㄨㄤ': 'uang', 'ㄨㄥ': 'ong',
         'ㄩ': 'v', 'ㄩㄝ': 've', 'ㄩㄢ': 'van', 'ㄩㄣ': 'vn', 'ㄩㄥ': 'iong'}
ALONE = {'ㄧ': 'yi', 'ㄧㄚ': 'ya', 'ㄧㄛ': 'yo', 'ㄧㄝ': 'ye', 'ㄧㄠ': 'yao', 'ㄧㄡ': 'you',
         'ㄧㄢ': 'yan', 'ㄧㄣ': 'yin', 'ㄧㄤ': 'yang', 'ㄧㄥ': 'ying',
         'ㄨ': 'wu', 'ㄨㄚ': 'wa', 'ㄨㄛ': 'wo', 'ㄨㄞ': 'wai', 'ㄨㄟ': 'wei', 'ㄨㄢ': 'wan', 'ㄨㄣ': 'wen',
         'ㄨㄤ': 'wang', 'ㄨㄥ': 'weng',
         'ㄩ': 'yu', 'ㄩㄝ': 'yue', 'ㄩㄢ': 'yuan', 'ㄩㄣ': 'yun', 'ㄩㄥ': 'yong'}
TONE = {'ˊ': 2, 'ˇ': 3, 'ˋ': 4}


def zy2py(syl):
    """ㄐㄩˊ -> ('ju', 2). Light tone is not handled (callers skip it)."""
    tone = 1
    if syl[-1] in TONE:
        tone, syl = TONE[syl[-1]], syl[:-1]
    ini = INIT.get(syl[0], '')
    rest = syl[1:] if ini else syl
    if not ini:
        return ALONE.get(rest) or RHYME[rest], tone
    py = RHYME[rest]
    if py.startswith('v') and ini in ('j', 'q', 'x'):
        py = {'v': 'u', 've': 'ue', 'van': 'uan', 'vn': 'un'}[py]
    return ini + py, tone


def file_name(syl):
    return '-'.join(f'{ord(c):x}' for c in syl) + '.mp3'


def fetch(py, tone):
    # audio-cmn spells ü as 'v' in some files and 'u:' / 'ü' in others
    for cand in dict.fromkeys((py, py.replace('v', 'u:'), py.replace('v', 'ü'))):
        try:
            with urllib.request.urlopen(URL.format(urllib.parse.quote(f'{cand}{tone}')), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    return None


def main():
    z = json.load(open(os.path.join(ROOT, 'data', 'zhuyin.json'), encoding='utf-8'))
    syls = sorted({s for w in z['words'].values() for s in w['zy'].split() if not s.startswith('˙')})
    os.makedirs(OUT, exist_ok=True)
    missing = []
    with tempfile.TemporaryDirectory() as tmp:
        for syl in syls:
            dst = os.path.join(OUT, file_name(syl))
            if os.path.exists(dst):
                continue
            py, tone = zy2py(syl)
            data = fetch(py, tone)
            if not data:
                missing.append(syl)
                continue
            src = os.path.join(tmp, 'in.mp3')
            open(src, 'wb').write(data)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', FILTER,
                            '-ac', '1', '-ar', '44100', '-b:a', '64k', dst], check=True)
            print(f'{syl} {py}{tone} -> {os.path.relpath(dst, ROOT)}')
    print(f'{len(syls)} syllables, missing: {missing or "none"}')


if __name__ == '__main__':
    if len(sys.argv) != 1:
        sys.exit(__doc__)
    main()
