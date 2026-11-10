@echo off
setlocal
title Buttercup Revival
if not exist "%~dp0.venv\Scripts\python.exe" (
    echo Buttercup is not installed in this folder.
    pause
    exit /b 1
)
"%~dp0.venv\Scripts\python.exe" "%~dp0scripts\setup-assistant.py" --uninstall
echo.
echo   Done. Now remove "Buttercup Revival" in chrome://extensions and delete this folder.
echo   Pronto. Agora remova "Buttercup Revival" em chrome://extensions e apague esta pasta.
echo.
pause
