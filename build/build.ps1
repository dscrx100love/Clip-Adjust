# Builds a signed ZXP package on Windows (PowerShell).
# Usage: powershell -ExecutionPolicy Bypass -File build/build.ps1 [version]
param([string]$Version = "")

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$Root = (Get-Location).Path
$BuildDir = Join-Path $Root "build"
$DistDir = Join-Path $Root "dist"
$StageDir = Join-Path $BuildDir "stage"

if ([string]::IsNullOrEmpty($Version)) {
    $manifest = Get-Content (Join-Path $Root "CSXS/manifest.xml") -Raw
    if ($manifest -match 'ExtensionBundleVersion="([^"]+)"') { $Version = $Matches[1] }
}
if ([string]::IsNullOrEmpty($Version)) { throw "version could not be determined." }
Write-Host "▶ Building Clip-Adjust v$Version"

$ZxpSign = Join-Path $BuildDir "ZXPSignCmd.exe"
if (-not (Test-Path $ZxpSign)) {
    Write-Host "▶ Downloading ZXPSignCmd from Adobe-CEP repo"
    $url = "https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.1/win64/ZXPSignCmd.exe"
    Invoke-WebRequest -Uri $url -OutFile $ZxpSign
}

$Cert = Join-Path $BuildDir "selfsigned.p12"
$Password = if ($env:CERT_PASSWORD) { $env:CERT_PASSWORD } else { "ClipAdjust" }
if (-not (Test-Path $Cert)) {
    Write-Host "▶ Generating self-signed certificate (one-time)"
    & $ZxpSign -selfSignedCert JP Tokyo ClipAdjust ClipAdjust $Password $Cert
}

if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
New-Item -ItemType Directory -Path $StageDir | Out-Null
New-Item -ItemType Directory -Path $DistDir | Out-Null

Write-Host "▶ Staging source files"
Copy-Item -Recurse "CSXS" $StageDir
Copy-Item -Recurse "client" $StageDir
Copy-Item -Recurse "host" $StageDir
Copy-Item -Recurse "lib" $StageDir

$ZxpPath = Join-Path $DistDir "Clip-Adjust-v$Version.zxp"
Write-Host "▶ Signing and packaging -> $ZxpPath"
& $ZxpSign -sign $StageDir $ZxpPath $Cert $Password -tsa https://timestamp.digicert.com/

Write-Host "✓ Done: $ZxpPath"
