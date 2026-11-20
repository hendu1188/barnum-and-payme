@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Parlay-All-Day.ps1" -Resume -OpenBrowser
if errorlevel 1 pause
