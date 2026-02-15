# Kikiwake
開発するときにはKikiwakeにあるprompt.mdを読んでから作業をするように。

使う言語は、可能ならブラウザJavaScript + firebase保存（or google spreadsheet 保存）がいい。

## 実行方法
このアプリケーションはブラウザのセキュリティ制限（CORS）のため、ローカルサーバー経由で実行する必要があります。

1. ターミナルでこのディレクトリに移動します。
   ```bash
   cd Documents/GitHub/Kikiwake
   ```
2. Pythonの簡易サーバーを立ち上げます。
   ```bash
   python3 -m http.server
   ```
3. ブラウザで `http://localhost:8000` にアクセスしてください。

テストモードは2分くらいでタスク全体の流れがサッと行えるモード
ユーザへの指示は全て日本語にして
