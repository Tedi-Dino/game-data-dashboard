@echo off
cd /d "%~dp0\..\.."
python tools\steam_info\steam_info.py %*
pause
