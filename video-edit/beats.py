"""Detect beats and accents in a music track for beat-synced editing.

Usage: python beats.py music.mp3 [-o beats.json] [--start 0] [--duration 30]

Output JSON:
  tempo     estimated BPM
  beats     beat times in seconds (relative to --start)
  accents   subset of beats with the strongest onsets (good spots for big transitions)
  downbeats every 4th beat, phase chosen by accent strength (bar starts)
"""
import argparse
import json

import librosa
import numpy as np


def analyze(path, start=0.0, duration=None):
    y, sr = librosa.load(path, sr=22050, offset=start, duration=duration)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    strength = onset_env[beat_frames] if len(beat_frames) else np.array([])

    # Bar phase: pick the offset (0-3) whose beats carry the most onset energy.
    phase = int(np.argmax([strength[p::4].sum() for p in range(4)])) if len(strength) >= 4 else 0
    downbeats = beat_times[phase::4]

    # Accents: beats in the top 25% of onset strength.
    accents = beat_times[strength >= np.percentile(strength, 75)] if len(strength) else []

    return {
        "tempo": float(np.atleast_1d(tempo)[0]),
        "duration": float(len(y) / sr),
        "beats": [round(float(t), 3) for t in beat_times],
        "accents": [round(float(t), 3) for t in accents],
        "downbeats": [round(float(t), 3) for t in downbeats],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("music")
    ap.add_argument("-o", "--out", default="beats.json")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--duration", type=float, default=None)
    a = ap.parse_args()
    data = analyze(a.music, a.start, a.duration)
    with open(a.out, "w") as f:
        json.dump(data, f, indent=2)
    print(f"tempo {data['tempo']:.1f} BPM, {len(data['beats'])} beats, "
          f"{len(data['accents'])} accents -> {a.out}")


if __name__ == "__main__":
    main()
