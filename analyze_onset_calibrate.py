#!/usr/bin/env python3
"""
ちは (ID 17) の詳細分析: フレームごとのRMS/ZCR/振幅を表示
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

def analyze_frames(samples, filtered, sr=44100, frame_ms=10, start_sec=0.0, end_sec=1.5):
    frame_size = int(sr * frame_ms / 1000)
    amp_thresh = 10 ** (-30 / 20)

    start_frame = int(start_sec * sr / frame_size)
    end_frame = int(end_sec * sr / frame_size)

    print(f"{'時刻':>8} {'RMS_raw':>10} {'RMS_hp':>10} {'ZCR':>8} {'amp?':>6} {'zcr<0.10?':>10} {'zcr<0.15?':>10} {'zcr<0.20?':>10}")
    print("-" * 80)

    for fi in range(start_frame, min(end_frame, len(samples) // frame_size)):
        i = fi * frame_size
        frame_raw = samples[i:i+frame_size]
        frame_hp = filtered[i:i+frame_size]

        rms_raw = np.sqrt(np.mean(frame_raw**2))
        rms_hp = np.sqrt(np.mean(frame_hp**2))
        zcr = np.sum(np.abs(np.diff(np.sign(frame_hp)))) / (2 * len(frame_hp))
        t = i / sr

        above_amp = "YES" if rms_hp > amp_thresh else "no"

        print(f"{t:>8.3f} {rms_raw:>10.5f} {rms_hp:>10.5f} {zcr:>8.3f} {above_amp:>6} "
              f"{'YES' if zcr < 0.10 else 'no':>10} "
              f"{'YES' if zcr < 0.15 else 'no':>10} "
              f"{'YES' if zcr < 0.20 else 'no':>10}")

# ちは
filepath = f"{SOUNDS_DIR}/ちは 上.m4a"
samples = load_pcm(filepath)
filtered = highpass_filter(samples)

print("=" * 80)
print("ちは (ID 17): 0.0 ~ 1.5s のフレーム分析")
print(f"元値: 1.052s (正しい値)")
print("=" * 80)
analyze_frames(samples, filtered, start_sec=0.0, end_sec=1.5)

print("\n")

# 複数の閾値で detect_voice_onset を試す
def detect_voice_onset(samples, sr=44100, frame_ms=10,
                        amp_db=-30, zcr_thresh=0.25, min_sustain_ms=30):
    frame_size = int(sr * frame_ms / 1000)
    amp_thresh = 10 ** (amp_db / 20)
    min_frames = max(1, int(min_sustain_ms / frame_ms))

    consecutive = 0
    onset_candidate = None

    for i in range(0, len(samples) - frame_size, frame_size):
        frame = samples[i:i+frame_size]
        rms = np.sqrt(np.mean(frame**2))

        if rms < amp_thresh:
            consecutive = 0
            onset_candidate = None
            continue

        zcr = np.sum(np.abs(np.diff(np.sign(frame)))) / (2 * len(frame))

        if zcr > zcr_thresh:
            consecutive = 0
            onset_candidate = None
            continue

        if consecutive == 0:
            onset_candidate = i / sr
        consecutive += 1

        if consecutive >= min_frames:
            return onset_candidate
    return None

print("ちは: 各ZCR閾値での声onset検出結果")
for zcr_t in [0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30]:
    for sustain in [20, 30, 50, 80]:
        result = detect_voice_onset(filtered, zcr_thresh=zcr_t, min_sustain_ms=sustain)
        if result is not None:
            print(f"  ZCR={zcr_t:.2f}, sustain={sustain}ms: onset={result:.3f}s")

print("\n")

# 各ターゲットでの分析
targets = [
    ("ちは", 17, 1.052),
    ("やす", 59, 1.402),
    ("ひとも", 99, 1.941),
    ("つく", 13, 0.803),  # 変更された
    ("す", 18, 0.943),    # 変更された
]

print("各ターゲットでの最適閾値探索 (ちは=1.052±0.05 になる条件):")
print()

# ちはで1.052近辺を返す閾値を探す
zcr_range = np.arange(0.05, 0.35, 0.01)
sustain_range = [20, 30, 50, 80, 100]

best_configs = []

chiha_filepath = f"{SOUNDS_DIR}/ちは 上.m4a"
chiha_samples = load_pcm(chiha_filepath)
chiha_filtered = highpass_filter(chiha_samples)

for zcr_t in zcr_range:
    for sustain in sustain_range:
        result = detect_voice_onset(chiha_filtered, zcr_thresh=zcr_t, min_sustain_ms=sustain)
        if result is not None and abs(result - 1.052) <= 0.05:
            best_configs.append((zcr_t, sustain, result))

print(f"ちは=1.052±0.05 になる設定 ({len(best_configs)}件):")
for zcr_t, sustain, result in best_configs[:20]:
    print(f"  ZCR={zcr_t:.2f}, sustain={sustain}ms: onset={result:.3f}s")
