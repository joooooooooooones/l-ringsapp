"""Laver appens lydeffekter (app/audio/sfx-*.mp3) med ren syntese.

Kør:  python3 tools/make_sfx.py   (kræver numpy og ffmpeg)
"""
import pathlib
import subprocess
import tempfile
import wave

import numpy as np

from audio_manifest import AUDIO_DIR, write_manifest

SR = 44100


def tone(freq, dur, partials, decay, start=0.0, total=None):
    """En klokke/marimba-tone: grundtone plus overtoner, der dør ud."""
    total = total or start + dur
    out = np.zeros(int(total * SR))
    t = np.arange(int(dur * SR)) / SR
    attack = np.minimum(1.0, t / 0.004)  # ingen klik i starten
    sig = sum(amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / (decay * d))
              for ratio, amp, d in partials)
    i = int(start * SR)
    out[i:i + len(t)] += sig * attack
    return out


MARIMBA = [(1, 1.0, 1.0), (4, 0.35, 0.25), (10, 0.08, 0.1)]
BELL = [(1, 1.0, 1.0), (2.76, 0.45, 0.6), (5.4, 0.25, 0.35), (8.9, 0.1, 0.2)]


def good():
    return tone(784, 0.5, MARIMBA, 0.22, 0.0, 0.75) + tone(1047, 0.6, MARIMBA, 0.28, 0.11, 0.75)


def level():
    notes = [523, 659, 784, 1047, 1319]
    total = 1.6
    sig = sum(tone(f, 1.2, BELL, 0.35, i * 0.1, total) * (0.8 if i < 4 else 1.0) for i, f in enumerate(notes))
    rng = np.random.default_rng(3)
    for _ in range(14):  # lidt glimmer til sidst
        f = rng.uniform(2000, 3500)
        sig += tone(f, 0.25, [(1, 0.12, 1.0)], 0.06, rng.uniform(0.45, 1.2), total)
    return sig


def bad():
    """Blødt, lavt 'bonk' – venligt, ikke en straf."""
    dur = 0.28
    t = np.arange(int(dur * SR)) / SR
    freq = 196 * (1 - 0.18 * (1 - np.exp(-t / 0.05)))  # lille fald i tonehøjde
    phase = 2 * np.pi * np.cumsum(freq) / SR
    sig = (np.sin(phase) + 0.3 * np.sin(2 * phase)) * np.exp(-t / 0.07)
    return sig * np.minimum(1.0, t / 0.003) * 0.7


def tap():
    return tone(1200, 0.08, [(1, 1.0, 1.0), (2.5, 0.2, 0.5)], 0.018) * 0.5


def write_mp3(sig, path, peak):
    sig = sig / np.max(np.abs(sig)) * peak
    pcm = (sig * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        with wave.open(tmp.name, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp.name,
                        '-ac', '1', '-ar', '44100', '-b:a', '64k', str(path)], check=True)


if __name__ == '__main__':
    # 'bad' er bevidst svagere end de glade lyde.
    for name, fn, peak in [('good', good, 0.8), ('level', level, 0.8), ('bad', bad, 0.4), ('tap', tap, 0.4)]:
        out = AUDIO_DIR / f'sfx-{name}.mp3'
        write_mp3(fn(), out, peak)
        print('skrev', out.relative_to(AUDIO_DIR.parent.parent))
    write_manifest()
