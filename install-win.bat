@echo off
rem Clip-Adjust installer for Windows.
rem Copies SubtitleSync.jsx into each installed Premiere Pro user Scripts folder
rem so it appears under File ^> Scripts ^> SubtitleSync.

chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "SCRIPT_NAME=SubtitleSync.jsx"
set "DOCS_ROOT=%USERPROFILE%\Documents\Adobe\Premiere Pro"

echo ==== Clip-Adjust インストーラー (Windows) ====
echo.

if not exist "%SCRIPT_NAME%" (
    echo ERROR: %SCRIPT_NAME% が同じフォルダに見つかりません。
    echo zip を解凍したフォルダの中から実行してください。
    pause
    exit /b 1
)

if not exist "%DOCS_ROOT%" (
    echo Premiere Pro のユーザーフォルダが見つかりません:
    echo   %DOCS_ROOT%
    echo.
    echo Premiere Pro を一度起動してから再度お試しください。
    pause
    exit /b 1
)

set /a INSTALLED=0
for /d %%V in ("%DOCS_ROOT%\*") do (
    set "SCRIPTS_DIR=%%V\Scripts"
    if not exist "!SCRIPTS_DIR!" mkdir "!SCRIPTS_DIR!"
    copy /Y "%SCRIPT_NAME%" "!SCRIPTS_DIR!\" >nul
    echo   OK !SCRIPTS_DIR!\%SCRIPT_NAME%
    set /a INSTALLED+=1
)

echo.
if %INSTALLED%==0 (
    echo インストール先のバージョンフォルダが見つかりませんでした。
    echo Premiere Pro を一度起動してから再度お試しください。
    pause
    exit /b 1
)

echo 完了しました（%INSTALLED% バージョンに配置）。
echo.
echo Premiere Pro を再起動すると、
echo   ファイル ^> スクリプト ^> SubtitleSync
echo から起動できるようになります。
echo.
pause
