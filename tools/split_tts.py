"""Cut the Gemini TTS audio for a word list back into one clip per word.

Usage:
  py tools/split_tts.py work/tts/script.txt     (reads work/tts/script.wav next to it)

Finds the pauses with ffmpeg silencedetect, trying several thresholds until the number of
speech segments equals the number of words; the n-th segment is the n-th line of the script.
Stops without writing anything if no threshold gives the right count (a word was skipped,
repeated or broken by a pause) - regenerate that script, or split it with --parts.

Writes assets/audio/zh/word/<code points joined by '-'>.mp3 (筆 -> 7b46.mp3), with the same
silence trim / loudness normalisation as the syllable clips, and work/tts/review.html for
listening through every clip. Needs ffmpeg on PATH.
"""
import html
import os
import re
import subprocess
import sys
import wave

from import_syllables import FILTER

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'zh', 'word')
NOISE = (-40, -35, -45, -30, -50)        # dB
MIN_SILENCE = (0.5, 0.4, 0.6, 0.7, 0.3, 0.8)  # seconds
MIN_SPEECH = 0.08                         # shorter blips (clicks, breaths) are not words
PAD = (0.05, 0.12)                        # keep a little before / after each segment


def file_name(word):
    return '-'.join(f'{ord(c):x}' for c in word) + '.mp3'


def segments(src, total, noise, dur):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', src, '-af',
                          f'silencedetect=noise={noise}dB:d={dur}', '-f', 'null', '-'],
                         capture_output=True, text=True, check=True).stderr
    starts = [max(0.0, float(x)) for x in re.findall(r'silence_start: (-?[\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: (-?[\d.]+)', log)]
    edges = [0.0]
    for s, e in zip(starts, ends + [total]):
        edges += [s, e]
    edges.append(total)
    segs = list(zip(edges[::2], edges[1::2]))
    return [(a, b) for a, b in segs if b - a >= MIN_SPEECH]


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    script = sys.argv[1]
    src = os.path.splitext(script)[0] + '.wav'
    words = [w.split('\t')[0].strip() for w in open(script, encoding='utf-8') if w.strip()]   # drop pronunciation hints
    with wave.open(src) as w:
        total = w.getnframes() / w.getframerate()
    tried = []
    for noise in NOISE:
        for dur in MIN_SILENCE:
            segs = segments(src, total, noise, dur)
            tried.append((noise, dur, len(segs)))
            if len(segs) == len(words):
                break
        else:
            continue
        break
    else:
        counts = ', '.join(f'{n}dB/{d}s:{c}' for n, d, c in tried)
        sys.exit(f'{len(words)} words but no threshold gives {len(words)} segments ({counts}).\n'
                 'Listen to the wav for skipped / repeated words, or regenerate with --parts.')
    print(f'{len(words)} segments at {noise}dB / {dur}s silence')

    os.makedirs(OUT, exist_ok=True)
    rows = []
    for word, (a, b) in zip(words, segs):
        dst = os.path.join(OUT, file_name(word))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{max(0, a - PAD[0]):.3f}',
                        '-to', f'{min(total, b + PAD[1]):.3f}', '-i', src, '-af', FILTER,
                        '-ac', '1', '-ar', '44100', '-b:a', '64k', dst], check=True)
        # a word much shorter or longer than its character count suggests the alignment slipped
        per_char = (b - a) / len(word)
        odd = not 0.18 <= per_char <= 1.2
        rows.append((word, dst, b - a, odd))
        print(f'{word}\t{b - a:.2f}s{"  <- check" if odd else ""}')

    review = os.path.join(os.path.dirname(src), 'review.html')
    with open(review, 'w', encoding='utf-8') as f:
        f.write('<!doctype html><meta charset="utf-8"><title>TTS clips</title>'
                '<style>body{font:18px sans-serif}td{padding:4px 10px}.odd{background:#fdd}</style><table>')
        for word, dst, sec, odd in rows:
            rel = os.path.relpath(dst, os.path.dirname(review)).replace(os.sep, '/')
            f.write(f'<tr class="{"odd" if odd else ""}"><td>{html.escape(word)}<td>{sec:.2f}s'
                    f'<td><audio controls preload="none" src="{rel}"></audio>')
        f.write('</table>')
    flagged = sum(r[3] for r in rows)
    print(f'{len(rows)} clips -> {os.path.relpath(OUT, ROOT)}, {flagged} flagged. '
          f'Listen: {os.path.relpath(review, ROOT)}')


if __name__ == '__main__':
    main()
