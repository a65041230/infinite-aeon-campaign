"""Draft a beat-synced plan.json from a folder of clips/photos and a music track.

Usage: python autoplan.py materials/ music.mp3 [-o plan.json] [--seconds 15]
                          [--beats-per-shot 2] [--music-start 0]

Shot starts on bar downbeats get the cutout transition, other accents get
zoom/flash, the rest are hard cuts.

--style fast alternates hero shots with rapid photo bursts (eighth, then
sixteenth notes leading into each bar), the photo-dump montage look.

Edit the resulting plan.json by hand
(in points, captions, transitions) before rendering.
"""
import argparse
import json
import os

import cv2

from beats import analyze
from render import IMAGE_EXT

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}


def duration(path):
    if os.path.splitext(path)[1].lower() in IMAGE_EXT:
        return None
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    return cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("materials")
    ap.add_argument("music")
    ap.add_argument("-o", "--out", default="plan.json")
    ap.add_argument("--seconds", type=float, default=15.0)
    ap.add_argument("--beats-per-shot", type=int, default=2)
    ap.add_argument("--music-start", type=float, default=0.0)
    ap.add_argument("--style", choices=["normal", "fast"], default="normal")
    a = ap.parse_args()

    out_dir = os.path.dirname(os.path.abspath(a.out))
    files = sorted(
        os.path.join(a.materials, f) for f in os.listdir(a.materials)
        if os.path.splitext(f)[1].lower() in IMAGE_EXT | VIDEO_EXT
    )
    if not files:
        raise SystemExit(f"no images or videos in {a.materials}")

    bt = analyze(a.music, a.music_start, a.seconds + 5)
    beats_path = os.path.join(out_dir, "beats.json")
    json.dump(bt, open(beats_path, "w"), indent=2)
    downbeats = {round(t, 3) for t in bt["downbeats"]}
    accents = {round(t, 3) for t in bt["accents"]}
    beats = bt["beats"]

    shots, used, b, i = [], {}, 0, 0
    images = [f for f in files if os.path.splitext(f)[1].lower() in IMAGE_EXT]
    heroes = [f for f in files if f not in images] or images
    if a.style == "fast" and images:
        # Per 2 bars: hero (cutout on the bar) | 8th-note burst | hero (zoom) | 16th-note burst.
        pattern = [("hero", 2, "cutout"), ("burst", 2, 0.5), ("hero", 2, "zoom"), ("burst", 2, 0.25)]
        pi = hi = ii = 0
        while b < len(beats) and beats[b] < a.seconds:
            kind, n, opt = pattern[pi % len(pattern)]
            if kind == "hero":
                f = heroes[hi % len(heroes)]
                hi += 1
                shot = {"src": os.path.relpath(f, out_dir), "beats": n,
                        "transition": "cut" if not shots else opt}
                d = duration(f)
                if d:
                    start = used.get(f, 0.0)
                    if start + n * 60 / bt["tempo"] > d:
                        start = 0.0
                    shot["in"] = round(start, 2)
                    used[f] = start + n * 60 / bt["tempo"]
            else:
                count = int(n / opt)
                pick = [images[(ii + j) % len(images)] for j in range(count)]
                ii += count
                shot = {"burst": [os.path.relpath(f, out_dir) for f in pick],
                        "beats": n, "per_image": opt, "first": "flash", "transition": "zoom"}
            shots.append(shot)
            b += n
            pi += 1
    while a.style == "normal" and b < len(beats) and beats[b] < a.seconds:
        f = files[i % len(files)]
        n = a.beats_per_shot
        t = round(beats[b], 3)
        if i == 0:
            tr = "cut"
        elif t in downbeats:
            tr = "cutout"
        elif t in accents:
            tr = "flash" if i % 2 else "zoom"
        else:
            tr = "cut"
        shot = {"src": os.path.relpath(f, out_dir), "beats": n, "transition": tr}
        d = duration(f)
        if d:
            need = n * 60 / bt["tempo"]
            start = used.get(f, 0.0)
            if start + need > d:
                start = 0.0
            shot["in"] = round(start, 2)
            used[f] = start + need
            shot["pulse"] = n >= 4
        shots.append(shot)
        b += n
        i += 1

    plan = {
        "music": os.path.relpath(a.music, out_dir),
        "music_start": a.music_start,
        "beats": "beats.json",
        "fps": 30,
        "size": [1080, 1920],
        "output": "out.mp4",
        "shots": shots,
        "captions": [],
    }
    json.dump(plan, open(a.out, "w"), indent=2, ensure_ascii=False)
    print(f"{len(shots)} shots over {beats[b - 1] if b else 0:.1f}s at {bt['tempo']:.1f} BPM -> {a.out}")


if __name__ == "__main__":
    main()
