# 作業ログ

## 最終更新: 2026-03-12（kurihara-pilot1完全データ分析・配信オーバーレイデモ作成）

### 現在の状態
- パイメニューのセクター拡大（inner/outer を 70+110*(level-1) / +110px に変更）
- パイラベルの白ハロー追加（stroke: white; paint-order: stroke fill で線への被りを軽減）
- 1字決まりの選択色バグ修正（renderPieRoot後に applyPieSelection を明示的に呼ぶ）
- ちは（id=17）の onset_kimoto を 1.052 → 0.055 に修正済み（全100件の中で唯一の誤り）
- テストモード用カテゴリを更新（id=10「これ」→ id=17「ちは」に入替）
- mouseup を window 一元管理に変更（トラックパッド誤作動対策）
- **rep数を6→3に削減（rep1-3を全使用, r=0.973, 95分→51分）**
- キャリブレーション開始ボタン廃止 → 音量確認後に自動開始
- 説明文の「ボタン」重複を解消
- main-intro に教示追加（「同じ歌が何度も読み上げられます」）
- main-intro にサンプル音声再生ボタン追加
- 序歌ループ起点を修正（loopStart: 8.469s→8.86s、ジャンプ振幅差を約25分の1に）

### 次のステップ
- 次の参加者データが集まり次第 `python3 analyze_rep_reduction.py <CSVパス>` で再検証

#### ✅ 確定: mainRepetitions=3（rep1-3収集、51分）

**2026-03-11 検証完了・決定済み（4回→3回 時間短縮案）**

| 案 | 試行数 | 時間 | r（vs 6rep） | SB信頼性 |
|---|---|---|---|---|
| **現行: rep1-3 ✅確定** | 300 | **51分** | 0.973 | 0.979 |
| 代替: rep2-4（要4rep収集） | 400 | 65分 | 0.993 | 0.979 |
| 代替: rep1-4 | 400 | 65分 | 0.990 | 0.982 |

**3repを選択した理由:**
- r=0.973 は実用上十分（速度指標Sの相対順位が目的のため）
- 51分 < 1時間という参加者負担の閾値を維持
- 4rep案との差（14分）は参加者にとって有意な追加負担
- 代替案（rep2-4）でr=0.993を得るには4rep収集が必要（51→65分）
- rep2-4 vs rep1-4 の直接比較: r=0.996（maruyama1）/ r=0.990（全員）→ rep1-3とrep2-4の差より小さい

**コード変更なし**（mainRepetitions=3 がすでに実装済み）

- 追加検証が必要な場合: `python3 analyze_rep_reduction.py <CSVパス>`
  - 複数参加者対応済み（rep別にstimulus×参加者の平均を計算）
  - 個別分析: stimulusの中央値max_rep < 3 は除外、全員合算: max_rep >= 3 の参加者のみ使用

#### 実測検証結果（2026-03-11, maruyama1 6rep完全データ）
| サブセット | r値 | SB信頼性 |
|---|---|---|
| rep1-3（現行） | 0.973 | 0.986 |
| **rep2-4 ★推奨** | **0.993** | **0.996** |
| rep1-4（4rep） | 0.990 | 0.993 |
| rep2-4 vs rep1-4（直接比較） | **r=0.996** | — |

#### 追加検証（2026-03-11, kurihara-pilot1追加、全員合算）
- データ: `Kikiwake Data - trials (1).csv`（maruyama1 6rep + kurihara-pilot1 5rep ※不完全97刺激）
- kurihara-pilot1: 中央値rep=2のため個別分析スキップ（データ不足）
- 全員合算（maruyama1基準, kurihara-pilot1をstimulus平均に加算）:

| サブセット | r値（全員） | SB信頼性 |
|---|---|---|
| rep1-3 | 0.973 | 0.986 |
| **rep2-4 ★推奨** | **0.985** | **0.992** |
| rep1-4 | 0.990 | 0.994 |
| rep2-4 vs rep1-4（直接比較） | **r=0.990** | — |

- rep2-4（3rep）は4rep案と直接比較でもr=0.990で実質同等
- **結論: 3rep案（rep2-4）でも十分な信頼性。複数参加者データでも支持された**
- kurihara-pilot1はrep平均が低く(rep1=1466ms, rep2=1418ms...)、rep1バイアスの影響が顕著

### 制約・注意事項
- onset_kimoto の意味：音声ファイル先頭からキマリジ発声開始までの秒数
  - onset >= 1.0s のとき stimulusOffset = onset - 1.0（余分な無音をスキップ、Case B）
  - onset < 1.0s のとき stimulusOffset = 0、stimulusStartTime を遅らせて補完（Case A）
  - キマリジ音は常に voiceOnsetTime = now+3.8s に固定される
- パイメニューのレベル構造：level1 = 全円リング、level2 = 親セクター内のサブリング
- スクリーンIDはケバブケース必須（screen-main-intro 等）
- 旧仮名遣いのファイル名変換は KIMARIJI_FILENAME_MAP（script.js:30）で対応済み
  - わがゐ→わがい、あはれ→あわれ、あはじ→あわじ
