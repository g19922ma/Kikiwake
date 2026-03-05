#!/usr/bin/env python3
"""
アルゴリズムで変更された6件を詳細分析:
ID 13 つく: 0.803 → 1.070
ID 17 ちは: 1.052 → 0.160  (誤) ← 元値保持すべき
ID 18 す: 0.943 → 1.160
ID 23 つき: 1.043 → 1.300
ID 40 しの: 1.088 → 1.340
ID 82 おも: 1.088 → 1.250
"""

import subprocess
import json
import numpy as np
from scipy.signal import butter, sosfilt

SOUNDS_DIR = "/Users/maruyama/Documents/GitHub/Kikiwake/sounds_kimoto"
SR = 44100

def load_pcm(filepath, sr=44100):
    cmd = ["ffmpeg", "-i", filepath, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"]
    result = subprocess.run(cmd, capture_output=True)
    raw = result.stdout
    if not raw:
        return None
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

def highpass_filter(samples, cutoff=100, sr=44100, order=4):
    sos = butter(order, cutoff / (sr / 2), btype="high", output="sos")
    return sosfilt(sos, samples)

def analyze_frames(samples, filtered, sr=44100, frame_ms=10, start_sec=0.0, end_sec=2.0):
    frame_size = int(sr * frame_ms / 1000)
    amp_thresh = 10 ** (-30 / 20)

    start_frame = int(start_sec * sr / frame_size)
    end_frame = int(end_sec * sr / frame_size)

    print(f"{'時刻':>8} {'RMS_hp':>10} {'ZCR':>8} {'active':>8}")
    print("-" * 45)

    for fi in range(start_frame, min(end_frame, len(samples) // frame_size)):
        i = fi * frame_size
        frame_hp = filtered[i:i+frame_size]

        rms_hp = np.sqrt(np.mean(frame_hp**2))
        zcr = np.sum(np.abs(np.diff(np.sign(frame_hp)))) / (2 * len(frame_hp))
        t = i / sr

        active = "ACTIVE" if (rms_hp > amp_thresh and zcr < 0.25) else ("-" if rms_hp < amp_thresh else "ZCR_high")
        print(f"{t:>8.3f} {rms_hp:>10.5f} {zcr:>8.3f} {active:>8}")

cases = [
    ("つく", 13, 0.803, 1.070),
    ("ちは", 17, 1.052, 0.160),  # 誤変更
    ("す", 18, 0.943, 1.160),
    ("つき", 23, 1.043, 1.300),
    ("しの", 40, 1.088, 1.340),
    ("おも", 82, 1.088, 1.250),
]

for name, id_, old, new in cases:
    filepath = f"{SOUNDS_DIR}/{name} 上.m4a"
    samples = load_pcm(filepath)
    filtered = highpass_filter(samples)

    print(f"\n{'='*60}")
    print(f"ID {id_}: {name}  元値={old}s → アルゴリズム={new}s")
    print(f"{'='*60}")

    # 元値周辺 ±0.5s を表示
    start = max(0, old - 0.3)
    end = old + 0.5
    analyze_frames(samples, filtered, start_sec=start, end_sec=end)
