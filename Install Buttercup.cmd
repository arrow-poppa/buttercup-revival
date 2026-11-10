@echo off
setlocal
title Buttercup Revival
if not exist "%~dp0scripts\install.ps1" (
    echo.
    echo   Extract the whole ZIP to a folder first, then open this file from there.
    echo   Extraia o ZIP inteiro para uma pasta e abra este arquivo a partir de la.
    echo.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
