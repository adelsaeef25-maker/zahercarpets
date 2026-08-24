@echo off
chcp 65001 > nul
title تشغيل سيرفر زاهر سالمان للسجاد
echo ======================================================
echo    ⚜ جاري تشغيل سيرفر زاهر سالمان للسجاد ⚜
echo ======================================================
echo.

set "NODE_EXE=C:\Program Files\Adobe\Adobe Photoshop CC 2019\node.exe"

if exist "%NODE_EXE%" (
    start http://localhost:3000
    "%NODE_EXE%" server.js
) else (
    start http://localhost:3000
    node server.js
)

pause
