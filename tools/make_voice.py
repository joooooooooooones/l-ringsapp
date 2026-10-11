"""Laver appens oplæsning som lydfiler (app/audio/<navn>.mp3).

Alle tekster appen kan sige, hentes fra app/js/data.js (DATA.allPhrases), så
nye ord automatisk kommer med. Eksisterende filer springes over, medmindre
--force bruges.

To måder at lave stemmen på:

1) VoiceStudio (https://github.com/debpalash/VoiceStudio) kører på din computer:
     python3 tools/make_voice.py --voicestudio --voice "Min stemme"
   --voice er navnet på en stemmeprofil i VoiceStudio, f.eks. din egen klonede stemme.

2) OmniVoice direkte i Python (samme model som VoiceStudio bruger):
     pip install torch torchaudio omnivoice
     python3 tools/make_voice.py --ref tools/voice/ref.wav --ref-text "Teksten der siges i optagelsen."
   Uden --ref laves først en dansk referencestemme ud fra --design, som så
   bruges til alle klip, så stemmen er den samme hele vejen igennem.

Kræver node og ffmpeg.
"""
import argparse
import json
import pathlib
import subprocess
import sys
import tempfile
import urllib.request

from audio_manifest import AUDIO_DIR, write_manifest

ROOT = pathlib.Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / 'tools' / 'voice'
REF_SENTENCE = 'Hej med dig. Nu skal vi øve os på at stave og regne, og det bliver rigtig sjovt.'


def phrases():
    js = ("global.window = {}; require(process.argv[1]);"
          "const d = window.DATA;"
          "console.log(JSON.stringify(d.allPhrases().map((t) => [d.audioKey(t), t])));")
    out = subprocess.run(['node', '-e', js, str(ROOT / 'app' / 'js' / 'data.js')],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out)


# Stykker der sættes sammen til regnestykker ("Hvad er" + "tre" + "plus" + "to"),
# skal ikke lyde som afsluttede sætninger.
JOINERS = {'Hvad er', 'plus', 'minus'}


def spoken_text(text):
    # Enkelte ord og bogstaver udtales mere tydeligt som en lille sætning med punktum.
    if text in JOINERS or text[-1] in '.!?':
        return text
    return text[0].upper() + text[1:] + '.'


def to_mp3(wav_path, mp3_path):
    """Skær stilhed af i begge ender, gør lydstyrken ens og gem som lille mp3."""
    trim = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,'
            'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,'
            'loudnorm=I=-17:TP=-1.5:LRA=7,afade=t=in:d=0.01')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav_path), '-af', trim,
                    '-ac', '1', '-ar', '24000', '-b:a', '48k', str(mp3_path)], check=True)


class VoiceStudio:
    def __init__(self, url, voice, speed):
        self.url = url.rstrip('/') + '/v1/audio/speech'
        self.voice = voice
        self.speed = speed

    def say_many(self, texts, wav_paths):
        for text, wav in zip(texts, wav_paths):
            self.say(text, wav)

    def say(self, text, wav_path):
        body = json.dumps({'model': 'omnivoice', 'input': text, 'voice': self.voice,
                           'response_format': 'wav', 'speed': self.speed, 'language': 'da'}).encode()
        req = urllib.request.Request(self.url, body, {'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=600) as r:
            pathlib.Path(wav_path).write_bytes(r.read())


class OmniVoiceLocal:
    def __init__(self, ref, ref_text, design, speed, steps):
        import torch
        from omnivoice import OmniVoice
        import soundfile as sf
        self.sf = sf
        device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
        dtype = torch.float16 if device != 'cpu' else torch.float32
        print(f'Indlæser OmniVoice på {device} …', flush=True)
        self.model = OmniVoice.from_pretrained('k2-fsa/OmniVoice', device_map=device, dtype=dtype)
        self.speed = speed
        self.steps = steps
        if not ref:
            ref, ref_text = self.make_reference(design)
        self.prompt = self.model.create_voice_clone_prompt(ref_audio=str(ref), ref_text=ref_text)

    def make_reference(self, design):
        """Lav (én gang) en dansk referencestemme, som alle klip klones fra."""
        VOICE_DIR.mkdir(parents=True, exist_ok=True)
        ref = VOICE_DIR / 'ref.wav'
        if not ref.exists():
            print(f'Laver referencestemme ({design}) …', flush=True)
            audio = self.model.generate(text=REF_SENTENCE, language='da', instruct=design,
                                        num_step=self.steps)
            self.sf.write(str(ref), audio[0], 24000)
        return ref, REF_SENTENCE

    def say_many(self, texts, wav_paths):
        n = len(texts)
        audios = self.model.generate(text=texts, language=['da'] * n, voice_clone_prompt=[self.prompt] * n,
                                     speed=[self.speed] * n, num_step=self.steps)
        for audio, wav in zip(audios, wav_paths):
            self.sf.write(str(wav), audio, 24000)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--voicestudio', action='store_true', help='brug VoiceStudio-appens lokale API')
    ap.add_argument('--url', default='http://127.0.0.1:3900', help='VoiceStudio-adresse')
    ap.add_argument('--voice', default='default', help='VoiceStudio stemmeprofil (navn eller id)')
    ap.add_argument('--ref', help='din egen optagelse (3-10 sek. wav) at klone stemmen fra')
    ap.add_argument('--ref-text', help='præcis det der siges i --ref')
    ap.add_argument('--design', default='female, middle-aged, moderate pitch',
                    help='stemmebeskrivelse når der ikke er en --ref')
    ap.add_argument('--speed', type=float, default=0.9, help='taletempo (lidt langsomt for børn)')
    ap.add_argument('--steps', type=int, default=32, help='OmniVoice-kvalitet (flere = bedre, langsommere)')
    ap.add_argument('--batch', type=int, default=1, help='antal klip ad gangen (1 er hurtigst på CPU)')
    ap.add_argument('--force', action='store_true', help='lav alle filer igen')
    ap.add_argument('--only', nargs='*', help='lav kun disse tekster')
    args = ap.parse_args()

    if args.ref and not args.ref_text:
        sys.exit('--ref kræver --ref-text med det der bliver sagt i optagelsen')

    todo = [(k, t) for k, t in phrases()
            if (args.force or not (AUDIO_DIR / f'{k}.mp3').exists()) and (not args.only or t in args.only)]
    print(f'{len(todo)} klip skal laves', flush=True)
    if not todo:
        write_manifest()
        return

    engine = (VoiceStudio(args.url, args.voice, args.speed) if args.voicestudio
              else OmniVoiceLocal(args.ref, args.ref_text, args.design, args.speed, args.steps))
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        done = 0
        for start in range(0, len(todo), args.batch):
            chunk = todo[start:start + args.batch]
            wavs = [pathlib.Path(tmp) / f'{k}.wav' for k, _ in chunk]
            engine.say_many([spoken_text(t) for _, t in chunk], wavs)
            for (key, text), wav in zip(chunk, wavs):
                to_mp3(wav, AUDIO_DIR / f'{key}.mp3')
                done += 1
                print(f'[{done}/{len(todo)}] {key}.mp3  "{text}"', flush=True)
            write_manifest()  # så appen kan bruge de klip der er færdige
    write_manifest()


if __name__ == '__main__':
    main()
