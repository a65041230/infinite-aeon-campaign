"""Render a beat-synced vertical edit from a plan.json.

Usage: python render.py plan.json [-o out.mp4] [--preview]

Every shot boundary lands on a music beat. Transitions (set on the incoming shot):
  cut     hard cut on the beat
  zoom    punch-in on the incoming shot
  flash   white flash on the beat
  whip    fast horizontal slide with motion blur
  cutout  the incoming shot's subject is cut out and pops in over the outgoing
          shot half a beat early, then its background drops in on the beat.
          The cutout comes from the incoming shot's first frame, so the hand-off
          is pixel-aligned.
Per-shot options: in (s), beats, speed, pulse (zoom bump on every beat),
push (slow zoom over the shot), anchor [x, y] crop focus 0-1.
See README.md for the plan format.
"""
import argparse
import json
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from beats import analyze

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "C:/Windows/Fonts/msjhbd.ttc",
]


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def ease_out_back(x):
    x = min(max(x, 0.0), 1.0)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


class Source:
    """Frame access by time for a video or a still image."""

    def __init__(self, path):
        self.path = path
        self.image = None
        if os.path.splitext(path)[1].lower() in IMAGE_EXT:
            self.image = cv2.imread(path)
            if self.image is None:
                sys.exit(f"cannot read image {path}")
            return
        self.cap = cv2.VideoCapture(path)
        if not self.cap.isOpened():
            sys.exit(f"cannot open video {path}")
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30.0
        self.count = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        self.idx = -1
        self.last = None

    def frame_at(self, t):
        if self.image is not None:
            return self.image
        target = min(max(int(round(t * self.fps)), 0), self.count - 1)
        if target < self.idx or target > self.idx + 90:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, target)
            self.idx = target - 1
        while self.idx < target:
            ok, f = self.cap.read()
            if not ok:
                break
            self.idx += 1
            self.last = f
        if self.last is None:
            sys.exit(f"no frames decoded from {self.path}")
        return self.last


def cover(frame, W, H, zoom=1.0, anchor=(0.5, 0.5), dx=0):
    """Scale to cover W x H (times zoom) and crop around anchor."""
    h, w = frame.shape[:2]
    s = max(W / w, H / h) * zoom
    nw, nh = max(W, int(math.ceil(w * s))), max(H, int(math.ceil(h * s)))
    r = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LINEAR)
    x = int((nw - W) * anchor[0]) + dx
    y = int((nh - H) * anchor[1])
    x = min(max(x, 0), nw - W)
    y = min(max(y, 0), nh - H)
    return r[y:y + H, x:x + W]


def alpha_over(dst, rgba, x=0, y=0):
    """Composite a BGRA image onto dst (BGR) at x, y in place."""
    h, w = rgba.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    src = rgba[y0 - y:y1 - y, x0 - x:x1 - x]
    a = src[:, :, 3:4].astype(np.float32) / 255.0
    roi = dst[y0:y1, x0:x1].astype(np.float32)
    dst[y0:y1, x0:x1] = (src[:, :, :3] * a + roi * (1 - a)).astype(np.uint8)


