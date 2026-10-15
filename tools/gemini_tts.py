"""Read a word list from tools/build_tts_script.py aloud with Gemini TTS, in one request.

Usage:
  py tools/gemini_tts.py work/tts/script.txt     (writes work/tts/script.wav)
  py tools/gemini_tts.py work/tts/pang.txt --style pang --voice Puck   (cat lines; --voice overrides .env)

Settings come from .env in the project root (see .env.example; .env is git-ignored):
  GEMINI_API_KEY    required
  GEMINI_TTS_MODEL  default gemini-3.8-flash-tts
  GEMINI_TTS_VOICE  default Kore (any prebuilt voice name)

A line may add a pronunciation hint after a tab (雨<TAB>yǔ, third tone): it is put in the style
prompt, not read aloud. Words are joined with <long pause> tags so tools/split_tts.py can cut the audio on silence.
Uses the Interactions API (non-streaming: streaming has been reported to truncate long audio).
Standard library only.
"""
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
TW = 'Taiwanese Mandarin (Taiwan standard pronunciation, not mainland)'
STYLES = {
    # example words: assets/audio/zh/word/
    'word': (f'A warm, clear {TW} speaker reading single words to young children, speaking slowly and evenly, '
             'the same pitch and loudness for every word.'),
    # 胖胖: the chubby tabby who is still learning zhuyin; 菲菲: the calm Russian Blue helper (ROADMAP 3.2)
    'pang': (f'{TW}. You are 胖胖, a chubby, curious, excitable young cat in a game for 5-year-olds: '
             'bright, a little high-pitched, bouncy and eager, slightly clumsy and cute. Speak clearly and not too fast, '
             'each line in the same voice and loudness.'),
    'fei': (f'{TW}. You are 菲菲, a calm, gentle, kind cat who helps young children learn: '
            'soft, warm and patient like a kindergarten teacher, unhurried and clear. '
            'Each line in the same voice and loudness.'),
}
SEP = ' <long pause> '


def load_env():
    path = os.path.join(ROOT, '.env')
    if not os.path.exists(path):
        sys.exit('.env not found: copy .env.example to .env and fill in GEMINI_API_KEY')
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"\''))


def to_wav(data):
    """3.8 models return a WAV file; 3.1 and older return headerless 24 kHz mono 16-bit PCM."""
    if data[:4] == b'RIFF':
        return data
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(data)
    return buf.getvalue()


def main():
    args = sys.argv[1:]
    opts = dict(zip(args[1::2], args[2::2]))
    if not args or len(args) % 2 == 0 or set(opts) - {'--voice', '--style'} or opts.get('--style', 'word') not in STYLES:
        sys.exit(__doc__)
    if '--voice' in opts:
        os.environ['GEMINI_TTS_VOICE'] = opts['--voice']
    load_env()
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        sys.exit('GEMINI_API_KEY is empty in .env')
    script = args[0]
    # a line may carry a pronunciation hint after a tab: it goes into the style, never into the transcript
    lines = [l.strip().split('\t', 1) for l in open(script, encoding='utf-8') if l.strip()]
    words = [l[0].strip() for l in lines]
    hints = [f'{l[0].strip()}: {l[1].strip()}' for l in lines if len(l) == 2]
    style = STYLES[opts.get('--style', 'word')] + (' Pronounce exactly: ' + '; '.join(hints) + '.' if hints else '')
    body = {
        'model': os.environ.get('GEMINI_TTS_MODEL') or 'gemini-3.8-flash-tts',
        'input': [{'type': 'user_input', 'content': [{
            'type': 'text',
            'text': SEP.join(words),
            'annotations': [{'type': 'speech_metadata', 'style': style}],
        }]}],
        'response_format': {'type': 'audio'},
        'generation_config': {'speech_config': [{'voice': os.environ.get('GEMINI_TTS_VOICE') or 'Kore'}]},
    }
    req = urllib.request.Request(URL, json.dumps(body).encode(), method='POST', headers={
        'x-goog-api-key': key, 'Content-Type': 'application/json'})
    print(f'{len(words)} words -> {body["model"]} ({body["generation_config"]["speech_config"][0]["voice"]}), '
          'this can take a few minutes...')
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'HTTP {e.code}: {e.read().decode(errors="replace")[:2000]}')
    audio = [c['data'] for s in res.get('steps', []) if s.get('type') == 'model_output'
             for c in s.get('content', []) if c.get('type') == 'audio' and c.get('data')]
    if not audio:
        sys.exit('no audio in response:\n' + json.dumps(res, ensure_ascii=False)[:2000])
    dst = os.path.splitext(script)[0] + '.wav'
    open(dst, 'wb').write(to_wav(base64.b64decode(audio[-1])))
    with wave.open(dst) as w:
        sec = w.getnframes() / w.getframerate()
    print(f'{dst}: {sec / 60:.1f} min. Next: py tools/split_tts.py {script}')


if __name__ == '__main__':
    main()
