#!/usr/bin/env python3
"""
rep数削減検討スクリプト
目的: 6rep → 3rep/4rep への削減が妥当かを検証
     rep1除外（学習効果混入回避）の効果も検証

使用データ: Kikiwake Data - trials.csv
実行方法:
  python3 analyze_rep_reduction.py [CSVファイルパス]
  python3 analyze_rep_reduction.py  # データなしの理論的推計のみ
"""

import sys
import csv
import math
from collections import defaultdict

# ==============================
# データ読み込み
# ==============================

def load_csv(filepath):
    rows = []
    with open(filepath, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows

def filter_rows(rows):
    """フィルタ条件（WORKLOG準拠）"""
    kept = []
    for r in rows:
        if r.get('is_test_mode', '').upper() in ('TRUE', '1'):
            continue
        if r.get('is_unknown', '') == '1':
            continue
        try:
            float(r['t_prime'])
        except (ValueError, KeyError):
            continue
        kept.append(r)
    return kept

# ==============================
# 相関計算
# ==============================

def pearson(xs, ys):
    n = len(xs)
    if n < 2:
        return float('nan')
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx == 0 or dy == 0:
        return float('nan')
    return num / (dx * dy)

def spearman_brown(r, n_target, n_current):
    """スピアマン-ブラウン公式で信頼性を推計
    r: 現在のN試行の信頼性
    n_target: 目標試行数（倍率）
    """
    k = n_target / n_current
    return (k * r) / (1 + (k - 1) * r)

# ==============================
# rep削減信頼性分析（オフセット対応）
# ==============================

def analyze_rep_reliability(rows, participant_id=None):
    """
    各stimulus_idに対してrep別のt_primeを集計し、
    様々なrepサブセット vs 全rep平均（基準）の相関を計算。
    rep1除外パターン（rep2-4等）も検証する。
    """
    if participant_id:
        rows = [r for r in rows if r.get('participant_id', '').lower() == participant_id.lower()]
    else:
        # 全員モード: rep数が不十分な参加者（最大repが3未満）を除外する
        pid_max_rep = defaultdict(int)
        for r in rows:
            pid = r.get('participant_id', '').lower()
            rep = int(r['rep'])
            pid_max_rep[pid] = max(pid_max_rep[pid], rep)
        eligible = {pid for pid, max_rep in pid_max_rep.items() if max_rep >= 3}
        excluded = set(pid_max_rep.keys()) - eligible
        if excluded:
            print(f"  ※ rep不足のため除外: {sorted(excluded)}")
        rows = [r for r in rows if r.get('participant_id', '').lower() in eligible]

    # stimulus_id ごとに rep → [t_prime, ...] を収集（複数参加者対応）
    raw = defaultdict(lambda: defaultdict(list))  # raw[stimulus_id][rep] = [t_prime, ...]
    for r in rows:
        sid = r['stimulus_id']
        rep = int(r['rep'])
        tprime = float(r['t_prime'])
        raw[sid][rep].append(tprime)

    # 複数参加者がいる場合は参加者間で平均化して data[stimulus_id][rep] = mean_t_prime にする
    data = defaultdict(dict)
    for sid, reps in raw.items():
        for rep, vals in reps.items():
            data[sid][rep] = sum(vals) / len(vals)

    max_reps_per_stimulus = {sid: max(reps.keys()) for sid, reps in data.items()}
    # 中央値で判定（一部の刺激が欠損しても分析を続行できるようにする）
    sorted_max = sorted(max_reps_per_stimulus.values()) if data else []
    median_max_reps = sorted_max[len(sorted_max) // 2] if sorted_max else 0
    min_max_reps = min(sorted_max) if sorted_max else 0

    print(f"\n=== 参加者: {participant_id or '全員'} ===")
    print(f"有効stimulus数: {len(data)}")
    print(f"各stimulusの最大rep（最小値/中央値）: {min_max_reps}/{median_max_reps}")

    if median_max_reps < 3:
        print("  ※ rep数が不足。分析スキップ。")
        return

    # 基準: 全repの平均
    full_avg = {}
    for sid, reps in data.items():
        vals = list(reps.values())
        full_avg[sid] = sum(vals) / len(vals)

    stimuli = sorted(full_avg.keys())

    # rep番号別 t_prime 平均
    rep_means = defaultdict(list)
    for sid, reps in data.items():
        for rep, val in reps.items():
            rep_means[rep].append(val)
    print(f"\nrep別 t_prime 平均:")
    for rep in sorted(rep_means.keys()):
        vals = rep_means[rep]
        print(f"  rep{rep}: {sum(vals)/len(vals):.0f}ms  (n={len(vals)})")

    # 各サブセットを検証
    subsets = []
    if min_max_reps >= 6:
        subsets = [
            ("rep1-6（現行）", list(range(1, 7))),
            ("rep1-4",         list(range(1, 5))),
            ("rep2-5",         list(range(2, 6))),
            ("rep1-3",         list(range(1, 4))),
            ("rep2-4 ★推奨",   list(range(2, 5))),
            ("rep3-5",         list(range(3, 6))),
            ("rep2-3",         list(range(2, 4))),
            ("rep1-2",         list(range(1, 3))),
        ]
    elif min_max_reps >= 4:
        subsets = [
            ("rep1-4",         list(range(1, 5))),
            ("rep2-4 ★推奨",   list(range(2, 5))),
            ("rep1-3",         list(range(1, 4))),
            ("rep2-3",         list(range(2, 4))),
        ]
    elif min_max_reps >= 3:
        subsets = [
            ("rep1-3",         list(range(1, 4))),
            ("rep2-3",         list(range(2, 4))),
        ]

    print(f"\n{'サブセット':>20} {'rep数':>6} {'相関r':>8} {'SB信頼性':>10} {'stimulus数':>10}")
    print("-" * 60)

    for label, rep_list in subsets:
        partial_avg = {}
        for sid in stimuli:
            reps = data[sid]
            used = [reps[i] for i in rep_list if i in reps]
            if len(used) == len(rep_list):
                partial_avg[sid] = sum(used) / len(used)

        common = [sid for sid in stimuli if sid in partial_avg and sid in full_avg]
        if len(common) < 10:
            continue

        xs = [partial_avg[sid] for sid in common]
        ys = [full_avg[sid] for sid in common]
        r = pearson(xs, ys)

        # スピアマン-ブラウン推計（N/6の比率）
        n_reps = len(rep_list)
        sb = spearman_brown(r**2, 6, n_reps) if not math.isnan(r) else float('nan')

        print(f"  {label:>18}   {n_reps:>4}   {r:>7.3f}   {math.sqrt(sb):>9.3f}   {len(common):>8}")

    # 3回平均 vs 4回平均（直接比較）
    if min_max_reps >= 4:
        avg3 = {}
        avg4 = {}
        for sid in stimuli:
            reps = data[sid]
            vals3 = [reps[i] for i in range(2, 5) if i in reps]  # rep2-4
            vals4 = [reps[i] for i in range(1, 5) if i in reps]  # rep1-4
            if len(vals3) == 3:
                avg3[sid] = sum(vals3) / 3
            if len(vals4) == 4:
                avg4[sid] = sum(vals4) / 4

        common_34 = [sid for sid in stimuli if sid in avg3 and sid in avg4]
        if len(common_34) >= 10:
            xs = [avg3[sid] for sid in common_34]
            ys = [avg4[sid] for sid in common_34]
            r_34 = pearson(xs, ys)
            print(f"\n  ★ rep2-4（3回）vs rep1-4（4回）直接比較: r = {r_34:.3f}  (n={len(common_34)})")

# ==============================
# 時間短縮推計（WORKLOGの実測モデル）
# ==============================

def estimate_time_savings():
    """
    WORKLOGの実測値から時間短縮量を推計する
    実測モデル（WORKLOG 2026-03-11）:
      - 試行間オーバーヘッド: 4.4秒/試行（合図音+待機+遷移）
      - t_prime: 1.25秒/試行
      - t_answer: 3.1秒/試行
      - 固定コスト: motor校正+教示 ≈ 7分
    """
    print("\n" + "="*60)
    print("時間短縮推計（WORKLOGの実測モデルより）")
    print("="*60)

    overhead_per_trial = 4.4   # 秒/試行
    tprime_per_trial   = 1.25  # 秒/試行
    tanswer_per_trial  = 3.1   # 秒/試行
    fixed_cost_min     = 7.0   # 分
    per_trial_total    = overhead_per_trial + tprime_per_trial + tanswer_per_trial

    print(f"\n1試行あたり内訳:")
    print(f"  オーバーヘッド: {overhead_per_trial:.1f}秒")
    print(f"  t_prime:        {tprime_per_trial:.2f}秒")
    print(f"  t_answer:       {tanswer_per_trial:.1f}秒")
    print(f"  合計:           {per_trial_total:.2f}秒")
    print(f"  固定コスト:     {fixed_cost_min}分")

    print(f"\n{'rep数':>6} {'試行数':>8} {'課題時間':>10} {'総計時間':>10} {'6rep比削減':>12}")
    print("-" * 55)

    base_trials = 600  # 6rep × 100刺激
    base_time = base_trials * per_trial_total / 60 + fixed_cost_min

    for n_reps in [6, 5, 4, 3, 2]:
        trials = n_reps * 100
        task_min = trials * per_trial_total / 60
        total_min = task_min + fixed_cost_min
        saved = base_time - total_min
        print(f"  {n_reps:>4}   {trials:>6}   {task_min:>7.0f}分   {total_min:>7.0f}分   -{saved:>6.0f}分")

    print(f"\n※ WORKLOGの実測値: 6rep≈95分、3rep≈51分（44分短縮）")

# ==============================
# 推奨案サマリー
# ==============================

def print_recommendation():
    print("\n" + "="*60)
    print("rep数削減 推奨案サマリー（WORKLOG 2026-03-11 実測）")
    print("="*60)
    print()

    plans = [
        ("現行",       "rep1-6", 6,  95, 1.000, 0.988, ""),
        ("4rep案A",    "rep1-4", 4,  65, 0.990, 0.982, ""),
        ("4rep案B",    "rep2-5", 4,  65, 0.998, 0.982, ""),
        ("3rep案A",    "rep1-3", 3,  51, 0.973, 0.979, ""),
        ("3rep案B ★",  "rep2-4", 3,  51, 0.993, 0.979, "←要4rep収集"),
        ("3rep案C",    "rep3-5", 3,  51, 0.987, 0.979, ""),
    ]

    print(f"{'案':>10} {'使用rep':>8} {'rep数':>6} {'時間':>8} {'r(vs6rep)':>11} {'SB信頼性':>10} {'備考':>10}")
    print("-" * 70)
    for name, reps, n, time_min, r, sb, note in plans:
        print(f"  {name:>10} {reps:>8}   {n:>4}  {time_min:>5}分   {r:>9.3f}   {sb:>9.3f}   {note}")

    print()
    print("【確定案: 3rep案A (rep1-3)】")
    print("  ・mainRepetitions=3 で rep1-3 を全使用（r=0.973, 51分）")
    print("  ・51分 < 1時間の参加者負担閾値を維持")
    print("  ・rep2-4（r=0.993）は4rep収集が必要で65分→採用せず")
    print()
    print("【参考: rep1除外効果】")
    print("  ・rep1は歌ごとの学習効果により平均~107ms高い")
    print("  ・rep2以降を使えば学習バイアスを排除できるが、時間的トレードオフあり")
    print()
    print("【実装】script.js の CONFIG.mainRepetitions = 6 → 3 に変更")
    print("  ※ 現行: rep1-3 を全使用（r=0.973, 51分）← 確定案")
    print("  ※ rep2-4 案(r=0.993)は mainRepetitions=4 が必要（65分）→ 時間超過のため不採用")

# ==============================
# メイン
# ==============================

def main():
    print("="*60)
    print("rep数削減検討レポート")
    print("目的: 6rep → 3rep の信頼性・時間短縮の検証")
    print("="*60)

    estimate_time_savings()
    print_recommendation()

    if len(sys.argv) > 1:
        csv_path = sys.argv[1]
        print(f"\n\n{'='*60}")
        print(f"実測分析: {csv_path}")
        print("="*60)
        try:
            rows = load_csv(csv_path)
            rows = filter_rows(rows)
            print(f"読み込み完了: {len(rows)}行（フィルタ後）")

            participants = sorted(set(r['participant_id'].lower() for r in rows))
            print(f"参加者: {participants}")

            for pid in participants:
                analyze_rep_reliability(rows, participant_id=pid)

            if len(participants) > 1:
                analyze_rep_reliability(rows, participant_id=None)

        except FileNotFoundError:
            print(f"  ファイルが見つかりません: {csv_path}")
        except Exception as e:
            print(f"  エラー: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("\n\n[データなし] CSVファイルを引数で指定すると実測分析を実行します。")
        print("使用例: python3 analyze_rep_reduction.py 'Kikiwake Data - trials (1).csv'")

if __name__ == '__main__':
    main()
