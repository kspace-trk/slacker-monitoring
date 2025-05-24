# Slacker Monitoring

macOSでスクリーンショットを監視し、カーソルの非活動時にDiscordに通知するツールです。

## 機能

- 3分ごとに`screencapture`コマンドでスクリーンショットを取得
- 時計などのUI変化による誤検知を防ぐため、右上170px × 30pxの領域を除外
- 前回のスクリーンショットと比較し、完全に一致していた場合は「カーソルが動いていない」と判定
- `pixelmatch`による差分比較
- 差分が0だった場合、Discord Webhookに通知

## セットアップ

1. 依存関係をインストール:

```bash
npm install
```

1. Discord Webhook URLを環境変数に設定:

`.env.example`ファイルを複製し、`.env`ファイルを作成してください。

## 使用方法

```bash
npm run start
```

## 動作要件

- macOS（`screencapture`コマンドが利用可能）
- Node.js 18以上
- スクリーンショット権限が有効になっていること

## 注意事項

- 初回実行時は権限の許可が必要になる場合があります
- `screenshots`ディレクトリが自動的に作成され、スクリーンショットが保存されます
- DISCORD_WEBHOOK_URL環境変数を必ず設定してから実行してください

## ファイル構成

- `monitor.js` - メインスクリプト
- `package.json` - 依存関係の定義
- `screenshots/` - スクリーンショット保存ディレクトリ（自動作成）

## 使用ライブラリ

- `pixelmatch` - 画像差分比較
- `pngjs` - PNG画像の読み書き
- `sharp` - 画像処理・トリミング
