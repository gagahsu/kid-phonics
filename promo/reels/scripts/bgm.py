"""Background music for the reel, synthesised here so there is no licence to track.

Usage: py promo/reels/scripts/bgm.py   -> promo/reels/public/audio/bgm.mp3
Bright, light kids' bed: 120 BPM, C - G - Am - F, marimba melody, plucked chords, soft bass, shaker.
Kept sparse in the voice range so the narration sits on top.
"""
import os
import subprocess
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
HERE = os.path.join(ROOT, 'work', 'reels')   # intermediate wav (not versioned)
SR = 44100
BEAT = 0.5                      # 120 BPM
BAR = 4 * BEAT
LOOPS = 6                       # 4 bars per loop (8 s), long enough for both reels; loop 1 = intro under the hook
LEN = LOOPS * 4 * BAR + 2
rng = np.random.default_rng(7)
out = np.zeros(int(LEN * SR))


def hz(n):                      # MIDI note -> Hz
    return 440 * 2 ** ((n - 69) / 12)


def add(t, sig, gain):
    i = int(t * SR)
    seg = sig[:len(out) - i] * gain
    out[i:i + len(seg)] += seg


def env(dur, decay, attack=0.004):
    t = np.arange(int(dur * SR)) / SR
    return t, np.minimum(t / attack, 1) * np.exp(-t / decay)


def marimba(n, dur=0.6):
    t, e = env(dur, 0.16)
    f = hz(n)
    return e * (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.03))


def bell(n):
    t, e = env(1.2, 0.35, 0.002)
    f = hz(n)
    return e * (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.12))


def pluck(n):                   # ukulele-ish: bright partials that fade fast
    t, e = env(0.45, 0.12, 0.002)
    f = hz(n)
    return e * sum(np.sin(2 * np.pi * k * f * t) * np.exp(-t * k * 6) / k for k in range(1, 6))


def bass(n, dur):
    t, e = env(dur, 0.4, 0.01)
    f = hz(n)
    return e * (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * 2 * f * t)) * np.minimum(1, (dur - t) / 0.03)


def shaker():
    t, e = env(0.06, 0.018, 0.001)
    noise = rng.standard_normal(len(t))
    return e * np.diff(noise, prepend=0)        # crude high-pass


def kick():
    t, e = env(0.25, 0.08, 0.001)
    return e * np.sin(2 * np.pi * (50 + 90 * np.exp(-t / 0.03)) * t)


CHORDS = [(48, (60, 64, 67)), (43, (59, 62, 67)), (45, (60, 64, 69)), (41, (60, 65, 69))]   # C G Am F
# melody on an 8th-note grid, one list per bar (None = rest), C major pentatonic-ish
MEL = [
    [72, None, 76, None, 79, 76, None, 72],
    [74, None, 79, None, 74, None, 71, None],
    [72, None, 76, None, 81, 79, None, 76],
    [77, None, 76, 74, None, 72, None, None],
]

for loop in range(LOOPS):
    for b, (root, chord) in enumerate(CHORDS):
        t0 = (loop * 4 + b) * BAR
        add(t0, bass(root, BEAT * 1.5), 0.32)
        add(t0 + 2 * BEAT, bass(root + 7 if root < 45 else root, BEAT * 1.5), 0.26)
        for beat in range(4):
            if loop > 0 or beat:
                add(t0 + beat * BEAT, kick(), 0.35 if beat % 2 == 0 else 0.0)
            for k, n in enumerate(chord):              # strum on the off-beats
                add(t0 + beat * BEAT + BEAT / 2 + k * 0.012, pluck(n), 0.07)
        for e8 in range(8):
            add(t0 + e8 * BEAT / 2, shaker(), 0.05 if e8 % 2 else 0.03)
        if loop > 0:
            for e8, n in enumerate(MEL[b]):
                if n:
                    add(t0 + e8 * BEAT / 2, marimba(n), 0.22)
        if loop == LOOPS - 1 or (loop == 0 and b == 3):
            add(t0, bell(chord[-1] + 24), 0.06)

out = out[:int((LOOPS * 4 * BAR + 1) * SR)]
out /= np.abs(out).max() / 0.8
os.makedirs(HERE, exist_ok=True)
tmp = os.path.join(HERE, 'bgm.wav')
with wave.open(tmp, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
dst = os.path.join(ROOT, 'promo', 'reels', 'public', 'audio', 'bgm.mp3')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', 'loudnorm=I=-18:TP=-1.5', '-ar', '44100',
                '-b:a', '128k', dst], check=True)
print(dst)
