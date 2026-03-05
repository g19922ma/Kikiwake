#!/usr/bin/env python3
"""
百人一首 onset 分析スクリプト
ZCR+振幅による声検出で全100件のonset_kimoto値を検証・更新する
"""

import subprocess
import json
import numpy as np
from scipy.signal import butter, sosfilt
import os

SOUNDS_DIR = "/Users/maruyama/Documents/GitHub/Kikiwake/sounds_kimoto"
KIMARIJI_JSON = "/Users/maruyama/Documents/GitHub/Kikiwake/kimariji.json"
SR = 44100

# 歴史的仮名→現代仮名ファイル名マッピング
FILENAME_MAP = {
    "わがゐ": "わがい",
    "あはれ": "あわれ",
    "あはじ": "あわじ",
}


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


def detect_voice_onset(samples, sr=44100, frame_ms=10,
                        amp_db=-30, zcr_thresh=0.25, min_sustain_ms=30):
    """
    振幅 > amp_db かつ ZCR < zcr_thresh が min_sustain_ms 継続 → 声のonset
    """
    frame_size = int(sr * frame_ms / 1000)
    amp_thresh = 10 ** (amp_db / 20)
    min_frames = max(1, int(min_sustain_ms / frame_ms))

    consecutive = 0
    onset_candidate = None

    for i in range(0, len(samples) - frame_size, frame_size):
        frame = samples[i : i + frame_size]
        rms = np.sqrt(np.mean(frame ** 2))

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


def get_raw_onset(samples, sr=44100, frame_ms=5, amp_db=-30):
    frame_size = int(sr * frame_ms / 1000)
    amp_thresh = 10 ** (amp_db / 20)
    for i in range(0, len(samples) - frame_size, frame_size):
        if np.sqrt(np.mean(samples[i : i + frame_size] ** 2)) > amp_thresh:
            return i / sr
    return None


def get_filepath(kimariji_str):
    """きまり字からファイルパスを取得"""
    name = FILENAME_MAP.get(kimariji_str, kimariji_str)
    path = os.path.join(SOUNDS_DIR, f"{name} 上.m4a")
    return path


def load_and_process(filepath):
    """ファイルを読み込み、ハイパスフィルタ適用"""
    samples = load_pcm(filepath)
    if samples is None:
        return None, None
    filtered = highpass_filter(samples)
    return samples, filtered


# ============================================================
# ステップ1: ZCR閾値キャリブレーション
# ============================================================
print("=" * 60)
print("ステップ1: ZCR閾値キャリブレーション")
print("=" * 60)

calibration_targets = [
    {"id": 17, "kimariji": "ちは", "expected": 1.052, "note": "正解"},
    {"id": 59, "kimariji": "やす", "expected": 1.402, "note": "既に修正済み"},
    {"id": 99, "kimariji": "ひとも", "expected": 1.941, "note": "既に修正済み"},
]

zcr_thresholds = [0.15, 0.20, 0.25, 0.30]

for target in calibration_targets:
    filepath = get_filepath(target["kimariji"])
    print(f"\n[ID {target['id']}] {target['kimariji']} (期待値: {target['expected']}s, {target['note']})")
    if not os.path.exists(filepath):
        print(f"  ファイルなし: {filepath}")
        continue

    samples, filtered = load_and_process(filepath)
    if samples is None:
        print("  読み込み失敗")
        continue

    raw_onset = get_raw_onset(samples)
    print(f"  生RMS onset: {raw_onset:.3f}s")

    for zcr_t in zcr_thresholds:
        v_onset = detect_voice_onset(filtered, zcr_thresh=zcr_t)
        v_str = f"{v_onset:.3f}s" if v_onset is not None else "None"
        print(f"  ZCR閾値={zcr_t}: 声onset={v_str}")

# ============================================================
# ステップ2: 最適閾値の選択
# ============================================================
# キャリブレーション結果に基づいて最適閾値を選定
# (スクリプト実行後に結果を見て決定するが、事前検討として0.25を使用)
BEST_ZCR_THRESH = 0.25

print("\n" + "=" * 60)
print(f"ステップ2: 全100件分析 (ZCR閾値={BEST_ZCR_THRESH})")
print("=" * 60)

with open(KIMARIJI_JSON, "r", encoding="utf-8") as f:
    data = json.load(f)

results = []
changes = []
errors = []

