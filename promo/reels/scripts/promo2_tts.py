"""Voiceover for the second reel (features the first one skipped), same settings as promo_tts.py, multi-speaker Gemini TTS (settings from the user's reference script).

Usage: py promo/reels/scripts/promo2_tts.py [line numbers...]   -> work/reels/promo2[_1_2].wav + .txt
       then: py tools/split_tts.py work/reels/promo2[_1_2].txt --out work/reels/promo2
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
      '胖胖 is pàng pàng (ㄆㄤˋ), fourth tone. 還 in 還能 is hái. 蓋 is gài.')
NARRATOR = 'Style: Upbeat, enthusiastic product-launch voiceover with a bright vocal smile, confident and warm, brisk tempo. ' + TW
PARENT = 'Style: A curious young parent, warm and conversational, a little puzzled, like asking a real question. ' + TW

LINES = [('Speaker 1', NARRATOR, t) for t in [
    '在發音 樂園，孩子是小老師，陪胖胖一起學注音！',
    '看注音，大聲念給胖胖聽，練習開口說。',
    '胖胖有時候會念錯，換孩子來抓錯！',
    '還能錄下自己的聲音，跟示範發音比一比。',
    '戳泡泡、翻牌配對，還有闖關大對決！',
    '每天練一輪，就蓋一個章；休息幾天，也不會歸零。',
    '出門在外，就選不用開口的遊戲。',
    '學會一整組注音，還能印獎狀！',
    '發音 樂園，打開瀏覽器就能玩！',
]]


def to_wav(pcm, rate=24000, bits=16):
    n = len(pcm)
    return struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', 36 + n, b'WAVE', b'fmt ', 16, 1, 1, rate,
                       rate * bits // 8, bits // 8, bits, b'data', n) + pcm


def main():
    pick = [int(a) for a in sys.argv[1:]] or list(range(1, len(LINES) + 1))
    lines = [LINES[i - 1] for i in pick]
    name = 'promo2' + ''.join(f'_{i}' for i in pick) if sys.argv[1:] else 'promo2'
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
