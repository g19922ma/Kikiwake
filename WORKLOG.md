# 作業ログ

## 最終更新: 2026-03-10

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

### 未解決の問題
- なし

### メモ
- 音声解析は ffmpeg + numpy で可能（librosa は NumPy バージョン不一致で使用不可）
- onset解析パイプライン: ハイパスフィルタ(100Hz) → スペクトルノイズ抑制(先頭50ms) → ノイズゲート(-30dB) → 最初の非ゼロフレーム
- パイメニューのセクター幅変更前: inner=60+85*(level-1), outer=+80
- パイメニューのセクター幅変更後: inner=70+110*(level-1), outer=+110
- サンプル音声は playSample()（script.js）で実装。state.cardData未構築でも動くよう kimarijiData から直接カードを生成