for entry in data["kimariji"]:
    entry_id = entry["id"]
    kimariji_str = entry["kimariji"]
    original_onset = entry["onset_kimoto"]

    filepath = get_filepath(kimariji_str)

    if not os.path.exists(filepath):
        print(f"[ID {entry_id:3d}] {kimariji_str}: ファイルなし ({filepath})")
        errors.append({"id": entry_id, "kimariji": kimariji_str, "reason": "file_not_found"})
        results.append({
            "id": entry_id,
            "kimariji": kimariji_str,
            "original": original_onset,
            "raw_onset": None,
            "voice_onset": None,
            "final": original_onset,
            "changed": False,
        })
        continue

    samples, filtered = load_and_process(filepath)
    if samples is None:
        print(f"[ID {entry_id:3d}] {kimariji_str}: 読み込み失敗")
        errors.append({"id": entry_id, "kimariji": kimariji_str, "reason": "load_failed"})
        results.append({
            "id": entry_id,
            "kimariji": kimariji_str,
            "original": original_onset,
            "raw_onset": None,
            "voice_onset": None,
            "final": original_onset,
            "changed": False,
        })
        continue

    raw_onset = get_raw_onset(samples)
    voice_onset = detect_voice_onset(filtered, zcr_thresh=BEST_ZCR_THRESH)

    # 判定
    if voice_onset is None:
        # 声onsetが検出できない → 元値を保持
        final_onset = original_onset
        changed = False
        flag = "VOICE_NOT_DETECTED"
    elif abs(voice_onset - original_onset) <= 0.15:
        # 差が0.15s以内 → 元値を信頼
        final_onset = original_onset
        changed = False
        flag = "OK"
    else:
        # 差が0.15s以上 → 声onsetを採用
        final_onset = round(voice_onset, 3)
        changed = True
        flag = "UPDATED"
        changes.append({
            "id": entry_id,
            "kimariji": kimariji_str,
            "old": original_onset,
            "new": final_onset,
            "raw_onset": raw_onset,
            "voice_onset": voice_onset,
        })

    raw_str = f"{raw_onset:.3f}" if raw_onset is not None else "None"
    voice_str = f"{voice_onset:.3f}" if voice_onset is not None else "None"
    diff = abs(voice_onset - original_onset) if voice_onset is not None else 0
    marker = " ***" if changed else ""

    print(
        f"[ID {entry_id:3d}] {kimariji_str:10s}: "
        f"元={original_onset:.3f} 生RMS={raw_str} 声={voice_str} "
        f"diff={diff:.3f} {flag}{marker}"
    )

    results.append({
        "id": entry_id,
        "kimariji": kimariji_str,
        "original": original_onset,
        "raw_onset": raw_onset,
        "voice_onset": voice_onset,
        "final": final_onset,
        "changed": changed,
        "flag": flag,
    })

# ============================================================
# ステップ3: kimariji.json 更新
# ============================================================
print("\n" + "=" * 60)
print("ステップ3: kimariji.json 更新")
print("=" * 60)

if changes:
    print(f"\n変更件数: {len(changes)}")
    print("\n変更一覧:")
    print(f"{'ID':>4} {'きまり字':12} {'旧値':>8} {'新値':>8} {'差分':>8}")
    print("-" * 50)
    for c in changes:
        diff = c["new"] - c["old"]
        print(f"{c['id']:>4} {c['kimariji']:12} {c['old']:>8.3f} {c['new']:>8.3f} {diff:>+8.3f}")

    # JSON更新
    id_to_result = {r["id"]: r for r in results}
    for entry in data["kimariji"]:
        r = id_to_result[entry["id"]]
        if r["changed"]:
            entry["onset_kimoto"] = r["final"]

    with open(KIMARIJI_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("\nkimariji.json を更新しました。")
else:
    print("変更なし（全件元値を保持）")

# ============================================================
# 最終チェック
# ============================================================
print("\n" + "=" * 60)
print("最終チェック")
print("=" * 60)

with open(KIMARIJI_JSON, "r", encoding="utf-8") as f:
    final_data = json.load(f)

issues = []
for entry in final_data["kimariji"]:
    v = entry["onset_kimoto"]
    if v is None or v <= 0:
        issues.append(f"ID {entry['id']} ({entry['kimariji']}): onset={v} [0以下]")
    elif v < 0.01:
        issues.append(f"ID {entry['id']} ({entry['kimariji']}): onset={v} [極小 <0.01s]")
    elif v >= 3.0:
        issues.append(f"ID {entry['id']} ({entry['kimariji']}): onset={v} [極大 >=3.0s]")

# ちは の確認
chiha = next((e for e in final_data["kimariji"] if e["id"] == 17), None)
if chiha:
    print(f"ちは (ID 17): onset_kimoto = {chiha['onset_kimoto']} (期待: 1.052)")
    if abs(chiha["onset_kimoto"] - 1.052) > 0.001:
        issues.append(f"ちは の値が変わっています: {chiha['onset_kimoto']}")

if issues:
    print(f"\n警告 ({len(issues)}件):")
    for issue in issues:
        print(f"  {issue}")
else:
    print("問題なし: 全件 0 < onset < 3.0s の範囲内")

print(f"\n総変更件数: {len(changes)}")
print(f"エラー件数: {len(errors)}")

if errors:
    print("エラー一覧:")
    for e in errors:
        print(f"  ID {e['id']} ({e['kimariji']}): {e['reason']}")

print("\n完了")