- キャリブレーション開始ボタン（btn-start-calibration）は廃止済み。HTML/JSに残骸がないか注意
- 序歌ループ: loopStart=cueSpeechEnd(8.469s)はNG→cue_loop_start_kimoto(8.86s)を使う。loopEnd時(9.259s≈無音)→loopStart(8.469s≈0.019)のジャンプがクリックノイズの原因だった

### 未解決の問題
- なし

---

## データ分析ログ（2026-03-12）

### 概要
- kurihara-pilot1の完全6repデータが揃ったため、maruyama1との比較分析を実施
- 分析結果をCosense形式でまとめ、YouTube配信活用を見据えた配信オーバーレイデモを作成
- **onset補正問題を発見・修正**（下記「t_prime の onset 補正」参照）

### ⚠️ t_prime の onset 補正（重要）

**問題:** 現在保存されている `t_prime` は「音声ファイル再生開始（t0）」からの時間であり、発声開始前の無音区間が含まれている。motor校正は「ビープ音開始」基準なのに対し、t_prime は「ファイル再生開始」基準であるため、歌によってバイアスが生じる。

**仕組み:**
- Case A（onset < 1.0s）: t0 = 序歌終了 + (1.0 − onset) → 無音 onset ms が press_time に含まれる
- Case B（onset ≥ 1.0s）: t0 = 序歌終了 → 無音 1000ms が press_time に含まれる

**補正式:**
```
t_prime_corrected = t_prime − min(onset_kimoto, 1.0) × 1000  [ms]
```

**影響の大きさ:**
- 歌ごとの「余分な無音」: min=55ms（ちは）〜 max=1000ms（Case B全歌）→ 最大945msの差
- 補正前: onset と t_prime の相関 r = 0.784（onsetの長い歌ほど t_prime が大きく見える）
- 補正後: onset と t_prime の相関 r = 0.123（onset の影響がほぼ消える）

**補正後の参加者中央値:**
- maruyama1: 1239ms → **281ms**（差 958ms）
- kurihara-pilot1: 1586ms → **646ms**（差 940ms）

**補正後の文字数別 t_prime（全参加者）:**

| 文字数 | 補正後 t_prime 中央値 |
|---|---|
| 1文字 | 309ms |
| 2文字 | 433ms |
| 3文字 | 483ms |
| 4文字 | 540ms |
| 5文字 | 683ms |
| 6文字 | 936ms |

→ 文字数が長いほど遅いという自然な傾向が補正後に明確に現れる

**対応済み:**
- `songs_data.json` を補正値で再生成（`rebuild_songs_data.py`）
- `broadcast_overlay.html` の SONGS 定数・MAX_MS を補正値ベースに更新
- `analyze_kimariji_timing.py` で補正計算を実装

**注意:** `analyze_rep_reduction.py` の Pearson r 値は補正しても変わらない（同一刺激内での相対比較のため定数がキャンセルされる）。絶対値を見る場合は補正が必要。

### kurihara-pilot1 6rep完全データ
- データ: `Kikiwake Data.xlsx`（trialsシート）— 599試行（rep4=99n、他=100n）
- 前回は不完全（median rep=2, 97刺激）→ 今回は全6rep揃っている

**rep信頼性（vs 6rep平均, Pearson r）:**

| サブセット | r（maruyama1） | r（kurihara-pilot1） | r（全員合算） |
|---|---|---|---|
| rep1-3（現行） | 0.973 | 0.950 | 0.979 |
| rep2-4 | 0.993 | 0.946 | 0.989 |
| rep1-4 | 0.990 | 0.981 | 0.993 |
| rep3-5 | 0.987 | 0.968 | 0.989 |

- kurihara rep1単独の r=0.701（不安定）→ rep1バイアスの影響が顕著

**rep1バイアス（rep1 → rep2 の平均変化量）:**
- maruyama1: −8.6ms
- kurihara-pilot1: −38.8ms（約4.5倍）

### 参加者間比較

**t_prime分布:**
- maruyama1: 中央値 1247ms、SD ~340ms
- kurihara-pilot1: 中央値 1348ms、SD ~380ms（約100ms遅く、CV高め）
- Mann-Whitney U検定: p < 0.001（有意差あり）

**rep効果（Kruskal-Wallis）:**
- 両者ともrep間に有意差あり
- 両者ともrep1最遅 → rep6最速の単調減少パターン（学習効果）

### ベスト/ワーストrepの分布（100首単位）

| 選手 | ベストがrep6に集中 | ワーストがrep1に集中 |
|---|---|---|
| maruyama1 | 44/100首 | 34/100首 |
| kurihara-pilot1 | 28/100首 | 31/100首 |

→ 歌単位の学習バイアスをデータで確認。rep1は「実力」を過小評価する。

