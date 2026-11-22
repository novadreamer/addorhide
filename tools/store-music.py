"""Calm background music for the promo video, composed and synthesised here (no samples, nothing licensed).

usage: python tools/store-music.py <out.wav> <seconds>

D major, 72 bpm, two bars per chord: Dmaj9 - Bm9 - Gmaj9 - Asus2/A. Layers: a warm detuned pad, a soft sine bass,
a quiet plucked arpeggio with a stereo echo, and a synthetic room reverb. 48 kHz stereo, faded in and out.
"""
import sys
import wave

import numpy as np

RATE = 48000
BPM = 72
BEAT = 60.0 / BPM
CHORD_LEN = 8 * BEAT          # two bars of 4/4

# MIDI notes: pad voicing (mid register) and arpeggio tones (upper register) per chord.
CHORDS = [
    {"bass": 38, "pad": [50, 54, 57, 61, 64], "arp": [62, 66, 69, 73, 76, 73, 69, 66]},   # Dmaj9
    {"bass": 35, "pad": [47, 50, 54, 57, 61], "arp": [59, 62, 66, 69, 73, 69, 66, 62]},   # Bm9
    {"bass": 31, "pad": [50, 54, 55, 59, 62], "arp": [62, 67, 71, 74, 78, 74, 71, 67]},   # Gmaj9
    {"bass": 33, "pad": [49, 52, 57, 59, 64], "arp": [61, 64, 69, 71, 76, 71, 69, 64]},   # Asus2/A
]


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12.0)


def envelope(n, attack, release):
    env = np.ones(n)
    # A short final segment gets proportionally shorter fades rather than overrunning its length.
    a, r = min(int(attack * RATE), n // 2), min(int(release * RATE), n // 2)
    if a:
        env[:a] = np.linspace(0, 1, a) ** 2
    if r:
        env[-r:] *= np.linspace(1, 0, r) ** 2
    return env


def one_pole_lowpass(signal, cutoff):
    alpha = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    out = np.empty_like(signal)
    acc = 0.0
    # Vectorised enough: process in blocks with a running state.
    for start in range(0, len(signal), 4096):
        block = signal[start:start + 4096]
        res = np.empty_like(block)
        for i, x in enumerate(block):
            acc += alpha * (x - acc)
            res[i] = acc
        out[start:start + 4096] = res
    return out


def main(path, seconds):
    total = int(seconds * RATE) + RATE
    left = np.zeros(total)
    right = np.zeros(total)
    t_all = np.arange(total) / RATE
    rng = np.random.default_rng(7)

    chord_samples = int(CHORD_LEN * RATE)
    overlap = int(1.2 * RATE)
    count = int(np.ceil(total / chord_samples)) + 1
    for k in range(count):
        chord = CHORDS[k % len(CHORDS)]
        start = k * chord_samples
        n = min(chord_samples + overlap, total - start)
        if n <= 0:
            break
        t = np.arange(n) / RATE
        env = envelope(n, 1.4, 1.6)
        # Pad: each note a pair of slightly detuned sines (one per side) with a touch of second harmonic.
        for note in chord["pad"]:
            f = hz(note)
            phase = rng.uniform(0, 2 * np.pi)
            l = np.sin(2 * np.pi * f * 0.998 * t + phase) + 0.18 * np.sin(4 * np.pi * f * t + phase)
            r = np.sin(2 * np.pi * f * 1.002 * t + phase * 1.3) + 0.18 * np.sin(4 * np.pi * f * t + phase)
            left[start:start + n] += 0.055 * env * l
            right[start:start + n] += 0.055 * env * r
        # Bass: soft sine, breathing with the chord.
        fb = hz(chord["bass"])
        bass = np.sin(2 * np.pi * fb * t) * envelope(n, 0.6, 1.4) * 0.11
        left[start:start + n] += bass
        right[start:start + n] += bass
        # Arpeggio: eighth notes, plucked (fast attack, exponential decay), panned left and right in turn.
        step = BEAT / 2
        for i in range(int(CHORD_LEN / step)):
            note = chord["arp"][i % len(chord["arp"])]
            s = start + int(i * step * RATE)
            m = min(int(1.6 * RATE), total - s)
            if m <= 0:
                continue
            tt = np.arange(m) / RATE
            f = hz(note)
            pluck = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 6)) * np.exp(-tt * 3.2)
            pluck[: int(0.004 * RATE)] *= np.linspace(0, 1, int(0.004 * RATE))
            gain = 0.045 * (1.0 if i % 8 == 0 else 0.8)
            pan = 0.35 if i % 2 else -0.35
            left[s:s + m] += gain * (1 - pan) * pluck
            right[s:s + m] += gain * (1 + pan) * pluck

    # Stereo echo on everything (dotted eighth), then a soft synthetic room.
    delay = int(BEAT * 0.75 * RATE)
    for _ in range(3):
        left[delay:] += 0.22 * right[:-delay]
        right[delay:] += 0.22 * left[:-delay]
    ir_len = int(2.2 * RATE)
    ir_t = np.arange(ir_len) / RATE
    ir = rng.standard_normal(ir_len) * np.exp(-ir_t * 3.0)
    ir /= np.sqrt(np.sum(ir ** 2))
    def reverb(x):
        size = 1 << int(np.ceil(np.log2(len(x) + ir_len)))
        wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
        return 0.78 * x + 0.32 * wet
    left, right = reverb(left), reverb(right)
    left = one_pole_lowpass(left, 6500)
    right = one_pole_lowpass(right, 6500)

    n = int(seconds * RATE)
    left, right = left[:n], right[:n]
    fade = envelope(n, 2.0, 3.5)
    left *= fade
    right *= fade
    peak = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-9)
    scale = 0.6 / peak
    data = (np.stack([left, right], axis=1) * scale * 32767).astype(np.int16)
    with wave.open(path, "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(data.tobytes())


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]))
