"""Step: narration clips, one MP3 per lesson step.

    python afm.py narrate status                          # clips per language, scripts without clips, clips without scripts
    python afm.py narrate record --lang ta --clip backoffice-3-start
    python afm.py narrate record --lang en --clip owner-0-intro,owner-0-read
    python afm.py narrate record --lang ta --missing      # every script that has no clip yet

Scripts (the words spoken) are in src/i18n/<lang>/narration.json, keyed by clip id <course>-<lesson>-<intro|step id|done>.
Clips are written to src/audio/<lang>/<clip id>.mp3; rebuild afterwards (python afm.py build --edition training).

Voices (same as the existing clips):
  en  Kokoro af_heart, 20 kbps MP3 at 24 kHz   - needs tools/tts/kokoro-v1.0.onnx and voices-v1.0.bin
  ta  AI4Bharat Indic-TTS Tamil, female, 16 kbps MP3 at 16 kHz - needs tools/tts/ta/ (fastpitch + hifigan)
See STANDARD.md, "Narration", for installing them.
"""
import json, re
from pipeline.common import ROOT

AUDIO = ROOT / 'src' / 'audio'
TTS = ROOT / 'tools' / 'tts'


def scripts(lang):
    return json.loads((ROOT / 'src' / 'i18n' / lang / 'narration.json').read_text(encoding='utf-8'))


def status():
    for lang in ('en', 'ta'):
        s = scripts(lang); clips = {f.stem for f in (AUDIO / lang).glob('*.mp3')}
        no_clip = sorted(set(s) - clips); no_script = sorted(clips - set(s))
        print(f'{lang}: {len(clips)} clips, {len(s)} scripts; scripts without a clip: {len(no_clip)} {no_clip[:5]}; clips without a script: {len(no_script)}')


def _mp3(audio, rate, kbps):
    import numpy as np, lameenc
    a = audio / (np.abs(audio).max() + 1e-9) * 0.89
    e = lameenc.Encoder(); e.set_bit_rate(kbps); e.set_in_sample_rate(rate); e.set_channels(1); e.set_quality(2)
    return e.encode((a * 32767).astype('int16').tobytes()) + e.flush()


def _en(text):
    import numpy as np
    from kokoro_onnx import Kokoro
    k = Kokoro(str(TTS / 'kokoro-v1.0.onnx'), str(TTS / 'voices-v1.0.bin'))
    for a, b in {'Priya': 'Pree-ya', 'Kavya': 'Kaav-ya', 'Lakshmi': 'Luck-shmi', 'Ulundurpet': 'Oolundoorpet'}.items():
        text = re.sub(rf'\b{a}\b', b, text)
    a, sr = k.create(text, voice='af_heart', speed=0.86, lang='en-us')
    pad = np.zeros(int(sr * 0.25), dtype=np.float32)
    return _mp3(np.concatenate([pad, a, pad]), sr, 20)


def _ta(text):
    import numpy as np, warnings; warnings.filterwarnings('ignore')
    from TTS.utils.synthesizer import Synthesizer
    from pipeline.tamil_speech import spoken
    text = spoken(text)
    d = TTS / 'ta'
    cfg = json.loads((d / 'fastpitch/config.json').read_text())            # point the model at its local speakers file
    cfg['speakers_file'] = str(d / 'fastpitch/speakers.pth'); cfg.setdefault('model_args', {})['speakers_file'] = cfg['speakers_file']
    (d / 'fastpitch/config_local.json').write_text(json.dumps(cfg))
    s = Synthesizer(tts_checkpoint=str(d / 'fastpitch/best_model.pth'), tts_config_path=str(d / 'fastpitch/config_local.json'),
                    tts_speakers_file=str(d / 'fastpitch/speakers.pth'), vocoder_checkpoint=str(d / 'hifigan/best_model.pth'),
                    vocoder_config=str(d / 'hifigan/config.json'), use_cuda=False)
    pieces, cur = [], ''
    for sent in re.split(r'(?<=[.!?;:])\s+', text):          # long text: sentence groups with short pauses
        if cur and len(cur) + len(sent) > 220: pieces.append(cur); cur = sent
        else: cur = (cur + ' ' + sent).strip()
    if cur: pieces.append(cur)
    out = [np.zeros(4000, np.float32)]
    for p in pieces:
        w = np.asarray(s.tts(p, speaker_name='female'), dtype=np.float32); sr = s.output_sample_rate
        w = np.interp(np.linspace(0, len(w) - 1, int(len(w) * 16000 / sr)), np.arange(len(w)), w).astype(np.float32)
        out += [w, np.zeros(int(16000 * 0.18), np.float32)]
    out[-1] = np.zeros(4000, np.float32)
    return _mp3(np.concatenate(out), 16000, 16)


def record(lang, clip=None, missing=False):
    s = scripts(lang)
    ids = [c.strip() for c in clip.split(',')] if clip else []
    if missing:
        ids = sorted(set(s) - {f.stem for f in (AUDIO / lang).glob('*.mp3')})
    bad = [i for i in ids if i not in s]
    if bad:
        raise SystemExit(f'No script for {bad} in src/i18n/{lang}/narration.json. Add the text there first.')
    synth = _en if lang == 'en' else _ta
    for i in ids:
        (AUDIO / lang / f'{i}.mp3').write_bytes(synth(s[i])); print('recorded', lang, i)
    print(f'{len(ids)} clip(s). Rebuild: python afm.py build --edition training --lang {lang}')
