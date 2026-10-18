@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   SOLSTICE . 暮海
echo   正在升起落日服务器...
echo.
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:8080/"
node serve.mjs
echo.
echo   服务器已停止。
pause
