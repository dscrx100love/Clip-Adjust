#!/usr/bin/env bash
# Builds a signed ZXP package. Self-signed cert is generated on first run.
# Usage: ./build/build.sh [version]
#   version defaults to the value in CSXS/manifest.xml
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BUILD_DIR="$ROOT/build"
DIST_DIR="$ROOT/dist"
STAGE_DIR="$BUILD_DIR/stage"

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
    VERSION=$(grep -oE 'ExtensionBundleVersion="[^"]+"' CSXS/manifest.xml | head -1 | sed 's/.*="\(.*\)"/\1/')
fi
if [[ -z "$VERSION" ]]; then
    echo "ERROR: version could not be determined." >&2
    exit 1
fi
echo "▶ Building Clip-Adjust v$VERSION"

ZXPSIGN="$BUILD_DIR/ZXPSignCmd"
if [[ ! -x "$ZXPSIGN" ]]; then
    OS=$(uname -s)
    case "$OS" in
        Darwin) URL="https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.1/mac/ZXPSignCmd" ;;
        Linux)  URL="https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.1/linux64/ZXPSignCmd" ;;
        *) echo "Unsupported OS for build.sh: $OS (use build.ps1 on Windows)"; exit 1 ;;
    esac
    echo "▶ Downloading ZXPSignCmd from Adobe-CEP repo"
    curl -fsSL "$URL" -o "$ZXPSIGN"
    chmod +x "$ZXPSIGN"
fi

CERT="$BUILD_DIR/selfsigned.p12"
CERT_PASSWORD="${CERT_PASSWORD:-ClipAdjust}"
if [[ ! -f "$CERT" ]]; then
    echo "▶ Generating self-signed certificate (one-time)"
    "$ZXPSIGN" -selfSignedCert JP Tokyo ClipAdjust ClipAdjust "$CERT_PASSWORD" "$CERT"
fi

rm -rf "$STAGE_DIR" "$DIST_DIR"
mkdir -p "$STAGE_DIR" "$DIST_DIR"

echo "▶ Staging source files"
cp -R CSXS "$STAGE_DIR/"
cp -R client "$STAGE_DIR/"
cp -R host "$STAGE_DIR/"
cp -R lib "$STAGE_DIR/"

ZXP_PATH="$DIST_DIR/Clip-Adjust-v$VERSION.zxp"
echo "▶ Signing and packaging → $ZXP_PATH"
"$ZXPSIGN" -sign "$STAGE_DIR" "$ZXP_PATH" "$CERT" "$CERT_PASSWORD" -tsa https://timestamp.digicert.com/

echo "✓ Done: $ZXP_PATH"
