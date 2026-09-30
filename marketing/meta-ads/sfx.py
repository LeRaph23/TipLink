"""Synthesises the cartoon sound effects for an ad, no samples needed.

    python3 sfx.py out.wav 16.5 '[[0.8, "pop"], [8.2, "trombone"], [6.8, "drumroll", 0.8]]'

Each cue is [time_s, name, optional_param]. Pure standard library.
"""
import json
import math
import random
import struct
import sys
import wave

SR = 44100
random.seed(7)


def env(i, n, attack=0.005, release=None):
    t = i / SR
    a = min(1.0, t / attack) if attack else 1.0
    r = 1.0 if release is None else max(0.0, 1 - i / n) ** release
    return a * r


def tone(freq_fn, dur, wave_fn=math.sin, amp=0.5, release=2.0, attack=0.005):
    n = int(dur * SR)
    out, ph = [], 0.0
    for i in range(n):
        ph += 2 * math.pi * freq_fn(i / SR) / SR
        out.append(amp * wave_fn(ph) * env(i, n, attack, release))
    return out


def saw(ph):
    return 2 * ((ph / (2 * math.pi)) % 1) - 1


def noise(dur, amp=0.4, release=2.0, smooth=0.0):
    n, out, y = int(dur * SR), [], 0.0
    for i in range(n):
        y = smooth * y + (1 - smooth) * random.uniform(-1, 1)
        out.append(amp * y * env(i, n, 0.01, release))
    return out


def mix(*parts):
    n = max(len(p) for p in parts)
    return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]


def pop(_=None):
    return tone(lambda t: 900 - 5000 * t, 0.09, amp=0.55, release=1.5)


def tink(_=None):
    return mix(tone(lambda t: 3100, 0.35, amp=0.25, release=4), tone(lambda t: 4650, 0.25, amp=0.12, release=5))


def ding(_=None):
    f = 1318.5
    return mix(tone(lambda t: f, 1.6, amp=0.32, release=3), tone(lambda t: f * 2.01, 1.0, amp=0.14, release=4),
               tone(lambda t: f * 3.0, 0.6, amp=0.06, release=5))


def cash(_=None):
    # "Ka-ching": a noisy clack, then a bright bell.
    return mix(noise(0.08, 0.35, 3), [0.0] * int(0.07 * SR) + ding())


def whoosh(_=None):
    n, out, y = int(0.45 * SR), [], 0.0
    for i in range(n):
        x = i / n
        k = 0.97 - 0.5 * math.sin(math.pi * x)  # opens up in the middle
        y = k * y + (1 - k) * random.uniform(-1, 1)
        out.append(0.9 * y * math.sin(math.pi * x) ** 2)
    return out


def boing(_=None):
    return tone(lambda t: 220 + 160 * math.sin(2 * math.pi * 9 * t) * math.exp(-4 * t) + 120 * t, 0.6, amp=0.45, release=1.5)


def flip(_=None):
    return noise(0.07, 0.35, 2, smooth=0.3)


def tick(_=None):
    return tone(lambda t: 2000, 0.03, amp=0.3, release=3)


def drumroll(dur=1.0):
    out = [0.0] * int(dur * SR)
    step = int(SR / 28)
    for k in range(0, len(out) - step, step):
        hit = noise(0.05, 0.18 + 0.2 * k / len(out), 4, smooth=0.5)
        for i, v in enumerate(hit):
            if k + i < len(out):
                out[k + i] += v
    return out + pop()


def tada(_=None):
    notes = [523.25, 659.25, 783.99, 1046.5]
    out = []
    for j, f in enumerate(notes):
        seg = tone(lambda t, f=f: f, 0.11 if j < 3 else 0.7, wave_fn=lambda p: 0.6 * math.sin(p) + 0.4 * saw(p) * 0.5,
                   amp=0.3, release=1.2 if j < 3 else 2)
        out += seg
    return out


def trombone(_=None):
    # The classic "wah wah wah wahhh".
    notes = [(293.66, 0.38), (277.18, 0.38), (261.63, 0.38), (246.94, 1.2)]
    out = []
    for j, (f, d) in enumerate(notes):
        vib = 5.5 if j == 3 else 0
        seg = tone(lambda t, f=f, vib=vib: f * (1 + 0.012 * math.sin(2 * math.pi * vib * t)), d,
                   wave_fn=lambda p: 0.55 * saw(p) + 0.45 * math.sin(p), amp=0.28, release=0.6, attack=0.04)
        out += seg
    # soften the sawtooth
    y, soft = 0.0, []
    for v in out:
        y = 0.8 * y + 0.2 * v
        soft.append(y * 1.6)
    return soft


def bell(_=None):
    return mix(ding(), [0.0] * int(0.18 * SR) + tone(lambda t: 1046.5, 1.2, amp=0.28, release=3))


def cricket(dur=1.5):
    out = []
    while len(out) < dur * SR:
        out += tone(lambda t: 4200, 0.18, wave_fn=lambda p: math.sin(p) * (0.5 + 0.5 * math.sin(p / 60)), amp=0.12, release=1)
        out += [0.0] * int(0.25 * SR)
    return out


def snip(_=None):
    # Scissors: two quick metallic clicks.
    click = lambda: mix(noise(0.03, 0.5, 4), tone(lambda t: 5200, 0.04, amp=0.12, release=6))
    return click() + [0.0] * int(0.06 * SR) + click()


def hiss(dur=1.5):
    n, out, y = int(dur * SR), [], 0.0
    for i in range(n):
        y = 0.4 * y + 0.6 * random.uniform(-1, 1)
        out.append(0.16 * y * min(1, i / (0.2 * SR)) * min(1, (n - i) / (0.4 * SR)))
    return out


SOUNDS = {f.__name__: f for f in [pop, tink, ding, cash, whoosh, boing, flip, tick, drumroll, tada, trombone, bell, cricket, snip, hiss]}


def main():
    path, duration, cues = sys.argv[1], float(sys.argv[2]), json.loads(sys.argv[3])
    track = [0.0] * int(duration * SR)
    for cue in cues:
        t, name, *param = cue
        clip = SOUNDS[name](*param)
        start = int(t * SR)
        for i, v in enumerate(clip):
            if start + i < len(track):
                track[start + i] += v
    peak = max(1e-9, max(abs(v) for v in track))
    gain = min(1.0, 0.9 / peak)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v * gain)) * 32767)) for v in track))


if __name__ == '__main__':
    main()
