"""Import the 37 zhuyin symbol recordings from the MOE handbook's open materials.

Source: 教育部《國語注音符號手冊》數位版 開放部件 (CC BY 4.0)
  https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html
  -> bopomofo_materials_20170213.zip (audio/F1.WAV ... F37.WAV)

Usage:
  py tools/import_moe_audio.py path/to/bopomofo_materials_20170213.zip

Writes assets/audio/zh/sym/<codepoint>.mp3 (e.g. 3105.mp3 = ㄅ): leading/trailing silence
trimmed, loudness normalised, mono 64 kbps. Needs ffmpeg on PATH.
"""
import os
import subprocess
import sys
import tempfile
import zipfile

# F-number -> symbol, as wired in the handbook's HTML (play('aN') next to each symbol's row).
# Note the medials ㄧㄨㄩ come last (35-37), after ㄦ.
ORDER = 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ'
FILTER = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'loudnorm=I=-16:TP=-1.5:LRA=7,adelay=30,apad=pad_dur=0.05')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'zh', 'sym')


def main(zip_path):
    os.makedirs(OUT, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z, tempfile.TemporaryDirectory() as tmp:
        for n, sym in enumerate(ORDER, 1):
            src = os.path.join(tmp, f'F{n}.wav')
            with open(src, 'wb') as f:
                f.write(z.read(f'audio/F{n}.WAV'))
            dst = os.path.join(OUT, f'{ord(sym):x}.mp3')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', FILTER,
                            '-ac', '1', '-ar', '44100', '-b:a', '64k', dst], check=True)
            print(f'F{n:<2} {sym} -> {os.path.relpath(dst, ROOT)}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
