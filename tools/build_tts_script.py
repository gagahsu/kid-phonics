"""Write every example word in data/zhuyin.json into a word list for Gemini TTS.

Usage:
  py tools/build_tts_script.py            (one script with all words)
  py tools/build_tts_script.py --parts 4  (split into 4 scripts, in case one call drifts or truncates)

Writes work/tts/script.txt (or script_1.txt ... script_N.txt): one word per line, in zhuyin.json
order. The line order is the clip order: tools/gemini_tts.py reads the words with pauses between
them, tools/split_tts.py cuts the audio on those pauses and names each clip after its line.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'work', 'tts')
PAUSE = 1.2          # rough length of a <long pause>
SEC_PER_CHAR = 0.4   # slow, child-directed reading
TOKENS_PER_SEC = 32  # Gemini audio tokens; reports vary between 25 and 32
MAX_TOKENS = 16000   # Gemini TTS output cap reported for 2.5 models (≈ 8–10 min of audio)


def main():
    parts = 1
    if len(sys.argv) == 3 and sys.argv[1] == '--parts' and sys.argv[2].isdigit() and int(sys.argv[2]) > 0:
        parts = int(sys.argv[2])
    elif len(sys.argv) != 1:
        sys.exit(__doc__)
    z = json.load(open(os.path.join(ROOT, 'data', 'zhuyin.json'), encoding='utf-8'))
    words = list(z['words'])
    os.makedirs(OUT, exist_ok=True)
    size = -(-len(words) // parts)
    for i in range(parts):
        chunk = words[i * size:(i + 1) * size]
        name = 'script.txt' if parts == 1 else f'script_{i + 1}.txt'
        with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(chunk) + '\n')
        sec = sum(len(w) for w in chunk) * SEC_PER_CHAR + len(chunk) * PAUSE
        tokens = sec * TOKENS_PER_SEC
        warn = '  ** may exceed the output cap, use more --parts **' if tokens > MAX_TOKENS else ''
        print(f'{os.path.relpath(os.path.join(OUT, name), ROOT)}: {len(chunk)} words, '
              f'~{sec / 60:.1f} min, ~{tokens:,.0f} audio tokens{warn}')


if __name__ == '__main__':
    main()
