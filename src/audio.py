"""Synthesizes the whole soundtrack (chiptune music + SFX + gibberish voices)
from build/events.json. Pure numpy, no samples.  ->  build/audio.wav"""
import json
import wave
import numpy as np

SR = 44100
DUR = 29.5
N = int(SR * DUR)
music = np.zeros(N)
sfx = np.zeros(N)
rng = np.random.default_rng(67)


# ------------------------------------------------------------ primitives
def t_arr(d):
    return np.arange(int(SR * d)) / SR


def osc(freq, d, kind="square", duty=0.5):
    t = t_arr(d)
    f = np.broadcast_to(freq, t.shape) if np.ndim(freq) else np.full(t.shape, freq)
    ph = np.cumsum(f) / SR
    frac = ph % 1.0
    if kind == "square":
        return np.where(frac < duty, 1.0, -1.0)
    if kind == "tri":
        return 4 * np.abs(frac - 0.5) - 1
    if kind == "saw":
        return 2 * frac - 1
    return np.sin(2 * np.pi * ph)


def env(n, a=0.005, d=0.1, s=0.0, r=0.05, total=None):
    """ADSR envelope with n samples."""
    e = np.zeros(n)
    ai, di, ri = int(a * SR), int(d * SR), int(r * SR)
    ai = max(1, min(ai, n)); e[:ai] = np.linspace(0, 1, ai)
    end_d = min(n, ai + di)
    if end_d > ai:
        e[ai:end_d] = np.linspace(1, s, end_d - ai)
    e[end_d:] = s
    if ri > 0 and s > 0:
        ri = min(ri, n); e[-ri:] *= np.linspace(1, 0, ri)
    return e


def band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def noise(d):
    return rng.uniform(-1, 1, int(SR * d))


def add(buf, sig, t, gain=1.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(sig) <= 0:
        return
    s = sig[max(0, -i):]
    i = max(0, i)
    s = s[: len(buf) - i]
    buf[i:i + len(s)] += s * gain


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def decay(n, rate):
    return np.exp(-np.arange(n) / SR * rate)


# ------------------------------------------------------------ music
BPM = 128
BEAT = 60 / BPM
E8 = BEAT / 2

def kick(t, g=0.9):
    d = 0.22; tt = t_arr(d)
    f = 150 * np.exp(-tt * 28) + 45
    add(music, osc(f, d, "sine") * decay(len(tt), 14), t, g)

def snare(t, g=0.35):
    n = band(noise(0.18), 900, 9000) * decay(int(0.18 * SR), 22)
    add(music, n + osc(190, 0.18, "tri") * decay(int(0.18 * SR), 30) * 0.4, t, g)

def hat(t, g=0.12):
    add(music, band(noise(0.05), 6000, 16000) * decay(int(0.05 * SR), 70), t, g)

def pluck(t, m, d, kind="square", g=0.12, duty=0.5):
    s = osc(note(m), d, kind, duty)
    add(music, s * env(len(s), 0.004, d * 0.9, 0.0), t, g)

PROG_MAJOR = [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [57, 60, 64]), (41, [57, 60, 65])]  # C G Am F

def section_chill(t0, t1, gain=1.0):
    t = t0; bar = 0
    while t < t1 - 1e-6:
        root, ch = PROG_MAJOR[bar % 4]
        for i in range(8):
            tt = t + i * E8
            if tt >= t1: break
            pluck(tt, root + (12 if i % 2 else 0), E8 * 0.9, "tri", 0.22 * gain)
            pluck(tt, ch[[0, 1, 2, 1][i % 4]] + 12, E8 * 0.8, "square", 0.05 * gain, 0.25)
            if i % 2 == 1: hat(tt, 0.06 * gain)
            if i in (0, 4): kick(tt, 0.5 * gain)
        t += BEAT * 4; bar += 1

LEAD = [72, 74, 76, 79, 76, 74, 72, 67, 69, 72, 74, 76, 74, 72, 74, 79]

def section_hype(t0, t1, gain=1.0):
    t = t0; bar = 0
    while t < t1 - 1e-6:
        root, ch = PROG_MAJOR[bar % 4]
        for i in range(8):
            tt = t + i * E8
            if tt >= t1: break
            pluck(tt, root, E8 * 0.85, "square", 0.11 * gain, 0.3)
            pluck(tt, root + 12, E8 * 0.5, "tri", 0.12 * gain)
            hat(tt, 0.08 * gain)
            if i % 2 == 0: kick(tt, 0.75 * gain)
            if i in (2, 6): snare(tt, 0.32 * gain)
            m = LEAD[(bar % 2) * 8 + i]
            pluck(tt, m, E8 * 0.95, "square", 0.075 * gain, 0.5)
        t += BEAT * 4; bar += 1

