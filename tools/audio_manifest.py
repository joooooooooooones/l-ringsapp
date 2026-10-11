"""Fælles: skriver app/audio/manifest.json med alle lydfiler, appen kan bruge."""
import json
import pathlib

AUDIO_DIR = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'audio'


def write_manifest():
    clips = sorted(p.stem for p in AUDIO_DIR.glob('*.mp3'))
    (AUDIO_DIR / 'manifest.json').write_text(json.dumps({'clips': clips}, indent=1) + '\n')
    print(f'manifest.json: {len(clips)} lydfiler')
