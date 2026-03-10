# 作業ログ

## 最終更新: 2026-03-10

## 最終更新: 2026-03-10（2回目）

### 現在の状態
- パイメニューのセクター拡大（inner/outer を 70+110*(level-1) / +110px に変更）
- パイラベルの白ハロー追加（stroke: white; paint-order: stroke fill で線への被りを軽減）
- 1字決まりの選択色バグ修正（renderPieRoot後に applyPieSelection を明示的に呼ぶ）
- ちは（id=17）の onset_kimoto を 1.052 → 0.055 に修正済み（全100件の中で唯一の誤り）
- テストモード用カテゴリを更新（id=10「これ」→ id=17「ちは」に入替）
- mouseup を window 一元管理に変更（トラックパッド誤作動対策）
- キャリブレーション開始ボタン廃止 → 音量確認後に自動開始
- 説明文の「ボタン」重複を解消
- main-intro に教示追加（「同じ歌が何度も読み上げられます」）
- main-intro にサンプル音声再生ボタン追加
- 序歌ループ起点を修正（loopStart: 8.469s→8.86s、ジャンプ振幅差を約25分の1に）
- mouseup を window 一元管理に変更（トラックパッド誤作動対策）

### 次のステップ
- 特になし

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
- rep数削減の検討結果：
  - 4回平均 → 6回平均との相関 r=.989（ほぼ同等）、時間40分削減
  - 3回平均 → r=.971（信頼性基準r>.90はクリア）
- 実験時間2時間の内訳：t_prime 11分、t_answer 28分、その他 81分
- 時間短縮案：rep4回 + 口頭回答で2時間→約1時間が見込める

---

### メモ
- 音声解析は ffmpeg + numpy で可能（librosa は NumPy バージョン不一致で使用不可）
- onset解析パイプライン: ハイパスフィルタ(100Hz) → スペクトルノイズ抑制(先頭50ms) → ノイズゲート(-30dB) → 最初の非ゼロフレーム
- パイメニューのセクター幅変更前: inner=60+85*(level-1), outer=+80
- パイメニューのセクター幅変更後: inner=70+110*(level-1), outer=+110
- サンプル音声は playSample()（script.js）で実装。state.cardData未構築でも動くよう kimarijiData から直接カードを生成
