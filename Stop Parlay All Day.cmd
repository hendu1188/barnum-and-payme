@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-Parlay-All-Day.ps1"
if errorlevel 1 pause
