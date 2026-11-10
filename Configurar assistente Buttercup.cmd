@echo off
setlocal
if not exist "%~dp0.venv\Scripts\pythonw.exe" (
    echo Instale as dependencias do Buttercup primeiro. Consulte README.md.
    pause
    exit /b 1
)
start "" /b "%~dp0.venv\Scripts\pythonw.exe" "%~dp0scripts\setup-assistant.py" --gui
