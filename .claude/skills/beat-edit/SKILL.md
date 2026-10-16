---
name: beat-edit
description: Cut a folder of clips/photos to a music track as a vertical beat-synced reel with cutout (摳圖) pop transitions, punch zooms, flashes and captions. Use when the user gives materials + music and wants a 卡點 / 轉場 / Reels / TikTok style edit, or asks to analyze and replicate such an edit.
---

# Beat-synced cutout edit

Tools live in `video-edit/` (see its README for the plan format). Python env: `~/vedit-venv`
(create with `pip install -r video-edit/requirements.txt` if missing). Work inside
`video-edit/projects/<name>/`, which is git-ignored; never commit media.

## Steps

1. Inventory: `ffprobe` every file (duration, size, orientation). Look at 1–3 frames per clip
   (extract with ffmpeg, read the PNG) to know what each shot shows and where the subject sits.
2. Music: run `beats.py` on the track. Pick the section to use (usually the chorus/drop:
   find where accents get dense) and set `music_start`. Aim for 10–20 s unless told otherwise.
3. Draft with `autoplan.py`, then rewrite `plan.json` as an editor would (rules below).
4. `render.py --preview`, extract a contact sheet around each transition
   (`ffmpeg -ss T -t 0.6 -i out.mp4 -vf fps=15,scale=180:320,tile=9x1 -frames:v 1 sheet.png`)
   and look at it. Fix bad cutouts (switch model, change `in`, or downgrade to `zoom`).
5. Render full quality and send the file to the user.

## Editing rules

- Every cut on a beat. Shot length: 1 beat in fast/drop sections, 2 beats normal, 4 beats for
  hero shots. Accelerate toward the drop (4 → 2 → 1 → 1), then land on a hero shot.
- Photo-dump speed: put photo runs in `burst` shots at 0.5 beat per image, tightening to 0.25
  in the bar before a drop or hero shot (`autoplan.py --style fast` drafts this). Order burst
  photos by colour/subject so the flicker reads as one motion, not noise. Never burst faster
  than 0.25 beat (≈ 3–4 frames at 120 BPM / 30 fps).
- `cutout` only where the incoming shot's first frame has one clear subject on a separable
  background, and only on downbeats/big accents (≈ every 2 bars). Overuse kills the effect.
- Between cutouts: alternate `cut`, `zoom`, occasional `flash` on strong accents, `whip` when
  both shots have lateral motion. `pulse: true` on shots ≥ 4 beats.
- Match action across cuts (motion direction, eye line, subject position). Set `in` so the
  interesting motion starts right at the cut; trim dead frames.
- Open on the strongest visual within the first beat (hook). End on a hero shot through the fade.
- Captions: ≤ 12 Chinese characters per line, 2 lines max, one idea per caption, timed to whole
  shots or beats, `y` 0.7–0.8 so they clear the subject's face and the platform UI.

## Gaps and AI-generated shots

If the story needs a shot the materials lack, list the missing shots with a one-line prompt each
(subject, action, camera move, 9:16, 3–5 s) and generate them with Higgsfield using a cheap model,
only if the Higgsfield MCP/CLI is connected and the user agreed to spend credits. For a bridge
between two shots, use the outgoing last frame and incoming first frame as start/end frames.

## Reference videos

Instagram/TikTok are usually blocked from this sandbox: ask the user to upload the reference file.
To analyze one: detect cuts with
`ffmpeg -i ref.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep pts_time`,
run `beats.py` on its audio, compare cut times to beats (on-beat ratio, beats per shot), and
contact-sheet each cut to classify the transition.