def section_tense(t0, t1):
    t = t0; i = 0
    while t < t1:
        m = [45, 45, 48, 44][(i // 4) % 4]
        pluck(t, m, E8 * 0.4, "saw", 0.14)
        pluck(t, m + 24, E8 * 0.2, "square", 0.04, 0.125)
        if i % 4 == 0: kick(t, 0.6)
        t += E8 / 2 * 1.0 + 0.0; i += 1

def scratch(t, g=0.5):
    d = 0.35; tt = t_arr(d)
    f = 900 * (1 - tt / d) ** 2 + 120 + 300 * np.sin(tt * 60)
    s = band(osc(f, d, "saw") * 0.6 + noise(d) * 0.4, 200, 5000) * env(len(tt), 0.005, d, 0)
    add(sfx, s, t, g)

def fanfare(t):
    seq = [(0, [60, 64, 67], 0.16), (0.18, [60, 64, 67], 0.16), (0.36, [60, 64, 67], 0.16), (0.54, [65, 69, 72], 0.5), (1.08, [67, 71, 74], 0.3), (1.4, [72, 76, 79, 84], 1.1)]
    for dt, ch, d in seq:
        for m in ch:
            s = osc(note(m) * (1 + 0.004 * np.sin(t_arr(d) * 30)), d, "saw") * 0.5 + osc(note(m), d, "square", 0.3) * 0.5
            s = band(s, 100, 6000) * env(len(s), 0.01, d * 0.3, 0.7, 0.08)
            add(music, s, t + dt, 0.075)
    for dt in (0, 0.54, 1.4):
        kick(t + dt, 0.9); snare(t + dt, 0.3)

def sad_trombone(t):
    for i, (m, d) in enumerate([(55, 0.32), (54, 0.32), (53, 0.32), (52, 0.9)]):
        tt = t_arr(d)
        vib = 1 + (0.02 * np.sin(tt * 2 * np.pi * 6) if i == 3 else 0)
        s = band(osc(note(m) * vib, d, "saw"), 80, 2200) * env(len(tt), 0.03, 0.05, 0.8, 0.12)
        add(music, s, t + i * 0.34, 0.16)

# timeline
section_chill(0.0, 10.8)
scratch(10.8)
section_tense(11.45, 13.8)
# determination drone
d = 1.2; s = osc(note(36), d, "saw") * 0.5 + osc(note(43), d, "saw") * 0.5
add(music, band(s, 40, 700) * np.linspace(0, 1, len(s)) ** 2, 13.8, 0.25)
section_hype(15.0, 18.45)
scratch(18.45, 0.6)
section_hype(20.6, 21.7, 0.9)
fanfare(21.9)
section_hype(24.0, 24.7, 0.7)
sad_trombone(25.3)
section_chill(26.9, DUR, 0.9)

# ------------------------------------------------------------ sfx
def sfx_jump(t):
    d = 0.13; f = np.linspace(320, 820, int(d * SR))
    add(sfx, osc(f, d, "square", 0.25) * env(len(f), 0.002, d, 0), t, 0.12)

def sfx_land(t, g=0.45):
    d = 0.09; tt = t_arr(d)
    add(sfx, osc(110 * np.exp(-tt * 20) + 50, d, "sine") * decay(len(tt), 35) + band(noise(d), 100, 1500) * decay(len(tt), 50) * 0.3, t, g)

def sfx_thud(t):
    d = 0.7; tt = t_arr(d)
    s = osc(90 * np.exp(-tt * 6) + 30, d, "sine") * decay(len(tt), 5) + band(noise(d), 40, 900) * decay(len(tt), 9) * 0.7
    add(sfx, s, t, 0.9)

def sfx_whistle(t, d):
    f = np.linspace(1600, 500, int(d * SR))
    add(sfx, osc(f, d, "sine") * np.linspace(0.3, 1, len(f)), t, 0.12)

def sfx_splash(t):
    d = 0.9; tt = t_arr(d)
    s = band(noise(d), 150, 3000) * decay(len(tt), 5) * 0.8
    sizzle = band(noise(d), 4000, 12000) * np.exp(-((tt - 0.35) ** 2) / 0.05) * 0.5
    blub = osc(140 * np.exp(-tt * 3) + 60, d, "sine") * decay(len(tt), 7) * 0.6
    add(sfx, s + sizzle + blub, t, 0.55)

def sfx_respawn(t):
    for i, m in enumerate([72, 76, 79, 84, 88]):
        d = 0.35; s = osc(note(m), d, "sine") * decay(int(d * SR), 9) + osc(note(m) * 2, d, "sine") * decay(int(d * SR), 14) * 0.3
        add(sfx, s, t + i * 0.05, 0.1)

def sfx_steps(t, d):
    k = 0.0
    while k < d:
        add(sfx, band(noise(0.04), 300, 3000) * decay(int(0.04 * SR), 90), t + k, 0.12); k += 0.13

def sfx_pop(t, g=0.25):
    d = 0.09; f = np.linspace(400, 1300, int(d * SR))
    add(sfx, osc(f, d, "sine") * env(len(f), 0.002, d, 0), t, g)

def sfx_whoosh(t):
    d = 0.6; tt = t_arr(d)
    s = band(noise(d), 300, 2500) * np.sin(np.pi * tt / d) ** 2
    add(sfx, s, t - 0.15, 0.35)

def sfx_counter(t, big=False):
    if big:
        d = 1.0; tt = t_arr(d)
        add(sfx, osc(55 * np.exp(-tt * 1.5) + 35, d, "sine") * decay(len(tt), 3) + band(noise(d), 60, 2000) * decay(len(tt), 8) * 0.5, t, 0.9)
        for m in (45, 52, 57):
            add(sfx, band(osc(note(m), 1.0, "saw"), 50, 1800) * decay(int(SR), 2.5), t, 0.08)
    else:
        add(sfx, osc(1200, 0.05, "square", 0.25) * decay(int(0.05 * SR), 60), t, 0.18)
        add(sfx, band(noise(0.25), 80, 1200) * decay(int(0.25 * SR), 14), t, 0.4)

def sfx_pickup(t):
    for i, m in enumerate([84, 88, 91, 96]):
        add(sfx, osc(note(m), 0.4, "tri") * decay(int(0.4 * SR), 8), t + i * 0.06, 0.12)

def sfx_confetti(t):
    r = np.random.default_rng(5)
    for _ in range(40):
        tt = t + r.uniform(0, 1.6)
        add(sfx, band(noise(0.03), 1500, 9000) * decay(int(0.03 * SR), 120), tt, r.uniform(0.05, 0.18))
    add(sfx, band(noise(0.35), 200, 4000) * decay(int(0.35 * SR), 10), t, 0.5)

def sfx_sting(t):
    for m in (60, 64, 67, 72):
        s = band(osc(note(m), 1.6, "saw") * 0.5 + osc(note(m) * 1.005, 1.6, "square", 0.3) * 0.5, 80, 5000)
        add(music, s * env(len(s), 0.01, 0.3, 0.5, 0.6), t, 0.07)
    kick(t, 0.9)

# --- gibberish voices
VOICE = {"tim": dict(base=330, kind="square", duty=0.35), "pro": dict(base=190, kind="saw", duty=0.5)}

def voice(t, who, dur, text, shout):
    v = VOICE[who]
    if shout:  # one long vowel wail ("AAAAA" / "NOOOO" / "wait WHAT")
        d = max(0.4, dur); tt = t_arr(d)
        pitch = v["base"] * (2.0 if who == "tim" else 1.9) * (1 - 0.35 * (tt / d) ** 1.5) * (1 + 0.03 * np.sin(tt * 2 * np.pi * 7))
        s = osc(pitch, d, "saw") * 0.6 + osc(pitch * 1.01, d, "square", 0.3) * 0.4
        s = band(s, 200, 3500) * env(len(tt), 0.03, 0.1, 0.9, 0.15)
        add(sfx, s, t, 0.22)
        return
    letters = [c for c in text.lower() if c.isalpha()]
    syl = max(3, len(letters) // 2)
    step = dur / syl
    for i in range(syl):
        c = letters[min(len(letters) - 1, i * 2)]
        semis = (ord(c) * 7) % 7 - 3
        f = v["base"] * 2 ** (semis / 12) * (1.12 if i == syl - 1 and text.endswith("?") else 1)
        d = step * 0.8; tt = t_arr(d)
        glide = f * (1 + 0.15 * np.sin(np.pi * tt / d))
        s = osc(glide, d, v["kind"], v["duty"])
        s = band(s, 150, 4000) * env(len(tt), 0.006, d * 0.6, 0.3, 0.02)
        add(sfx, s, t + i * step, 0.13)


events = json.load(open("build/events.json"))
for e in events:
    t, k = e["t"], e["type"]
    if k == "jump": sfx_jump(t)
    elif k == "land": sfx_land(t)
    elif k == "thud": sfx_thud(t)
    elif k == "fallwhistle": sfx_whistle(t, e["dur"])
    elif k == "splash": sfx_splash(t)
    elif k == "respawn": sfx_respawn(t)
    elif k == "steps": sfx_steps(t, e["dur"])
    elif k == "voice": voice(t, e["who"], e["dur"], e["text"], e["shout"])
    elif k == "counter": sfx_counter(t)
    elif k == "counterbig": sfx_counter(t, True)
    elif k == "pop": sfx_pop(t)
    elif k == "whoosh": sfx_whoosh(t)
    elif k == "pickup": sfx_pickup(t)
    elif k == "confetti": sfx_confetti(t)
    elif k == "win": pass  # fanfare lives in the music track
    elif k == "sting": sfx_sting(t)

# ------------------------------------------------------------ mix
mix = music * 0.8 + sfx
mix[-int(SR * 1.2):] *= np.linspace(1, 0, int(SR * 1.2))
mix = np.tanh(mix * 1.3) / np.tanh(1.3)          # soft limiter
mix /= max(1e-9, np.max(np.abs(mix))) / 0.89
stereo = np.stack([mix, mix], axis=1)
pcm = (stereo * 32767).astype(np.int16)
with wave.open("build/audio.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote build/audio.wav", DUR, "s")