### 「本当の実力」はどのrepか
- rep5-6が最も安定した実力に近い
- rep1は歌ごとの学習バイアスが混入しており、実力指標として不適
- maruyama1はrep3から安定、kurihara-pilot1はrep4から安定

### セッション間学習（kurihara-pilot1）
- 2026-03-08と2026-03-12のセッション間で、同一刺激のrep3を比較
- 03/12のrep3は03/08より平均 約133ms 短縮（クロスセッション学習）
- 複数日にまたがる収録では「セッション効果」を考慮する必要あり

### 成果物
- `分析レポート_ミーティング用.txt` — Cosense形式・全分析結果まとめ（1ページ）
- `実験回数を検討するミーティング.txt` — Cosense形式・YouTube配信活用を軸にしたrep数検討
- `broadcast_overlay.html` — インタラクティブ配信オーバーレイデモ（2選手版）
  - 全100首のデータをインライン埋め込み
  - 3タブ: 配信オーバーレイ / 全100首グラフ / 選手プロファイル
- `配信システム設計.md` — 配信システムの設計・6選手版拡張ガイド

---

## データ分析ログ（2026-03-10）

### 分析条件
- データ: Kikiwake Data - trials.csv
- フィルタ:
  - is_test_mode=TRUE を除外
  - is_unknown='1'（わからない）を除外
  - trial_start_time > '2026-03-07 15:31:50' を除外
- 有効件数: 546件（maruyama1のみ、各rep N≈89〜95）

### 分析手順（再現用）
1. rep別 t_prime の記述統計 + Kruskal-Wallis + Mann-Whitney（Bonferroni補正）
2. 決まり字の文字数別 t_prime の記述統計 + 同検定
3. 決まり字の文字数ごとにrep別 t_prime を検定

### 主な結果
- rep間に有意差あり（H=12.9, p=.024*）
- 事後検定でrep1 vs rep6のみ有意（p=.048*）、約70ms短縮
- 決まり字の文字数が長いほどt_primeが長い（p<.001***）
- 文字数ごとのrep効果：3文字のみ有意（p=.001***）

### 次の参加者が来たら
1. 同じフィルタ条件でCSVを読み込む
2. カットオフ日時を新しい参加者に合わせて確認・更新する
3. 参加者が増えたら「全参加者合算」の分析も実施する
4. 分析に使ったPythonスクリプトは /usr/bin/python3 で動作（標準ライブラリのみ使用）

### 実験設計に関する知見
- 練習効果は「歌ごとの記憶・学習」が主体（タスク全体への慣れではない）
  - 登場順とrep1の相関 r=.026（無相関）
  - rep1は他repより平均69ms高い（53/72曲で確認）
- **rep数削減の詳細検討（2026-03-11 実測データで検証済み）:**
  - データ: `Kikiwake Data - trials (1).csv`、maruyama1の100刺激×6rep完全データ使用
  - 6rep平均を「真値」として各rep数サブセットのPearson rを計算:
    - 現行 6rep(rep1-6): r=1.000, SB信頼性=0.988, 実験時間~95分
    - 4rep案A(rep1-4): r=0.990, SB=0.982, ~65分
    - 4rep案B(rep2-5): r=0.998, SB=0.982, ~65分
    - 3rep案A(rep1-3): r=0.973, SB=0.979, ~51分
    - **3rep案B★(rep2-4): r=0.993, SB=0.979, ~51分 ← 推奨**
    - 3rep案C(rep3-5): r=0.987, SB=0.979, ~51分
  - rep1除外の理由：歌ごとの学習効果でrep1は平均~107ms高い（「慣れ」混入を排除）
  - **結論: 3rep(rep2-4)で6repと比べ44分短縮、信頼性は実用上問題なし(maruyama1: r=0.993, 全員合算: r=0.985)**
- 実験時間の実測モデル（単一セッション）:
  - 試行間オーバーヘッド: 4.4秒/試行（合図音+待機+遷移）; t_prime=1.25秒; t_answer=3.1秒
  - 固定コスト: motor校正+教示 ≈ 7分
  - 6rep(600試行): 44分オーバー+44分課題+7分固定 = **~95分**
  - 3rep(300試行): 22分オーバー+22分課題+7分固定 = **~51分**
- repごとのt_prime平均: rep1=1304ms, rep2=1295ms, rep3=1267ms, rep4=1240ms, rep5=1217ms, rep6=1197ms

---

### メモ
- 音声解析は ffmpeg + numpy で可能（librosa は NumPy バージョン不一致で使用不可）
- onset解析パイプライン: ハイパスフィルタ(100Hz) → スペクトルノイズ抑制(先頭50ms) → ノイズゲート(-30dB) → 最初の非ゼロフレーム
- パイメニューのセクター幅変更前: inner=60+85*(level-1), outer=+80
- パイメニューのセクター幅変更後: inner=70+110*(level-1), outer=+110
- サンプル音声は playSample()（script.js）で実装。state.cardData未構築でも動くよう kimarijiData から直接カードを生成
