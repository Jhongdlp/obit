#!/usr/bin/env python3
"""Renders docs/demo.gif for the README from real obit output.

    python3 scripts/demo-gif.py

Kept in the repo so the GIF is reproducible: the text below is copied from an
actual run, and nothing here invents numbers.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1000, 600
BG, CHROME = "#0f1117", "#171a21"
FG, DIM, GREEN, YELLOW, RED, CYAN, WHITE = (
    "#c9d1d9", "#6e7681", "#3fb950", "#d29922", "#f85149", "#58a6ff", "#f0f6fc",
)
MONO = "/usr/share/fonts/TTF/CascadiaCode.ttf"
EMOJI = "/usr/share/fonts/noto/NotoColorEmoji.ttf"
SIZE, LH, PAD, TOP = 19, 30, 34, 78

font = ImageFont.truetype(MONO, SIZE)
bold = ImageFont.truetype(MONO, SIZE)
try:  # NotoColorEmoji is a bitmap font: it only renders at its native size
    emoji = ImageFont.truetype(EMOJI, 109)
except OSError:
    emoji = None


def chrome(d):
    d.rectangle([0, 0, W, TOP - 26], fill=CHROME)
    for i, c in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        d.ellipse([PAD + i * 22, 18, PAD + i * 22 + 12, 30], fill=c)
    d.text((W / 2, 24), "obit", font=ImageFont.truetype(MONO, 15), fill=DIM, anchor="mt")


def emoji_at(img, ch, x, y):
    """Draw a color emoji by rendering it big and scaling down."""
    if not emoji:
        return
    tile = Image.new("RGBA", (140, 140), (0, 0, 0, 0))
    ImageDraw.Draw(tile).text((0, 0), ch, font=emoji, embedded_color=True)
    tile = tile.crop(tile.getbbox() or (0, 0, 1, 1)).resize((22, 22), Image.LANCZOS)
    img.paste(tile, (int(x), int(y)), tile)


def frame(lines, cursor_on=False):
    """lines: list of (text, color) or ('EMOJI', char, rest, color)."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    chrome(d)
    y = TOP
    for ln in lines:
        if ln[0] == "EMOJI":
            _, ch, rest, col = ln
            emoji_at(img, ch, PAD + 22, y + 2)
            d.text((PAD + 58, y), rest, font=bold, fill=col)
        else:
            text, col = ln
            d.text((PAD, y), text, font=font, fill=col)
            if cursor_on and ln is lines[-1]:
                w = d.textlength(text, font=font)
                d.rectangle([PAD + w + 2, y + 3, PAD + w + 12, y + SIZE + 6], fill=FG)
        y += LH
    return img


PROMPT = "~/code/notchAgent $ "
CMD = "npx obit"

# Copied verbatim from a real run. Do not edit to look better.
RUN = [
    ("looking for dead code...", DIM),
    ("26 candidates, working out how each one died...", DIM),
    ("", FG),
    ("EMOJI", "⚰", " notchAgent", WHITE),
    ("      1 orphaned — replaced and left behind", GREEN),
    ("      21 stillborn — written, never wired up", YELLOW),
    ("      4 probably false positives — the framework uses them", RED),
    ("", FG),
    ("   → OBITUARY.md", CYAN),
]

REPORT = [
    (PROMPT + "head OBITUARY.md", WHITE),
    ("", FG),
    ("## High confidence — orphaned, with a replacement", GREEN),
    ("", FG),
    ("### src/design/tokens.ts:328 — COLOR", WHITE),
    ("Its last reference was removed in 507d476a.", FG),
    ("- Died in 507d476a (2026-08-31)", FG),
    ("  «feat: release v0.1.0 - native desktop dock»", DIM),
    ("- Declared in that same commit:", FG),
    ("  ACCENT_DARK, ACCENT_LIGHT, AGENT_COLOR", CYAN),
    ("- Verify: git show 507d476a -- src/design/tokens.ts", FG),
    ("- Dead for 14 days", DIM),
]

frames, delays = [], []


def push(img, ms):
    frames.append(img)
    delays.append(ms)


# 1. type the command
for i in range(len(CMD) + 1):
    push(frame([(PROMPT + CMD[:i], WHITE)], cursor_on=True), 55)
push(frame([(PROMPT + CMD, WHITE)]), 500)

# 2. output appears line by line
shown = [(PROMPT + CMD, WHITE)]
for ln in RUN:
    shown = shown + [ln]
    # a blank line changes nothing on screen: don't spend time on it
    push(frame(shown), 420 if ln[0] == "EMOJI" else (40 if ln[0] == "" else 220))
push(frame(shown), 2600)

# 3. the report itself
for i in range(1, len(REPORT) + 1):
    push(frame(REPORT[:i]), 40 if REPORT[i - 1][0] == "" else 150)
push(frame(REPORT), 3800)

out = "docs/demo.gif"
frames[0].save(
    out, save_all=True, append_images=frames[1:], duration=delays,
    loop=0, optimize=True, disposal=2,
)
print(f"{out}  {len(frames)} frames")