class Cutouts:
    def __init__(self, model, cache_dir):
        self.model = model
        self.cache_dir = cache_dir
        self.session = None
        os.makedirs(cache_dir, exist_ok=True)

    def get(self, frame, key):
        """Return a styled BGRA sticker (white stroke + shadow) and its centre."""
        path = os.path.join(self.cache_dir, f"{key}.png")
        if os.path.exists(path):
            rgba = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        else:
            from rembg import new_session, remove
            if self.session is None:
                self.session = new_session(self.model)
            rgb = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            out = np.array(remove(rgb, session=self.session))
            rgba = cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA)
            cv2.imwrite(path, rgba)

        alpha = rgba[:, :, 3]
        alpha = np.where(alpha > 40, alpha, 0).astype(np.uint8)
        H, W = alpha.shape
        k = max(3, W // 90) | 1
        stroke = cv2.dilate(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        shadow = cv2.GaussianBlur(stroke, (0, 0), W / 60)
        shadow = np.roll(shadow, (W // 80, W // 80), axis=(0, 1))

        out = np.zeros((H, W, 4), np.float32)
        def layer(color, a):
            a = a[:, :, None].astype(np.float32) / 255.0
            out[:, :, :3] = np.array(color, np.float32) * a + out[:, :, :3] * (1 - a)
            out[:, :, 3:] = a * 255 + out[:, :, 3:] * (1 - a)
        layer((0, 0, 0), (shadow * 0.55).astype(np.uint8))
        layer((255, 255, 255), stroke)
        a = alpha[:, :, None].astype(np.float32) / 255.0
        out[:, :, :3] = rgba[:, :, :3] * a + out[:, :, :3] * (1 - a)
        sticker = out.astype(np.uint8)

        ys, xs = np.nonzero(alpha > 128)
        centre = (float(xs.mean()), float(ys.mean())) if len(xs) else (W / 2, H / 2)
        return sticker, centre


def scaled_about(rgba, scale, centre):
    M = np.array([[scale, 0, centre[0] * (1 - scale)],
                  [0, scale, centre[1] * (1 - scale)]], np.float32)
    h, w = rgba.shape[:2]
    return cv2.warpAffine(rgba, M, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def find_font():
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return p
    try:
        return subprocess.run(["fc-match", "-f", "%{file}", ":lang=zh"],
                              capture_output=True, text=True).stdout or None
    except FileNotFoundError:
        return None


def caption_image(text, W, size, font_path):
    font = ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default()
    stroke = max(4, size // 12)
    lines = text.split("\n")
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    boxes = [probe.textbbox((0, 0), ln, font=font, stroke_width=stroke) for ln in lines]
    lh = max(b[3] - b[1] for b in boxes)
    h = int(lh * len(lines) * 1.2) + stroke * 2
    img = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, (ln, b) in enumerate(zip(lines, boxes)):
        x = (W - (b[2] - b[0])) // 2 - b[0]
        d.text((x, int(i * lh * 1.2) + stroke - b[1]), ln, font=font, fill=(255, 255, 255, 255),
               stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGBA2BGRA)


def expand_bursts(shots, base):
    """Expand {"burst": [files] | "dir/", "per_image": 0.5, ...} into one shot per image.

    A burst is the rapid photo montage: each image holds for per_image beats
    (0.5 = eighth notes, 0.25 = sixteenths) and snaps in with a punch zoom.
    """
    out = []
    for s in shots:
        if "burst" not in s:
            out.append(s)
            continue
        files = s["burst"]
        if isinstance(files, str):
            d = files if os.path.isabs(files) else os.path.join(base, files)
            files = sorted(os.path.join(files, f) for f in os.listdir(d)
                           if os.path.splitext(f)[1].lower() in IMAGE_EXT)
        per = s.get("per_image", 0.5)
        count = int(round(s["beats"] / per)) if "beats" in s else len(files)
        extra = {k: v for k, v in s.items() if k not in ("burst", "per_image", "beats", "transition")}
        for j in range(count):
            shot = dict(extra, src=files[j % len(files)], beats=per,
                        transition=s.get("transition", "zoom") if j else s.get("first", "flash"))
            shot.setdefault("push", False)
            out.append(shot)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan")
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--preview", action="store_true", help="half resolution, faster encode")
    a = ap.parse_args()

    base = os.path.dirname(os.path.abspath(a.plan))
    rel = lambda p: p if os.path.isabs(p) else os.path.join(base, p)
    plan = json.load(open(a.plan))
    out_path = a.out or rel(plan.get("output", "out.mp4"))

    fps = plan.get("fps", 30)
    W, H = plan.get("size", [1080, 1920])
    if a.preview:
        W, H = W // 2, H // 2
    music = rel(plan["music"])
    music_start = plan.get("music_start", 0.0)

    if plan.get("beats") and os.path.exists(rel(plan["beats"])):
        bt = json.load(open(rel(plan["beats"])))
    else:
        bt = analyze(music, music_start)
    beats, tempo = bt["beats"], bt["tempo"]
    period = 60.0 / tempo

    def whole_beat(k):
        if k < len(beats):
            return beats[k]
        return beats[-1] + (k - len(beats) + 1) * period

    def beat_time(k):
        """Time of beat k; fractional k interpolates (0.5 = eighth note)."""
        k0 = math.floor(k)
        t0 = whole_beat(k0)
        return t0 if k == k0 else t0 + (whole_beat(k0 + 1) - t0) * (k - k0)

    # Shot boundaries on beats; the first shot starts at t=0.
    b = plan.get("start_beat", 0)
    shots = []
    for i, s in enumerate(expand_bursts(plan["shots"], base)):
        n = s.get("beats", 2)
        t0 = 0.0 if i == 0 else beat_time(b)
        shots.append(dict(s, t0=t0, t1=beat_time(b + n), b0=b, b1=b + n))
        b += n
    total = shots[-1]["t1"]

    cut = Cutouts(plan.get("cutout_model", "u2net"), os.path.join(base, ".cutout_cache"))
    font = find_font()
    cap_size = int(plan.get("caption_size", 84) * W / 1080)
    captions = []
    for c in plan.get("captions", []):
        if "shot" in c:
            s = shots[c["shot"]]
            c0, c1 = s["t0"], s["t1"]
        else:
            c0 = beat_time(c["start_beat"])
            c1 = beat_time(c["start_beat"] + c.get("beats", 2))
        img = caption_image(c["text"], W, cap_size, font)
        captions.append((c0, c1, img, c.get("y", 0.72)))

    def shot_frame(i, t, extra_zoom=1.0, dx=0):
        """Frame of shot i at local time t (seconds since its start)."""
        s = shots[i]
        src = s["_src"]
        dur = s["t1"] - s["t0"]
        zoom = extra_zoom
        if s.get("push", src.image is not None):
            zoom *= 1.0 + 0.08 * (t / max(dur, 1e-6))
        if s.get("pulse"):
            # Zoom bump on every beat inside the shot.
            for k in range(math.floor(s["b0"]) + 1, math.ceil(s["b1"])):
                d = (s["t0"] + t) - beat_time(k)
                if 0 <= d < 0.15:
                    zoom *= 1.0 + 0.05 * (1 - d / 0.15)
        if s.get("transition") == "zoom":
            zoom *= 1.0 + 0.18 * (1 - ease_out(t / min(0.22, dur * 0.6)))
        f = src.frame_at(s.get("in", 0.0) + t * s.get("speed", 1.0))
        return cover(f, W, H, zoom, tuple(s.get("anchor", (0.5, 0.5))), dx)

    for i, s in enumerate(shots):
        s["_src"] = Source(rel(s["src"]))
    stickers = {}
    for i, s in enumerate(shots):
        if i > 0 and s.get("transition") == "cutout":
            first = shot_frame(i, 0.0)
            key = f"{os.path.basename(s['src'])}_{s.get('in', 0.0)}_{W}x{H}"
            print(f"cutout for shot {i} ({s['src']})", flush=True)
            stickers[i] = cut.get(first, key)
            s["_src"] = Source(rel(s["src"]))  # reset reader after the probe read

    nframes = int(round(total * fps))
    fade = min(0.6, total / 4)
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
           "-ss", str(music_start), "-t", f"{total:.3f}", "-i", music,
           "-map", "0:v", "-map", "1:a",
           "-af", f"afade=t=out:st={max(total - fade, 0):.3f}:d={fade:.3f}",
           "-c:v", "libx264", "-preset", "veryfast" if a.preview else "medium",
           "-crf", "23" if a.preview else "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out_path]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    si = 0
    for n in range(nframes):
        t = n / fps
        while si < len(shots) - 1 and t >= shots[si]["t1"]:
            si += 1
        s = shots[si]
        lt = t - s["t0"]
        nxt = shots[si + 1] if si + 1 < len(shots) else None
        to_end = s["t1"] - t
        tr_in = s.get("transition", "cut")
        tr_out = nxt.get("transition", "cut") if nxt else "cut"

        whip = 3 / fps * 2
        if si > 0 and tr_in == "whip" and lt < whip / 2:
            k = 1 - lt / (whip / 2)
            frame = shot_frame(si, lt, dx=0)
            frame = np.roll(frame, int(-W * 0.35 * k), axis=1)
        elif nxt and tr_out == "whip" and to_end < whip / 2:
            k = 1 - to_end / (whip / 2)
            frame = np.roll(shot_frame(si, lt), int(W * 0.35 * k), axis=1)
        else:
            frame = shot_frame(si, lt)
        if (si > 0 and tr_in == "whip" and lt < whip / 2) or \
           (nxt and tr_out == "whip" and to_end < whip / 2):
            kernel = np.zeros((1, max(3, W // 25)), np.float32)
            kernel[:] = 1.0 / kernel.size
            frame = cv2.filter2D(frame, -1, kernel)

        for j, (sticker, centre) in stickers.items():
            # The pop starts half a beat before the cutout shot, even if several
            # short burst shots play underneath it.
            T = shots[j]["t0"]
            lead = min(period * 0.5, T)
            if lead > 0 and T - lead <= t < T:
                p = 1 - (T - t) / lead
                frame = (frame * (1 - 0.35 * ease_out(p * 2))).astype(np.uint8)
                alpha_over(frame, scaled_about(sticker, 1.35 - 0.35 * ease_out_back(p * 1.6), centre))
        if si > 0 and tr_in == "cutout" and lt < 0.12:
            # Keep the stroke for a few frames so the sticker settles into the shot.
            sticker, centre = stickers[si]
            st = sticker.copy()
            st[:, :, 3] = (st[:, :, 3] * (1 - lt / 0.12)).astype(np.uint8)
            alpha_over(frame, st)

        if si > 0 and tr_in == "flash" and lt < 0.15:
            k = 0.9 * (1 - lt / 0.15)
            frame = (frame * (1 - k) + 255 * k).astype(np.uint8)

        for c0, c1, img, y in captions:
            if c0 <= t < c1:
                pop = 0.7 + 0.3 * ease_out_back((t - c0) / 0.18)
                ch, cw = img.shape[:2]
                big = np.zeros((ch * 2, cw, 4), np.uint8)
                big[ch // 2:ch // 2 + ch] = img
                big = scaled_about(big, pop, (cw / 2, ch))
                alpha_over(frame, big, 0, int(H * y) - ch)

        enc.stdin.write(frame.tobytes())
        if n % (fps * 2) == 0:
            print(f"\r{n}/{nframes} frames", end="", flush=True)

    enc.stdin.close()
    if enc.wait() != 0:
        sys.exit("ffmpeg failed")
    print(f"\nwrote {out_path} ({total:.2f}s, {len(shots)} shots, {tempo:.1f} BPM)")


if __name__ == "__main__":
    main()
