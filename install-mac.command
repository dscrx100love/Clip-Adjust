#!/bin/bash
# Clip-Adjust installer for macOS.
# Copies SubtitleSync.jsx into each installed Premiere Pro user Scripts folder
# so it appears under File > Scripts > SubtitleSync.

set -e
cd "$(dirname "$0")"

SCRIPT_NAME="SubtitleSync.jsx"
DOCS_ROOT="$HOME/Documents/Adobe/Premiere Pro"

echo "==== Clip-Adjust インストーラー (macOS) ===="
echo

if [ ! -f "$SCRIPT_NAME" ]; then
    echo "ERROR: $SCRIPT_NAME が同じフォルダに見つかりません。"
    echo "zip を解凍したフォルダの中から実行してください。"
    read -p "Enter キーで閉じる..."
    exit 1
fi

if [ ! -d "$DOCS_ROOT" ]; then
    echo "Premiere Pro のユーザーフォルダが見つかりません:"
    echo "  $DOCS_ROOT"
    echo
    echo "Premiere Pro を一度起動してから再度お試しください。"
    read -p "Enter キーで閉じる..."
    exit 1
fi

INSTALLED=0
for VERSION_DIR in "$DOCS_ROOT"/*/; do
    [ -d "$VERSION_DIR" ] || continue
    SCRIPTS_DIR="${VERSION_DIR}Scripts"
    mkdir -p "$SCRIPTS_DIR"
    cp "$SCRIPT_NAME" "$SCRIPTS_DIR/"
    echo "  ✓ $SCRIPTS_DIR/$SCRIPT_NAME"
    INSTALLED=$((INSTALLED + 1))
done

echo
if [ "$INSTALLED" -eq 0 ]; then
    echo "インストール先のバージョンフォルダが見つかりませんでした。"
    echo "Premiere Pro を一度起動してから再度お試しください。"
    read -p "Enter キーで閉じる..."
    exit 1
fi

echo "完了しました（$INSTALLED バージョンに配置）。"
echo
echo "Premiere Pro を再起動すると、"
echo "  ファイル > スクリプト > SubtitleSync"
echo "から起動できるようになります。"
echo
read -p "Enter キーで閉じる..."
