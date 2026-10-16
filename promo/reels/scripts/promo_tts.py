"""Promo voiceover for the reel, multi-speaker Gemini TTS (settings from the user's reference script).

Usage: py promo/reels/scripts/promo_tts.py [line numbers...]   -> work/reels/promo[_1_2].wav + .txt
       then: py tools/split_tts.py work/reels/promo[_1_2].txt --out work/reels/promo
The spoken text writes the name as 發音 樂園: written together, 音樂 (music) wins and 樂 comes out yuè.
"""
import os
import struct
import sys

from google import genai
from google.genai import types

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
HERE = os.path.join(ROOT, 'work', 'reels')   # output (not versioned)
for line in open(os.path.join(ROOT, '.env'), encoding='utf-8'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.strip().split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"\''))

TW = ('Taiwanese Mandarin with Taiwan standard pronunciation (not mainland). '
      'Pronounce 發音樂園 as fā yīn lè yuán: 樂 is lè (ㄌㄜˋ) as in 快樂, never yuè. '
      '識字 is shì zì: 識 is fourth tone shì (ㄕˋ), never shí.')
NARRATOR = 'Style: Upbeat, enthusiastic product-launch voiceover with a bright vocal smile, confident and warm, brisk tempo. ' + TW
PARENT = 'Style: A curious young parent, warm and conversational, a little puzzled, like asking a real question. ' + TW

LINES = [
    ('Speaker 2', PARENT, '這兩個音，怎麼聽起來一樣？'),
    ('Speaker 2', PARENT, '孩子還不識字，注音要怎麼教？'),
    ('Speaker 1', NARRATOR, '發音 樂園，給五到七歲孩子的注音發音練習。'),
    ('Speaker 1', NARRATOR, '看圖卡、聽發音，三十七個注音都有真人錄音。'),
    ('Speaker 1', NARRATOR, '聽音、分類、拼拼看，一輪只要五題。'),
    ('Speaker 1', NARRATOR, '家長看得到練習紀錄，知道哪裡要多練。'),
    ('Speaker 1', NARRATOR, '每天五分鐘，學會一個符號，就能收集貼紙。'),
    ('Speaker 1', NARRATOR, '發音 樂園，打開瀏覽器就能玩！'),
]


def to_wav(pcm, rate=24000, bits=16):
    n = len(pcm)
    return struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', 36 + n, b'WAVE', b'fmt ', 16, 1, 1, rate,
                       rate * bits // 8, bits // 8, bits, b'data', n) + pcm


def main():
    pick = [int(a) for a in sys.argv[1:]] or list(range(1, len(LINES) + 1))
    lines = [LINES[i - 1] for i in pick]
    name = 'promo' + ''.join(f'_{i}' for i in pick) if sys.argv[1:] else 'promo'
    client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])
    parts = [types.Part(text=t + ' <long pause>', speech_metadata=types.SpeechMetadata(speaker=s, style=st))
             for s, st, t in lines]
    config = types.GenerateContentConfig(
        temperature=1,
        response_modalities=['audio'],
        speech_config=types.SpeechConfig(multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
            speaker_voice_configs=[
                types.SpeakerVoiceConfig(speaker='Speaker 1', voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name='Veda'))),
                types.SpeakerVoiceConfig(speaker='Speaker 2', voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name='Rami'))),
            ])),
    )
    audio, mime = bytearray(), ''
    for chunk in client.models.generate_content_stream(
            model=os.environ.get('PROMO_TTS_MODEL', 'gemini-3.8-flash-lite-tts'), contents=[types.Content(role='user', parts=parts)], config=config):
        if chunk.parts and chunk.parts[0].inline_data and chunk.parts[0].inline_data.data:
            audio.extend(chunk.parts[0].inline_data.data)
            mime = chunk.parts[0].inline_data.mime_type
    if not audio:
        sys.exit('no audio returned')
    data = bytes(audio)
    if data[:4] != b'RIFF':
        rate = next((int(p.split('=')[1]) for p in mime.split(';') if p.strip().startswith('rate=')), 24000)
        data = to_wav(data, rate)
    os.makedirs(HERE, exist_ok=True)
    out = os.path.join(HERE, name + '.wav')
    open(out, 'wb').write(data)
    open(os.path.join(HERE, name + '.txt'), 'w', encoding='utf-8').write('\n'.join(t for _, _, t in lines) + '\n')
    print(out, mime)


if __name__ == '__main__':
    main()
