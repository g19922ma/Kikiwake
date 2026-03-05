#!/usr/bin/env python3
"""
おも (ID 82) の精密分析
元値: 1.088s (手作業)
アルゴリズム: 1.250s (ZCR=0.25)
差: 0.162s (0.15s超)
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

filepath = f"{SOUNDS_DIR}/おも 上.m4a"
samples = load_pcm(filepath)
filtered = highpass_filter(samples)

SR = 44100
frame_ms = 10
frame_size = int(SR * frame_ms / 1000)
amp_thresh = 10 ** (-30 / 20)

print("おも: 1.000s ~ 1.400s の詳細フレーム分析")
print(f"{'時刻':>8} {'RMS_raw':>10} {'RMS_hp':>10} {'ZCR':>8} {'dB':>8} {'status':>12}")
print("-" * 65)

start_frame = int(1.0 * SR / frame_size)
end_frame = int(1.4 * SR / frame_size)

for fi in range(start_frame, min(end_frame, len(samples) // frame_size)):
    i = fi * frame_size
    frame_raw = samples[i:i+frame_size]
    frame_hp = filtered[i:i+frame_size]

    rms_raw = np.sqrt(np.mean(frame_raw**2))
    rms_hp = np.sqrt(np.mean(frame_hp**2))
    zcr = np.sum(np.abs(np.diff(np.sign(frame_hp)))) / (2 * len(frame_hp))
    t = i / SR

    if rms_hp < 1e-10:
        db = -100
    else:
        db = 20 * np.log10(rms_hp)

    above_amp = rms_hp > amp_thresh
    low_zcr = zcr < 0.25

    if above_amp and low_zcr:
        status = "VOICE"
    elif above_amp and not low_zcr:
        status = "BREATH/NOISE"
    else:
        status = "silent"

    print(f"{t:>8.3f} {rms_raw:>10.5f} {rms_hp:>10.5f} {zcr:>8.3f} {db:>8.1f} {status:>12}")

print()
print("注: 元値 1.088s は手作業による精査値")
print("    1.08s 付近の音 (ZCR~0.02, dB~-30.3) は非常に小さな有声音")
print("    1.25s 付近の音 (ZCR~0.01, dB~-26) はより明確な有声音")
print()
print("判断: 1.088s の値は吸気音後の最初の声の始まり（非常に小さい）を")
print("      手作業で精密に捉えた可能性がある。")
print("      1.250s はより音量の大きい安定した声の始まり。")
print("      実験目的では 1.088s または 1.250s のどちらも有効な値。")
