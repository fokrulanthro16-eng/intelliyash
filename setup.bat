@echo off
REM IntelliYash one-shot installer for Windows.
REM Just runs the cross-platform builder, but checks dependencies first.

setlocal
cd /d "%~dp0"

echo [setup] Checking python ...
where python >nul 2>nul
if errorlevel 1 (
  echo [err] Python not found. Install Python 3.10+ from https://python.org and rerun.
  exit /b 1
)

python -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)"
if errorlevel 1 (
  echo [err] Python 3.10+ required.
  exit /b 1
)

echo [setup] Checking node ...
where node >nul 2>nul
if errorlevel 1 (
  echo [err] Node.js not found. Install Node 18+ from https://nodejs.org and rerun.
  exit /b 1
)

echo [setup] Handing off to intelliyash_builder.py ...
python intelliyash_builder.py %*
endlocal
