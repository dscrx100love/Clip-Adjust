# Clip-Adjust

Premiere Pro 用のテロップ同期ツール。
ベース動画のカット開始位置にテロップの IN 点を一括で吸着させる。

## ステータス

**v0（要件定義フェーズ）** — 実装はこれから。
要件は [`docs/requirements.md`](docs/requirements.md) を参照。

## 想定ワークフロー（完成後）

1. zip をダウンロードして解凍
2. `install-mac.command` または `install-win.bat` をダブルクリック
3. Premiere Pro を再起動 → **ファイル > スクリプト > SubtitleSync** から起動
4. ベース動画トラック / テロップトラック / 許容フレーム数を選んで実行

## 対応環境

- Premiere Pro 2024 以降
- macOS 12+ / Windows 10+
